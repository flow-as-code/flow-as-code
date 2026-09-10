/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The diff behind the conflict dialog. A wrong diff is worse than no diff:
// the user picks a side based on what it shows.

import type { FlowDoc } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { diffDocs, diffLines, docLines } from "../src/model/docDiff.js";
import { demoDoc } from "./helpers.js";

describe("diffLines", () => {
  it("says two identical inputs are identical, with every line paired", () => {
    const lines = ["a", "b", "c"];
    const diff = diffLines(lines, [...lines]);
    expect(diff.identical).toBe(true);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.rows.map((r) => [r.left, r.right])).toEqual([
      ["a", "a"],
      ["b", "b"],
      ["c", "c"],
    ]);
  });

  it("pairs a replaced line so the two columns line up", () => {
    const diff = diffLines(["a", "b", "c"], ["a", "B", "c"]);
    expect(diff.identical).toBe(false);
    expect(diff.rows.map((r) => r.kind)).toEqual(["same", "changed", "same"]);
    const changed = diff.rows[1]!;
    expect(changed.left).toBe("b");
    expect(changed.right).toBe("B");
    expect(changed.leftNo).toBe(2);
    expect(changed.rightNo).toBe(2);
  });

  it("keeps an insertion one-sided and numbers the columns independently", () => {
    const diff = diffLines(["a", "c"], ["a", "b", "c"]);
    expect(diff.rows.map((r) => r.kind)).toEqual(["same", "added", "same"]);
    expect(diff.rows[1]!.left).toBeUndefined();
    expect(diff.rows[1]!.right).toBe("b");
    // "c" is line 2 on the left and line 3 on the right.
    expect(diff.rows[2]!.leftNo).toBe(2);
    expect(diff.rows[2]!.rightNo).toBe(3);
  });

  it("keeps a deletion one-sided", () => {
    const diff = diffLines(["a", "b", "c"], ["a", "c"]);
    expect(diff.rows.map((r) => r.kind)).toEqual(["same", "removed", "same"]);
    expect(diff.rows[1]!.right).toBeUndefined();
  });

  it("aligns around a moved block rather than calling everything changed", () => {
    const diff = diffLines(["x", "a", "b", "c", "y"], ["x", "a", "q", "b", "c", "y"]);
    expect(diff.rows.filter((r) => r.kind === "same")).toHaveLength(5);
    expect(diff.rows.filter((r) => r.kind === "added")).toHaveLength(1);
  });

  it("degrades to a coarse answer instead of allocating an unbounded matrix", () => {
    const left = Array.from({ length: 1200 }, (_, i) => `left ${String(i)}`);
    const right = Array.from({ length: 1200 }, (_, i) => `right ${String(i)}`);
    const diff = diffLines(left, right);
    expect(diff.coarse).toBe(true);
    expect(diff.identical).toBe(false);
    expect(diff.rows.length).toBeGreaterThan(0);
  });

  it("handles an empty side", () => {
    expect(diffLines([], ["a"]).rows.map((r) => r.kind)).toEqual(["added"]);
    expect(diffLines(["a"], []).rows.map((r) => r.kind)).toEqual(["removed"]);
    expect(diffLines([], []).identical).toBe(true);
  });
});

describe("diffDocs", () => {
  it("compares canonical serializations, so key order is not a difference", () => {
    const doc = demoDoc();
    const reordered = Object.fromEntries(
      Object.entries(doc as unknown as Record<string, unknown>).reverse(),
    ) as unknown as FlowDoc;
    expect(Object.keys(reordered)[0]).not.toBe(Object.keys(doc)[0]);
    expect(diffDocs(doc, reordered).identical).toBe(true);
  });

  it("shows a changed parameter as one changed line", () => {
    const left = demoDoc();
    const right = demoDoc();
    right.content.Actions.find((a) => a.Identifier === "welcome")!.Parameters.Text = "Different.";
    const diff = diffDocs(left, right);
    expect(diff.identical).toBe(false);
    const changed = diff.rows.filter((r) => r.kind === "changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]!.right).toContain("Different.");
  });

  it("treats a missing side as an empty document", () => {
    expect(diffDocs(null, demoDoc()).rows.every((r) => r.kind === "added")).toBe(true);
    expect(diffDocs(demoDoc(), null).rows.every((r) => r.kind === "removed")).toBe(true);
  });

  it("docLines drops the trailing newline rather than showing a blank last line", () => {
    const lines = docLines(demoDoc());
    expect(lines.at(-1)).toBe("}");
  });
});
