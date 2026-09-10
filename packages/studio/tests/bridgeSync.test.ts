/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The live round trip as a state machine: what a "synced" event does to the
// open document, and the conflict rules. No DOM and no server here; the
// dialog is covered in conflictUi.test.tsx and the wire in
// packages/cli/src/bridge/server.test.ts.

import type { FlowDoc } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { setParam } from "../src/model/mutations.js";
import {
  CONFLICT_LOCKED,
  initialState,
  reducer,
  defaultStore,
  type StudioState,
} from "../src/state/studio.js";
import type { BridgeConflict } from "../src/store/bridgeProtocol.js";
import { BRIDGE_GLOBAL, BRIDGE_PROTOCOL } from "../src/store/bridgeProtocol.js";
import { BridgeStore } from "../src/store/bridgeStore.js";
import { createDemoStore } from "../src/store/demoStore.js";
import { demoDoc } from "./helpers.js";

const NAME = "appointment-line";

function loaded(): StudioState {
  return reducer(initialState(createDemoStore()), {
    type: "doc-loaded",
    name: NAME,
    doc: demoDoc(),
  });
}

/** The demo doc with one prompt changed, as a builder-file edit would produce. */
function editedDoc(text: string): FlowDoc {
  const doc = demoDoc();
  doc.content.Actions.find((a) => a.Identifier === "welcome")!.Parameters.Text = text;
  return doc;
}

function conflictFor(overrides: Partial<BridgeConflict> = {}): BridgeConflict {
  return {
    name: NAME,
    reason: "both sides changed",
    origin: "disk",
    docSide: demoDoc(),
    codeSide: editedDoc("From the builder file."),
    ...overrides,
  };
}

describe("doc-synced", () => {
  it("replaces the open document and clears dirty", () => {
    const state = reducer(loaded(), { type: "doc-synced", name: NAME, doc: editedDoc("Hello.") });
    expect(JSON.stringify(state.doc?.content)).toContain("Hello.");
    expect(state.dirty).toBe(false);
    expect(state.lintPending).toBe(true);
  });

  it("keeps the selection when the selected block survives the edit", () => {
    // Losing the selection on every keystroke in the editor would make the
    // live round trip unusable; the viewport is React Flow's and survives
    // because the canvas is not remounted.
    let state = reducer(loaded(), { type: "select", id: "welcome" });
    state = reducer(state, { type: "doc-synced", name: NAME, doc: editedDoc("Hello.") });
    expect(state.selected).toBe("welcome");
  });

  it("drops the selection when the selected block is gone", () => {
    let state = reducer(loaded(), { type: "select", id: "welcome" });
    const without = demoDoc();
    without.content.Actions = without.content.Actions.filter((a) => a.Identifier !== "welcome");
    state = reducer(state, { type: "doc-synced", name: NAME, doc: without });
    expect(state.selected).toBeNull();
  });

  it("ignores an event for a document that is not open", () => {
    const state = loaded();
    expect(reducer(state, { type: "doc-synced", name: "other-flow", doc: demoDoc() })).toBe(state);
  });

  it("raises a conflict instead of discarding unsaved canvas work", () => {
    const state = loaded();
    const dirty = reducer(state, {
      type: "mutated",
      doc: setParam(state.doc!, "welcome", "Text", "Typed on the canvas."),
    });
    expect(dirty.dirty).toBe(true);

    const next = reducer(dirty, {
      type: "doc-synced",
      name: NAME,
      doc: editedDoc("Typed in the editor."),
    });
    expect(next.doc).toBe(dirty.doc);
    expect(next.conflict?.origin).toBe("canvas");
    expect(JSON.stringify(next.conflict?.docSide?.content)).toContain("Typed on the canvas.");
    expect(JSON.stringify(next.conflict?.codeSide?.content)).toContain("Typed in the editor.");
  });

  it("adopts an event that matches the unsaved document rather than asking", () => {
    const state = loaded();
    const edited = setParam(state.doc!, "welcome", "Text", "Same on both sides.");
    const dirty = reducer(state, { type: "mutated", doc: edited });
    const next = reducer(dirty, { type: "doc-synced", name: NAME, doc: edited });
    expect(next.conflict).toBeNull();
    expect(next.dirty).toBe(false);
  });

  it("takes the new document once the user has answered (force)", () => {
    const state = loaded();
    const dirty = reducer(state, {
      type: "mutated",
      doc: setParam(state.doc!, "welcome", "Text", "Canvas."),
    });
    const next = reducer(dirty, {
      type: "doc-synced",
      name: NAME,
      doc: editedDoc("Editor."),
      force: true,
    });
    expect(JSON.stringify(next.doc?.content)).toContain("Editor.");
    expect(next.conflict).toBeNull();
  });
});

describe("conflict", () => {
  it("holds the conflict for the open document and ignores others", () => {
    const state = reducer(loaded(), { type: "conflict", conflict: conflictFor() });
    expect(state.conflict?.name).toBe(NAME);
    expect(reducer(state, { type: "conflict", conflict: conflictFor({ name: "other" }) })).toEqual(
      state,
    );
  });

  it("is cleared by a sync, however the pair got back in sync", () => {
    const state = reducer(loaded(), { type: "conflict", conflict: conflictFor() });
    const resolved = reducer(state, { type: "doc-synced", name: NAME, doc: demoDoc() });
    expect(resolved.conflict).toBeNull();
    expect(resolved.resolving).toBe(false);
  });

  it("refuses an edit until the user has answered", () => {
    // An edit landing while the question is open belongs to neither answer:
    // "keep the canvas version" writes the snapshot the dialog is showing, so
    // the edit would be dropped without ever being named.
    const state = reducer(loaded(), {
      type: "conflict",
      conflict: conflictFor({ origin: "canvas", docSide: editedDoc("Canvas.") }),
    });
    const next = reducer(state, {
      type: "mutated",
      doc: setParam(state.doc!, "welcome", "Text", "Typed behind the dialog."),
    });
    expect(next.doc).toBe(state.doc);
    expect(next.dirty).toBe(false);
    expect(next.conflict).toBe(state.conflict);
    expect(next.notice?.message).toBe(CONFLICT_LOCKED);
  });

  it("is cleared by opening another document", () => {
    const state = reducer(loaded(), { type: "conflict", conflict: conflictFor() });
    const other = reducer(state, { type: "doc-loaded", name: "other", doc: demoDoc() });
    expect(other.conflict).toBeNull();
  });
});

describe("a synth failure", () => {
  const failure = {
    type: "sync-error" as const,
    name: NAME,
    path: `${NAME}.flow.ts`,
    message: "Cannot find package '@flow-as-code/core'",
  };

  it("is kept until that document syncs again, and toasted once", () => {
    const state = reducer(loaded(), failure);
    expect(state.syncError?.message).toContain("Cannot find package");
    expect(state.notice?.message).toContain(`${NAME}.flow.ts`);

    // Dismissing the toast is not fixing the file.
    const dismissed = reducer(state, { type: "notice", message: null });
    expect(dismissed.syncError).toBe(state.syncError);

    const synced = reducer(dismissed, { type: "doc-synced", name: NAME, doc: demoDoc() });
    expect(synced.syncError).toBeNull();
  });

  it("survives a sync of a different document", () => {
    const state = reducer(loaded(), failure);
    const other = reducer(state, { type: "doc-synced", name: "other-flow", doc: demoDoc() });
    expect(other.syncError).toBe(state.syncError);
  });

  it("clears on any sync when the bridge could not name the document", () => {
    const state = reducer(loaded(), { type: "sync-error", path: "flows", message: "boom" });
    expect(
      reducer(state, { type: "doc-synced", name: "other-flow", doc: demoDoc() }).syncError,
    ).toBe(null);
  });
});

describe("the header error", () => {
  const failed = (): StudioState => reducer(loaded(), { type: "error", message: "Refusing." });

  it("clears on the next edit, save, or sync", () => {
    const state = failed();
    expect(state.error).toBe("Refusing.");
    expect(
      reducer(state, {
        type: "mutated",
        doc: setParam(state.doc!, "welcome", "Text", "Fixed."),
      }).error,
    ).toBeNull();
    expect(reducer(state, { type: "saved" }).error).toBeNull();
    expect(reducer(state, { type: "doc-synced", name: NAME, doc: demoDoc() }).error).toBeNull();
  });
});

describe("defaultStore", () => {
  it("is the demo store when the page was not served by a bridge", () => {
    expect(defaultStore({})).not.toBeInstanceOf(BridgeStore);
    expect(defaultStore({}).label).toBe("demo");
  });

  it("is the bridge store when the server injected its description", () => {
    const store = defaultStore({
      [BRIDGE_GLOBAL]: {
        protocol: BRIDGE_PROTOCOL,
        dir: "/tmp/flows",
        label: "flows",
        token: "test-token",
      },
    });
    expect(store).toBeInstanceOf(BridgeStore);
    expect(store.label).toBe("flows");
    expect(store.persistent).toBe(true);
  });

  it("ignores a description from a different protocol version", () => {
    const store = defaultStore({
      [BRIDGE_GLOBAL]: {
        protocol: BRIDGE_PROTOCOL + 1,
        dir: "/tmp",
        label: "x",
        token: "test-token",
      },
    });
    expect(store).not.toBeInstanceOf(BridgeStore);
  });
});
