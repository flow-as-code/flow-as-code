/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Mutations must never produce a doc that the schema rejects, and never one
// that codegen silently demotes to `new GenericBlock({...})`. Each case here
// was a reproduced defect: the assertions are the fix, not a description of it.

import { readFileSync } from "node:fs";
import type { FlowAction, FlowDoc } from "@flow-as-code/core";
import { DTMF_DIGITS, MAX_ACTIONS_PER_FLOW, codegen, lint } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONDITION_OPERANDS,
  DTMF_KEY_ORDER,
  acceptsConditions,
  acceptsNextAction,
  defaultConditionFor,
  isDtmfMenu,
  isTerminalType,
  offersErrorBranch,
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
import { demoDoc, detachableDoc, expectByteStable, expectSchemaValid, menuDoc } from "./helpers.js";

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
    // An error handle is offered where the type has an error to wire: not on
    // a terminal, always on an unmodeled block, never on a modeled type whose
    // page lists no error.
    expect(offersErrorBranch(getAction(demoDoc(), "welcome")!)).toBe(true);
    expect(offersErrorBranch(getAction(demoDoc(), "hang-up")!)).toBe(false);
    expect(offersErrorBranch(getAction(detachableDoc(), "raw-a")!)).toBe(true);
    expect(offersErrorBranch(getAction(demoDoc(), "enable-logging")!)).toBe(false);
    const { doc, id } = addBlock(demoDoc(), "UpdateContactRoutingBehavior", { x: 0, y: 900 });
    expect(offersErrorBranch(getAction(doc, id)!)).toBe(false);
    expect(connectNodes(doc, id, "hang-up", "error")).toBeUndefined();
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

  it("deletes an optional parameter on an empty field and clears its rival on a value", () => {
    const { doc, id } = addBlock(demoDoc(), "UpdateContactRoutingBehavior", { x: 0, y: 900 });
    expect(getAction(doc, id)?.Parameters).toEqual({ QueuePriority: "5" });
    const aged = setNumberParam(doc, id, "QueueTimeAdjustmentSeconds", "-30", {
      asString: true,
      optional: true,
      clears: ["QueuePriority"],
    });
    expect(aged.ok).toBe(true);
    if (!aged.ok) return;
    expect(getAction(aged.doc, id)?.Parameters).toEqual({ QueueTimeAdjustmentSeconds: "-30" });
    expectSchemaValid(aged.doc);
    // Once wired the block is typed, and emptying its only field leaves {}
    // which the block class refuses, so the guard reports the demotion rather
    // than letting it happen silently.
    const wired = connectNodes(aged.doc, id, "hang-up", "primary")!;
    expect([...demotedIds(wired)]).not.toContain(id);
    expect(() =>
      setNumberParam(wired, id, "QueueTimeAdjustmentSeconds", "", {
        asString: true,
        optional: true,
      }),
    ).toThrow(MutationRefused);
    // Without optional, an empty field is still refused with a message.
    expect(setNumberParam(wired, id, "QueueTimeAdjustmentSeconds", "", {}).ok).toBe(false);
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
    // A MessageParticipant's class reads no condition, so the move has
    // nothing to mean and is answered before the guard is asked.
    const doc = edgeCasesDoc();
    const edge = conditionEdgeId("compare-tier", 0);
    expect(rewireEdge(doc, edge, "ssml-greeting", "hang-up")).toBeUndefined();
    expect(emittedClassFor(doc, "ssml-greeting")).toContain("new MessageParticipant(");
  });

  it("refuses a next edge dropped on a Compare", () => {
    // A Compare's paths are all conditions (acceptsNextAction), so the drop
    // has nothing to mean; the Compare is untouched and stays typed.
    const doc = edgeCasesDoc();
    expect(rewireEdge(doc, nextEdgeId("ssml-greeting"), "compare-tier", "hang-up")).toBeUndefined();
    expect(emittedClassFor(doc, "compare-tier")).toContain("new Compare(");
  });

  it("refuses a next edge dropped on an unfinished Loop, whose next path is its done branch", () => {
    // The Loop is generic until both branches are wired, so the guard sees
    // no demotion; without the explicit check the edge landed as a bare
    // NextAction no drag could produce, and the done drag then overwrote it.
    const loop = addBlock(demoDoc(), "Loop", { x: 0, y: 900 });
    // The edge starts on an attribute update without its catch-all, generic
    // before and after the edge leaves it, so only the Loop is under test. (A
    // message will not do: its catch-all is optional, so a message with a
    // next edge is typed and giving the edge up would demote it.)
    const message = addBlock(loop.doc, "UpdateContactAttributes", { x: 0, y: 1000 });
    const wired = connectNodes(message.doc, message.id, "hang-up", "primary")!;
    expect(rewireEdge(wired, nextEdgeId(message.id), loop.id, "hang-up")).toBeUndefined();
    expect(getAction(wired, loop.id)?.Transitions.NextAction).toBeUndefined();

    // A file can carry a Loop with its branches wired and no NextAction (the
    // studio never writes that shape). A drop that agrees with the done
    // branch lands and completes the block; one that disagrees is the same
    // clobber as a drop on a block that already has a next edge.
    const authored: FlowDoc = {
      ...wired,
      content: {
        ...wired.content,
        Actions: wired.content.Actions.map((x) =>
          x.Identifier === loop.id
            ? {
                ...x,
                Transitions: {
                  Errors: [],
                  Conditions: [
                    {
                      NextAction: "welcome",
                      Condition: { Operator: "Equals", Operands: ["ContinueLooping"] },
                    },
                    {
                      NextAction: "hang-up",
                      Condition: { Operator: "Equals", Operands: ["DoneLooping"] },
                    },
                  ],
                },
              }
            : x,
        ),
      },
    };
    expect(demotedIds(authored).has(loop.id)).toBe(true);
    expect(rewireEdge(authored, nextEdgeId(message.id), loop.id, "welcome")).toBeUndefined();
    const agreed = rewireEdge(authored, nextEdgeId(message.id), loop.id, "hang-up")!;
    expect(getAction(agreed, loop.id)?.Transitions.NextAction).toBe("hang-up");
    expect(getAction(agreed, message.id)?.Transitions.NextAction).toBeUndefined();
    expect(demotedIds(agreed).has(loop.id)).toBe(false);
    expectSchemaValid(agreed);
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

  it("a palette-inserted block is typed as soon as its branches are wired", () => {
    // connectNodes writes Transitions in synth normal form (Errors and
    // Conditions present), which is the form every block class emits and the
    // form codegen compares against; without it the new block stayed a
    // GenericBlock until a save and re-synth wrote the arrays back.
    const { doc, id } = addBlock(demoDoc(), "MessageParticipant", { x: 0, y: 900 });
    const next = connectNodes(doc, id, "hang-up", "primary")!;
    const wired = connectNodes(next, id, "apologize", "error")!;
    expect(getAction(wired, id)?.Transitions).toEqual({
      NextAction: "hang-up",
      Errors: [{ ErrorType: "NoMatchingError", NextAction: "apologize" }],
      Conditions: [],
    });
    expect([...demotedIds(wired)]).toEqual([]);
    // A terminal action keeps its empty object.
    expect(getAction(wired, "hang-up")?.Transitions).toEqual({});
  });

  it("a fixed-conditions block takes one drag per operand and mirrors NextAction", () => {
    // CheckHoursOfOperation: Equals True, then Equals False (NextAction
    // follows the out-of-hours path), then the catch-all from the error
    // handle; three drags and the block is typed. A fourth primary drag has
    // nothing left to mean.
    const { doc, id } = addBlock(demoDoc(), "CheckHoursOfOperation", { x: 0, y: 900 });
    expect(acceptsNextAction(getAction(doc, id)!)).toBe(false);
    const open = connectNodes(doc, id, "welcome", "primary")!;
    expect(getAction(open, id)?.Transitions.Conditions).toEqual([
      { NextAction: "welcome", Condition: { Operator: "Equals", Operands: ["True"] } },
    ]);
    expect(getAction(open, id)?.Transitions.NextAction).toBeUndefined();
    const closed = connectNodes(open, id, "announce-closed", "primary")!;
    expect(getAction(closed, id)?.Transitions.NextAction).toBe("announce-closed");
    expect(getAction(closed, id)?.Transitions.Conditions).toHaveLength(2);
    expect(connectNodes(closed, id, "hang-up", "primary")).toBeUndefined();
    const wired = connectNodes(closed, id, "apologize", "error")!;
    expect([...demotedIds(wired)]).toEqual([]);
    // Retargeting the out-of-hours branch carries NextAction along.
    const moved = rewireEdge(wired, conditionEdgeId(id, 1), id, "hang-up")!;
    expect(getAction(moved, id)?.Transitions.NextAction).toBe("hang-up");
    expect([...demotedIds(moved)]).toEqual([]);
    // And so does retargeting the next edge, the other half of the same path.
    const back = rewireEdge(moved, nextEdgeId(id), id, "announce-closed")!;
    expect(getAction(back, id)?.Transitions.Conditions?.[1]?.NextAction).toBe("announce-closed");
    expect([...demotedIds(back)]).toEqual([]);
  });

  it("a Loop is typed after its two drags, with or without its optional error branch", () => {
    const { doc, id } = addBlock(demoDoc(), "Loop", { x: 0, y: 900 });
    // The page lists no error, some console exports carry one: the handle
    // offers it and the block is typed either way.
    expect(offersErrorBranch(getAction(doc, id)!)).toBe(true);
    const again = connectNodes(doc, id, "welcome", "primary")!;
    const done = connectNodes(again, id, "hang-up", "primary")!;
    expect(getAction(done, id)?.Transitions).toEqual({
      NextAction: "hang-up",
      Errors: [],
      Conditions: [
        { NextAction: "welcome", Condition: { Operator: "Equals", Operands: ["ContinueLooping"] } },
        { NextAction: "hang-up", Condition: { Operator: "Equals", Operands: ["DoneLooping"] } },
      ],
    });
    expect([...demotedIds(done)]).toEqual([]);
    expectSchemaValid(done);
    const withError = connectNodes(done, id, "apologize", "error")!;
    expect(getAction(withError, id)?.Transitions.Errors).toEqual([
      { ErrorType: "NoMatchingError", NextAction: "apologize" },
    ]);
    expect([...demotedIds(withError)]).toEqual([]);
    expectSchemaValid(withError);
    expect(codegen(withError)).toContain('onError: "apologize"');
  });

  it("moving a Loop's next edge away takes its mirrored done branch along, and the reverse", () => {
    // An unfinished Loop (only the done branch wired, as a file can carry
    // it) is generic, so the guard has nothing to refuse and what is left is
    // the bookkeeping: the next edge and the done branch are one path drawn
    // twice. Before the rule was read from the catalog this knew only a
    // menu's no-match error, and the done branch stayed behind.
    const loop = addBlock(demoDoc(), "Loop", { x: 0, y: 900 });
    // The edge starts on an attribute update without its catch-all, generic
    // before and after the edge leaves it, so only the Loop is under test. (A
    // message will not do: its catch-all is optional, so a message with a
    // next edge is typed and giving the edge up would demote it.)
    const message = addBlock(loop.doc, "UpdateContactAttributes", { x: 0, y: 1000 });
    const doneOnly: FlowDoc = {
      ...message.doc,
      content: {
        ...message.doc.content,
        Actions: message.doc.content.Actions.map((x) =>
          x.Identifier === loop.id
            ? {
                ...x,
                Transitions: {
                  NextAction: "hang-up",
                  Errors: [],
                  Conditions: [
                    {
                      NextAction: "hang-up",
                      Condition: { Operator: "Equals", Operands: ["DoneLooping"] },
                    },
                  ],
                },
              }
            : x,
        ),
      },
    };
    expect(demotedIds(doneOnly).has(loop.id)).toBe(true);

    const viaNext = rewireEdge(doneOnly, nextEdgeId(loop.id), message.id, "hang-up")!;
    expect(getAction(viaNext, message.id)?.Transitions.NextAction).toBe("hang-up");
    expect(getAction(viaNext, loop.id)?.Transitions).toEqual({ Errors: [], Conditions: [] });
    expectSchemaValid(viaNext);

    // The other half: a Compare takes the condition, and NextAction goes too.
    const compare = addBlock(doneOnly, "Compare", { x: 0, y: 1100 });
    const viaCondition = rewireEdge(
      compare.doc,
      conditionEdgeId(loop.id, 0),
      compare.id,
      "hang-up",
    )!;
    expect(getAction(viaCondition, loop.id)?.Transitions).toEqual({ Errors: [], Conditions: [] });
    expect(getAction(viaCondition, compare.id)?.Transitions.Conditions?.[0]?.NextAction).toBe(
      "hang-up",
    );
    expectSchemaValid(viaCondition);
  });

  it("a Wait's event drags list the event, pair the bot event with ParticipantNotFound, and stay typed", () => {
    const { doc, id } = addBlock(demoDoc(), "Wait", { x: 0, y: 900 });
    // WaitCompleted first, then the catch-all: the smallest typed Wait.
    let wait = connectNodes(doc, id, "hang-up", "primary")!;
    wait = connectNodes(wait, id, "apologize", "error")!;
    expect([...demotedIds(wait)]).toEqual([]);
    expect(getAction(wait, id)?.Parameters.Events).toBeUndefined();
    // No bot event yet, so the error handle has nothing left to add: the
    // ParticipantNotFound branch is not a gesture of its own.
    expect(connectNodes(wait, id, "welcome", "error")).toBeUndefined();

    // Each event drag lists the event; on a typed block, so the guard is
    // watching, and it would have refused a branch without its listing.
    const customer = connectNodes(wait, id, "welcome", "primary")!;
    expect(getAction(customer, id)?.Parameters.Events).toEqual(["CustomerReturned"]);
    expect([...demotedIds(customer)]).toEqual([]);

    const bot = connectNodes(customer, id, "hang-up", "primary")!;
    expect(getAction(bot, id)?.Parameters.Events).toEqual([
      "CustomerReturned",
      "BotParticipantDisconnected",
    ]);
    expect(getAction(bot, id)?.Transitions.Errors).toEqual([
      { ErrorType: "NoMatchingError", NextAction: "apologize" },
      { ErrorType: "ParticipantNotFound", NextAction: "hang-up" },
    ]);
    expect([...demotedIds(bot)]).toEqual([]);
    expectSchemaValid(bot);
    expect(codegen(bot)).toContain('onParticipantNotFound: "hang-up"');
    // All three branches wired: nothing left for a primary drag to mean.
    expect(connectNodes(bot, id, "welcome", "primary")).toBeUndefined();

    // Removing the bot branch takes its listing and its paired error away.
    const unbot = removeCondition(bot, id, 2)!;
    expect(getAction(unbot, id)?.Parameters.Events).toEqual(["CustomerReturned"]);
    expect(getAction(unbot, id)?.Transitions.Errors).toEqual([
      { ErrorType: "NoMatchingError", NextAction: "apologize" },
    ]);
    expect([...demotedIds(unbot)]).toEqual([]);
    // And the last event's removal drops the Events parameter altogether,
    // the shape the block class writes with no events.
    const none = removeCondition(unbot, id, 1)!;
    expect(getAction(none, id)?.Parameters.Events).toBeUndefined();
    expect([...demotedIds(none)]).toEqual([]);
    expectSchemaValid(none);
  });

  it("the bot event's ParticipantNotFound is wired in the class's order even before the catch-all", () => {
    // An unfinished Wait: the bot branch dragged before any error handle
    // drag must not put ParticipantNotFound ahead of NoMatchingError, or the
    // catch-all drag that follows would land second and the block would
    // never invert.
    const { doc, id } = addBlock(demoDoc(), "Wait", { x: 0, y: 900 });
    let wait = connectNodes(doc, id, "hang-up", "primary")!; // WaitCompleted
    wait = connectNodes(wait, id, "welcome", "primary")!; // CustomerReturned
    wait = connectNodes(wait, id, "hang-up", "primary")!; // BotParticipantDisconnected
    wait = connectNodes(wait, id, "apologize", "error")!; // NoMatchingError
    expect(getAction(wait, id)?.Transitions.Errors?.map((e) => e.ErrorType)).toEqual([
      "NoMatchingError",
      "ParticipantNotFound",
    ]);
    expect([...demotedIds(wait)]).toEqual([]);
    expectSchemaValid(wait);
  });

  it("a percentage split takes a 1% branch per drag and stays typed once its remainder is wired", () => {
    const { doc, id } = addBlock(demoDoc(), "DistributeByPercentage", { x: 0, y: 900 });
    const one = connectNodes(doc, id, "welcome", "primary")!;
    const two = connectNodes(one, id, "apologize", "primary")!;
    expect(getAction(two, id)?.Transitions.Conditions).toEqual([
      { NextAction: "welcome", Condition: { Operator: "NumberLessThan", Operands: ["2"] } },
      { NextAction: "apologize", Condition: { Operator: "NumberLessThan", Operands: ["3"] } },
    ]);
    const wired = connectNodes(two, id, "hang-up", "error")!;
    expect(getAction(wired, id)?.Transitions.NextAction).toBe("hang-up");
    expect([...demotedIds(wired)]).toEqual([]);
    // A third branch on the typed block is a 1% claim too, not the empty
    // placeholder, so the block stays typed.
    const three = connectNodes(wired, id, "welcome", "primary")!;
    expect(getAction(three, id)?.Transitions.Conditions?.[2]?.Condition.Operands).toEqual(["4"]);
    expect([...demotedIds(three)]).toEqual([]);
  });

  it("a fresh UpdateContactCallbackNumber wired up on the canvas is typed, with no demotion", () => {
    const fresh = addBlock(demoDoc(), "UpdateContactCallbackNumber", { x: 0, y: 900 });
    let doc = connectNodes(fresh.doc, fresh.id, "hang-up", "primary")!;
    doc = connectNodes(doc, fresh.id, "apologize", "error")!; // InvalidCallbackNumber
    doc = connectNodes(doc, fresh.id, "welcome", "error")!; // CallbackNumberNotDialable
    expect(getAction(doc, fresh.id)?.Transitions.Errors?.map((e) => e.ErrorType)).toEqual([
      "InvalidCallbackNumber",
      "CallbackNumberNotDialable",
    ]);
    expect(demotedIds(doc).has(fresh.id)).toBe(false);
    expectSchemaValid(doc);
    expectByteStable(doc);
  });

  it.each(["DequeueContactAndTransferToQueue", "CreateCallbackContact"] as const)(
    "choosing (not set) on the queue picker of a %s keeps an authored agent queue",
    (type) => {
      const queueField = { clears: ["AgentId"] };
      const agentField = { clears: ["QueueId"] };
      const { doc, id } = addBlock(demoDoc(), type, { x: 0, y: 900 });
      const withAgent = setParam(doc, id, "AgentId", "${cdref:queue:agent-jane}", agentField);
      let wired = connectNodes(withAgent, id, "hang-up", "primary")!;
      wired = connectNodes(wired, id, "apologize", "error")!;
      if (type === "DequeueContactAndTransferToQueue") {
        wired = connectNodes(wired, id, "apologize", "error")!;
      }
      expect(demotedIds(wired).has(id)).toBe(false);
      // What the inspector does on "(not set)": a delete with no clears.
      const cleared = setParam(wired, id, "QueueId", undefined);
      expect(getAction(cleared, id)?.Parameters.AgentId).toBe("${cdref:queue:agent-jane}");
      expect(demotedIds(cleared).has(id)).toBe(false);
      // Setting the other still clears: the exclusivity is kept on a set.
      const swapped = setParam(cleared, id, "QueueId", "${cdref:queue:front-desk}", queueField);
      expect(getAction(swapped, id)?.Parameters.AgentId).toBeUndefined();
      expect(getAction(swapped, id)?.Parameters.QueueId).toBe("${cdref:queue:front-desk}");
    },
  );

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

    // Dropping it on a block whose class wires no NoMatchingCondition ("sales"
    // is a MessageParticipant) has nothing to mean, and is refused before the
    // guard would have seen the finished menu demoted.
    expect(
      rewireEdge(menuDoc(), errorEdgeId("menu", 1, "NoMatchingCondition"), "sales", "bye"),
    ).toBeUndefined();
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
    // The edge being moved starts on an unfinished attribute update, generic
    // until its catch-all is wired, which can give it up without the guard
    // having a say; what is under test is the check. (A message is typed
    // with only a next edge, its catch-all being optional.)
    const b = addBlock(a.doc, "UpdateContactAttributes", { x: 0, y: 1000 });
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

describe("the second review of the participant and flow-control gestures", () => {
  /** A typed Wait with WaitCompleted, both events and the catch-all, on the demo. */
  function fullWait(): { doc: FlowDoc; id: string } {
    const { doc, id } = addBlock(demoDoc(), "Wait", { x: 0, y: 900 });
    let wait = connectNodes(doc, id, "hang-up", "primary")!; // WaitCompleted
    wait = connectNodes(wait, id, "apologize", "error")!; // NoMatchingError
    wait = connectNodes(wait, id, "welcome", "primary")!; // CustomerReturned
    wait = connectNodes(wait, id, "hang-up", "primary")!; // BotParticipantDisconnected
    expect(demotedIds(wait).has(id)).toBe(false);
    return { doc: wait, id };
  }

  it("a loop of prompts' interrupt drag brings its seconds, and removing it takes them away", () => {
    const { doc, id } = addBlock(demoDoc(), "MessageParticipantIteratively", { x: 0, y: 900 });
    // A fresh loop is finished as it is, the console's hold-flow shape.
    expect(getAction(doc, id)?.Transitions).toEqual({ Errors: [], Conditions: [] });
    expect(demotedIds(doc).has(id)).toBe(false);
    const interrupted = connectNodes(doc, id, "welcome", "primary")!;
    expect(getAction(interrupted, id)?.Parameters.InterruptFrequencySeconds).toBe("30");
    expect(demotedIds(interrupted).has(id)).toBe(false);
    expectSchemaValid(interrupted);
    const quiet = removeCondition(interrupted, id, 0)!;
    expect(getAction(quiet, id)?.Parameters.InterruptFrequencySeconds).toBeUndefined();
    expect(demotedIds(quiet).has(id)).toBe(false);
  });

  it("a fresh loop of prompts is an end the terminal-blocks rule accepts", () => {
    // The palette's block, alone in a hold flow, as the console's default
    // hold flows are.
    const { doc, id } = addBlock(demoDoc(), "MessageParticipantIteratively", { x: 0, y: 900 });
    const loop = getAction(doc, id)!;
    const hold: FlowDoc = {
      ...doc,
      connectType: "CUSTOMER_HOLD",
      content: { ...doc.content, StartAction: id, Actions: [loop] },
      layout: { [id]: { x: 20, y: 20 } },
    };
    expect(lint(hold).filter((f) => f.rule === "terminal-blocks")).toEqual([]);
  });

  it("re-adding a Wait event after removing it keeps the class's branch order", () => {
    const { doc, id } = fullWait();
    const without = removeCondition(doc, id, 1)!; // CustomerReturned
    expect(getAction(without, id)?.Parameters.Events).toEqual(["BotParticipantDisconnected"]);
    const back = connectNodes(without, id, "welcome", "primary")!;
    expect(
      getAction(back, id)?.Transitions.Conditions?.map((c) => c.Condition.Operands[0]),
    ).toEqual(["WaitCompleted", "CustomerReturned", "BotParticipantDisconnected"]);
    expect(getAction(back, id)?.Parameters.Events).toEqual([
      "CustomerReturned",
      "BotParticipantDisconnected",
    ]);
    expect(demotedIds(back).has(id)).toBe(false);
  });

  it("a catch-all moved onto a Wait lands in the class's error order", () => {
    // An unfinished Wait holding the bot branch and ParticipantNotFound, then
    // a NoMatchingError moved onto it from an unmodeled block: before, it
    // landed after ParticipantNotFound and the Wait could never be typed.
    const fresh = addBlock(detachableDoc(), "Wait", { x: 0, y: 900 });
    let doc = connectNodes(fresh.doc, fresh.id, "target", "primary")!; // WaitCompleted
    doc = connectNodes(doc, fresh.id, "target", "primary")!; // CustomerReturned
    doc = connectNodes(doc, fresh.id, "target", "primary")!; // BotParticipantDisconnected
    const moved = rewireEdge(doc, errorEdgeId("raw-b", 0, "NoMatchingError"), fresh.id, "target")!;
    expect(getAction(moved, fresh.id)?.Transitions.Errors?.map((e) => e.ErrorType)).toEqual([
      "NoMatchingError",
      "ParticipantNotFound",
    ]);
    expect(demotedIds(moved).has(fresh.id)).toBe(false);
  });

  it("a Wait event moved between Waits carries its listing with it", () => {
    const a = fullWait();
    const b = addBlock(a.doc, "Wait", { x: 0, y: 1000 });
    let doc = connectNodes(b.doc, b.id, "hang-up", "primary")!; // WaitCompleted
    doc = connectNodes(doc, b.id, "apologize", "error")!; // NoMatchingError
    const moved = rewireEdge(doc, conditionEdgeId(a.id, 1), b.id, "welcome")!;
    expect(getAction(moved, a.id)?.Parameters.Events).toEqual(["BotParticipantDisconnected"]);
    expect(getAction(moved, b.id)?.Parameters.Events).toEqual(["CustomerReturned"]);
    expect(demotedIds(moved).has(a.id)).toBe(false);
    expect(demotedIds(moved).has(b.id)).toBe(false);
  });

  it("an error or a branch the landing block's class does not read is refused", () => {
    const split = addBlock(detachableDoc(), "DistributeByPercentage", { x: 0, y: 900 });
    expect(
      rewireEdge(split.doc, errorEdgeId("raw-b", 0, "NoMatchingError"), split.id, "target"),
    ).toBeUndefined();
    const wait = addBlock(menuDoc(), "Wait", { x: 0, y: 900 });
    expect(rewireEdge(wait.doc, conditionEdgeId("menu", 0), wait.id, "bye")).toBeUndefined();
  });

  it("the recording block's two forms replace each other from the inspector's fields", () => {
    const { doc, id } = addBlock(demoDoc(), "UpdateContactRecordingAndAnalyticsBehavior", {
      x: 0,
      y: 900,
    });
    let typed = connectNodes(doc, id, "hang-up", "primary")!;
    typed = connectNodes(typed, id, "apologize", "error")!;
    typed = connectNodes(typed, id, "apologize", "error")!;
    expect(demotedIds(typed).has(id)).toBe(false);
    const screen = setParam(
      typed,
      id,
      "ScreenRecordingBehavior",
      { ScreenRecordedParticipants: ["Agent"] },
      { clears: ["VoiceBehavior"] },
    );
    expect(getAction(screen, id)?.Parameters).toEqual({
      ScreenRecordingBehavior: { ScreenRecordedParticipants: ["Agent"] },
    });
    expect(demotedIds(screen).has(id)).toBe(false);
  });
});
