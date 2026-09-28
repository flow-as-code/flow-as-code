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

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
import { addBlock, connectNodes, setParam } from "../src/model/mutations.js";
import { compareDoc, demoDoc, detachableDoc, menuDoc } from "./helpers.js";

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const NAME = "test.flowdoc.json";

/** A demo document with one more block, inserted and wired the way the canvas would. */
function withRoutingBlock(): { doc: FlowDoc; id: string } {
  const added = addBlock(demoDoc(), "UpdateContactRoutingBehavior", { x: 0, y: 900 });
  return { doc: connectNodes(added.doc, added.id, "hang-up", "primary")!, id: added.id };
}
function withCallbackBlock(): { doc: FlowDoc; id: string } {
  const added = addBlock(demoDoc(), "CreateCallbackContact", { x: 0, y: 900 });
  let doc = connectNodes(added.doc, added.id, "hang-up", "primary")!;
  doc = connectNodes(doc, added.id, "apologize", "error")!;
  return { doc, id: added.id };
}

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

describe("an unmodeled block on the canvas", () => {
  /** Replaces window.confirm and records what it was asked. */
  function stubConfirm(answer: boolean): { asked: string[] } {
    const asked: string[] = [];
    window.confirm = (message?: string) => {
      asked.push(message ?? "");
      return answer;
    };
    return { asked };
  }

  it("opens the read-only raw JSON inspector", async () => {
    await renderDoc(
      detachableDoc(),
      <>
        <Canvas />
        <Inspector />
      </>,
    );
    expect(present('[data-testid="node-raw-a"]').textContent).toContain("unmodeled");
    await click(present('[data-testid="raw-button-raw-a"]'));
    const raw = testId("raw-json");
    expect(raw.textContent).toContain("UpdatePreviousContactParticipantState");
    expect(raw.textContent).toContain("PreviousContactParticipantState");
  });

  it("is what makes a neighbour deletable: the prompt is accurate and the delete happens", async () => {
    // "target" is pointed at by raw-a's next and raw-b's error; both are
    // unmodeled, so detaching them costs nothing and the delete goes ahead
    // after the prompt.
    const { asked } = stubConfirm(true);
    await renderDoc(
      detachableDoc(),
      <>
        <Canvas />
        <Inspector />
        <NoticeBar />
      </>,
    );
    await click(present('[data-testid="node-target"]'));
    await click(testId("delete-block"));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('2 transition(s) point at "target"');
    expect(asked[0]).toContain("removes those branches");
    expect(asked[0]).not.toContain("detached");
    expect(document.querySelector('[data-testid="node-target"]')).toBeNull();
    expect(document.querySelector('[data-testid="mutation-notice"]')).toBeNull();
  });

  it("changes nothing when the prompt is declined", async () => {
    stubConfirm(false);
    await renderDoc(
      detachableDoc(),
      <>
        <Canvas />
        <Inspector />
      </>,
    );
    await click(present('[data-testid="node-target"]'));
    await click(testId("delete-block"));
    expect(present('[data-testid="node-target"]')).not.toBeNull();
  });
});

describe("a view's reference and its version edit one key of ViewResource each", () => {
  function participantDoc(): FlowDoc {
    // The studio project runs from its own directory or the repo root.
    const relative = ["conformance", "roundtrip", "participant", "doc.flowdoc.json"];
    const candidates = [
      join(process.cwd(), ...relative),
      join(process.cwd(), "..", "..", ...relative),
    ];
    const file = candidates.find((c) => existsSync(c)) ?? candidates[0]!;
    return JSON.parse(readFileSync(file, "utf8")) as FlowDoc;
  }
  /** The ShowView's ViewResource, straight from the document. */
  function ViewProbe() {
    const { state } = useStudio();
    const a = state.doc?.content.Actions.find((x) => x.Identifier === "show-form");
    return <span data-testid="view-probe">{JSON.stringify(a?.Parameters.ViewResource)}</span>;
  }

  it("keeps the other key when either is edited, and reaches the picker's version prompt", async () => {
    await renderDoc(
      participantDoc(),
      <>
        <Canvas />
        <Inspector />
        <ViewProbe />
      </>,
    );
    await click(present('[data-testid="node-show-form"]'));
    const version = testId<HTMLInputElement>("text-ViewResource.Version");
    expect(version.value).toBe("1");
    await typeAndBlur(version, "2");
    expect(testId("view-probe").textContent).toBe(
      JSON.stringify({ Id: "${cdref:view:form@1}", Version: "2" }),
    );
    expect(document.querySelector('[data-testid="demoted-banner"]')).toBeNull();

    // "new reference…" on the view picker asks for a name and a version and
    // writes the token into ViewResource.Id, leaving Version alone. Before
    // the field existed, no inspector surface rendered a view picker, so the
    // version prompt was unreachable.
    const prompts: string[] = [];
    const answers = ["wizard", "3"];
    window.prompt = (message?: string) => {
      prompts.push(message ?? "");
      return answers.shift() ?? null;
    };
    const picker = [...document.querySelectorAll('[data-testid="inspector"] select')].find((s) =>
      [...(s as HTMLSelectElement).options].some((o) => o.value === "__new__"),
    ) as HTMLSelectElement;
    await selectOption(picker, "__new__");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("View version");
    expect(testId("view-probe").textContent).toBe(
      JSON.stringify({ Id: "${cdref:view:wizard@3}", Version: "2" }),
    );
    expect(document.querySelector('[data-testid="demoted-banner"]')).toBeNull();
  });
});

describe("a Lex bot's alias is picked as one key of LexV2Bot", () => {
  it("creates a lex reference through the picker and keeps the block typed", async () => {
    const relative = ["conformance", "roundtrip", "participant", "doc.flowdoc.json"];
    const candidates = [
      join(process.cwd(), ...relative),
      join(process.cwd(), "..", "..", ...relative),
    ];
    const file = candidates.find((c) => existsSync(c)) ?? candidates[0]!;
    const doc = JSON.parse(readFileSync(file, "utf8")) as FlowDoc;
    function BotProbe() {
      const { state } = useStudio();
      const a = state.doc?.content.Actions.find((x) => x.Identifier === "ask-intent");
      return <span data-testid="bot-probe">{JSON.stringify(a?.Parameters.LexV2Bot)}</span>;
    }
    await renderDoc(
      doc,
      <>
        <Canvas />
        <Inspector />
        <BotProbe />
      </>,
    );
    await click(present('[data-testid="node-ask-intent"]'));
    window.prompt = () => "support-bot";
    const picker = [...document.querySelectorAll('[data-testid="inspector"] select')].find((s) =>
      [...(s as HTMLSelectElement).options].some((o) => o.textContent === "sales-bot"),
    ) as HTMLSelectElement;
    expect(picker).toBeDefined();
    await selectOption(picker, "__new__");
    expect(testId("bot-probe").textContent).toBe(
      JSON.stringify({ AliasArn: "${cdref:lex:support-bot}" }),
    );
    expect(document.querySelector('[data-testid="demoted-banner"]')).toBeNull();
  });
});

describe("the recording block's two JSON fields replace each other", () => {
  it("setting screen recording clears voice recording and keeps the block typed", async () => {
    const relative = ["conformance", "roundtrip", "recording-analytics", "doc.flowdoc.json"];
    const candidates = [
      join(process.cwd(), ...relative),
      join(process.cwd(), "..", "..", ...relative),
    ];
    const file = candidates.find((c) => existsSync(c)) ?? candidates[0]!;
    const doc = JSON.parse(readFileSync(file, "utf8")) as FlowDoc;
    function RecordProbe() {
      const { state } = useStudio();
      const a = state.doc?.content.Actions.find((x) => x.Identifier === "record-voice");
      return <span data-testid="record-probe">{JSON.stringify(a?.Parameters)}</span>;
    }
    await renderDoc(
      doc,
      <>
        <Canvas />
        <Inspector />
        <RecordProbe />
      </>,
    );
    await click(present('[data-testid="node-record-voice"]'));
    const label = [...document.querySelectorAll('[data-testid="inspector"] label')].find((l) =>
      (l.textContent ?? "").startsWith("Screen recording"),
    )!;
    const area = label.querySelector("textarea")!;
    await typeAndBlur(area, JSON.stringify({ ScreenRecordedParticipants: ["Agent"] }));
    expect(testId("record-probe").textContent).toBe(
      JSON.stringify({ ScreenRecordingBehavior: { ScreenRecordedParticipants: ["Agent"] } }),
    );
    expect(document.querySelector('[data-testid="demoted-banner"]')).toBeNull();
  });
});

describe("the dynamic form of a number or select is shown as text", () => {
  /** The demo document with a typed Loop whose count is a JSONPath, and a GetMetricData whose channel is one. */
  function withDynamicBlocks(): FlowDoc {
    const loop = addBlock(demoDoc(), "Loop", { x: 0, y: 900 });
    let doc = connectNodes(loop.doc, loop.id, "welcome", "primary")!;
    doc = connectNodes(doc, loop.id, "hang-up", "primary")!;
    const metrics = addBlock(doc, "GetMetricData", { x: 0, y: 1000 });
    doc = connectNodes(metrics.doc, metrics.id, "hang-up", "primary")!;
    doc = connectNodes(doc, metrics.id, "apologize", "error")!;
    doc = setParam(doc, loop.id, "LoopCount", "$.Attributes.retries");
    return setParam(doc, metrics.id, "QueueChannel", "$.Channel");
  }

  it("shows a Loop's JSONPath count as text and takes a number back through the bounds", async () => {
    const doc = withDynamicBlocks();
    await renderDoc(
      doc,
      <>
        <Canvas />
        <Inspector />
        <NoticeBar />
      </>,
    );
    await click(present('[data-testid="node-loop"]'));
    expect(document.querySelector('[data-testid="number-LoopCount"]')).toBeNull();
    const field = testId<HTMLInputElement>("jsonpath-LoopCount");
    expect(field.value).toBe("$.Attributes.retries");
    expect(testId("inspector").textContent).toContain("Loop count (JSONPath)");
    expect(document.querySelector('[data-testid="demoted-banner"]')).toBeNull();

    await typeAndBlur(field, "$.Attributes.attempts");
    expect(testId<HTMLInputElement>("jsonpath-LoopCount").value).toBe("$.Attributes.attempts");

    // Out of range is refused with the number field's message; the refused
    // text stays on screen to be corrected and the document keeps the
    // JSONPath, which is why the field is still the text one.
    await typeAndBlur(testId<HTMLInputElement>("jsonpath-LoopCount"), "101");
    expect(testId("inspector").textContent).toContain("at most 100");
    expect(testId<HTMLInputElement>("jsonpath-LoopCount").value).toBe("101");

    // A number in range lands in the static form, the console's string.
    await typeAndBlur(testId<HTMLInputElement>("jsonpath-LoopCount"), "3");
    expect(document.querySelector('[data-testid="jsonpath-LoopCount"]')).toBeNull();
    expect(testId<HTMLInputElement>("number-LoopCount").value).toBe("3");
    expect(document.querySelector('[data-testid="demoted-banner"]')).toBeNull();
  });

  it("shows GetMetricData's JSONPath channel as text and takes a listed name back", async () => {
    await renderDoc(
      withDynamicBlocks(),
      <>
        <Canvas />
        <Inspector />
      </>,
    );
    await click(present('[data-testid="node-get-metrics"]'));
    const field = testId<HTMLInputElement>("jsonpath-QueueChannel");
    expect(field.value).toBe("$.Channel");
    expect(document.querySelector('[data-testid="demoted-banner"]')).toBeNull();
    await typeAndBlur(field, "Chat");
    expect(document.querySelector('[data-testid="jsonpath-QueueChannel"]')).toBeNull();
    const select = [...document.querySelectorAll('[data-testid="inspector"] select')].find(
      (s) => (s as HTMLSelectElement).value === "Chat",
    );
    expect(select).toBeDefined();
    expect(document.querySelector('[data-testid="demoted-banner"]')).toBeNull();
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

describe("inspector fields the review found unguarded", () => {
  it("shows the guard's refusal when the last routing field is emptied", async () => {
    const { doc, id } = withRoutingBlock();
    await renderDoc(
      doc,
      <>
        <Canvas />
        <Inspector />
        <NoticeBar />
      </>,
    );
    await click(present(`[data-testid="node-${id}"]`));
    const field = testId<HTMLInputElement>("number-QueuePriority");
    expect(field.value).toBe("5");
    await typeAndBlur(field, "");
    // The refusal reaches the field, and the document keeps the value.
    expect(testId("inspector").textContent).toContain("That parameter change");
    expect(present<HTMLInputElement>('[data-testid="number-QueuePriority"]')).toBeDefined();
  });

  it("deletes an emptied optional text field instead of storing an empty string", async () => {
    const { doc, id } = withCallbackBlock();
    await renderDoc(
      doc,
      <>
        <Canvas />
        <Inspector />
        <Probe id={id} />
      </>,
    );
    await click(present(`[data-testid="node-${id}"]`));
    const field = testId<HTMLInputElement>("text-CallerId");
    await typeAndBlur(field, "+15555550100");
    expect(testId("probe").textContent).toBe('"+15555550100"');
    await typeAndBlur(testId<HTMLInputElement>("text-CallerId"), "");
    expect(testId("probe").textContent).toBe("absent");
  });
});

/** Renders one parameter of one action straight from the store, for assertions. */
function Probe({ id }: { id: string }) {
  const { state } = useStudio();
  const value = state.doc?.content.Actions.find((a) => a.Identifier === id)?.Parameters.CallerId;
  return <span data-testid="probe">{value === undefined ? "absent" : JSON.stringify(value)}</span>;
}
