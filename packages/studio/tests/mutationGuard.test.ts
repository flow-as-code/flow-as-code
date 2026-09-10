/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The one invariant, and the proof that it is not vacuous.
//
// Every case below is a defect a reviewer reproduced against the previous
// pass, where a per-mutation guard existed for one path and every unguarded
// path stayed open. They are asserted through the mutations the UI actually
// calls, not through the guard's internals, so removing the guard fails them.
//
// The first describe block is the structural half: a mutation added to
// model/mutations.ts later is guarded by construction, because this test
// enumerates the module's exports and knows the (short, deliberate) list of
// exports that are not mutations.

import type { FlowAction, FlowDoc } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import * as mutations from "../src/model/mutations.js";
import {
  MutationRefused,
  addBlock,
  deleteBlock,
  guardedMutationName,
  removeCondition,
  rewireEdge,
  setMessageBody,
  setParam,
} from "../src/model/mutations.js";
import { demotedIds, demotionDelta } from "../src/model/demotion.js";
import { assertSaveable } from "../src/model/validate.js";
import { compareDoc, demoDoc, menuDoc } from "./helpers.js";

/**
 * Exports of model/mutations.ts that are NOT mutations: they read a document
 * or a single action and never produce a new document. Anything else exported
 * from that module must go through guard(). Adding a name here is the only way
 * to opt a function out, which is a deliberate, reviewable act; forgetting to
 * wrap a new mutation is not.
 */
const NOT_MUTATIONS = new Set([
  "normalize",
  "getAction",
  "incomingCount",
  "nextIdentifier",
  "canAddBlock",
  "messageBodyKey",
  "guardedMutationName",
  "MutationRefused",
  "MESSAGE_BODY_KEYS",
]);

describe("every exported mutation is wrapped", () => {
  it("enumerates the module and finds no unguarded producer", () => {
    const unguarded = Object.entries(mutations)
      .filter(([name, value]) => typeof value === "function" && !NOT_MUTATIONS.has(name))
      .filter(([, value]) => guardedMutationName(value) === undefined)
      .map(([name]) => name);
    expect(unguarded).toEqual([]);
  });

  it("covers every mutation the studio calls, by name", () => {
    const guarded = Object.entries(mutations)
      .filter(([, value]) => guardedMutationName(value) !== undefined)
      .map(([name]) => name)
      .sort();
    expect(guarded).toEqual([
      "addBlock",
      "connectNodes",
      "deleteBlock",
      "moveNode",
      "removeCondition",
      "rewireEdge",
      "setCondition",
      "setMessageBody",
      "setNumberParam",
      "setParam",
    ]);
  });

  it("rejects a first argument that is not a document", () => {
    // The guard finds the "before" state at args[0]; the convention cannot be
    // broken silently.
    expect(() => setParam(null as unknown as FlowDoc, "welcome", "Text", "x")).toThrow(TypeError);
  });
});

/** Runs a mutation and returns the refusal it threw, or undefined. */
function refusalFrom(run: () => unknown): MutationRefused | undefined {
  try {
    run();
    return undefined;
  } catch (err) {
    if (err instanceof MutationRefused) return err;
    throw err;
  }
}

/** A demo flow plus a wired Compare, for the error-vocabulary cases. */
function demoWithCompare(): FlowDoc {
  const doc = demoDoc();
  const compare: FlowAction = {
    Identifier: "compare",
    Type: "Compare",
    Parameters: { ComparisonValue: "$.Attributes.tier" },
    Transitions: {
      Errors: [{ ErrorType: "NoMatchingCondition", NextAction: "hang-up" }],
      Conditions: [{ NextAction: "hang-up", Condition: { Operator: "Equals", Operands: ["x"] } }],
    },
  };
  doc.content.Actions = [...doc.content.Actions, compare];
  doc.layout = { ...doc.layout, compare: { x: 0, y: 400 } };
  return doc;
}

describe("R2 both ends of rewireEdge are guarded, not just the source end", () => {
  it("refuses moving a CheckHoursOfOperation branch to a new target", () => {
    const refusal = refusalFrom(() =>
      rewireEdge(demoDoc(), "check-hours:condition:1", "check-hours", "hang-up"),
    );
    expect(refusal?.blockIds).toEqual(["check-hours"]);
  });

  it("refuses moving a CheckHoursOfOperation next edge to a new target", () => {
    const refusal = refusalFrom(() =>
      rewireEdge(demoDoc(), "check-hours:next", "check-hours", "hang-up"),
    );
    expect(refusal?.blockIds).toEqual(["check-hours"]);
  });

  it("still allows a target-end rewire that keeps the block expressible", () => {
    const next = rewireEdge(demoDoc(), "check-hours:condition:0", "check-hours", "apologize");
    expect(next).toBeDefined();
    expect(demotedIds(next!).has("check-hours")).toBe(false);
  });
});

describe("R3 removing a Compare's last branch", () => {
  it("is refused, where it used to pass lint and the schema cleanly", () => {
    const doc = compareDoc();
    const one = removeCondition(doc, "compare", 1)!;
    expect(one).toBeDefined();
    const refusal = refusalFrom(() => removeCondition(one, "compare", 0));
    expect(refusal?.blockIds).toEqual(["compare"]);
    expect(refusal?.message).toContain("Wire a replacement branch");
  });
});

describe("R4 an error edge moved onto a block whose type cannot hold it", () => {
  it("refuses a NoMatchingError dropped on a Compare, which would demote both", () => {
    const refusal = refusalFrom(() =>
      rewireEdge(demoWithCompare(), "welcome:error:0:NoMatchingError", "compare", "apologize"),
    );
    expect(refusal?.blockIds).toEqual(["compare", "welcome"]);
  });

  it("refuses a QueueAtCapacity dropped on a MessageParticipant", () => {
    const refusal = refusalFrom(() =>
      rewireEdge(demoDoc(), "transfer:error:0:QueueAtCapacity", "announce-busy", "apologize"),
    );
    expect(refusal?.blockIds).toEqual(["announce-busy", "transfer"]);
  });
});

describe("setMessageBody keeps its invariant at runtime, not only in the types", () => {
  it("refuses an undefined body instead of writing no body parameter", () => {
    expect(() =>
      setMessageBody(demoDoc(), "welcome", "Text", undefined as unknown as string),
    ).toThrow(TypeError);
  });

  it("leaves the document untouched when it refuses", () => {
    const doc = demoDoc();
    const before = JSON.stringify(doc);
    expect(() => setMessageBody(doc, "welcome", "Text", undefined as unknown as string)).toThrow();
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("is refused only for a PromptId the code generator cannot express, and says so", () => {
    // The mutation always writes exactly one body key, so the hint that used
    // to read "needs exactly one of Text, SSML, or PromptId" named a state the
    // guard never sees. What it refuses is a PromptId that is neither a prompt
    // reference nor a JSONPath, on a MessageParticipant or a menu alike.
    for (const id of ["welcome", "menu"]) {
      const doc = id === "menu" ? menuDoc() : demoDoc();
      for (const bad of ["greeting", "${cdref:queue:appointments}"]) {
        const refusal = refusalFrom(() => setMessageBody(doc, id, "PromptId", bad));
        expect(refusal?.blockIds).toEqual([id]);
        expect(refusal?.message).toContain("Give PromptId a ${cdref:prompt:...} reference");
        expect(refusal?.message).not.toContain("exactly one");
      }
      expect(setMessageBody(doc, id, "PromptId", "${cdref:prompt:greeting}")).toBeDefined();
      expect(setMessageBody(doc, id, "PromptId", "$.External.PromptArn")).toBeDefined();
      expect(setMessageBody(doc, id, "Text", "any string")).toBeDefined();
      expect(setMessageBody(doc, id, "SSML", "any string")).toBeDefined();
    }
  });
});

describe("the refused docs really were invisible to the other gates", () => {
  it("assertSaveable accepts every one of them", () => {
    // Why the invariant has to live at the mutation layer: each of these is
    // schema-valid and lint-clean, so the save gate would have written it.
    const demoted: FlowDoc[] = [];

    const hours = demoDoc();
    hours.content.Actions = hours.content.Actions.map((a) =>
      a.Identifier === "check-hours"
        ? { ...a, Transitions: { ...a.Transitions, NextAction: "hang-up" } }
        : a,
    );
    demoted.push(hours);

    const compare = compareDoc();
    compare.content.Actions = compare.content.Actions.map((a) =>
      a.Identifier === "compare" ? { ...a, Transitions: { ...a.Transitions, Conditions: [] } } : a,
    );
    demoted.push(compare);

    expect([...demotedIds(demoted[0]!)].sort()).toEqual(["check-hours", "enable-logging"]);
    expect([...demotedIds(demoted[1]!)]).toEqual(["compare"]);
    for (const doc of demoted) expect(() => assertSaveable(doc)).not.toThrow();
  });
});

describe("the guard does not refuse legitimate work", () => {
  it("lets the palette insert every modeled type", () => {
    let doc = demoDoc();
    for (const type of [
      "MessageParticipant",
      "Compare",
      "CheckHoursOfOperation",
      "InvokeLambdaFunction",
      "TransferContactToQueue",
      "DisconnectParticipant",
      "GetParticipantInput",
    ] as const) {
      doc = addBlock(doc, type, { x: 0, y: 0 }).doc;
    }
    expect(doc.content.Actions).toHaveLength(18);
  });

  it("lets a block with nothing pointing at it be deleted", () => {
    const { doc, id } = addBlock(demoDoc(), "MessageParticipant", { x: 0, y: 900 });
    expect(deleteBlock(doc, id).content.Actions).toHaveLength(11);
  });
});

describe("the oracle fails closed", () => {
  // Three lenses independently found that probeDemotion's catch swallowed its
  // own deliberate throws into { generated: false }, which demotionDelta then
  // reported as "nothing demoted", leaving the invariant silently inactive on
  // any document codegen could not process.
  //
  // codegen refuses a value it cannot emit as a TypeScript literal, so this is
  // a document the oracle genuinely cannot read. It cannot be authored in the
  // studio and, since the schema fix below, cannot be loaded either.
  const unreadable = (): FlowDoc => {
    const doc = structuredClone(demoDoc());
    (doc.content.Actions[1]!.Parameters as Record<string, unknown>).Weird = 1n;
    return doc;
  };

  it("reports unverifiable rather than an empty demotion set", () => {
    const doc = unreadable();
    const delta = demotionDelta(doc, structuredClone(doc));
    expect(delta.demoted).toEqual([]);
    expect(delta.unverifiable ?? delta.ungeneratable).toBeDefined();
  });

  it("never answers with a bare empty delta when it could not read the document", () => {
    // The precise regression: demoted:[] with no explanation reads as approval.
    const doc = unreadable();
    const delta = demotionDelta(doc, structuredClone(doc));
    const silentApproval =
      delta.demoted.length === 0 &&
      delta.unverifiable === undefined &&
      delta.ungeneratable === undefined;
    expect(silentApproval).toBe(false);
  });

  it("still allows ordinary edits on a document it can analyse", () => {
    expect(() => setParam(demoDoc(), "welcome", "Text", "Updated greeting.")).not.toThrow();
  });
});
