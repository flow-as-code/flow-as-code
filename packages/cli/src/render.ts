/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli render <dir-or-file> --resources <map.json>`: standalone
// materialization. FlowDoc in, deployable Flow language JSON out, with every
// `${cdref:...}` token replaced from the resource map.
//
// The map takes any of the three key forms @flow-as-code/core defines, the same
// three `emit --target tf --address-map` has always taken, so one file serves
// every command that resolves references.
//
// This is the one path where literal ARNs are the goal rather than a mistake
// (packages/core/SPEC.md, Materialization), so the map's values are not
// linted. What is enforced is completeness: @flow-as-code/core's MaterializeError
// carries every unmapped token, and all of them are printed, for every
// document, before the command exits 1. One run, one round of map edits.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  MaterializeError,
  describeMissingRefKey,
  materializeWithMap,
  serializeContent,
} from "@flow-as-code/core";

import { defaultOutDir, loadDocs, readStringMap } from "./docs.js";
import { CliError } from "./errors.js";

export interface RenderOptions {
  resources: string;
  out?: string;
}

export function runRender(target: string, options: RenderOptions): string[] {
  const docs = loadDocs(target);
  const resourceMap = readStringMap(options.resources, "resource map");
  const outDir = resolve(options.out ?? defaultOutDir(target));

  const problems: string[] = [];
  const rendered: { path: string; text: string }[] = [];
  for (const { path, doc } of docs) {
    try {
      rendered.push({
        path: join(outDir, `${doc.name}.json`),
        text: serializeContent(materializeWithMap(doc, resourceMap)),
      });
    } catch (error) {
      if (!(error instanceof MaterializeError)) throw error;
      problems.push(`${path}: ${String(error.missingTokens.length)} unmapped token(s):`);
      // Each one with every key form the map would have accepted, because the
      // map's own author has to pick one and a token that is present under a
      // different spelling is the failure this line exists to prevent.
      for (const entry of error.missingRefs) problems.push(`    ${describeMissingRefKey(entry)}`);
    }
  }

  if (problems.length > 0) {
    throw new CliError(
      `Cannot render:\n  ${problems.join("\n  ")}\n` +
        `Add a key for each to ${resolve(options.resources)}. Any one of the three ` +
        `forms works. \`simulate --resource-map\` reads the same file; ` +
        `\`emit --target tf --address-map\` takes the same keys, but terraform ` +
        `addresses in place of the ARNs, which it refuses.`,
    );
  }

  mkdirSync(outDir, { recursive: true });
  for (const { path, text } of rendered) writeFileSync(path, text, "utf8");
  return rendered.map((r) => r.path);
}
