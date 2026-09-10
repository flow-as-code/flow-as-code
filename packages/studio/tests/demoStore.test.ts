/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Acceptance: layout survives reload. A write followed by a fresh read returns
// identical positions, and the stored text is the byte-stable serialization.

import { serialize } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { moveNode } from "../src/model/mutations.js";
import { createDemoStore } from "../src/store/demoStore.js";
import { demoDoc } from "./helpers.js";

describe("DemoStore", () => {
  it("lists the demo doc", async () => {
    const store = createDemoStore();
    expect(await store.list()).toEqual([{ name: "appointment-line" }]);
  });

  it("reads the canonical demo doc", async () => {
    const store = createDemoStore();
    const { doc, text } = await store.read("appointment-line");
    expect(doc.name).toBe("appointment-line");
    expect(doc.content.Actions).toHaveLength(11);
    expect(text).toBe(serialize(doc));
  });

  it("layout survives write and reload with identical positions", async () => {
    const store = createDemoStore();
    const { doc } = await store.read("appointment-line");
    const moved = moveNode(doc, "welcome", { x: 987, y: 654 });
    await store.write("appointment-line", moved);

    const reread = await store.read("appointment-line");
    expect(reread.doc.layout).toEqual(moved.layout);
    expect(reread.doc.layout?.welcome).toEqual({ x: 987, y: 654 });
    // Byte-stable round trip: writing what we read back changes nothing.
    await store.write("appointment-line", reread.doc);
    expect((await store.read("appointment-line")).text).toBe(reread.text);
  });

  it("store instances do not share state", async () => {
    const a = createDemoStore();
    const b = createDemoStore();
    const { doc } = await a.read("appointment-line");
    await a.write("appointment-line", moveNode(doc, "welcome", { x: 1, y: 2 }));
    const fresh = await b.read("appointment-line");
    expect(fresh.doc.layout?.welcome).toEqual(demoDoc().layout?.welcome);
  });

  it("rejects reads of unknown documents", async () => {
    await expect(createDemoStore().read("nope")).rejects.toThrow(/No document/);
  });
});
