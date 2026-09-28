/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The studio bundles this package, so nothing in its module graph may import
// a Node built-in. The graph is walked statically, as core's lint engine's is
// (packages/core/src/lint-browser-safe.test.ts): executing it proves nothing,
// since node:fs resolves under any test environment.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;

function walk(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const [, spec] of readFileSync(file, "utf8").matchAll(IMPORT)) {
      if (spec!.startsWith(".")) queue.push(resolve(dirname(file), spec!.replace(/\.js$/, ".ts")));
      else bare.add(spec!);
    }
  }
  return { files, bare };
}

describe("@flow-as-code/hcl is browser-safe", () => {
  const graph = walk(resolve(SRC, "index.ts"));

  it("walks the whole entry point", () => {
    expect(graph.files.size).toBeGreaterThanOrEqual(8);
  });

  it("imports nothing but its own modules and the core package", () => {
    expect([...graph.bare].filter((s) => s !== "@flow-as-code/core")).toEqual([]);
  });
});
