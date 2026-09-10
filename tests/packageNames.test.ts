/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The npm scope is a placeholder that changes before first publish, and the
// hosted demo build has to be able to strip it from the artifact. Both only
// work if the name is written as a value in exactly one place,
// packages/core/src/package-names.ts. Everywhere else it may appear as an
// import specifier (the rename edits those mechanically along with the
// manifests) or in a comment. A string literal anywhere else is a second copy
// that the rename would miss and the demo build could not alias away.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SCOPE = "@flow-as-code";
const ROOT = process.cwd();
const SOURCE_OF_TRUTH = join("packages", "core", "src", "package-names.ts");

/** Test files and fixtures assert against the literal; they are not output. */
const isTestOrFixture = (path: string): boolean =>
  /\.test\.tsx?$/.test(path) ||
  path.split(sep).includes("__fixtures__") ||
  path.endsWith("test-helpers.ts");

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const pkg of readdirSync(join(ROOT, "packages"))) {
    const src = join(ROOT, "packages", pkg, "src");
    let entries: string[];
    try {
      entries = readdirSync(src, { recursive: true, encoding: "utf8" });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/\.tsx?$/.test(entry)) continue;
      const path = join(src, entry);
      if (isTestOrFixture(path)) continue;
      out.push(path);
    }
  }
  return out.sort();
}

const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);

/** An import or export specifier, on one line or as the `} from "..."` tail. */
const isSpecifier = (line: string): boolean =>
  /^\s*(import|export)\b[^"']*\bfrom\s+["']@flow-as-code\//.test(line) ||
  /^\s*import\s+["']@flow-as-code\//.test(line) ||
  /^\s*\}?\s*from\s+["']@flow-as-code\//.test(line) ||
  /import\(\s*["']@flow-as-code\//.test(line);

describe("the npm scope as a value", () => {
  const files = sourceFiles();

  it("scans a meaningful set of files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("appears only in package-names.ts, import specifiers, and comments", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (rel === SOURCE_OF_TRUTH) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes(SCOPE)) return;
        if (isComment(line) || isSpecifier(line)) return;
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("is defined in the source of truth", () => {
    const text = readFileSync(join(ROOT, SOURCE_OF_TRUTH), "utf8");
    expect(text).toContain(`export const PACKAGE_SCOPE = "${SCOPE}";`);
  });
});
