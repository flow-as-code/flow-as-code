/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli codegen <doc.flowdoc.json>`: FlowDoc in, typed builder TypeScript
// out. The inverse of `flow-cli synth`, and named to match: synth writes
// `<flow.name>.flowdoc.json`, so codegen writes `<doc.name>.flow.ts` next to
// its input unless `--out` says otherwise.
//
// When the output file already exists its current text is passed as
// `options.previous`, which is how `@keep` comments survive regeneration
// (packages/core/src/codegen.ts). Overwriting without reading first would
// silently delete the one thing in a generated file a human is invited to own.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { codegen } from "@flow-as-code/core";

import { loadOneDoc } from "./docs.js";

export interface CodegenOptions {
  out?: string;
}

export function runCodegen(file: string, options: CodegenOptions): string {
  const { path, doc } = loadOneDoc(file, "codegen");
  const target = resolve(options.out ?? join(dirname(path), `${doc.name}.flow.ts`));

  const previous = existsSync(target) ? readFileSync(target, "utf8") : undefined;
  const source = codegen(doc, previous === undefined ? {} : { previous });

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source, "utf8");
  return target;
}
