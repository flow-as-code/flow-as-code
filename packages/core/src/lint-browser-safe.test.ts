/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A02 acceptance: the lint engine runs in a browser-like environment with no
// fs imports. The studio runs it in a web worker (docs/02-studio-design.md).
//
// This walks the module graph statically rather than executing it. Running the
// engine under jsdom would prove nothing: `node:fs` still resolves there. What
// matters is that nothing in the graph imports a Node builtin or a dependency
// that needs one.

const SRC = dirname(fileURLToPath(new URL("./lint/index.ts", import.meta.url)));
const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;

function resolveSpecifier(from: string, spec: string): string | undefined {
  if (!spec.startsWith(".")) return undefined; // bare specifier, handled separately
  // Source is authored with .js extensions for NodeNext; the file on disk is .ts.
  return resolve(dirname(from), spec.replace(/\.js$/, ".ts"));
}

function walk(entry: string): { files: Set<string>; bare: Map<string, string> } {
  const files = new Set<string>();
  const bare = new Map<string, string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (files.has(file)) continue;
    files.add(file);

    const source = readFileSync(file, "utf8");
    for (const [, spec] of source.matchAll(IMPORT)) {
      const local = resolveSpecifier(file, spec!);
      if (local === undefined) bare.set(spec!, file);
      else queue.push(local);
    }
  }
  return { files, bare };
}

describe("A02 acceptance: the lint engine is browser-safe", () => {
  const graph = walk(resolve(SRC, "index.ts"));

  it("pulls in more than a trivial number of modules", () => {
    // Guards against the walker silently resolving nothing and passing vacuously.
    expect(graph.files.size).toBeGreaterThan(10);
  });

  it("imports no Node builtin anywhere in its module graph", () => {
    const builtins = [...graph.bare.entries()].filter(
      ([spec]) =>
        spec.startsWith("node:") ||
        ["fs", "path", "url", "os", "crypto", "child_process"].includes(spec),
    );
    expect(builtins.map(([spec, from]) => `${spec} (from ${from})`)).toEqual([]);
  });

  it("imports no third-party dependency at all", () => {
    // dagre is fine in the studio bundle but the worker should not have to
    // carry it. Keeping the lint graph dependency-free keeps the worker small.
    expect([...graph.bare.keys()]).toEqual([]);
  });

  it("is reachable as its own entry point, so the worker need not import synth", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.exports["./lint"]).toBeDefined();
  });
});
