/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// The studio on a read-only store, which is what the hosted demo boots with
// (docs/05-hosted-demo.md). Everything that reads still works: the canvas,
// the inspector, the GenericBlock's raw JSON, lint, and the export dialog's
// previews. Everything that writes is gone from the toolbar, and a badge says
// so. The write layer is pinned separately in readOnlyStore.test.ts; this file
// is the half a visitor meets.

import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { createDemoStore } from "../src/store/demoStore.js";
import { readOnly } from "../src/store/readOnlyStore.js";
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

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

async function renderDemo(): Promise<void> {
  vi.useFakeTimers();
  await render(<App store={readOnly(createDemoStore())} />);
  await settleLint();
}

const absent = (id: string) => document.querySelector(`[data-testid="${id}"]`);

describe("the read-only demo", () => {
  it("shows the badge and drops every button that would write", async () => {
    await renderDemo();
    expect(testId("read-only-badge").textContent).toBe("Read-only demo");
    expect(absent("save-button")).toBeNull();
    expect(absent("export-button")).toBeNull();
    const labels = [...document.querySelectorAll("header button")].map((b) => b.textContent);
    expect(labels).not.toContain("Open file");
    expect(labels).not.toContain("Open folder");
    expect(document.querySelector('header input[type="file"]')).toBeNull();
    // What remains: the document switcher and the preview export.
    expect(labels).toContain("Export as…");
    expect(button("export-targets-button").disabled).toBe(false);
  });

  it("still renders the whole flow, the GenericBlock included", async () => {
    await renderDemo();
    expect(document.querySelectorAll('[data-testid^="node-"]').length).toBe(11);
    expect(present('[data-testid="node-enable-logging"]').textContent).toContain(
      "UpdateFlowLoggingBehavior",
    );
    await click(present('[data-testid="raw-button-enable-logging"]'));
    expect(testId("raw-json").textContent).toContain("UpdateFlowLoggingBehavior");
    expect(absent("lint-panel")).not.toBeNull();
  });

  it("edits on the canvas, marks them as tab-local, and never saves", async () => {
    await renderDemo();
    await click(present('[data-testid="node-welcome"]'));
    const body = testId<HTMLTextAreaElement>("message-body");
    await typeAndBlur(body, "Thanks for calling the demo line.");
    await settleLint();
    const status = document.querySelector("header span")?.parentElement?.textContent ?? "";
    expect(status).toContain("edited in this tab");
    expect(status).not.toContain("unsaved changes");
    expect(absent("save-button")).toBeNull();
  });

  it("previews an export in the dialog instead of downloading it", async () => {
    await renderDemo();
    // A download here would reach for URL.createObjectURL; make that loud.
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL }));

    await click(button("export-targets-button"));
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(testId("export-destination").textContent).toContain("Shows in");
    expect(testId("export-destination").textContent).toContain("read-only demo");

    await click(testId("export-target-cdk"));
    await click(button("export-run"));
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(testId("export-result").textContent).toContain("Generated 1 file(s)");
    expect(testId("export-preview-flow-stack.ts").textContent).toContain("FlowSet");
    expect(createObjectURL).not.toHaveBeenCalled();

    // Terraform previews every file, including the template under flows/.
    await click(testId("export-target-tf"));
    await click(button("export-run"));
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(testId("export-result").textContent).toContain("Generated 5 file(s)");
    expect(testId("export-preview-flows/appointment-line.flow.tftpl").textContent).toContain(
      "Actions",
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
