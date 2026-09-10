/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// Component smoke tests. happy-dom (engines node >=20.0.0, so it clears this
// repo's Node 22.12 floor) plus the React Flow measurement polyfills from
// tests/appHarness.tsx. No real Worker is spawned; useLintWorker falls back to
// the main thread when worker boot fails.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { click, installDomStubs, present, render, unmount } from "./appHarness.js";
import { demoDoc } from "./helpers.js";

beforeAll(installDomStubs);
afterEach(unmount);

const renderApp = () => render(<App />);

describe("studio app", () => {
  it("renders every demo doc node on the canvas", async () => {
    await renderApp();
    const nodes = document.querySelectorAll('[data-testid^="node-"]');
    expect(nodes.length).toBe(11);
    expect(document.querySelector('[data-testid="node-welcome"]')?.textContent).toContain(
      "MessageParticipant",
    );
  });

  it("opens the inspector with generated fields for a modeled block", async () => {
    await renderApp();
    await click(present('[data-testid="node-check-hours"]'));
    const inspector = document.querySelector('[data-testid="inspector"]');
    expect(inspector).not.toBeNull();
    expect(inspector?.textContent).toContain("check-hours");
    expect(inspector?.textContent).toContain("Hours of operation");
    // The typed ref picker lists the existing hours token by name.
    const options = [...(inspector?.querySelectorAll("option") ?? [])].map((o) => o.textContent);
    expect(options).toContain("main-line");
    expect(options).toContain("new reference…");
  });

  it("opens the read-only raw JSON inspector for the GenericBlock", async () => {
    await renderApp();
    await click(present('[data-testid="raw-button-enable-logging"]'));
    const raw = document.querySelector('[data-testid="raw-json"]');
    expect(raw).not.toBeNull();
    expect(raw?.textContent).toContain("UpdateFlowLoggingBehavior");
    expect(raw?.textContent).toContain("FlowLoggingBehavior");
  });

  it("renders the save button and lint panel", async () => {
    await renderApp();
    expect(document.querySelector('[data-testid="save-button"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="lint-panel"]')).not.toBeNull();
  });

  it("lists every reference with its usage count and drills into the users", async () => {
    await renderApp();
    const panel = present('[data-testid="refs-panel"]');
    const rows = panel.querySelectorAll('[data-testid^="ref-${cdref:"]');
    expect(rows.length).toBe(demoDoc().refs?.length);
    const hours = present('[data-testid="ref-${cdref:hours:main-line}"]');
    expect(hours.textContent).toContain("main-line");
    expect(
      document.querySelector('[data-testid="ref-count-${cdref:hours:main-line}"]')?.textContent,
    ).toBe("1");

    // Selecting it reveals the actions that hold it.
    await click(hours);
    expect(document.querySelector('[data-testid="ref-action-check-hours"]')).not.toBeNull();
  });

  it("gives a freshly inserted block the source handles it needs to be wired", async () => {
    await renderApp();
    const add = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "MessageParticipant",
    );
    await click(add!);
    const node = present('[data-testid="node-message"]');
    // Two source handles (primary, error) and one target, from the TYPE. The
    // block has no transitions at all at this point.
    expect(node.querySelectorAll(".react-flow__handle-right").length).toBe(2);
    expect(node.querySelectorAll(".react-flow__handle-left").length).toBe(1);
  });

  it("gives a terminal block no source handle", async () => {
    await renderApp();
    const node = present('[data-testid="node-hang-up"]');
    expect(node.querySelectorAll(".react-flow__handle-right").length).toBe(0);
  });
});
