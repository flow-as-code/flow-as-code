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

export interface CodegenOptions {
  out?: string;
  to?: string;
}

export function runCodegen(file: string, options: CodegenOptions): string {
  const { path, doc } = loadOneDoc(file, "codegen");
  const kind =
    options.to === undefined ? (doc.meta?.sourceKind ?? "ts") : parseKind(options.to, "--to");
  const target = resolve(options.out ?? join(dirname(path), `${doc.name}${suffixOf(kind)}`));

  const previous = existsSync(target) ? readFileSync(target, "utf8") : undefined;
  const source = generateCompanion(doc, kind, previous === undefined ? {} : { previous });

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source, "utf8");
  return target;
}
