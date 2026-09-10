/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// The save gate has two layers and this file pins both, so removing either one
// fails a test:
//   1. the UI layer, which disables Save and Export while a hard rule fails
//      and while lint has not yet seen the current doc, and
//   2. the write layer, which refuses the same doc even when called directly.
// The reviewers' reproduction was exactly this: type an ARN, blur, and click
// Save inside the 200 ms lint debounce.

import type { FlowDoc } from "@flow-as-code/core";
import { act, useEffect } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { Toolbar } from "../src/components/Toolbar.js";
import { useLintWorker } from "../src/hooks/useLintWorker.js";
import { setParam } from "../src/model/mutations.js";
import { SaveRefusedError, validateDoc } from "../src/model/validate.js";
import { StudioProvider, useStudio } from "../src/state/studio.js";
import { exportBlob } from "../src/store/exportDoc.js";
import { MemoryStore } from "../src/store/memoryStore.js";
import {
  button,
  click,
  installDomStubs,
  present,
  render,
  settleLint,
  testId,
  typeAndBlur,
  unmount,
} from "./appHarness.js";
import { demoDoc } from "./helpers.js";

const HARNESS_NAME = "schema.flowdoc.json";

/** Puts a document the mutations would never author in front of the Toolbar. */
function SchemaHarness({ doc }: { doc: FlowDoc }) {
  return (
    <StudioProvider>
      <SchemaHarnessInner doc={doc} />
    </StudioProvider>
  );
}

function SchemaHarnessInner({ doc }: { doc: FlowDoc }) {
  const { state, dispatch } = useStudio();
  useLintWorker(state.doc, dispatch);
  useEffect(() => {
    if (state.docName !== HARNESS_NAME) dispatch({ type: "doc-loaded", name: HARNESS_NAME, doc });
  }, [state.docName, doc, dispatch]);
  return state.docName === HARNESS_NAME ? <Toolbar /> : null;
}

const ARN = "arn:aws:connect:us-east-1:123456789012:instance/abc";

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

async function renderApp(): Promise<void> {
  vi.useFakeTimers();
  await render(<App />);
  await settleLint();
}

describe("save gate, UI layer", () => {
  it("disables Save and Export the instant the doc changes, before lint has run", async () => {
    await renderApp();
    await click(present('[data-testid="node-welcome"]'));

    const body = testId<HTMLTextAreaElement>("message-body");
    await typeAndBlur(body, `Our instance is ${ARN}`);

    // Inside the debounce: dirty, but nothing has linted this doc yet. The old
    // reducer left blocked=false here and Save was clickable.
    expect(button("save-button").disabled).toBe(true);
    expect(button("export-button").disabled).toBe(true);
    expect(document.querySelector('[data-testid="save-pending"]')).not.toBeNull();

    // After lint reports, the hard-rule failure keeps both disabled.
    await settleLint();
    expect(button("save-button").disabled).toBe(true);
    expect(button("export-button").disabled).toBe(true);
    expect(document.querySelector('[data-testid="save-blocked"]')?.textContent).toContain(
      "no-literal-arn",
    );
  });

  it("enables Save for a clean edit once lint reports", async () => {
    await renderApp();
    await click(present('[data-testid="node-welcome"]'));

    const body = testId<HTMLTextAreaElement>("message-body");
    await typeAndBlur(body, "Thanks for calling the appointment line.");
    expect(button("save-button").disabled).toBe(true); // still unchecked

    await settleLint();
    expect(button("save-button").disabled).toBe(false);
    expect(button("export-button").disabled).toBe(false);
    expect(document.querySelector('[data-testid="save-blocked"]')).toBeNull();
  });
});

describe("the buttons reflect BOTH halves of the write gate", () => {
  it("disables Save for a schema-invalid doc, instead of failing at write time", async () => {
    // assertSaveable refuses on the hard lint rules AND the schema. Deriving
    // the button state from the lint half alone left Save enabled here and
    // turned the click into a thrown error.
    const doc = demoDoc();
    doc.content.Actions = doc.content.Actions.map((a) =>
      a.Identifier === "welcome" ? { ...a, Parameters: {} } : a,
    );
    expect(validateDoc(doc).blockers).toEqual([]);
    expect(validateDoc(doc).schemaErrors.length).toBeGreaterThan(0);

    vi.useFakeTimers();
    await render(<SchemaHarness doc={doc} />);
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    await settleLint();

    expect(button("save-button").disabled).toBe(true);
    expect(button("export-button").disabled).toBe(true);
    expect(document.querySelector('[data-testid="save-invalid"]')).not.toBeNull();
    // Not hidden behind "Checking...": lint has run and found nothing.
    expect(document.querySelector('[data-testid="save-pending"]')).toBeNull();
  });
});

describe("save gate, write layer", () => {
  // Same doc the UI test produces, written straight to the store and to the
  // exporter. Deleting the button's disabled logic fails the tests above;
  // deleting assertSaveable fails these.
  const poisoned = () => setParam(demoDoc(), "welcome", "Text", `Our instance is ${ARN}`);

  it("MemoryStore.write refuses it", async () => {
    const store = new MemoryStore("demo", [demoDoc()]);
    await expect(store.write("appointment-line", poisoned())).rejects.toThrow(SaveRefusedError);
    expect((await store.read("appointment-line")).text).not.toContain(ARN);
  });

  it("exportBlob refuses it", () => {
    expect(() => exportBlob(poisoned())).toThrow(SaveRefusedError);
  });
});
