/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// Two rules that only hold in the rendered DOM.
//
// R1: every transition in the document is drawn, whatever the block's Type
// says. React Flow drops an edge whose sourceHandle is missing from its node,
// so a rule that hid source handles by Type made a transition on a
// terminal-typed action vanish: not visible, not rewireable, not deletable.
// CLAUDE.md, "Never drop content".
//
// And refusals are shown. The demotion invariant refuses real gestures, and a
// canvas that ignores them silently is indistinguishable from a broken one.

import type { FlowDoc } from "@flow-as-code/core";
import { act, useEffect, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Canvas } from "../src/components/Canvas.js";
import { Inspector } from "../src/components/Inspector.js";
import { NoticeBar } from "../src/components/NoticeBar.js";
import { Toolbar } from "../src/components/Toolbar.js";
import { useLintWorker } from "../src/hooks/useLintWorker.js";
import { StudioProvider, useStudio } from "../src/state/studio.js";
import {
  button,
  click,
  installDomStubs,
  present,
  render,
  selectOption,
  settleLint,
  testId,
  typeAndBlur,
  unmount,
} from "./appHarness.js";
import { compareDoc, demoDoc, menuDoc } from "./helpers.js";

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const NAME = "test.flowdoc.json";

/**
 * Puts an arbitrary document in front of the real components. StudioProvider
 * boots the demo store on mount, so the load is re-asserted until it sticks
 * rather than raced against that boot.
 */
function Harness({ doc, children }: { doc: FlowDoc; children: ReactNode }) {
  const { state, dispatch } = useStudio();
  useLintWorker(state.doc, dispatch);
  useEffect(() => {
    if (state.docName !== NAME) dispatch({ type: "doc-loaded", name: NAME, doc });
  }, [state.docName, doc, dispatch]);
  if (state.docName !== NAME) return null;
  return <>{children}</>;
}

async function renderDoc(doc: FlowDoc, children: ReactNode): Promise<void> {
  vi.useFakeTimers();
  await render(
    <StudioProvider>
      <Harness doc={doc}>{children}</Harness>
    </StudioProvider>,
  );
  // Let the provider's store boot resolve, then the harness re-load.
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  await settleLint();
}

/**
 * The first branch's operands, straight from the document. The operand input
 * is uncontrolled (defaultValue), so reading it back would only report what
 * was typed, not what was committed.
 */
function OperandProbe() {
  const { state } = useStudio();
  const branch = state.doc?.content.Actions.find((a) => a.Identifier === "compare")?.Transitions
    .Conditions?.[0];
  return <span data-testid="operand-probe">{JSON.stringify(branch?.Condition.Operands)}</span>;
}

/**
 * The menu block's parameters, straight from the document. The timeout field
 * holds a draft until it is committed, and the console's string form is not
 * what the number input shows, so the document is read here rather than the
 * DOM.
 */
function MenuProbe() {
  const { state } = useStudio();
  const menu = state.doc?.content.Actions.find((a) => a.Identifier === "menu");
  return <span data-testid="menu-probe">{JSON.stringify(menu?.Parameters)}</span>;
}

/** Every transition the document holds, however the block types classify them. */
function transitionCount(doc: FlowDoc): number {
  return doc.content.Actions.reduce((n, a) => {
    const t = a.Transitions;
    return (
      n +
      (t.NextAction === undefined ? 0 : 1) +
      (t.Errors ?? []).length +
      (t.Conditions ?? []).length
    );
  }, 0);
}

/** The demo flow with a transition on hang-up, whose Type is terminal. */
function terminalWithTransition(): FlowDoc {
  const doc = demoDoc();
  doc.content.Actions = doc.content.Actions.map((a) =>
    a.Identifier === "hang-up" ? { ...a, Transitions: { NextAction: "welcome" } } : a,
  );
  return doc;
}

describe("R1 every transition is rendered", () => {
  it("draws one edge per transition even when the Type says terminal", async () => {
    const doc = terminalWithTransition();
    await renderDoc(doc, <Canvas />);
    const edges = document.querySelectorAll(".react-flow__edge");
    expect(edges.length).toBe(transitionCount(doc));
    expect([...edges].map((e) => e.getAttribute("data-id"))).toContain("hang-up:next");
  });

  it("gives that node the source handle its edge attaches to", async () => {
    await renderDoc(terminalWithTransition(), <Canvas />);
    const node = present('[data-testid="node-hang-up"]');
    expect(node.querySelectorAll(".react-flow__handle-right").length).toBe(1);
  });

  it("still gives a terminal block with no transitions no source handle", async () => {
    await renderDoc(demoDoc(), <Canvas />);
    const node = present('[data-testid="node-hang-up"]');
    expect(node.querySelectorAll(".react-flow__handle-right").length).toBe(0);
    expect(document.querySelectorAll(".react-flow__edge").length).toBe(transitionCount(demoDoc()));
  });

  it("marks a block codegen cannot express, instead of pretending it is typed", async () => {
    const doc = demoDoc();
    doc.content.Actions = doc.content.Actions.map((a) =>
      a.Identifier === "welcome" ? { ...a, Transitions: {} } : a,
    );
    await renderDoc(doc, <Canvas />);
    expect(document.querySelector('[data-testid="demoted-welcome"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="demoted-announce-closed"]')).toBeNull();
  });
});

describe("refusals reach the screen", () => {
  it("shows why removing a Compare's last branch is refused", async () => {
    await renderDoc(
      compareDoc(),
      <>
        <Canvas />
        <Inspector />
        <NoticeBar />
      </>,
    );
    await click(present('[data-testid="node-compare"]'));

    // Two branches: removing the first is fine, removing the last is refused.
    const removeButtons = () =>
      [...document.querySelectorAll('[data-testid="inspector"] button')].filter(
        (b) => b.textContent === "remove",
      );
    expect(removeButtons()).toHaveLength(2);
    await click(removeButtons()[1]!);
    expect(document.querySelector('[data-testid="mutation-notice"]')).toBeNull();

    await click(removeButtons()[0]!);
    const notice = present('[data-testid="mutation-notice"]');
    expect(notice.textContent).toContain('"compare"');
    expect(notice.textContent).toContain("Wire a replacement branch");
    // The branch is still there: the refusal did not half-apply.
    expect(removeButtons()).toHaveLength(1);
  });

  it("dismisses the notice on request", async () => {
    await renderDoc(
      compareDoc(),
      <>
        <Canvas />
        <Inspector />
        <NoticeBar />
      </>,
    );
    await click(present('[data-testid="node-compare"]'));
    const remove = [...document.querySelectorAll('[data-testid="inspector"] button')].filter(
      (b) => b.textContent === "remove",
    );
    await click(remove[1]!);
    await click(remove[0]!);
    expect(document.querySelector('[data-testid="mutation-notice"]')).not.toBeNull();
    await click(present('[data-testid="dismiss-notice"]'));
    expect(document.querySelector('[data-testid="mutation-notice"]')).toBeNull();
  });
});

describe("R5 an ARN typed into a branch operand reaches the save gate", () => {
  it("disables Save and names no-literal-arn", async () => {
    await renderDoc(
      compareDoc(),
      <>
        <Toolbar />
        <Canvas />
        <Inspector />
      </>,
    );
    await click(present('[data-testid="node-compare"]'));
    expect(button("save-button").disabled).toBe(true); // not dirty yet

    const operands = present<HTMLInputElement>('input[aria-label="Branch 1 operands"]');
    await typeAndBlur(operands, "arn:aws:lambda:us-east-1:123456789012:function:lookup");
    await settleLint();

    expect(button("save-button").disabled).toBe(true);
    expect(button("export-button").disabled).toBe(true);
    expect(document.querySelector('[data-testid="save-blocked"]')?.textContent).toContain(
      "no-literal-arn",
    );
  });

  it("empties a branch to the same placeholder a fresh drag creates", async () => {
    // A10 refused this and told the user "a branch needs at least one
    // operand", while dragging a new branch from a Compare's handle authored
    // exactly the empty operand it refused. Two surfaces, two answers, for the
    // same condition. They share one function now (normalizeOperands), so an
    // emptied field means the placeholder, which is what the canvas gesture
    // already meant and what the schema's minItems 1 allows.
    await renderDoc(
      compareDoc(),
      <>
        <Canvas />
        <Inspector />
        <NoticeBar />
        <OperandProbe />
      </>,
    );
    await click(present('[data-testid="node-compare"]'));
    const operands = present<HTMLInputElement>('input[aria-label="Branch 1 operands"]');
    await typeAndBlur(operands, "  ");
    expect(document.querySelector('[data-testid="mutation-notice"]')).toBeNull();
    expect(present('[data-testid="operand-probe"]').textContent).toBe('[""]');

    // Interior blanks are still a typo, not an operand.
    await typeAndBlur(operands, "gold, , silver");
    expect(present('[data-testid="operand-probe"]').textContent).toBe('["gold","silver"]');
  });
});

describe("a GetParticipantInput menu in the inspector", () => {
  const renderMenu = () =>
    renderDoc(
      menuDoc(),
      <>
        <Canvas />
        <Inspector />
        <NoticeBar />
        <MenuProbe />
      </>,
    );

  it("draws both the next edge and the no-match error it mirrors", async () => {
    const doc = menuDoc();
    await renderMenu();
    const ids = [...document.querySelectorAll(".react-flow__edge")].map((e) =>
      e.getAttribute("data-id"),
    );
    expect(ids.length).toBe(transitionCount(doc));
    expect(ids).toContain("menu:next");
    expect(ids).toContain("menu:error:1:NoMatchingCondition");
    expect(ids).toContain("menu:condition:2");
    expect(document.querySelector('[data-testid="demoted-menu"]')).toBeNull();
  });

  it("offers the body switch with a (none) choice a message does not get", async () => {
    await renderMenu();
    await click(present('[data-testid="node-menu"]'));
    const kind = testId<HTMLSelectElement>("message-body-kind");
    expect(kind.value).toBe("Text");
    expect([...kind.options].map((o) => o.value)).toEqual(["", "Text", "SSML", "PromptId"]);
    expect(testId<HTMLTextAreaElement>("message-body").value).toContain("press 1");

    await selectOption(kind, "");
    expect(document.querySelector('[data-testid="mutation-notice"]')).toBeNull();
    expect(document.querySelector('[data-testid="message-body"]')).toBeNull();
    expect(JSON.parse(present('[data-testid="menu-probe"]').textContent!)).toEqual({
      InputTimeLimitSeconds: "5",
      StoreInput: "False",
    });
    expect(document.querySelector('[data-testid="demoted-menu"]')).toBeNull();

    // Back to a spoken body: the switch restores an empty Text to type into.
    await selectOption(testId<HTMLSelectElement>("message-body-kind"), "Text");
    expect(testId<HTMLTextAreaElement>("message-body").value).toBe("");

    // A MessageParticipant cannot be silent, so it is not offered the choice.
    await click(present('[data-testid="node-sales"]'));
    expect([...testId<HTMLSelectElement>("message-body-kind").options].map((o) => o.value)).toEqual(
      ["Text", "SSML", "PromptId"],
    );
  });

  it("lets a prompt be unset on a menu, which removes the body", async () => {
    await renderMenu();
    await click(present('[data-testid="node-menu"]'));
    await selectOption(testId<HTMLSelectElement>("message-body-kind"), "PromptId");
    // The prompt picker is the select offering a hand-typed token.
    const promptPicker = () => {
      const picker = [
        ...document.querySelectorAll<HTMLSelectElement>('[data-testid="inspector"] select'),
      ].find((el) => [...el.options].some((o) => o.value === "__custom__"));
      expect(picker, "expected the prompt picker").toBeDefined();
      return picker!;
    };
    // No prompt refs exist in the doc, so enter a token by hand.
    await selectOption(promptPicker(), "__custom__");
    const token = present<HTMLInputElement>('[data-testid="inspector"] input[type="text"]');
    await typeAndBlur(token, "${cdref:prompt:menu-intro}");
    expect(JSON.parse(present('[data-testid="menu-probe"]').textContent!).PromptId).toBe(
      "${cdref:prompt:menu-intro}",
    );
    expect(document.querySelector('[data-testid="demoted-menu"]')).toBeNull();

    // "(not set)" is selectable here (it is disabled on a message) and it
    // leaves the menu silent rather than writing an empty Text.
    const again = promptPicker();
    expect([...again.options].find((o) => o.value === "")?.disabled).toBe(false);
    await selectOption(again, "");
    expect(document.querySelector('[data-testid="mutation-notice"]')).toBeNull();
    expect(JSON.parse(present('[data-testid="menu-probe"]').textContent!)).toEqual({
      InputTimeLimitSeconds: "5",
      StoreInput: "False",
    });
    expect(testId<HTMLSelectElement>("message-body-kind").value).toBe("");
  });

  it("edits the timeout as a bounded number but stores the console's string", async () => {
    await renderMenu();
    await click(present('[data-testid="node-menu"]'));
    const field = testId<HTMLInputElement>("number-InputTimeLimitSeconds");
    expect(field.value).toBe("5");

    await typeAndBlur(field, "0");
    expect(testId("inspector").textContent).toContain("at least 1");
    await typeAndBlur(field, "181");
    expect(testId("inspector").textContent).toContain("at most 180");

    await typeAndBlur(field, "10");
    expect(testId("inspector").textContent).not.toContain("at most 180");
    expect(document.querySelector('[data-testid="mutation-notice"]')).toBeNull();
    expect(
      JSON.parse(present('[data-testid="menu-probe"]').textContent!).InputTimeLimitSeconds,
    ).toBe("10");
    expect(document.querySelector('[data-testid="demoted-menu"]')).toBeNull();
  });

  it("shows one branch per key and refuses an operand that is not a key", async () => {
    await renderMenu();
    await click(present('[data-testid="node-menu"]'));
    expect(
      present('[data-testid="conditions"]').querySelectorAll('[data-testid^="condition-"]'),
    ).toHaveLength(3);
    expect(present('[data-testid="menu-branch-hint"]').textContent).toContain("0 to 9, * or #");
    const operands = present<HTMLInputElement>('input[aria-label="Branch 1 operands"]');
    expect(operands.defaultValue).toBe("1");

    await typeAndBlur(operands, "gold");
    const notice = present('[data-testid="mutation-notice"]');
    expect(notice.textContent).toContain('"menu"');
    expect(document.querySelector('[data-testid="demoted-menu"]')).toBeNull();

    await click(present('[data-testid="dismiss-notice"]'));
    await typeAndBlur(operands, "3");
    expect(document.querySelector('[data-testid="mutation-notice"]')).toBeNull();
  });

  it("shows the stored-input form generic, with its branches but no key hint", async () => {
    // StoreInput "True" is not the menu form. A stray branch on it is still
    // listed (content is never dropped), but not under the hint that a drag
    // hands out keys, because on this form a drag means the next action.
    const doc = menuDoc();
    doc.content.Actions = doc.content.Actions.map((a) =>
      a.Identifier === "menu"
        ? {
            ...a,
            Parameters: {
              ...a.Parameters,
              StoreInput: "True",
              InputValidation: { CustomValidation: { MaximumLength: "10" } },
            },
            Transitions: {
              ...a.Transitions,
              Errors: a.Transitions.Errors!.filter((e) => e.ErrorType !== "NoMatchingCondition"),
              Conditions: a.Transitions.Conditions!.slice(0, 1),
            },
          }
        : a,
    );
    await renderDoc(
      doc,
      <>
        <Canvas />
        <Inspector />
      </>,
    );
    expect(document.querySelector('[data-testid="demoted-menu"]')).not.toBeNull();
    await click(present('[data-testid="node-menu"]'));
    expect(
      present('[data-testid="conditions"]').querySelectorAll('[data-testid^="condition-"]'),
    ).toHaveLength(1);
    expect(document.querySelector('[data-testid="menu-branch-hint"]')).toBeNull();
  });

  it("keeps the key hint off a Compare's branches", async () => {
    // The hint is gated on the menu form, not on "has branches": a Compare
    // lists its branches under the same heading, and a gate that only read
    // StoreInput would show the hint there too, since a Compare has none.
    await renderDoc(
      compareDoc(),
      <>
        <Canvas />
        <Inspector />
      </>,
    );
    await click(present('[data-testid="node-compare"]'));
    expect(
      present('[data-testid="conditions"]').querySelectorAll('[data-testid^="condition-"]'),
    ).toHaveLength(2);
    expect(document.querySelector('[data-testid="menu-branch-hint"]')).toBeNull();
  });
});
