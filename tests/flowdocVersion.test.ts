/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Every committed FlowDoc, fixture and test document is at the current format
// version. Older versions live only under conformance/migrate, as inputs the
// migration is proven against. The sweep is repository-wide because the 0.2
// bump touched 61 JSON files and 8 TypeScript files, and a straggler found by
// hand is a straggler found late.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLOWDOC_VERSION } from "@flow-as-code/core";

const OLDER = /"?flowdoc"?\s*:\s*"0\.1"/;

/** Files that hold an older version literal on purpose, each with its reason. */
const ALLOWED = new Set([
  // This file: the self-check below plants the literal to prove the detector reads it.
  "tests/flowdocVersion.test.ts",
  // Proves the studio validates a 0.1 file against the 0.1 schema before migrating it.
  "packages/studio/tests/saveGate.test.ts",
]);

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(
    (f) =>
      /\.(json|ts|tsx|mjs)$/.test(f) &&
      !f.startsWith("conformance/migrate/") &&
      !f.includes("/schema/") &&
      !f.startsWith("tasks/") &&
      !ALLOWED.has(f),
  );

describe("FlowDoc version sweep", () => {
  it("is running against the version this test expects", () => {
    expect(FLOWDOC_VERSION).toBe("0.2");
  });

  it("walks a non-trivial number of files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("finds no file still declaring FlowDoc 0.1", () => {
    const offenders = files.filter((f) => OLDER.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("would catch one", () => {
    expect(OLDER.test('{\n  "flowdoc": "0.1",')).toBe(true);
    expect(OLDER.test('    flowdoc: "0.1",')).toBe(true);
    expect(OLDER.test('"flowdoc": "0.2"')).toBe(false);
  });
});
