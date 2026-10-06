/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Every committed FlowDoc, fixture and test document is at the current format
// version. Older versions live only under conformance/migrate, as inputs the
// migration is proven against. The sweep is repository-wide because the 0.2
// bump touched 61 JSON files and 8 TypeScript files, the 0.3 bump 170 and 12,
// and a straggler found by hand is a straggler found late.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLOWDOC_VERSION } from "@flow-as-code/core";

const ROOT_DIR = join(import.meta.dirname, "..");
const OLDER = /"?flowdoc"?\s*:\s*"0\.[12]"/;

/** Files that hold an older version literal on purpose, each with its reason. */
const ALLOWED = new Set([
  // This file: the self-check below plants the literal to prove the detector reads it.
  "tests/flowdocVersion.test.ts",
  // Proves the studio validates a 0.1 or 0.2 file against its own schema before migrating it.
  "packages/studio/tests/saveGate.test.ts",
  // Takes every fixture holding an unmodeled type back to 0.2 to prove it
  // validates there, migrates, and validates at 0.3 (owner decision 3).
  "packages/core/src/conformance.test.ts",
]);

/**
 * Directories the sweep does not enter, each with its reason.
 *
 * `examples/vendored/` is the showcase snapshot (tasks/C07): written by
 * `scripts/sync-example.mjs` from one satellite commit and never edited in
 * place (CLAUDE.md, "Showcase examples"), so it stays at the version the
 * satellite wrote until the satellite adopts the npm release that writes 0.3
 * (tasks/D10). C07's lint test reads it through `migrateFlowDoc`, so an older
 * snapshot lints against the current catalog without an edit.
 */
const SKIPPED_PREFIXES = ["conformance/migrate/", "tasks/", "examples/vendored/"];

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(
    (f) =>
      /\.(json|ts|tsx|mjs)$/.test(f) &&
      !SKIPPED_PREFIXES.some((prefix) => f.startsWith(prefix)) &&
      !f.includes("/schema/") &&
      !ALLOWED.has(f),
  );

describe("FlowDoc version sweep", () => {
  it("is running against the version this test expects", () => {
    expect(FLOWDOC_VERSION).toBe("0.3");
  });

  it("walks a non-trivial number of files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("finds no file still declaring FlowDoc 0.1 or 0.2", () => {
    const offenders = files.filter((f) => OLDER.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("would catch one", () => {
    expect(OLDER.test('{\n  "flowdoc": "0.1",')).toBe(true);
    expect(OLDER.test('{\n  "flowdoc": "0.2",')).toBe(true);
    expect(OLDER.test('    flowdoc: "0.1",')).toBe(true);
    expect(OLDER.test('    flowdoc: "0.2",')).toBe(true);
    expect(OLDER.test('"flowdoc": "0.3"')).toBe(false);
  });
});

// docs/06's compatibility table names the FlowDoc version the provider reads
// and the schema file that defines it. A format bump that forgets the page
// would tell a provider user the wrong version.
describe("the provider page's compatibility table", () => {
  const page = readFileSync(join(ROOT_DIR, "docs", "06-terraform-provider.md"), "utf8");
  const table = page.slice(page.indexOf("## Versions and compatibility"));
  const rows = [...table.matchAll(/^\|(?!\s*-)(?!\s*Provider)(.*)\|$/gm)].map((m) =>
    m[1]!.split("|").map((c) => c.trim()),
  );

  it("has a row, whose FlowDoc column is the current version", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r[1])).toContain(FLOWDOC_VERSION);
  });

  it("names schema files that exist under conformance/schema", () => {
    for (const row of rows) {
      expect(existsSync(join(ROOT_DIR, "conformance", "schema", row[2]!)), row[2]).toBe(true);
    }
    const current = rows.find((r) => r[1] === FLOWDOC_VERSION)!;
    expect(current[2]).toBe(`flowdoc-${FLOWDOC_VERSION}.schema.json`);
  });
});
