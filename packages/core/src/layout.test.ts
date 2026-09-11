/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// conformance/layout pins the auto-layout algorithm every implementation
// assigns to unplaced actions (conformance/layout/README.md). The expected
// positions were worked by hand from the specification, so this suite is the
// implementation being held to the words rather than the words to the code.

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FlowDoc } from "./index.js";
import { LAYOUT_MARGIN, NODE_GAP, NODE_HEIGHT, NODE_WIDTH, RANK_GAP, autoLayout } from "./index.js";

const root = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const cases = readdirSync(new URL("conformance/layout/", root), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

describe("auto-layout conformance", () => {
  it("has the cases the README lists", () => {
    expect(cases).toEqual([
      "branching",
      "cycle",
      "linear",
      "longest-path",
      "single",
      "unreachable",
    ]);
  });

  it.each(cases)("%s", (name) => {
    const doc = JSON.parse(read(`conformance/layout/${name}/doc.flowdoc.json`)) as FlowDoc;
    const expected = read(`conformance/layout/${name}/expected.layout.json`);
    const actual = autoLayout(doc.content.Actions, doc.content.StartAction);
    expect(JSON.stringify(actual, null, 2) + "\n").toBe(expected);
  });
});

describe("auto-layout properties", () => {
  const docs = cases.map(
    (name) => JSON.parse(read(`conformance/layout/${name}/doc.flowdoc.json`)) as FlowDoc,
  );

  it("places every action, on the grid the constants define, never two in one place", () => {
    for (const doc of docs) {
      const layout = autoLayout(doc.content.Actions, doc.content.StartAction);
      expect(Object.keys(layout).sort()).toEqual(
        doc.content.Actions.map((a) => a.Identifier).sort(),
      );
      const seen = new Set<string>();
      for (const p of Object.values(layout)) {
        expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
        expect((p.x - LAYOUT_MARGIN) % (NODE_WIDTH + RANK_GAP)).toBe(0);
        expect((p.y - LAYOUT_MARGIN) % (NODE_HEIGHT + NODE_GAP)).toBe(0);
        const key = `${String(p.x)},${String(p.y)}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("is a pure function of the array and the start", () => {
    for (const doc of docs) {
      const once = autoLayout(doc.content.Actions, doc.content.StartAction);
      const twice = autoLayout(doc.content.Actions, doc.content.StartAction);
      expect(twice).toEqual(once);
    }
  });

  it("defaults the start to the first action", () => {
    const doc = docs.find((d) => d.name === "linear")!;
    expect(autoLayout(doc.content.Actions)).toEqual(
      autoLayout(doc.content.Actions, doc.content.StartAction),
    );
  });

  it("treats everything as unreachable when the start names no action", () => {
    const doc = docs.find((d) => d.name === "linear")!;
    const layout = autoLayout(doc.content.Actions, "nowhere");
    expect(Object.values(layout).map((p) => p.x)).toEqual([20, 20, 20]);
    expect(Object.values(layout).map((p) => p.y)).toEqual([20, 120, 220]);
  });

  it("survives an empty array", () => {
    expect(autoLayout([])).toEqual({});
  });
});
