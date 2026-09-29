/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli export --instance <arn> [--out <dir>] [--author ts|tf] [--no-codegen]
// [--on-error abort|collect]`.
//
// Reads every flow and module in a live instance through @flow-as-code/core's
// exportInstance and writes one `<name>.flowdoc.json` per document, plus its
// companion (`<name>.flow.ts`, or `<name>.flow.tf` with --author tf) unless
// --no-codegen, into --out (default: the working
// directory). The name is the slug the exporter derives from the console name,
// which is also how `diff` finds the live counterpart of a local document.
//
// --on-error defaults to collect, not abort, because a fresh instance always
// holds the stock "Sample Lambda integration" flow, which calls a Lambda in an
// AWS-owned account that ListLambdaFunctions cannot return. That flow is an
// unknown-ARN hard error by design (packages/core/SPEC.md, Export), and
// aborting on it would make a first export of any new instance write nothing.
// Collect writes everything else and reports every failure at once; either
// mode exits 1 when any flow failed.
//
// Both halves of a pair are written the way `synth` and the studio write them:
// the document carries `meta.sourceHash` of the generated source, so the watch
// engine sees an exported pair as in sync rather than as a conflict. An
// existing companion is read first so its `@keep` comments (and a .flow.tf's
// carried values) survive, as `codegen` does.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ExportFailure, ExportedFlow, FlowDoc } from "@flow-as-code/core";
import { collectInventory, exportInstance, serialize } from "@flow-as-code/core";

import { type LiveClients, parseInstanceArn, SDK_CLIENTS } from "./aws.js";
import { generateCompanion, parseKind, suffixOf, type SourceKind } from "./companion.js";
import { FLOWDOC_SUFFIX } from "./docs.js";
import { CliError, messageOf } from "./errors.js";
import { generator, sha256Hex } from "./synth.js";

export interface ExportOptions {
  instance: string;
  out?: string;
  /** commander's `--no-codegen` sets this false; absent means generate. */
  codegen?: boolean;
  /** The companion to generate: ts (the default) or tf. */
  author?: string;
  onError?: string;
}

const ON_ERROR = new Set<string>(["abort", "collect"]);

/** One document written to disk. */
export interface WrittenDoc {
  name: string;
  kind: FlowDoc["kind"];
  /** Paths relative to the output directory, document first. */
  files: string[];
  /** True when the content came through the `$SAVED` alias (never published). */
  saved: boolean;
}

export interface ExportOutcome {
  outDir: string;
  written: WrittenDoc[];
  failures: ExportFailure[];
  warnings: string[];
}

/** Writes one exported document, and its companion unless `author` is undefined. */
function writeExported(
  flow: ExportedFlow,
  outDir: string,
  author: SourceKind | undefined,
): WrittenDoc {
  const { doc } = flow;
  const docFile = `${doc.name}${FLOWDOC_SUFFIX}`;
  const files = [docFile];
  let text: string;

  if (author !== undefined) {
    const sourceFile = `${doc.name}${suffixOf(author)}`;
    const sourcePath = join(outDir, sourceFile);
    const otherFile = `${doc.name}${suffixOf(author === "ts" ? "tf" : "ts")}`;
    if (existsSync(join(outDir, otherFile))) {
      throw new CliError(
        `${otherFile} already exists in ${outDir}; --author ${author} would give the document ` +
          `two companions. Run \`flow-cli convert\` on it, or export into another directory.`,
      );
    }
    const previous = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : undefined;
    const source = generateCompanion(
      doc,
      author,
      previous === undefined ? {} : { previous, previousPath: sourcePath },
    );
    writeFileSync(sourcePath, source, "utf8");
    files.push(sourceFile);
    text = serialize({
      ...doc,
      meta: { ...doc.meta, sourceHash: `sha256:${sha256Hex(source)}`, sourceKind: author },
    });
  } else {
    text = serialize(doc);
  }
  writeFileSync(join(outDir, docFile), text, "utf8");

  return { name: doc.name, kind: doc.kind, files, saved: flow.saved === true };
}

export async function runExport(
  options: ExportOptions,
  clients: LiveClients = SDK_CLIENTS,
): Promise<ExportOutcome> {
  const onError = options.onError ?? "collect";
  if (!ON_ERROR.has(onError)) {
    throw new CliError(`Unknown --on-error "${onError}". Use "abort" or "collect".`);
  }
  const target = parseInstanceArn(options.instance);
  const outDir = resolve(options.out ?? ".");
  const author =
    options.codegen === false ? undefined : parseKind(options.author ?? "ts", "--author");

  const client = await clients.inventory(target);
  // The inventory is listed on its own, apart from the flows: a refused list
  // call, throttling, or the network failing there is not a flow failure, so
  // --on-error has no say in it and the SDK's message is passed through as is.
  let inventory;
  try {
    inventory = await collectInventory(client);
  } catch (error) {
    throw new CliError(messageOf(error), 1, { cause: error });
  }
  // Resolved before the try: the catch below labels everything a flow-export
  // abort, and a manifest lookup failure is not that.
  const stamp = generator();
  let result;
  try {
    result = await exportInstance(client, {
      inventory,
      onError: onError === "abort" ? "throw" : "collect",
      generator: stamp,
    });
  } catch (error) {
    // With the inventory in hand, exportInstance throws only for a flow, and
    // only in abort mode; collect records every flow failure in `failures`.
    throw new CliError(`export aborted (--on-error abort): ${messageOf(error)}`, 1, {
      cause: error,
    });
  }

  mkdirSync(outDir, { recursive: true });
  const failures = [...result.failures];
  const written: WrittenDoc[] = [];
  // Flow and module names are unique per kind, not across kinds, and both
  // kinds write <name>.flowdoc.json. The second one is a failure, not a
  // silent overwrite.
  const claimed = new Map<string, ExportedFlow>();

  for (const flow of result.flows) {
    const other = claimed.get(flow.doc.name);
    if (other !== undefined) {
      failures.push({
        arn: flow.arn,
        name: flow.sourceName,
        reason:
          `a ${other.doc.kind} and a ${flow.doc.kind} both slug to "${flow.doc.name}"; ` +
          `not written, ${other.doc.name}${FLOWDOC_SUFFIX} holds the ${other.doc.kind}`,
      });
      continue;
    }
    claimed.set(flow.doc.name, flow);
    // A document that cannot be written (another companion in the way, an
    // existing companion that does not parse) is a failure like any other:
    // under collect the rest are still written and every failure is listed.
    try {
      written.push(writeExported(flow, outDir, author));
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      if (onError === "abort") throw error;
      failures.push({ arn: flow.arn, name: flow.sourceName, reason: error.message });
    }
  }

  for (const warning of result.warnings) console.error(`warning: ${warning}`);
  for (const doc of written) {
    const tag = doc.saved ? `${doc.kind}, $SAVED` : doc.kind;
    console.log(`${doc.name} (${tag}): ${doc.files.join(", ")}`);
  }
  for (const failure of failures) {
    console.error(`failed: ${failure.name} (${failure.arn}): ${failure.reason}`);
  }
  console.log(
    `Exported ${String(written.length)} of ${String(written.length + failures.length)} to ${outDir}`,
  );

  if (failures.length > 0) {
    throw new CliError(`${String(failures.length)} flow(s) could not be exported`);
  }
  return { outDir, written, failures, warnings: result.warnings };
}
