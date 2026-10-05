/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli codegen <doc.flowdoc.json> [--to ts|tf]`: FlowDoc in, companion
// source out. The inverse of `flow-cli synth`, and named to match: synth writes
// `<flow.name>.flowdoc.json`, so codegen writes `<doc.name>.flow.ts` (or
// `.flow.tf`) next to its input unless `--out` says otherwise. The kind is
// `--to`, else the document's meta.sourceKind, else ts.
//
// When the output file already exists its current text is passed as
// `previous`, which is how `@keep` comments survive regeneration
// (packages/core/src/codegen.ts), and for a `.flow.tf` also its refs bindings,
// instance_id, tags and lint (conformance/hcl/README.md rule 24). Overwriting
// without reading first would silently delete the one thing in a generated
// file a human is invited to own.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { generateCompanion, parseKind, suffixOf } from "./companion.js";
import { loadOneDoc } from "./docs.js";
import { CliError } from "./errors.js";
import { serializeWithMeta, sha256Hex } from "./synth.js";

export interface CodegenOptions {
  out?: string;
  to?: string;
  /** TypeScript only: one extra banner line after the fixed two; kept across runs that omit it. */
  banner?: string;
}

export function runCodegen(file: string, options: CodegenOptions): string {
  const { path, doc } = loadOneDoc(file, "codegen");
  const kind =
    options.to === undefined ? (doc.meta?.sourceKind ?? "ts") : parseKind(options.to, "--to");
  if (options.banner !== undefined && kind === "tf") {
    throw new CliError("--banner applies to the TypeScript companion; a .flow.tf carries none.");
  }
  const paired = join(dirname(path), `${doc.name}${suffixOf(kind)}`);
  const target = resolve(options.out ?? paired);
  const other = join(dirname(path), `${doc.name}${suffixOf(kind === "ts" ? "tf" : "ts")}`);
  if (target === paired && existsSync(other)) {
    throw new CliError(
      `${other} already exists, and a document has one companion. Run ` +
        `\`flow-cli convert ${path} --to ${kind}\` to switch it, or pass --out to write elsewhere.`,
    );
  }

  const previous = existsSync(target) ? readFileSync(target, "utf8") : undefined;
  const source = generateCompanion(doc, kind, {
    ...(previous === undefined ? {} : { previous, previousPath: target }),
    ...(options.banner === undefined ? {} : { banner: options.banner }),
  });

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source, "utf8");
  // The document's own companion, regenerated: restamp the document with the
  // hash of what was just written, or the watcher meets a pair that no longer
  // agrees (a .flow.tf regeneration normalizes the text it read).
  if (target === paired && (doc.meta?.sourceKind ?? kind) === kind) {
    writeFileSync(path, serializeWithMeta(doc, `sha256:${sha256Hex(source)}`, kind), "utf8");
  }
  return target;
}
