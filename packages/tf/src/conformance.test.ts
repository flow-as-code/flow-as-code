/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Golden-file tests for the emitter. Each conformance/emit-tf/<case>/ holds the
// input documents, the address map, and the expected output tree; the bytes
// must match exactly. Regenerate deliberately with UPDATE_GOLDENS=1 and read
// the diff: a golden that changes without a reason in the same commit is the
// bug these tests exist to catch.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCases } from "./__fixtures__/cases.js";
import { emitTf } from "./emit.js";

const cases = loadCases();
const update = process.env.UPDATE_GOLDENS === "1";

function writeGoldens(dir: URL, files: Record<string, string>): void {
  const expected = new URL("expected/", dir);
  rmSync(expected, { recursive: true, force: true });
  for (const [relative, content] of Object.entries(files)) {
    const target = fileURLToPath(new URL(relative, expected));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
}

describe("conformance/emit-tf", () => {
  it("has cases", () => {
    expect(cases.map((c) => c.name)).toEqual([
      "demo-complete-map",
      "demo-incomplete-map",
      "hostile-text",
      "module-set",
    ]);
  });
});

describe.each(cases)("emit-tf case $name", (testCase) => {
  const emitted = (): Record<string, string> => emitTf(testCase.docs, testCase.options).files;

  it("matches the golden output byte for byte", () => {
    const files = emitted();
    if (update) writeGoldens(testCase.dir, files);
    const expected = update ? files : testCase.expected;

    expect(Object.keys(expected).length).toBeGreaterThan(0);
    expect(Object.keys(files)).toEqual(Object.keys(expected));
    for (const [path, content] of Object.entries(files)) {
      expect(content, `${testCase.name}/${path}`).toBe(expected[path]);
    }
  });

  it("emits paths in sorted order", () => {
    const paths = Object.keys(emitted());
    expect(paths).toEqual([...paths].sort());
  });

  it("is byte-stable across runs", () => {
    // Entries, not the object: this has to catch a change in path order too.
    expect(JSON.stringify(Object.entries(emitted()))).toBe(
      JSON.stringify(Object.entries(emitted())),
    );
  });

  // The one rule that outranks every other in this repo: authored content and
  // emitter output carry reference tokens or terraform addresses, never ARNs.
  it("emits no literal ARN", () => {
    for (const [path, content] of Object.entries(emitted())) {
      expect(content, path).not.toContain("arn:aws");
    }
  });

  it("emits no provider block, backend, or credential", () => {
    for (const [path, content] of Object.entries(emitted())) {
      if (path.endsWith(".example")) continue;
      expect(content, path).not.toMatch(/^\s*provider\s+"/m);
      expect(content, path).not.toMatch(/^\s*backend\s+"/m);
      expect(content, path).not.toMatch(/access_key|secret_key|session_token/);
    }
  });

  it("ends every file with exactly one trailing newline", () => {
    for (const [path, content] of Object.entries(emitted())) {
      expect(content.endsWith("\n"), path).toBe(true);
      expect(content.endsWith("\n\n"), path).toBe(false);
    }
  });
});
