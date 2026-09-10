/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli export --instance <arn> [--out <dir>] [--no-codegen] [--on-error abort|collect]`.
//
// Reads every flow and module in a live instance through @flow-as-code/core's
// exportInstance and writes one `<name>.flowdoc.json` per document, plus
// `<name>.flow.ts` unless --no-codegen, into --out (default: the working
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
// existing `<name>.flow.ts` is read first so its `@keep` comments survive, as
// `codegen` does.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ExportFailure, ExportedFlow, FlowDoc } from "@flow-as-code/core";
import { codegen, collectInventory, exportInstance, serialize } from "@flow-as-code/core";

import { type LiveClients, parseInstanceArn, SDK_CLIENTS } from "./aws.js";
import { FLOWDOC_SUFFIX } from "./docs.js";
import { CliError, messageOf } from "./errors.js";
import { generator, sha256Hex } from "./synth.js";

export const TS_SUFFIX = ".flow.ts";

export interface ExportOptions {
  instance: string;
  out?: string;
  /** commander's `--no-codegen` sets this false; absent means generate. */
  codegen?: boolean;
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

/** Writes one exported document, and its source when asked. */
function writeExported(flow: ExportedFlow, outDir: string, withCode: boolean): WrittenDoc {
  const { doc } = flow;
  const docFile = `${doc.name}${FLOWDOC_SUFFIX}`;
  const files = [docFile];
  let text: string;

  if (withCode) {
    const tsFile = `${doc.name}${TS_SUFFIX}`;
    const tsPath = join(outDir, tsFile);
    const previous = existsSync(tsPath) ? readFileSync(tsPath, "utf8") : undefined;
    const source = codegen(doc, previous === undefined ? {} : { previous });
    writeFileSync(tsPath, source, "utf8");
    files.push(tsFile);
    text = serialize({ ...doc, meta: { ...doc.meta, sourceHash: `sha256:${sha256Hex(source)}` } });
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
  const withCode = options.codegen !== false;

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
    written.push(writeExported(flow, outDir, withCode));
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
