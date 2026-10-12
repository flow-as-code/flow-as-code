/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// The inspector seam: the mutations refuse illegal edits (tests/
// modelCorrectness.test.ts), and these check the panel actually routes through
// them instead of writing the parameter itself. Each case is a reproduced
// defect that ended in a saved file.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { ErrorBoundary } from "../src/components/ErrorBoundary.js";
import { schemaErrorsFor } from "../src/model/validate.js";
import {
  click,
  installDomStubs,
  present,
  query,
  render,
  selectOption,
  testId,
  typeAndBlur,
  unmount,
} from "./appHarness.js";

beforeAll(installDomStubs);
afterEach(unmount);

const renderApp = () => render(<App />);

describe("inspector number fields", () => {
  it("refuses an emptied Timeout instead of committing 0", async () => {
    await renderApp();
    await click(present('[data-testid="node-look-up-appointment"]'));
    const field = testId<HTMLInputElement>("number-InvocationTimeLimitSeconds");
    expect(field.value).toBe("8");

    await typeAndBlur(field, "");
    // The panel explains the refusal and the parameter keeps its value.
    expect(present('[data-testid="inspector"]').textContent).toContain("Enter a number");
    expect(testId("inspector").textContent).toContain("Timeout (seconds)");

    await typeAndBlur(field, "3.5");
    expect(testId("inspector").textContent).toContain("whole number");

    await typeAndBlur(field, "9");
    expect(testId("inspector").textContent).toContain("at most 8");

    await typeAndBlur(field, "4");
    expect(testId("inspector").textContent).not.toContain("at most 8");
  });
});

describe("inspector message body", () => {
  it("never leaves the block without a body when switching to Prompt", async () => {
    await renderApp();
    await click(present('[data-testid="node-welcome"]'));
    const kind = testId<HTMLSelectElement>("message-body-kind");
    expect(kind.value).toBe("Text");

    // Choosing Prompt shows the picker but writes nothing yet: a PromptId has
    // to be a reference, and no body parameter at all is schema-invalid.
    await selectOption(kind, "PromptId");
    expect(document.querySelector('[data-testid="message-body"]')).toBeNull();
    const pickerOptions = [...testId("inspector").querySelectorAll("option")].map(
      (o) => o.textContent,
    );
    expect(pickerOptions).toContain("new reference…");

    // Switching back to Text restores a body without a save-blocking doc.
    await selectOption(testId<HTMLSelectElement>("message-body-kind"), "SSML");
    const body = testId<HTMLTextAreaElement>("message-body");
    expect(body.value).toBe("Thanks for calling. Let's get you to the right place.");
  });
});

describe("error boundary", () => {
  function Boom(): never {
    throw new Error("kaboom");
  }

  it("keeps a render failure on screen instead of blanking the app", async () => {
    // React logs the caught error; that noise is expected here.
    const consoleError = console.error;
    console.error = () => {};
    try {
      await render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    } finally {
      console.error = consoleError;
    }
    expect(present('[data-testid="error-boundary"]').textContent).toContain("kaboom");
  });
});

describe("inspector state is scoped to the selected block", () => {
  it("does not carry a rejected number error over to the next selection", async () => {
    await renderApp();
    await click(present('[data-testid="node-look-up-appointment"]'));
    await typeAndBlur(testId<HTMLInputElement>("number-InvocationTimeLimitSeconds"), "");
    expect(testId("inspector").textContent).toContain("Enter a number");

    // numberErrors was keyed by selection but never cleared, so the message
    // reappeared the next time this block was selected.
    await click(present('[data-testid="node-welcome"]'));
    expect(testId("inspector").textContent).not.toContain("Enter a number");
    await click(present('[data-testid="node-look-up-appointment"]'));
    expect(testId("inspector").textContent).not.toContain("Enter a number");
  });

  it("does not carry a pending body switch over to the next MessageParticipant", async () => {
    await renderApp();
    await click(present('[data-testid="node-welcome"]'));
    await selectOption(testId<HTMLSelectElement>("message-body-kind"), "PromptId");
    expect(document.querySelector('[data-testid="message-body"]')).toBeNull();

    await click(present('[data-testid="node-apologize"]'));
    // A different block, so the pending Prompt switch must not apply to it.
    expect(testId<HTMLSelectElement>("message-body-kind").value).toBe("Text");
    expect(document.querySelector('[data-testid="message-body"]')).not.toBeNull();
  });
});

describe("required reference pickers", () => {
  it("do not offer clearing the reference as a selectable option", async () => {
    await renderApp();
    await click(present('[data-testid="node-look-up-appointment"]'));
    const picker = [...testId("inspector").querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.textContent === "appointment-lookup"),
    );
    expect(picker).toBeDefined();
    const none = [...picker!.options].find((o) => o.value === "");
    expect(none?.textContent).toBe("(choose a reference)");
    expect(none?.disabled).toBe(true);
  });

  it("refuses to delete a required reference even if the option is chosen anyway", async () => {
    await renderApp();
    await click(present('[data-testid="node-look-up-appointment"]'));
    const picker = [...testId("inspector").querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.textContent === "appointment-lookup"),
    );
    await selectOption(picker!, "");
    expect(testId("inspector").textContent).toContain("This reference is required");
    // The parameter is untouched: the picker still shows the token.
    expect([...testId("inspector").querySelectorAll("option")].map((o) => o.textContent)).toContain(
      "appointment-lookup",
    );
  });

  it("still offers (not set) on an optional reference", async () => {
    await renderApp();
    await click(present('[data-testid="node-check-hours"]'));
    const picker = [...testId("inspector").querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.textContent === "main-line"),
    );
    const none = [...picker!.options].find((o) => o.value === "");
    expect(none?.textContent).toBe("(not set)");
    expect(none?.disabled).toBe(false);
  });
});

describe("delete block", () => {
  /** Replaces window.confirm and records what it was asked. */
  function stubConfirm(answer: boolean): { asked: string[] } {
    const asked: string[] = [];
    window.confirm = (message?: string) => {
      asked.push(message ?? "");
      return answer;
    };
    return { asked };
  }

  it("does not promise a detach it is about to refuse", async () => {
    // Deleting "hang-up" on the demo flow detaches four MessageParticipants'
    // next transitions, which the demotion invariant refuses. The prompt used
    // to say the transitions "will be detached. Delete?", the user said yes,
    // and nothing happened. There is no prompt now: there is the refusal.
    const { asked } = stubConfirm(true);
    await renderApp();
    await click(present('[data-testid="node-hang-up"]'));
    await click(testId("delete-block"));

    expect(asked).toEqual([]);
    expect(testId("mutation-notice").textContent).toContain("read-only generic block");
    // And the block is still there.
    expect(present('[data-testid="node-hang-up"]')).not.toBeNull();
  });

  it("refuses, without prompting, a delete whose one neighbour is typed", async () => {
    // "welcome" was deletable with a prompt while its only neighbour,
    // enable-logging, was an unmodeled block; since the builder models that
    // block, detaching its next transition would demote it, so the delete is
    // refused before any prompt. The prompt for a delete that will happen is
    // exercised on the detachable document in canvasUi.test.tsx.
    const { asked } = stubConfirm(true);
    await renderApp();
    await click(present('[data-testid="node-welcome"]'));
    await click(testId("delete-block"));

    expect(asked).toEqual([]);
    expect(testId("mutation-notice").textContent).toContain('"enable-logging"');
    expect(present('[data-testid="node-welcome"]')).not.toBeNull();
  });
});

describe("schema helper", () => {
  it("is the same validator the write path uses", () => {
    expect(schemaErrorsFor({ flowdoc: "0.3" }).length).toBeGreaterThan(0);
  });
});

describe("Customer Profiles request and response fields (tasks/D03)", () => {
  const addProfileBlock = async (type: string, id: string) => {
    await renderApp();
    await click(present(`button[title="Add ${type}"]`));
    await click(present(`[data-testid="node-${id}"]`));
  };

  it("chooses request fields from the page's list and types a custom attribute", async () => {
    await addProfileBlock("CreateCustomerProfile", "create-profile");
    const add = testId<HTMLSelectElement>("fieldmap-ProfileRequestData-add");
    expect([...add.options].map((o) => o.value)).toContain("FirstName");
    await selectOption(add, "FirstName");
    const value = testId<HTMLInputElement>("fieldmap-ProfileRequestData-FirstName");
    await typeAndBlur(value, "$.Attributes.firstName");
    expect(testId<HTMLInputElement>("fieldmap-ProfileRequestData-FirstName").value).toBe(
      "$.Attributes.firstName",
    );
    // A field already present is not offered again.
    expect(
      [...testId<HTMLSelectElement>("fieldmap-ProfileRequestData-add").options].map((o) => o.value),
    ).not.toContain("FirstName");

    await typeAndBlur(testId<HTMLInputElement>("fieldmap-ProfileRequestData-custom"), "Nickname");
    expect(testId("inspector").textContent).toContain(
      '"Nickname" is not spelled Attributes.<name>',
    );
    expect(query('[data-testid="fieldmap-ProfileRequestData-Nickname"]')).toBeNull();
    await typeAndBlur(
      testId<HTMLInputElement>("fieldmap-ProfileRequestData-custom"),
      "Attributes.loyaltyTier",
    );
    expect(
      query('[data-testid="fieldmap-ProfileRequestData-Attributes.loyaltyTier"]'),
    ).not.toBeNull();

    await click(testId("fieldmap-ProfileRequestData-FirstName-remove"));
    expect(query('[data-testid="fieldmap-ProfileRequestData-FirstName"]')).toBeNull();
  });

  it("switches GetCustomerProfile between its two search forms, clearing the other", async () => {
    await addProfileBlock("GetCustomerProfile", "get-profile");
    const form = testId<HTMLSelectElement>("form-ProfileRequestData");
    expect(form.value).toBe("0");
    expect(testId<HTMLInputElement>("text-ProfileRequestData.IdentifierName").value).toBe("_phone");
    expect(query('[data-testid="select-ProfileRequestData.LogicalOperator"]')).toBeNull();

    await selectOption(form, "1");
    expect(testId<HTMLSelectElement>("form-ProfileRequestData").value).toBe("1");
    expect(query('[data-testid="text-ProfileRequestData.IdentifierName"]')).toBeNull();
    const operator = testId<HTMLSelectElement>("select-ProfileRequestData.LogicalOperator");
    expect(operator.value).toBe("AND");
    await selectOption(operator, "OR");
    expect(testId<HTMLSelectElement>("select-ProfileRequestData.LogicalOperator").value).toBe("OR");
    // The block stayed typed through the switch: no demotion notice.
    expect(testId("inspector").textContent).not.toContain("read-only generic block");

    await selectOption(testId<HTMLSelectElement>("form-ProfileRequestData"), "0");
    expect(testId<HTMLInputElement>("text-ProfileRequestData.IdentifierValue").value).toBe(
      "$.CustomerEndpoint.Address",
    );
    expect(query('[data-testid="select-ProfileRequestData.LogicalOperator"]')).toBeNull();
  });

  it("switches GetCustomerProfileObject between the latest object and a search identifier", async () => {
    await addProfileBlock("GetCustomerProfileObject", "get-profile-object");
    expect(testId<HTMLInputElement>("text-ProfileRequestData.ObjectType").value).toBe("Order");
    expect(testId<HTMLSelectElement>("form-ProfileRequestData").value).toBe("0");
    expect(query('[data-testid="text-ProfileRequestData.IdentifierName"]')).toBeNull();
    await selectOption(testId<HTMLSelectElement>("form-ProfileRequestData"), "1");
    expect(testId<HTMLInputElement>("text-ProfileRequestData.IdentifierName").value).toBe(
      "_orderId",
    );
    expect(testId("inspector").textContent).not.toContain("read-only generic block");
    expect(testId<HTMLInputElement>("names-ProfileResponseData-OrderStatus").checked).toBe(false);
  });

  it("ticks response fields from the page's list and holds typed ones to the pattern", async () => {
    await addProfileBlock("CreateCustomerProfile", "create-profile");
    const first = testId<HTMLInputElement>("names-ProfileResponseData-FirstName");
    expect(first.checked).toBe(false);
    await click(first);
    expect(testId<HTMLInputElement>("names-ProfileResponseData-FirstName").checked).toBe(true);

    const other = testId<HTMLTextAreaElement>("names-ProfileResponseData-other");
    await typeAndBlur(other, "Attributes.loyaltyTier\nfirstname");
    expect(testId("inspector").textContent).toContain(
      '"firstname" is not spelled Attributes.<name>',
    );
    await typeAndBlur(other, "Attributes.loyaltyTier");
    expect(testId("inspector").textContent).not.toContain("is not spelled");
    expect(testId<HTMLTextAreaElement>("names-ProfileResponseData-other").value).toBe(
      "Attributes.loyaltyTier",
    );
    expect(testId<HTMLInputElement>("names-ProfileResponseData-FirstName").checked).toBe(true);
  });
});
