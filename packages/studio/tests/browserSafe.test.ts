/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// What the studio's source may import.
//
// The studio is bundled for a browser, but its tests run in node, and
// vitest.config.ts resolves the workspace packages to their TypeScript sources
// so a clean tree can test without a build. Both of those make a node-only
// import easy to add and hard to notice: it passes every test and fails the
// vite build, or worse, silently ships an unusable chunk.
//
// So the rule is stated here instead of being discovered later. Two forbidden
// shapes:
//
//   node builtins            nothing in src/ may reach the filesystem, spawn a
//                            process, or read a path. The bridge exists because
//                            the browser cannot.
//   the @flow-as-code/tf INDEX        it re-exports writeTf, which imports node:fs. The
//                            export target imports @flow-as-code/tf/emit,
//                            the pure half, and only that subpath is aliased in
//                            vitest.config.ts.
//
// Tests are exempt: they are node programs by design.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

/** Every module specifier a file imports (static, type-only, or dynamic). */
function imports(text: string): string[] {
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
}

const files = sources(SRC);

describe("the studio's source stays browser-safe", () => {
  it("finds the source tree", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("imports no node builtin", () => {
    const offenders = files
      .map((file) => ({ file, bad: imports(readFileSync(file, "utf8")).filter(isNodeBuiltin) }))
      .filter((f) => f.bad.length > 0)
      .map((f) => `${f.file.slice(SRC.length)}: ${f.bad.join(", ")}`);
    expect(offenders).toEqual([]);
  });

  it("imports @flow-as-code/tf only through its pure /emit subpath", () => {
    const offenders = files
      .filter((file) => imports(readFileSync(file, "utf8")).some((s) => s === "@flow-as-code/tf"))
      .map((file) => file.slice(SRC.length));
    expect(offenders).toEqual([]);
    // And the subpath is really used, so this is not vacuously satisfied by
    // nobody importing @flow-as-code/tf at all.
    const emitters = files.filter((file) =>
      imports(readFileSync(file, "utf8")).includes("@flow-as-code/tf/emit"),
    );
    expect(emitters.length).toBeGreaterThan(0);
  });

  it("imports nothing from @flow-as-code/cli, which would be a dependency cycle", () => {
    const offenders = files.filter((file) =>
      imports(readFileSync(file, "utf8")).some((s) => s.startsWith("@flow-as-code/cli")),
    );
    expect(offenders).toEqual([]);
  });
});

const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "fs/promises",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "process",
  "stream",
  "url",
  "util",
  "worker_threads",
  "zlib",
]);

function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith("node:") || NODE_BUILTINS.has(specifier);
}
