/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// conformance/README.md classifies every family as one both implementations
// pass or one only the TypeScript side does. The Go provider vendors the
// directory and reads that list to decide what to run, so a family that lands
// without a line there would be silently skipped by the second implementation.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "conformance");

/** Whether a directory holds a file at any depth; git does not track an empty one. */
function holdsFiles(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some((e) =>
    e.isDirectory() ? holdsFiles(join(dir, e.name)) : e.isFile(),
  );
}

const families = readdirSync(ROOT)
  .filter((name) => statSync(join(ROOT, name)).isDirectory() && holdsFiles(join(ROOT, name)))
  .sort();

const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const section = readme.slice(
  readme.indexOf("## What a second implementation must pass"),
  readme.indexOf("The round-trip rule for HCL"),
);

/** The family names a list classifies: the first code span of each bullet. */
function listed(heading: string): string[] {
  const start = section.indexOf(heading);
  const rest = section.slice(start + heading.length);
  const end = rest.search(/\n\n[A-Z]/);
  const body = end === -1 ? rest : rest.slice(0, end);
  return [...body.matchAll(/^- `([a-z-]+)`/gm)].map((m) => m[1]!);
}

describe("conformance/README.md names every family", () => {
  const both = listed("Both implementations:");
  const typescript = listed("TypeScript only:");

  it("has a section to read", () => {
    expect(section.length).toBeGreaterThan(0);
    expect(families.length).toBeGreaterThan(8);
  });

  it("classifies each family exactly once", () => {
    expect([...both, ...typescript].sort()).toEqual(families);
    expect(both.filter((f) => typescript.includes(f))).toEqual([]);
  });
});
