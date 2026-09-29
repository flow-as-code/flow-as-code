/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Only scripts are executable. A fixture copied from a filesystem that marks
// every file 0755 (an SMB share did, on 2026-09-29) lands in git as 100755, and
// the Go provider, which vendors conformance/ from a GitHub tarball, then
// carries the bit too. The index records the mode git will check out, so the
// test reads it there rather than from the working tree.
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url);

function executables(): string[] {
  const out = execFileSync("git", ["ls-files", "-s"], { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\n")
    .filter((line) => line.startsWith("100755 "))
    .map((line) => line.split("\t")[1] ?? "");
}

describe("file modes", () => {
  it("finds the scripts that are executable", () => {
    expect(executables()).toContain("scripts/license-headers.mjs");
  });

  it("marks nothing executable outside scripts/", () => {
    expect(executables().filter((path) => !path.startsWith("scripts/"))).toEqual([]);
  });
});
