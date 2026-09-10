/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// The conflict dialog on screen. The rule it enforces is the one
// docs/02-studio-design.md states: the studio shows a diff and asks which side
// wins, and nothing is written until the user answers. So the assertions are
// about what is shown, what is disabled, and what each button actually does.

import type { FlowDoc } from "@flow-as-code/core";
import { serialize } from "@flow-as-code/core";
import { act, useEffect, useRef } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ConflictModal } from "../src/components/ConflictModal.js";
import { Toolbar } from "../src/components/Toolbar.js";
import { setParam } from "../src/model/mutations.js";
import { StudioProvider, useStudio } from "../src/state/studio.js";
import type { BridgeConflict, BridgeInfo } from "../src/store/bridgeProtocol.js";
import { BRIDGE_PROTOCOL } from "../src/store/bridgeProtocol.js";
import { BridgeStore, type BridgeFetch } from "../src/store/bridgeStore.js";
import { button, click, installDomStubs, query, render, testId, unmount } from "./appHarness.js";
import { demoDoc } from "./helpers.js";

const NAME = "appointment-line";
const INFO: BridgeInfo = {
  protocol: BRIDGE_PROTOCOL,
  dir: "/tmp/flows",
  label: "flows",
  token: "test-token",
};

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

function editedDoc(text: string): FlowDoc {
  const doc = demoDoc();
  doc.content.Actions.find((a) => a.Identifier === "welcome")!.Parameters.Text = text;
  return doc;
}

interface Request {
  url: string;
  body: unknown;
}

/** A bridge holding the demo document, recording what the dialog asks of it. */
function bridgeStore(requests: Request[]): BridgeStore {
  const fetchImpl: BridgeFetch = (url, init) => {
    const method = init?.method ?? "GET";
    const body: unknown = init?.body === undefined ? undefined : JSON.parse(init.body);
    if (method !== "GET") requests.push({ url, body });
    const reply = url.endsWith("/bridge/docs")
      ? { docs: [{ name: NAME }] }
      : method === "GET"
        ? { name: NAME, doc: demoDoc(), text: serialize(demoDoc()) }
        : {
            name: NAME,
            doc: editedDoc("From the builder file."),
            text: serialize(editedDoc("From the builder file.")),
          };
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(reply)),
    });
  };
  return new BridgeStore(INFO, { base: "", fetch: fetchImpl, idleMs: 10_000 });
}

function conflictFor(overrides: Partial<BridgeConflict> = {}): BridgeConflict {
  return {
    name: NAME,
    reason: "both sides changed since the last sync",
    origin: "disk",
    docSide: demoDoc(),
    codeSide: editedDoc("From the builder file."),
    ...overrides,
  };
}

/** Mounts the app's real boot path on a stub bridge, then raises a conflict. */
function Harness({ store, conflict }: { store: BridgeStore; conflict: BridgeConflict }) {
  return (
    <StudioProvider store={store}>
      <HarnessInner conflict={conflict} />
    </StudioProvider>
  );
}

function HarnessInner({ conflict }: { conflict: BridgeConflict }) {
  const { state, dispatch } = useStudio();
  // Raised once. Re-raising whenever state.conflict went back to null would
  // hide the thing under test: that answering clears it.
  const raised = useRef(false);
  useEffect(() => {
    if (state.doc === null || raised.current) return;
    if (state.lintPending) {
      // The lint worker is not part of this file; a clean verdict stands in,
      // so the only thing left disabling Save is the conflict.
      dispatch({ type: "lint", findings: [], blocked: false });
      return;
    }
    if (!state.dirty) {
      dispatch({
        type: "mutated",
        doc: setParam(state.doc, "welcome", "Text", "Unsaved canvas edit."),
      });
      return;
    }
    raised.current = true;
    dispatch({ type: "conflict", conflict });
  }, [state, dispatch, conflict]);

  const welcome = state.doc?.content.Actions.find((a) => a.Identifier === "welcome");
  return state.doc === null ? null : (
    <>
      <Toolbar />
      <ConflictModal />
      {/* Stands in for the inspector, which is live behind the dialog in the
          shipped shell: one gesture that dispatches a mutation. */}
      <button
        type="button"
        data-testid="edit-behind"
        onClick={() =>
          dispatch({
            type: "mutated",
            doc: setParam(state.doc!, "welcome", "Text", "Typed behind the dialog."),
          })
        }
      >
        edit behind the dialog
      </button>
      <span data-testid="doc-probe">{String(welcome?.Parameters.Text)}</span>
    </>
  );
}

/** Mounts and lets the boot chain (list, read, lint, edit, conflict) settle. */
async function mount(store: BridgeStore, conflict: BridgeConflict): Promise<void> {
  await render(<Harness store={store} conflict={conflict} />);
  await act(async () => {
    await vi.waitFor(() => expect(query('[data-testid="conflict-modal"]')).not.toBeNull());
  });
}

describe("conflict dialog", () => {
  it("shows both sides, the diff, and no way out but choosing", async () => {
    await mount(bridgeStore([]), conflictFor());

    const modal = testId("conflict-modal");
    expect(modal.textContent).toContain("changed on both sides");
    expect(modal.textContent).toContain("both sides changed since the last sync");
    // Side by side: one row per line, two cells per row, and the changed line
    // shows both versions.
    const diff = testId("conflict-diff");
    expect(diff.textContent).toContain("Thanks for calling");
    expect(diff.textContent).toContain("From the builder file.");
    // The only controls are the two choices; there is no dismiss.
    const buttons = [...modal.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toEqual(["Keep the canvas version", "Keep the code version"]);
  });

  it("blocks saving until the user answers", async () => {
    await mount(bridgeStore([]), conflictFor());
    expect(button("save-button").disabled).toBe(true);
    expect(testId("save-conflicted").textContent).toContain("choose which side");
  });

  it("asks the bridge for the code side when the user picks it", async () => {
    const requests: Request[] = [];
    await mount(bridgeStore(requests), conflictFor());
    await click(button("conflict-keep-code"));

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(`/bridge/docs/${NAME}/resolve`);
    expect(requests[0]!.body).toEqual({ side: "code" });
    // The canvas takes the resolved document and the dialog goes away.
    expect(query('[data-testid="conflict-modal"]')).toBeNull();
  });

  it("asks the bridge for the doc side when both sides are files", async () => {
    const requests: Request[] = [];
    await mount(bridgeStore(requests), conflictFor());
    await click(button("conflict-keep-doc"));
    expect(requests[0]!.url).toBe(`/bridge/docs/${NAME}/resolve`);
    expect(requests[0]!.body).toEqual({ side: "doc" });
  });

  it("force-writes the canvas side when only this window holds it", async () => {
    const requests: Request[] = [];
    const canvasSide = editedDoc("Unsaved canvas edit.");
    await mount(bridgeStore(requests), conflictFor({ origin: "canvas", docSide: canvasSide }));
    await click(button("conflict-keep-doc"));

    // Nothing else has these bytes, so keeping them is a forced write, not a
    // resolve of something already on disk.
    expect(requests[0]!.url).toBe(`/bridge/docs/${NAME}`);
    expect(requests[0]!.body).toEqual({ doc: canvasSide, force: true });
    expect(query('[data-testid="conflict-modal"]')).toBeNull();
  });

  it("refuses to offer a side it could not read", async () => {
    await mount(
      bridgeStore([]),
      conflictFor({ codeSide: null, codeError: "SyntaxError: unexpected }" }),
    );
    expect(button("conflict-keep-code").disabled).toBe(true);
    expect(button("conflict-keep-doc").disabled).toBe(false);
    expect(testId("conflict-code-error").textContent).toContain("unexpected }");
  });

  it("pauses editing while it is open, and says so where the user is looking", async () => {
    // The dialog used to cover the canvas only, so the inspector stayed live
    // behind it and an edit made there went into a document no answer would
    // write: "keep the canvas version" writes the frozen snapshot.
    await mount(bridgeStore([]), conflictFor({ origin: "canvas", docSide: editedDoc("Canvas.") }));
    await click(testId("edit-behind"));

    expect(testId("doc-probe").textContent).toBe("Unsaved canvas edit.");
    expect(testId("conflict-notice").textContent).toContain("editing is paused");
    expect(query('[data-testid="conflict-modal"]')).not.toBeNull();
  });

  it("refuses a canvas version the save gate would refuse, leaving a way out", async () => {
    // Keeping the canvas side is a forced write from this window, so it runs
    // the save gate. Discovering that inside the write left the refusal in the
    // header behind the modal and the dialog up with the same dead button.
    const refused = editedDoc("arn:aws:connect:us-east-1:123456789012:instance/i/queue/q");
    await mount(bridgeStore([]), conflictFor({ origin: "canvas", docSide: refused }));

    expect(button("conflict-keep-doc").disabled).toBe(true);
    expect(testId("conflict-doc-refused").textContent).toContain("no-literal-arn");
    expect(testId("conflict-doc-refused").textContent).toContain("Keep the code version");
    // The way out of the dialog is still open.
    expect(button("conflict-keep-code").disabled).toBe(false);
  });

  it("shows a failed resolve inside the dialog, which now covers the header", async () => {
    const store = bridgeStore([]);
    vi.spyOn(store, "resolve").mockRejectedValue(new Error("the bridge said no"));
    await mount(store, conflictFor());
    await click(button("conflict-keep-code"));

    expect(testId("conflict-error").textContent).toContain("the bridge said no");
    expect(query('[data-testid="conflict-modal"]')).not.toBeNull();
  });

  it("says so when the two sides describe the same flow", async () => {
    await mount(bridgeStore([]), conflictFor({ codeSide: demoDoc() }));
    expect(testId("conflict-identical").textContent).toContain("same flow");
    expect(query('[data-testid="conflict-diff"]')).toBeNull();
  });
});
