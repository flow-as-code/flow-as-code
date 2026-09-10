/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The read-only store behind the hosted demo: reads delegate, writes refuse,
// and the boot store picks it exactly when the demo flag is set.

import { describe, expect, it } from "vitest";
import { defaultStore } from "../src/state/studio.js";
import { BRIDGE_GLOBAL, BRIDGE_PROTOCOL } from "../src/store/bridgeProtocol.js";
import { BridgeStore } from "../src/store/bridgeStore.js";
import { createDemoStore } from "../src/store/demoStore.js";
import { MemoryStore } from "../src/store/memoryStore.js";
import { READ_ONLY_MESSAGE, ReadOnlyStore, readOnly } from "../src/store/readOnlyStore.js";
import { demoDoc } from "./helpers.js";

describe("ReadOnlyStore", () => {
  it("reads through to the wrapped store and keeps its label", async () => {
    const inner = new MemoryStore("demo", [demoDoc()]);
    const store = readOnly(inner);
    expect(store).toBeInstanceOf(ReadOnlyStore);
    expect(store.label).toBe("demo");
    expect(store.readOnly).toBe(true);
    expect(store.persistent).toBe(false);
    expect(await store.list()).toEqual(await inner.list());
    expect((await store.read("appointment-line")).text).toBe(
      (await inner.read("appointment-line")).text,
    );
  });

  it("refuses every write and leaves the wrapped store untouched", async () => {
    const inner = new MemoryStore("demo", [demoDoc()]);
    const store = readOnly(inner);
    const before = (await inner.read("appointment-line")).text;
    const edited = demoDoc();
    edited.meta = { ...edited.meta, note: "changed in the tab" };
    await expect(store.write("appointment-line", edited)).rejects.toThrow(READ_ONLY_MESSAGE);
    expect((await inner.read("appointment-line")).text).toBe(before);
    // A valid document is refused too: this is not the save gate saying no.
    await expect(store.write("appointment-line", demoDoc())).rejects.toThrow(/read-only demo/);
  });

  it("tells the user edits stay in the tab and a reload restores the demo", () => {
    expect(READ_ONLY_MESSAGE).toMatch(/not saved/);
    expect(READ_ONLY_MESSAGE).toMatch(/[Rr]eload/);
  });
});

describe("defaultStore", () => {
  it("boots the plain demo store in the regular build", () => {
    const store = defaultStore({}, false);
    expect(store.readOnly).toBe(false);
    expect(store.label).toBe(createDemoStore().label);
  });

  it("boots the demo read-only in the demo build", () => {
    const store = defaultStore({}, true);
    expect(store).toBeInstanceOf(ReadOnlyStore);
    expect(store.readOnly).toBe(true);
    expect(store.label).toBe(createDemoStore().label);
  });

  it("still prefers an injected bridge, which the demo build stubs out", () => {
    const scope = {
      [BRIDGE_GLOBAL]: { protocol: BRIDGE_PROTOCOL, dir: "/x", label: "x", token: "t" },
    };
    expect(defaultStore(scope, true)).toBeInstanceOf(BridgeStore);
  });
});
