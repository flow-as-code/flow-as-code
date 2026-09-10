/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// The whole studio half of the round trip, wired the way it ships: a page
// served by the bridge boots on the BridgeStore, subscribes to the event
// stream, and a builder-file edit reaches the canvas.
//
// This is deliberately an App-level test. Every piece below is unit-tested
// elsewhere, but the wire between them is one line in App.tsx, and deleting
// that line broke nothing else.

import { serialize, type FlowDoc } from "@flow-as-code/core";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { BRIDGE_GLOBAL, BRIDGE_PROTOCOL } from "../src/store/bridgeProtocol.js";
import type { BridgeEvent } from "../src/store/bridgeProtocol.js";
import {
  blur,
  click,
  installDomStubs,
  present,
  query,
  render,
  testId,
  unmount,
} from "./appHarness.js";
import { demoDoc } from "./helpers.js";

const NAME = "appointment-line";

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  delete (globalThis as Record<string, unknown>)[BRIDGE_GLOBAL];
  vi.unstubAllGlobals();
});

/** The demo document plus one block, as a builder-file edit would produce. */
function withExtraBlock(): FlowDoc {
  const doc = demoDoc();
  doc.content.Actions.push({
    Identifier: "second-hang-up",
    Type: "DisconnectParticipant",
    Parameters: {},
    Transitions: {},
  });
  doc.layout = { ...doc.layout, "second-hang-up": { x: 900, y: 400 } };
  return doc;
}

/** The demo document with the welcome block's spoken text replaced. */
function withBody(text: string): FlowDoc {
  const doc = demoDoc();
  doc.content.Actions.find((a) => a.Identifier === "welcome")!.Parameters.Text = text;
  return doc;
}

/**
 * Serves the bridge routes from memory. Events are handed out only once the
 * test calls `deliver`, so "an edit arrives while the studio is open" is what
 * is under test rather than a race with the initial load.
 *
 * `writes` records every non-GET request, which is how a test asserts that a
 * gesture wrote nothing at all rather than only that the header looks calm.
 */
function serveBridge(): { deliver: (events: BridgeEvent[]) => void; writes: string[] } {
  (globalThis as Record<string, unknown>)[BRIDGE_GLOBAL] = {
    protocol: BRIDGE_PROTOCOL,
    token: "test-token",
    dir: "/tmp/flows",
    label: "flows",
  };
  let pending: BridgeEvent[] = [];
  let cursor = 0;
  const writes: string[] = [];
  vi.stubGlobal("fetch", (url: string, init?: { method?: string }) => {
    const method = init?.method ?? "GET";
    if (method !== "GET") writes.push(`${method} ${url}`);
    let body: unknown;
    if (url.endsWith("/bridge/docs")) {
      body = { docs: [{ name: NAME }] };
    } else if (url.includes("/bridge/events")) {
      if (pending.length > 0) cursor += pending.length;
      body = { cursor, events: pending };
      pending = [];
    } else {
      body = { name: NAME, doc: demoDoc(), text: serialize(demoDoc()) };
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
  return {
    deliver: (events) => {
      pending = events;
    },
    writes,
  };
}

/**
 * Waits for the app to reach a state. The act() flush is INSIDE the retry, not
 * around it: React queues an update dispatched from outside act (the poll loop
 * is outside), and a waitFor wrapped in one act() would spin on a DOM that
 * cannot change until that act exits.
 */
async function settle(check: () => void): Promise<void> {
  await vi.waitFor(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    check();
  });
}

describe("a page served by the bridge", () => {
  it("boots on the bridge store, not the demo", async () => {
    serveBridge();
    await render(<App />);
    await settle(() => expect(query('[data-testid="node-welcome"]')).not.toBeNull());
    // The toolbar names the served directory rather than "demo".
    expect(document.body.textContent).toContain("flows");
    expect(document.body.textContent).not.toContain("demo");
  });

  it("hot-reloads the canvas from a synced event, keeping the selection", async () => {
    const next = withExtraBlock();
    const bridge = serveBridge();
    await render(<App />);
    await settle(() => expect(query('[data-testid="node-welcome"]')).not.toBeNull());

    await click(present('[data-testid="node-welcome"]'));
    expect(present('[data-testid="node-welcome"]').className).toContain("ring-2");

    // The edit arrives on the event stream: no reload, no re-open.
    bridge.deliver([{ seq: 1, kind: "synced", name: NAME, doc: next, text: serialize(next) }]);
    await settle(() => expect(query('[data-testid="node-second-hang-up"]')).not.toBeNull());
    // The block the user was inspecting is still selected.
    expect(present('[data-testid="node-welcome"]').className).toContain("ring-2");
    expect(present('[data-testid="inspector"]').textContent).toContain("welcome");
  });

  it("shows a synced body edit in the inspector it is being edited in", async () => {
    const next = withBody("Hello from disk edit three.");
    const bridge = serveBridge();
    await render(<App />);
    await settle(() => expect(query('[data-testid="node-welcome"]')).not.toBeNull());
    await click(present('[data-testid="node-welcome"]'));
    expect(testId<HTMLTextAreaElement>("message-body").value).toContain("Thanks for calling");

    bridge.deliver([{ seq: 1, kind: "synced", name: NAME, doc: next, text: serialize(next) }]);
    await settle(() =>
      expect(testId<HTMLTextAreaElement>("message-body").value).toBe("Hello from disk edit three."),
    );
  });

  it("does not write a stale body back when the field is clicked after a sync", async () => {
    // The defect: the textarea kept the pre-sync text, so a click and a blur
    // with no typing at all committed it as an edit and the next Save wrote it
    // over the file that had just changed on disk, with no conflict dialog.
    const next = withBody("Hello from disk edit three.");
    const bridge = serveBridge();
    await render(<App />);
    await settle(() => expect(query('[data-testid="node-welcome"]')).not.toBeNull());
    await click(present('[data-testid="node-welcome"]'));

    bridge.deliver([{ seq: 1, kind: "synced", name: NAME, doc: next, text: serialize(next) }]);
    await settle(() =>
      expect(testId<HTMLTextAreaElement>("message-body").value).toBe("Hello from disk edit three."),
    );

    await blur(testId<HTMLTextAreaElement>("message-body"));
    expect(testId<HTMLTextAreaElement>("message-body").value).toBe("Hello from disk edit three.");
    // No mutation: the document is not dirty and Save has nothing to write.
    expect(document.body.textContent).not.toContain("unsaved changes");
    expect(bridge.writes).toEqual([]);
  });

  it("keeps one readable out-of-sync line until the builder file synths again", async () => {
    // A synth failure used to be an eight-second toast carrying the whole tsx
    // stack trace, after which nothing said the canvas and the file on disk
    // had stopped agreeing.
    const bridge = serveBridge();
    await render(<App />);
    await settle(() => expect(query('[data-testid="node-welcome"]')).not.toBeNull());

    bridge.deliver([
      {
        seq: 1,
        kind: "error",
        name: NAME,
        path: `/tmp/flows/${NAME}.flow.ts`,
        message:
          "Cannot find package '@flow-as-code/core'\n" +
          "    at packageResolve (node:internal/modules/esm/resolve:873:9)\n" +
          "    at moduleResolve (node:internal/modules/esm/resolve:947:18)",
      },
    ]);
    await settle(() => expect(query('[data-testid="sync-error"]')).not.toBeNull());

    const badge = testId("sync-error");
    // The visible label is the file name and nothing longer, because the badge
    // is width-capped and a longer one clipped mid-path.
    expect(badge.textContent).toBe(`Code out of sync: ${NAME}.flow.ts`);
    expect(badge.textContent).not.toContain("/tmp/flows/");

    // The accessible name says what is wrong, not just where. It was the raw
    // absolute path of the builder file, which told a screen reader reader
    // nothing about the failure.
    const label = badge.getAttribute("aria-label") ?? "";
    expect(label).toBe(
      `Code out of sync: ${NAME}.flow.ts: Cannot find package '@flow-as-code/core'`,
    );
    expect(label).not.toContain("/tmp/flows/");
    expect(label).not.toContain("at packageResolve");
    // Pointer and screen reader are told the same thing.
    expect(badge.getAttribute("title")).toBe(label);

    // Fixing the file is what clears it.
    bridge.deliver([
      { seq: 2, kind: "synced", name: NAME, doc: demoDoc(), text: serialize(demoDoc()) },
    ]);
    await settle(() => expect(query('[data-testid="sync-error"]')).toBeNull());
  });

  it("reduces the absolute path inside the synth message to the file name", async () => {
    // The real message from a builder file that does not compile repeats the
    // absolute path the badge already names, and it was the whole reason the
    // label ran off the end of the badge.
    const bridge = serveBridge();
    await render(<App />);
    await settle(() => expect(query('[data-testid="node-welcome"]')).not.toBeNull());

    const path = `/private/tmp/a/very/long/served/directory/${NAME}.flow.ts`;
    bridge.deliver([
      {
        seq: 1,
        kind: "error",
        name: NAME,
        path,
        message: `Evaluating ${path} threw: Transform failed with 1 error`,
      },
    ]);
    await settle(() => expect(query('[data-testid="sync-error"]')).not.toBeNull());

    expect(testId("sync-error").getAttribute("aria-label")).toBe(
      `Code out of sync: ${NAME}.flow.ts: Evaluating ${NAME}.flow.ts threw: ` +
        "Transform failed with 1 error",
    );
  });

  it("shows a conflict event as the dialog, with saving blocked", async () => {
    const codeSide = withExtraBlock();
    const bridge = serveBridge();
    await render(<App />);
    await settle(() => expect(query('[data-testid="node-welcome"]')).not.toBeNull());

    bridge.deliver([
      {
        seq: 1,
        kind: "conflict",
        name: NAME,
        reason: "both sides changed",
        origin: "disk",
        docSide: demoDoc(),
        codeSide,
      },
    ]);
    await settle(() => expect(query('[data-testid="conflict-modal"]')).not.toBeNull());
    expect(present('[data-testid="conflict-diff"]').textContent).toContain("second-hang-up");
  });
});
