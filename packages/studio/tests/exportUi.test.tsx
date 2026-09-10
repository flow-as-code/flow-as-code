/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// The export dialog: the address-map editor refuses a literal ARN inline (the
// A12 acceptance criterion), says what is still unmapped, and runs an export
// through the sink the store implies.
//
// The model tests in exportTargets/exportGate/exportRefMap are where the rules
// live; this file pins that the dialog is actually wired to them, which is the
// half a user meets.

import { act } from "react";
import type { FlowDoc } from "@flow-as-code/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "../src/components/ExportDialog.js";
import { StudioProvider } from "../src/state/studio.js";
import { MemoryStore } from "../src/store/memoryStore.js";
import { click, installDomStubs, query, render, testId, unmount } from "./appHarness.js";
import { demoDoc } from "./helpers.js";

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

/** The dialog on the demo store, with the document set loaded. */
async function openDialog(doc: FlowDoc = demoDoc()): Promise<void> {
  await render(
    <StudioProvider store={new MemoryStore("demo", [doc])}>
      <ExportDialog onClose={() => undefined} />
    </StudioProvider>,
  );
  // The dialog lists the store asynchronously.
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/**
 * A document @flow-as-code/tf refuses to emit: two module references whose tokens
 * differ but whose generated local names collide, so the emitter throws rather
 * than answering "what is still unmapped?".
 *
 * A real input rather than a stubbed throw, because the point of the guard is
 * what the dialog does when the emitter it is asking says no.
 */
function unemittableDoc(): FlowDoc {
  return {
    flowdoc: "0.1",
    kind: "flow",
    name: "clash-line",
    connectType: "CONTACT_FLOW",
    content: {
      Version: "2019-10-30",
      StartAction: "invoke",
      Actions: [
        {
          Identifier: "invoke",
          Type: "InvokeFlowModule",
          Parameters: { FlowModuleId: "${cdref:module:survey@main-line}" },
          Transitions: { NextAction: "hang-up", Errors: [], Conditions: [] },
        },
        {
          Identifier: "hang-up",
          Type: "DisconnectParticipant",
          Parameters: { Note: "${cdref:module:survey-main@line}" },
          Transitions: { Errors: [], Conditions: [] },
        },
      ],
    },
  };
}

/**
 * Types into a controlled input that commits on change rather than on blur.
 *
 * The native value setter is called through the prototype on purpose: React
 * installs a per-node value tracker whose setter records what it is given, so
 * a plain `el.value = x` updates the tracker as well and React then sees no
 * change and fires no onChange. appHarness's typeAndBlur does not hit this
 * because the fields it drives commit in onBlur.
 */
const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

function type(el: HTMLInputElement, value: string): Promise<void> {
  return act(async () => {
    nativeValue?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const ADDRESS = "aws_connect_queue.appointments.arn";
const ARN = "arn:aws:connect:us-east-1:123456789012:instance/i/queue/q";

describe("the address-map editor", () => {
  it("lists every reference in the document set", async () => {
    await openDialog();
    expect(testId("export-address-queue:appointments")).not.toBeNull();
    expect(testId("export-address-hours:main-line")).not.toBeNull();
    expect(testId("export-address-lambda:appointment-lookup")).not.toBeNull();
  });

  it("rejects a literal ARN inline and blocks the export while it stands", async () => {
    await openDialog();
    const field = testId<HTMLInputElement>("export-address-queue:appointments");
    await type(field, ARN);

    const error = testId("export-address-error-queue:appointments");
    expect(error.textContent).toContain("no-literal-arn");
    expect(testId<HTMLButtonElement>("export-run").disabled).toBe(true);

    // Replacing it with a terraform address clears the error and unblocks.
    await type(field, ADDRESS);
    expect(document.querySelector('[data-testid="export-address-error-queue:appointments"]')).toBe(
      null,
    );
    expect(testId<HTMLButtonElement>("export-run").disabled).toBe(false);
  });

  it("suggests the resource type each row actually needs", async () => {
    // Every row used to suggest aws_connect_queue.front_desk.arn.
    await openDialog();
    expect(testId<HTMLInputElement>("export-address-hours:main-line").placeholder).toBe(
      "aws_connect_hours_of_operation.main_line.arn",
    );
    expect(testId<HTMLInputElement>("export-address-lambda:appointment-lookup").placeholder).toBe(
      "aws_lambda_function.appointment_lookup.arn",
    );
    expect(testId<HTMLInputElement>("export-address-queue:appointments").placeholder).toBe(
      "aws_connect_queue.appointments.arn",
    );
  });

  it("drops a refused export's list of missing tokens as soon as the map changes", async () => {
    // The list named the tokens that were unmapped at the time. Editing the
    // map is what makes it wrong, and it used to stand until the next Export.
    await openDialog();
    await click(testId("export-target-raw"));
    await click(testId("export-run"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(testId("export-error").textContent).toContain("have no resource map entry");

    await type(testId<HTMLInputElement>("export-resource-${cdref:queue:appointments}"), ARN);
    expect(query('[data-testid="export-error"]')).toBeNull();
  });

  it("says which references are still unmapped, and stops saying it when they are", async () => {
    await openDialog();
    expect(testId("export-missing").textContent).toContain("3 of 3");
    await type(testId<HTMLInputElement>("export-address-queue:appointments"), ADDRESS);
    expect(testId("export-missing").textContent).toContain("2 of 3");
    expect(testId("export-missing").textContent).toContain("${cdref:hours:main-line}");

    await type(
      testId<HTMLInputElement>("export-address-hours:main-line"),
      "aws_connect_hours_of_operation.main_line.arn",
    );
    await type(
      testId<HTMLInputElement>("export-address-lambda:appointment-lookup"),
      "data.aws_lambda_function.appointment_lookup.arn",
    );
    expect(testId("export-missing").textContent).toContain("All 3 reference(s) have an address");
  });
});

describe("what the dialog does when it cannot answer", () => {
  it("blocks the export when the emitter refuses the set, instead of reporting all clear", async () => {
    await openDialog(unemittableDoc());
    // The failure is shown, and the "everything is mapped" line is not: a
    // swallowed error used to leave that line saying all references had an
    // address while nothing had been checked at all.
    const shown = testId("export-scan-error").textContent ?? "";
    expect(shown).toContain("both map to local.flow_refs.module_survey_main_line_arn");
    expect(document.querySelector('[data-testid="export-missing"]')).toBeNull();
    expect(testId<HTMLButtonElement>("export-run").disabled).toBe(true);
    expect(testId("export-blocked").textContent).toContain("emitter");
  });

  it("keeps the CDK target exportable, since it reads neither map", async () => {
    // CDK needs no address map, so a set @flow-as-code/tf cannot emit is still a
    // perfectly good CDK scaffold.
    await openDialog(unemittableDoc());
    await click(testId("export-target-cdk"));
    expect(testId<HTMLButtonElement>("export-run").disabled).toBe(false);
  });
});

describe("a bad entry blocks only the target that reads it", () => {
  /** Whitespace: not empty, so it is checked, and not a value, so it fails. */
  const BLANK = "   ";

  it("does not let a raw resource error block a Terraform export", async () => {
    await openDialog();
    await click(testId("export-target-raw"));
    await type(testId<HTMLInputElement>("export-resource-${cdref:queue:appointments}"), BLANK);
    expect(testId("export-resource-error-${cdref:queue:appointments}")).not.toBeNull();
    expect(testId<HTMLButtonElement>("export-run").disabled).toBe(true);

    // Terraform never reads the resource map, so that entry is none of its
    // business: the export is offered.
    await click(testId("export-target-tf"));
    expect(testId<HTMLButtonElement>("export-run").disabled).toBe(false);
    await click(testId("export-target-cdk"));
    expect(testId<HTMLButtonElement>("export-run").disabled).toBe(false);
  });

  it("does not let a terraform address error block a raw export", async () => {
    await openDialog();
    await type(testId<HTMLInputElement>("export-address-queue:appointments"), ARN);
    expect(testId<HTMLButtonElement>("export-run").disabled).toBe(true);

    await click(testId("export-target-raw"));
    expect(testId<HTMLButtonElement>("export-run").disabled).toBe(false);

    // Back on Terraform the same entry is fatal again.
    await click(testId("export-target-tf"));
    expect(testId<HTMLButtonElement>("export-run").disabled).toBe(true);
  });
});

describe("running an export from the dialog", () => {
  it("downloads every emitted file when no bridge is serving the studio", async () => {
    // The real anchor, really appended: only the click is intercepted, so the
    // download path is exercised as the browser would run it.
    const created: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      created.push(this.download);
    });
    Object.assign(URL, {
      createObjectURL: () => "blob:x",
      revokeObjectURL: () => undefined,
    });

    await openDialog();
    await type(testId<HTMLInputElement>("export-address-queue:appointments"), ADDRESS);
    await click(testId("export-run"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelector('[data-testid="export-error"]')?.textContent).toBeUndefined();
    const result = testId("export-result");
    expect(result.textContent).toContain("Downloaded 5 file(s)");
    expect(result.textContent).toContain("flows/appointment-line.flow.tftpl");
    expect(created).toContain("flows-appointment-line.flow.tftpl");
    expect(created).toHaveLength(5);
  });

  it("reports the CDK target's binder entries before exporting", async () => {
    await openDialog();
    await click(testId("export-target-cdk"));
    const summary = testId("export-binder-types").textContent ?? "";
    expect(summary).toContain("hours (main-line)");
    expect(summary).toContain("lambda (appointment-lookup)");
    expect(summary).toContain("queue (appointments)");
  });

  it("lists every missing resource map entry for the raw target", async () => {
    await openDialog();
    await click(testId("export-target-raw"));
    expect(testId("export-missing").textContent).toContain("3 of 3");
    expect(testId("export-missing").textContent).toContain("${cdref:lambda:appointment-lookup}");

    // An ARN is what belongs here, so it is accepted rather than refused.
    await type(testId<HTMLInputElement>("export-resource-${cdref:queue:appointments}"), ARN);
    expect(
      document.querySelector('[data-testid="export-resource-error-${cdref:queue:appointments}"]'),
    ).toBeNull();
    expect(testId("export-missing").textContent).toContain("2 of 3");
  });
});
