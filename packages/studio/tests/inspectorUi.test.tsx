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

  it("prompts, accurately, for a delete that will happen", async () => {
    const { asked } = stubConfirm(true);
    await renderApp();
    // "welcome" is the one block on the demo flow with an incoming transition
    // whose deletion is allowed: its only neighbour is the unmodeled
    // enable-logging, which codegen already emits as a GenericBlock, so
    // detaching costs nothing.
    await click(present('[data-testid="node-welcome"]'));
    await click(testId("delete-block"));

    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('1 transition(s) point at "welcome"');
    expect(asked[0]).toContain("removes those branches");
    expect(asked[0]).not.toContain("detached");
    expect(document.querySelector('[data-testid="node-welcome"]')).toBeNull();
  });

  it("changes nothing when the prompt is declined", async () => {
    stubConfirm(false);
    await renderApp();
    await click(present('[data-testid="node-welcome"]'));
    await click(testId("delete-block"));
    expect(present('[data-testid="node-welcome"]')).not.toBeNull();
  });
});

describe("schema helper", () => {
  it("is the same validator the write path uses", () => {
    expect(schemaErrorsFor({ flowdoc: "0.1" }).length).toBeGreaterThan(0);
  });
});
