/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Mutations must never produce a doc that the schema rejects, and never one
// that codegen silently demotes to `new GenericBlock({...})`. Each case here
// was a reproduced defect: the assertions are the fix, not a description of it.

import { readFileSync } from "node:fs";
import type { FlowAction, FlowDoc } from "@flow-as-code/core";
import { DTMF_DIGITS, MAX_ACTIONS_PER_FLOW, codegen } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONDITION_OPERANDS,
  DTMF_KEY_ORDER,
  acceptsConditions,
  acceptsNextAction,
  defaultConditionFor,
  isDtmfMenu,
  isTerminalType,
  normalizeOperands,
} from "../src/model/capabilities.js";
import { conditionEdgeId, docToGraph, errorEdgeId, nextEdgeId } from "../src/model/graph.js";
import { demotedIds } from "../src/model/demotion.js";
import {
  MESSAGE_BODY_KEYS,
  MutationRefused,
  addBlock,
  canAddBlock,
  connectNodes,
  getAction,
  messageBodyKey,
  moveNode,
  removeCondition,
  setCondition,
  setMessageBody,
  setNumberParam,
  setParam,
  rewireEdge,
} from "../src/model/mutations.js";
import { demoDoc, expectByteStable, expectSchemaValid, menuDoc } from "./helpers.js";

/** conformance/roundtrip/edge-cases: a Compare with real condition branches. */
function edgeCasesDoc(): FlowDoc {
  const path = new URL(
    "../../../conformance/roundtrip/edge-cases/doc.flowdoc.json",
    import.meta.url,
  );
  return JSON.parse(readFileSync(path, "utf8")) as FlowDoc;
}

/**
 * The constructor codegen emits for one action: `new Compare({` for a modeled
 * block, `new GenericBlock({` when the shape no longer fits the builder. The
 * `id:` line follows the constructor line, so walk back from it.
 */
function emittedClassFor(doc: FlowDoc, id: string): string {
  const lines = codegen(doc).split("\n");
  const idLine = lines.findIndex((l) => l.trim() === `id: "${id}",`);
  expect(idLine, `no emitted block for "${id}"`).toBeGreaterThan(-1);
  for (let i = idLine; i >= 0; i--) {
    const line = lines[i]!;
    if (line.includes("new ")) return line.trim();
  }
  return "";
}

describe("M1 setMessageBody always leaves exactly one body parameter", () => {
  it("keeps one body key for every switch", () => {
    let doc = demoDoc();
    for (const kind of ["SSML", "Text", "SSML"] as const) {
      doc = setMessageBody(doc, "welcome", kind, "body");
      const params = getAction(doc, "welcome")!.Parameters;
      expect(Object.keys(params).filter((k) => ["Text", "SSML", "PromptId"].includes(k))).toEqual([
        kind,
      ]);
      expectSchemaValid(doc);
    }
  });

  it("switching to a prompt writes the reference, never an empty body", () => {
    const doc = setMessageBody(demoDoc(), "welcome", "PromptId", "${cdref:prompt:greeting}");
    const params = getAction(doc, "welcome")!.Parameters;
    expect(params.PromptId).toBe("${cdref:prompt:greeting}");
    expect(params.Text).toBeUndefined();
    expect(messageBodyKey(getAction(doc, "welcome")!)).toBe("PromptId");
    expectSchemaValid(doc);
    expectByteStable(doc);
  });

  it("a MessageParticipant with no body at all is schema-invalid (the old behaviour)", () => {
    // Guards the reason the fix exists: lint stays clean, so only the schema
    // check catches it, and the mutation must never produce it.
    const doc = demoDoc();
    const bodyless = {
      ...doc,
      content: {
        ...doc.content,
        Actions: doc.content.Actions.map((a) =>
          a.Identifier === "welcome" ? { ...a, Parameters: {} } : a,
        ),
      },
    };
    expect(() => expectSchemaValid(bodyless)).toThrow();
  });
});

describe("M2 a drag from a Compare creates a branch, never a NextAction", () => {
  it("appends a condition branch and keeps codegen on the Compare class", () => {
    const doc = edgeCasesDoc();
    expect(emittedClassFor(doc, "compare-tier")).toContain("new Compare(");

    const next = connectNodes(doc, "compare-tier", "hang-up")!;
    expect(next).toBeDefined();
    expect(getAction(next, "compare-tier")?.Transitions.NextAction).toBeUndefined();
    const conditions = getAction(next, "compare-tier")!.Transitions.Conditions!;
    expect(conditions[conditions.length - 1]?.NextAction).toBe("hang-up");
    expectSchemaValid(next);
    expect(emittedClassFor(next, "compare-tier")).toContain("new Compare(");
    expect(emittedClassFor(next, "compare-tier")).not.toContain("GenericBlock");
  });

  it("a drag from the error handle wires NoMatchingCondition on a fresh Compare", () => {
    const { doc, id } = addBlock(demoDoc(), "Compare", { x: 0, y: 900 });
    const branched = connectNodes(doc, id, "hang-up", "primary")!;
    expect(
      branched.content.Actions.find((a) => a.Identifier === id)?.Transitions.Conditions,
    ).toHaveLength(1);
    const withCatchAll = connectNodes(branched, id, "apologize", "error")!;
    expect(getAction(withCatchAll, id)?.Transitions.Errors).toEqual([
      { ErrorType: "NoMatchingCondition", NextAction: "apologize" },
    ]);
    expect(getAction(withCatchAll, id)?.Transitions.NextAction).toBeUndefined();
    expectSchemaValid(withCatchAll);
  });

  it("capabilities agree with the builder shapes", () => {
    expect(acceptsNextAction(getAction(edgeCasesDoc(), "compare-tier")!)).toBe(false);
    expect(acceptsNextAction(getAction(demoDoc(), "welcome")!)).toBe(true);
    expect(acceptsNextAction(getAction(demoDoc(), "hang-up")!)).toBe(false);
    expect(isTerminalType("EndFlowExecution")).toBe(true);
  });
});

describe("M3 numeric parameters honour the field's bounds", () => {
  const bounds = { min: 1, max: 8 };

  it("refuses an empty field instead of committing 0", () => {
    const result = setNumberParam(demoDoc(), "look-up-appointment", "T", "", bounds);
    expect(result.ok).toBe(false);
  });

  it("refuses out-of-range and non-integer values", () => {
    for (const raw of ["0", "9", "3.5", "abc"]) {
      const result = setNumberParam(
        demoDoc(),
        "look-up-appointment",
        "InvocationTimeLimitSeconds",
        raw,
        bounds,
      );
      expect(result.ok, `${raw} should be refused`).toBe(false);
    }
  });

  it("accepts an in-range integer and keeps the doc schema-valid", () => {
    const result = setNumberParam(
      demoDoc(),
      "look-up-appointment",
      "InvocationTimeLimitSeconds",
      "5",
      bounds,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        getAction(result.doc, "look-up-appointment")?.Parameters.InvocationTimeLimitSeconds,
      ).toBe(5);
      expectSchemaValid(result.doc);
    }
  });

  it("a timeout of 0 would be schema-invalid, which is why the check exists", () => {
    const doc = demoDoc();
    const broken = {
      ...doc,
      content: {
        ...doc.content,
        Actions: doc.content.Actions.map((a) =>
          a.Identifier === "look-up-appointment"
            ? { ...a, Parameters: { ...a.Parameters, InvocationTimeLimitSeconds: 0 } }
            : a,
        ),
      },
    };
    expect(() => expectSchemaValid(broken)).toThrow();
  });
});

describe("M4 condition edges only move onto blocks that take conditions", () => {
  it("refuses a condition edge dropped on a MessageParticipant", () => {
    const doc = edgeCasesDoc();
    const edge = conditionEdgeId("compare-tier", 0);
    expect(() => rewireEdge(doc, edge, "ssml-greeting", "hang-up")).toThrow(MutationRefused);
    expect(emittedClassFor(doc, "ssml-greeting")).toContain("new MessageParticipant(");
  });

  it("refuses a next edge dropped on a Compare", () => {
    const doc = edgeCasesDoc();
    expect(() => rewireEdge(doc, nextEdgeId("ssml-greeting"), "compare-tier", "hang-up")).toThrow(
      MutationRefused,
    );
  });

  it("still moves a condition edge between blocks that do take conditions", () => {
    const doc = addBlock(edgeCasesDoc(), "Compare", { x: 0, y: 900 }).doc;
    const moved = rewireEdge(doc, conditionEdgeId("compare-tier", 0), "compare", "hang-up");
    expect(moved).toBeDefined();
    expect(getAction(moved!, "compare")?.Transitions.Conditions).toHaveLength(1);
    expectSchemaValid(moved!);
  });

  it("acceptsConditions matches the builder shapes", () => {
    const doc = edgeCasesDoc();
    expect(acceptsConditions(getAction(doc, "compare-tier")!)).toBe(true);
    expect(acceptsConditions(getAction(doc, "ssml-greeting")!)).toBe(false);
    // CheckHoursOfOperation's two conditions are fixed by its builder; a third
    // demotes it, so the canvas refuses to add one.
    expect(acceptsConditions(getAction(demoDoc(), "check-hours")!)).toBe(false);
  });
});

describe("condition authoring", () => {
  it("edits an operator and operands, and removes a branch", () => {
    const doc = edgeCasesDoc();
    const edited = setCondition(doc, "compare-tier", 0, {
      Operator: "TextStartsWith",
      Operands: ["go", "ld"],
    })!;
    expect(
      edited.content.Actions.find((a) => a.Identifier === "compare-tier")?.Transitions
        .Conditions?.[0]?.Condition,
    ).toEqual({
      Operator: "TextStartsWith",
      Operands: ["go", "ld"],
    });
    expectSchemaValid(edited);

    expect(
      setCondition(doc, "compare-tier", 0, { Operator: "Nope", Operands: ["x"] } as never),
    ).toBeUndefined();
    expect(
      setCondition(doc, "compare-tier", 0, { Operator: "Equals", Operands: [] }),
    ).toBeUndefined();

    const before = getAction(doc, "compare-tier")!.Transitions.Conditions!.length;
    const removed = removeCondition(doc, "compare-tier", 0)!;
    expect(getAction(removed, "compare-tier")?.Transitions.Conditions).toHaveLength(before - 1);
    expectSchemaValid(removed);
  });
});

describe("C3 a new block can be wired up", () => {
  it("a palette-inserted block is not terminal and takes a success transition", () => {
    const { doc, id } = addBlock(demoDoc(), "MessageParticipant", { x: 0, y: 900 });
    // The node renders a source handle because the TYPE is not terminal, not
    // because it already has transitions (it has none).
    expect(isTerminalType(getAction(doc, id)!.Type)).toBe(false);
    expect(getAction(doc, id)?.Transitions).toEqual({});
    const wired = connectNodes(doc, id, "hang-up", "primary")!;
    expect(getAction(wired, id)?.Transitions.NextAction).toBe("hang-up");
  });

  it("an action whose last transition was detached can be rewired", () => {
    // A block that reached the canvas with no transitions (from a file, or an
    // older studio) must keep its source handle and stay wireable.
    const stripped = demoDoc();
    stripped.content.Actions = stripped.content.Actions.map((a) =>
      a.Identifier === "transfer" ? { ...a, Transitions: {} } : a,
    );
    const transfer = getAction(stripped, "transfer")!;
    expect(transfer.Transitions.NextAction).toBeUndefined();
    expect(isTerminalType(transfer.Type)).toBe(false);
    expect(connectNodes(stripped, "transfer", "apologize", "primary")).toBeDefined();
  });
});

describe("error edges keyed by index", () => {
  it("keeps two errors of the same type as two edges", () => {
    const doc = demoDoc();
    const twice = {
      ...doc,
      content: {
        ...doc.content,
        Actions: doc.content.Actions.map((a) =>
          a.Identifier === "welcome"
            ? {
                ...a,
                Transitions: {
                  ...a.Transitions,
                  Errors: [
                    { ErrorType: "NoMatchingError", NextAction: "apologize" },
                    { ErrorType: "NoMatchingError", NextAction: "hang-up" },
                  ],
                },
              }
            : a,
        ),
      },
    };
    const edges = docToGraph(twice).edges.filter(
      (e) => e.source === "welcome" && e.kind === "error",
    );
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.id)).toEqual([
      errorEdgeId("welcome", 0, "NoMatchingError"),
      errorEdgeId("welcome", 1, "NoMatchingError"),
    ]);
    // Rewiring the second one leaves the first alone.
    const moved = rewireEdge(twice, edges[1]!.id, "welcome", "announce-closed")!;
    expect(getAction(moved, "welcome")?.Transitions.Errors).toEqual([
      { ErrorType: "NoMatchingError", NextAction: "apologize" },
      { ErrorType: "NoMatchingError", NextAction: "announce-closed" },
    ]);
  });
});

describe("operands mean the same thing to both authoring surfaces", () => {
  // The inspector's text field and a drag from a Compare's handle both produce
  // operands, and they disagreed: a drag authored [""] while the inspector
  // refused to, so one gesture could reach a condition the other rejected.
  // There is one function now, and this is what pins them together.
  it("a fresh branch carries exactly what an emptied field means", () => {
    const { doc, id } = addBlock(demoDoc(), "Compare", { x: 0, y: 900 });
    const branched = connectNodes(doc, id, "hang-up", "primary")!;
    const created = getAction(branched, id)!.Transitions.Conditions![0]!.Condition;
    expect(created.Operands).toEqual(normalizeOperands(""));
    expect(created.Operands).toEqual([...DEFAULT_CONDITION_OPERANDS]);
    // Round trip: writing that same value back through the inspector's path is
    // a no-op, not a refusal.
    expect(
      setCondition(branched, id, 0, { ...created, Operands: normalizeOperands("") }),
    ).toBeDefined();
    expectSchemaValid(branched);
  });

  it("drops blanks between commas but never produces the empty list", () => {
    expect(normalizeOperands("gold, silver")).toEqual(["gold", "silver"]);
    expect(normalizeOperands("gold, , silver")).toEqual(["gold", "silver"]);
    expect(normalizeOperands("  ")).toEqual([""]);
    expect(normalizeOperands(",,")).toEqual([""]);
    // The schema requires at least one operand, so [] is not a state a branch
    // can be saved in (conformance/schema, $defs.condition.Operands minItems).
    expect(normalizeOperands("").length).toBeGreaterThan(0);
  });
});

describe("M5 a GetParticipantInput is authored as a DTMF menu", () => {
  // The block class (@flow-as-code/core blocks.ts) takes one key per Equals branch, a
  // string timeout, and three errors with NextAction mirroring the no-match
  // one. Each gesture below either produces that shape or is refused; none of
  // them may hand the user a silently generic block.
  const MENU_ERRORS = ["InputTimeLimitExceeded", "NoMatchingCondition", "NoMatchingError"];

  /** A fresh menu from the palette, wired up the way the canvas would. */
  function wiredFreshMenu(): { doc: FlowDoc; id: string } {
    const fresh = addBlock(demoDoc(), "GetParticipantInput", { x: 0, y: 900 });
    let doc = connectNodes(fresh.doc, fresh.id, "hang-up", "primary")!;
    doc = connectNodes(doc, fresh.id, "apologize", "primary")!;
    doc = connectNodes(doc, fresh.id, "apologize", "error")!;
    doc = connectNodes(doc, fresh.id, "welcome", "error")!;
    doc = connectNodes(doc, fresh.id, "hang-up", "error")!;
    return { doc, id: fresh.id };
  }

  it("a primary drag adds an Equals branch on the next free key", () => {
    const { doc, id } = addBlock(demoDoc(), "GetParticipantInput", { x: 0, y: 900 });
    expect(getAction(doc, id)?.Parameters).toEqual({
      Text: "New menu",
      InputTimeLimitSeconds: "5",
      StoreInput: "False",
    });
    const one = connectNodes(doc, id, "hang-up", "primary")!;
    const two = connectNodes(one, id, "apologize", "primary")!;
    expect(getAction(two, id)?.Transitions.Conditions).toEqual([
      { NextAction: "hang-up", Condition: { Operator: "Equals", Operands: ["1"] } },
      { NextAction: "apologize", Condition: { Operator: "Equals", Operands: ["2"] } },
    ]);
    // Never a bare NextAction, and never the Compare placeholder.
    expect(getAction(two, id)?.Transitions.NextAction).toBeUndefined();
    expectSchemaValid(two);
  });

  it("skips keys the menu already answers to", () => {
    const doc = menuDoc(); // 1, 2 and * are taken
    const next = connectNodes(doc, "menu", "bye", "primary")!;
    const added = getAction(next, "menu")!.Transitions.Conditions!.at(-1)!;
    expect(added.Condition.Operands).toEqual(["3"]);
    expect(emittedClassFor(next, "menu")).toContain("new GetParticipantInput(");
    expectSchemaValid(next);
  });

  it("hands out keys in the order a menu is read: 1 to 9, 0, *, #", () => {
    // No branches yet and the catch-all error still missing, so the block is
    // generic until the very end and every gesture below is a plain append.
    let doc = menuDoc();
    doc.content.Actions = doc.content.Actions.map((a) =>
      a.Identifier === "menu"
        ? {
            ...a,
            Transitions: {
              ...a.Transitions,
              Errors: a.Transitions.Errors!.slice(0, 2),
              Conditions: [],
            },
          }
        : a,
    );
    const handed: string[] = [];
    // Bounded: a drag that never runs out of keys is the defect, not a reason
    // to spin.
    for (let i = 0; i <= DTMF_DIGITS.length; i++) {
      const next = connectNodes(doc, "menu", "bye", "primary");
      if (next === undefined) break;
      doc = next;
      handed.push(...getAction(doc, "menu")!.Transitions.Conditions!.at(-1)!.Condition.Operands);
    }
    // Spelled out rather than compared against DTMF_KEY_ORDER: the constant is
    // what this test pins, so a reorder there must land here as a red test.
    expect(handed).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"]);
    expect(defaultConditionFor(getAction(doc, "menu")!)).toBeUndefined();
    // With every key taken the primary gesture has nothing left to mean, while
    // a handle-less drag still falls through to the error branch it lacks.
    expect(connectNodes(doc, "menu", "bye", "primary")).toBeUndefined();
    const fallback = connectNodes(doc, "menu", "bye")!;
    expect(getAction(fallback, "menu")?.Transitions.Errors?.[2]).toEqual({
      ErrorType: "NoMatchingError",
      NextAction: "bye",
    });
    expect(connectNodes(fallback, "menu", "bye")).toBeUndefined();
    expect(emittedClassFor(fallback, "menu")).toContain("new GetParticipantInput(");
    expectSchemaValid(fallback);
  });

  it("the key order is exactly @flow-as-code/core's DTMF digits", () => {
    expect([...DTMF_KEY_ORDER].sort()).toEqual([...DTMF_DIGITS].sort());
    expect(new Set(DTMF_KEY_ORDER).size).toBe(DTMF_KEY_ORDER.length);
  });

  it("error drags wire the three errors in the class's order and mirror the no-match path", () => {
    const { doc, id } = addBlock(demoDoc(), "GetParticipantInput", { x: 0, y: 900 });
    const t1 = connectNodes(doc, id, "apologize", "error")!;
    expect(getAction(t1, id)?.Transitions.Errors).toEqual([
      { ErrorType: "InputTimeLimitExceeded", NextAction: "apologize" },
    ]);
    expect(getAction(t1, id)?.Transitions.NextAction).toBeUndefined();

    const t2 = connectNodes(t1, id, "welcome", "error")!;
    expect(getAction(t2, id)?.Transitions.Errors?.[1]).toEqual({
      ErrorType: "NoMatchingCondition",
      NextAction: "welcome",
    });
    // Wiring NoMatchingCondition is what sets NextAction: one path, drawn twice.
    expect(getAction(t2, id)?.Transitions.NextAction).toBe("welcome");

    const t3 = connectNodes(t2, id, "hang-up", "error")!;
    expect(getAction(t3, id)?.Transitions.Errors?.map((e) => e.ErrorType)).toEqual(MENU_ERRORS);
    expect(connectNodes(t3, id, "hang-up", "error")).toBeUndefined();
    expectSchemaValid(t3);
  });

  it("a fresh menu wired up on the canvas is typed, with no demotion", () => {
    const { doc, id } = wiredFreshMenu();
    expect(emittedClassFor(doc, id)).toContain("new GetParticipantInput(");
    expect(demotedIds(doc).has(id)).toBe(false);
    expect(getAction(doc, id)?.Transitions.NextAction).toBe("welcome");
    expectSchemaValid(doc);
    expectByteStable(doc);
  });

  it("retargeting the next edge or the no-match error moves both ends together", () => {
    const doc = menuDoc();
    const viaNext = rewireEdge(doc, nextEdgeId("menu"), "menu", "bye")!;
    expect(getAction(viaNext, "menu")?.Transitions.NextAction).toBe("bye");
    expect(getAction(viaNext, "menu")?.Transitions.Errors?.[1]?.NextAction).toBe("bye");
    expect(emittedClassFor(viaNext, "menu")).toContain("new GetParticipantInput(");

    const viaError = rewireEdge(doc, errorEdgeId("menu", 1, "NoMatchingCondition"), "menu", "bye")!;
    expect(getAction(viaError, "menu")?.Transitions.NextAction).toBe("bye");
    expect(getAction(viaError, "menu")?.Transitions.Errors?.[1]?.NextAction).toBe("bye");
    expect(emittedClassFor(viaError, "menu")).toContain("new GetParticipantInput(");

    // The other two errors are their own paths and leave NextAction alone.
    const timeout = rewireEdge(
      doc,
      errorEdgeId("menu", 0, "InputTimeLimitExceeded"),
      "menu",
      "bye",
    )!;
    expect(getAction(timeout, "menu")?.Transitions.NextAction).toBe("no-match");
    expect(getAction(timeout, "menu")?.Transitions.Errors?.[0]?.NextAction).toBe("bye");
    expectSchemaValid(timeout);
  });

  it("moving the no-match error to another menu carries the mirrored NextAction with it", () => {
    // Two unfinished menus, so neither move costs a typed form and the guard
    // has nothing to refuse: what is left is the mirror bookkeeping itself.
    const a = addBlock(demoDoc(), "GetParticipantInput", { x: 0, y: 900 });
    const b = addBlock(a.doc, "GetParticipantInput", { x: 0, y: 1000 });
    let doc = connectNodes(b.doc, a.id, "apologize", "error")!; // InputTimeLimitExceeded
    doc = connectNodes(doc, a.id, "welcome", "error")!; // NoMatchingCondition, mirrored
    expect(getAction(doc, a.id)?.Transitions.NextAction).toBe("welcome");

    const moved = rewireEdge(doc, errorEdgeId(a.id, 1, "NoMatchingCondition"), b.id, "welcome")!;
    expect(getAction(moved, b.id)?.Transitions.Errors).toEqual([
      { ErrorType: "NoMatchingCondition", NextAction: "welcome" },
    ]);
    expect(getAction(moved, b.id)?.Transitions.NextAction).toBe("welcome");
    // The path left the first menu whole: no next edge stays behind.
    expect(getAction(moved, a.id)?.Transitions.NextAction).toBeUndefined();
    expect(getAction(moved, a.id)?.Transitions.Errors?.map((e) => e.ErrorType)).toEqual([
      "InputTimeLimitExceeded",
    ]);
    expectSchemaValid(moved);

    // On a finished menu the same move is refused: the no-match path is
    // required, so taking it away would demote the block (legality is the
    // guard's, not a rule here).
    expect(() =>
      rewireEdge(menuDoc(), errorEdgeId("menu", 1, "NoMatchingCondition"), "sales", "bye"),
    ).toThrow(MutationRefused);
  });

  it("moving the next edge away from a menu takes the mirrored no-match error with it", () => {
    // The mirror of the case above: the path is one, whichever half is dragged.
    const a = addBlock(demoDoc(), "GetParticipantInput", { x: 0, y: 900 });
    const b = addBlock(a.doc, "MessageParticipant", { x: 0, y: 1000 });
    let doc = connectNodes(b.doc, a.id, "apologize", "error")!; // InputTimeLimitExceeded
    doc = connectNodes(doc, a.id, "welcome", "error")!; // NoMatchingCondition, mirrored

    const moved = rewireEdge(doc, nextEdgeId(a.id), b.id, "welcome")!;
    expect(getAction(moved, b.id)?.Transitions.NextAction).toBe("welcome");
    expect(getAction(moved, a.id)?.Transitions.NextAction).toBeUndefined();
    expect(getAction(moved, a.id)?.Transitions.Errors).toEqual([
      { ErrorType: "InputTimeLimitExceeded", NextAction: "apologize" },
    ]);
    expectSchemaValid(moved);
  });

  it("a next edge dropped on a menu whose no-match path goes elsewhere is refused, not retargeted", () => {
    // A hand-authored menu with the no-match error wired and no NextAction:
    // the studio no longer produces this shape, but a file can carry it. The
    // error is the menu's next path, so a drop that disagrees with it is the
    // same clobber as dropping on a block that already has a next edge; before
    // the check, mirrorNoMatch replaced the dropped target with "welcome".
    const a = addBlock(demoDoc(), "GetParticipantInput", { x: 0, y: 900 });
    a.doc.content.Actions = a.doc.content.Actions.map((x) =>
      x.Identifier === a.id
        ? {
            ...x,
            Transitions: {
              Errors: [{ ErrorType: "NoMatchingCondition", NextAction: "welcome" }],
              Conditions: [],
            },
          }
        : x,
    );
    // The edge being moved starts on an unfinished message, which can give it
    // up without the guard having a say; what is under test is the check.
    const b = addBlock(a.doc, "MessageParticipant", { x: 0, y: 1000 });
    const disagreeing = connectNodes(b.doc, b.id, "hang-up", "primary")!;
    expect(rewireEdge(disagreeing, nextEdgeId(b.id), a.id, "hang-up")).toBeUndefined();

    // Agreeing with it restores the path drawn twice.
    const agreeing = connectNodes(b.doc, b.id, "welcome", "primary")!;
    const agreed = rewireEdge(agreeing, nextEdgeId(b.id), a.id, "welcome")!;
    expect(getAction(agreed, a.id)?.Transitions.NextAction).toBe("welcome");
    expect(getAction(agreed, b.id)?.Transitions.NextAction).toBeUndefined();
    expectSchemaValid(agreed);
  });

  /**
   * A menu with its NoMatchingCondition error still to wire, carrying the
   * transitions given. An unfinished menu is generic already, so the guard
   * has nothing to refuse and only the source-end checks stand between a
   * drop and the mirror rewriting NextAction.
   */
  function unfinishedMenu(transitions: FlowAction["Transitions"]): { doc: FlowDoc; id: string } {
    const fresh = addBlock(demoDoc(), "GetParticipantInput", { x: 0, y: 900 });
    fresh.doc.content.Actions = fresh.doc.content.Actions.map((x) =>
      x.Identifier === fresh.id ? { ...x, Transitions: transitions } : x,
    );
    return fresh;
  }

  /** A further fresh menu whose no-match path goes to "announce-busy", ready to move. */
  function noMatchToMove(doc: FlowDoc): { doc: FlowDoc; edgeId: string } {
    const other = addBlock(doc, "GetParticipantInput", { x: 0, y: 1000 });
    let wired = connectNodes(other.doc, other.id, "announce-closed", "error")!; // InputTimeLimitExceeded
    wired = connectNodes(wired, other.id, "announce-busy", "error")!; // NoMatchingCondition, mirrored
    return { doc: wired, edgeId: errorEdgeId(other.id, 1, "NoMatchingCondition") };
  }

  it("a no-match error dropped on the stored-input form is refused, as the error drag is", () => {
    // Reproduced: the drop appended NoMatchingCondition to a StoreInput block
    // and mirrorNoMatch rewrote its NextAction from "hang-up" to the dropped
    // target, so the block lost its continuation and gained an error the
    // action page says this form cannot carry. connectNodes already refuses
    // the equivalent drag (wireMissingError); the rewire bypassed that gate.
    const stored = unfinishedMenu({
      NextAction: "hang-up",
      Errors: [{ ErrorType: "NoMatchingError", NextAction: "apologize" }],
      Conditions: [],
    });
    stored.doc.content.Actions = stored.doc.content.Actions.map((x) =>
      x.Identifier === stored.id
        ? { ...x, Parameters: { ...x.Parameters, StoreInput: "True" } }
        : x,
    );
    expect(isDtmfMenu(getAction(stored.doc, stored.id)!)).toBe(false);
    const moving = noMatchToMove(stored.doc);
    expect(rewireEdge(moving.doc, moving.edgeId, stored.id, "announce-busy")).toBeUndefined();

    // The form is the reason, not the disagreement: a drop that agrees with
    // NextAction is refused the same way, as connectNodes refuses the drag.
    stored.doc.content.Actions = stored.doc.content.Actions.map((x) =>
      x.Identifier === stored.id
        ? { ...x, Transitions: { ...x.Transitions, NextAction: "announce-busy" } }
        : x,
    );
    const agreeing = noMatchToMove(stored.doc);
    expect(rewireEdge(agreeing.doc, agreeing.edgeId, stored.id, "announce-busy")).toBeUndefined();
    expect(connectNodes(stored.doc, stored.id, "announce-busy", "error")).toBeUndefined();
  });

  it("a no-match error dropped on a menu whose next path goes elsewhere is refused, not clobbered", () => {
    // Reproduced: the drop appended the error and mirrorNoMatch replaced the
    // menu's NextAction with the dropped target, silently. A menu's next path
    // is the no-match path drawn twice, so a disagreeing drop is the same
    // overwrite the next-edge rewire already refuses.
    const menu = unfinishedMenu({
      NextAction: "apologize",
      Errors: [{ ErrorType: "InputTimeLimitExceeded", NextAction: "announce-closed" }],
      Conditions: [],
    });
    const moving = noMatchToMove(menu.doc);
    expect(rewireEdge(moving.doc, moving.edgeId, menu.id, "announce-busy")).toBeUndefined();

    // Agreeing with it is the path drawn twice, and it leaves the moved-from
    // menu whole.
    const agreed = rewireEdge(moving.doc, moving.edgeId, menu.id, "apologize")!;
    expect(getAction(agreed, menu.id)?.Transitions.NextAction).toBe("apologize");
    expect(getAction(agreed, menu.id)?.Transitions.Errors).toEqual([
      { ErrorType: "InputTimeLimitExceeded", NextAction: "announce-closed" },
      { ErrorType: "NoMatchingCondition", NextAction: "apologize" },
    ]);
    expectSchemaValid(agreed);
  });

  it("a no-match error dropped on a menu that already has one is refused, as the error drag is", () => {
    // The hand-authored shape: no-match wired, NextAction absent. The
    // NextAction check passes it, and a second NoMatchingCondition is a shape
    // the class never emits; wireMissingError refuses an error already wired,
    // so the rewire does too, whichever target it names.
    const menu = unfinishedMenu({
      Errors: [{ ErrorType: "NoMatchingCondition", NextAction: "welcome" }],
      Conditions: [],
    });
    const moving = noMatchToMove(menu.doc);
    expect(rewireEdge(moving.doc, moving.edgeId, menu.id, "welcome")).toBeUndefined();
    expect(rewireEdge(moving.doc, moving.edgeId, menu.id, "announce-busy")).toBeUndefined();
  });

  it("stores the timeout as the console's string, and refuses the JSON number", () => {
    const doc = menuDoc();
    const bounds = { min: 1, max: 180 };
    // Without asString the parameter would become a JSON 10, a shape only
    // GenericBlock holds; the guard sees the demotion and refuses.
    expect(() => setNumberParam(doc, "menu", "InputTimeLimitSeconds", "10", bounds)).toThrow(
      MutationRefused,
    );
    const result = setNumberParam(doc, "menu", "InputTimeLimitSeconds", "10", {
      ...bounds,
      asString: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getAction(result.doc, "menu")?.Parameters.InputTimeLimitSeconds).toBe("10");
      expect(emittedClassFor(result.doc, "menu")).toContain("new GetParticipantInput(");
      expectSchemaValid(result.doc);
    }
    // The bounds still apply before the spelling does.
    expect(
      setNumberParam(doc, "menu", "InputTimeLimitSeconds", "0", { ...bounds, asString: true }).ok,
    ).toBe(false);
  });

  it("refuses a branch that is not a single key, in the guard, not a second rule list", () => {
    const doc = menuDoc();
    expect(() => setCondition(doc, "menu", 0, { Operator: "Equals", Operands: ["gold"] })).toThrow(
      MutationRefused,
    );
    expect(() =>
      setCondition(doc, "menu", 0, { Operator: "TextStartsWith", Operands: ["1"] }),
    ).toThrow(MutationRefused);
    // Re-keying a branch to another single key is fine.
    const rekeyed = setCondition(doc, "menu", 0, { Operator: "Equals", Operands: ["3"] })!;
    expect(emittedClassFor(rekeyed, "menu")).toContain("new GetParticipantInput(");
    expectSchemaValid(rekeyed);
  });

  it("a menu may play nothing: clearing the body keeps it typed", () => {
    const doc = menuDoc();
    const silent = setParam(doc, "menu", "Text", undefined, { clears: MESSAGE_BODY_KEYS });
    expect(messageBodyKey(getAction(silent, "menu")!)).toBeUndefined();
    expect(emittedClassFor(silent, "menu")).toContain("new GetParticipantInput(");
    expectSchemaValid(silent);
    // The same gesture on a MessageParticipant is refused (M1).
    expect(() => setParam(doc, "sales", "Text", undefined, { clears: MESSAGE_BODY_KEYS })).toThrow(
      MutationRefused,
    );
    // And the body switch works on a menu the way it does on a message.
    const ssml = setMessageBody(doc, "menu", "SSML", "<speak>Press 1.</speak>");
    expect(messageBodyKey(getAction(ssml, "menu")!)).toBe("SSML");
    expect(emittedClassFor(ssml, "menu")).toContain("new GetParticipantInput(");
  });

  /**
   * The stored-input form of the same action: StoreInput "True", the
   * InputValidation the action page requires with it, no branches and no
   * NoMatchingCondition ("Must be defined only if StoreInput is False"). The
   * builder does not model it, so it is a GenericBlock before any gesture and
   * must keep the gestures every unmodeled block has.
   */
  function storedInputDoc(): FlowDoc {
    const doc = menuDoc();
    doc.content.Actions = doc.content.Actions.map((a) =>
      a.Identifier === "menu"
        ? {
            ...a,
            Parameters: {
              Text: "Enter your account number, then press pound.",
              InputTimeLimitSeconds: "5",
              StoreInput: "True",
              InputValidation: { CustomValidation: { MaximumLength: "10" } },
            },
            Transitions: {
              NextAction: "sales",
              Errors: [{ ErrorType: "NoMatchingError", NextAction: "bye" }],
              Conditions: [],
            },
          }
        : a,
    );
    return doc;
  }

  it("the stored-input form keeps the gestures of an unmodeled block", () => {
    const doc = storedInputDoc();
    expect(demotedIds(doc).has("menu")).toBe(true);
    const stored = getAction(doc, "menu")!;
    expect(isDtmfMenu(stored)).toBe(false);
    expect(acceptsConditions(stored)).toBe(false);
    expect(acceptsNextAction(stored)).toBe(true);

    // With a NextAction already wired, a primary drag has nothing to mean; it
    // never appends a key branch the action page says this form cannot carry.
    expect(connectNodes(doc, "menu", "bye", "primary")).toBeUndefined();

    // Once the next edge has been moved to another block (a source-end rewire
    // allows that on a generic block), the primary drag is the gesture that
    // puts it back.
    const fresh = addBlock(doc, "MessageParticipant", { x: 0, y: 900 });
    const detached = rewireEdge(fresh.doc, nextEdgeId("menu"), fresh.id, "bye")!;
    expect(getAction(detached, "menu")?.Transitions.NextAction).toBeUndefined();
    expect(getAction(detached, fresh.id)?.Transitions.NextAction).toBe("bye");
    const restored = connectNodes(detached, "menu", "bye", "primary")!;
    expect(getAction(restored, "menu")?.Transitions).toEqual({
      NextAction: "bye",
      Errors: [{ ErrorType: "NoMatchingError", NextAction: "bye" }],
      Conditions: [],
    });
    expectSchemaValid(restored);

    // The error vocabulary is the menu form's, so an error drag means nothing
    // here rather than wiring a NoMatchingCondition the form cannot carry.
    expect(connectNodes(doc, "menu", "bye", "error")).toBeUndefined();
    expect(connectNodes(doc, "menu", "bye")).toBeUndefined();
    expect(demotedIds(restored).has("menu")).toBe(true);
    expect(emittedClassFor(restored, "menu")).toContain("new GenericBlock(");
  });

  it("a menu with StoreInput absent is still the menu form", () => {
    // StoreInput is optional on the action page and conditions are supported
    // when it is absent, so the drag hands out a key there too.
    const doc = menuDoc();
    doc.content.Actions = doc.content.Actions.map((a) => {
      if (a.Identifier !== "menu") return a;
      const { StoreInput: _storeInput, ...rest } = a.Parameters;
      return { ...a, Parameters: rest };
    });
    const absent = getAction(doc, "menu")!;
    expect(isDtmfMenu(absent)).toBe(true);
    expect(acceptsConditions(absent)).toBe(true);
    expect(acceptsNextAction(absent)).toBe(false);
    const next = connectNodes(doc, "menu", "bye", "primary")!;
    expect(getAction(next, "menu")!.Transitions.Conditions!.at(-1)).toEqual({
      NextAction: "bye",
      Condition: { Operator: "Equals", Operands: ["3"] },
    });
    expectSchemaValid(next);
  });

  it("capabilities describe the menu's gestures", () => {
    const menu = getAction(menuDoc(), "menu")!;
    expect(isDtmfMenu(menu)).toBe(true);
    expect(acceptsConditions(menu)).toBe(true);
    expect(acceptsNextAction(menu)).toBe(false);
    expect(defaultConditionFor(menu)).toEqual({ Operator: "Equals", Operands: ["3"] });
    // Compare keeps its placeholder.
    expect(defaultConditionFor(getAction(edgeCasesDoc(), "compare-tier")!)).toEqual({
      Operator: "Equals",
      Operands: [...DEFAULT_CONDITION_OPERANDS],
    });
  });
});

describe("moveNode and the action cap", () => {
  it("ignores a position for an id that is not an Action", () => {
    const doc = demoDoc();
    const moved = moveNode(doc, "not-a-block", { x: 5, y: 5 });
    expect(moved.layout?.["not-a-block"]).toBeUndefined();
    expect(moved).toBe(doc);
  });

  it("refuses to add past MAX_ACTIONS_PER_FLOW", () => {
    let doc = demoDoc();
    while (canAddBlock(doc)) doc = addBlock(doc, "MessageParticipant", { x: 0, y: 0 }).doc;
    expect(doc.content.Actions).toHaveLength(MAX_ACTIONS_PER_FLOW);
    expect(canAddBlock(doc)).toBe(false);
    expect(() => addBlock(doc, "MessageParticipant", { x: 0, y: 0 })).toThrow(
      new RegExp(String(MAX_ACTIONS_PER_FLOW)),
    );
    expectSchemaValid(doc);
  });
});
