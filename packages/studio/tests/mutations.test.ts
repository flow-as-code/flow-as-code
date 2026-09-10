/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { serialize } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import {
  MutationRefused,
  addBlock,
  connectNodes,
  deleteBlock,
  getAction,
  incomingCount,
  moveNode,
  rewireEdge,
  setMessageBody,
  setParam,
} from "../src/model/mutations.js";
import { demoDoc, detachableDoc, expectByteStable, expectSchemaValid } from "./helpers.js";

describe("moveNode", () => {
  it("updates layout only; content and refs are untouched", () => {
    const doc = demoDoc();
    const before = JSON.stringify(doc.content);
    const moved = moveNode(doc, "welcome", { x: 300.4, y: 200.6 });
    expect(JSON.stringify(moved.content)).toBe(before);
    expect(moved.refs).toEqual(doc.refs);
    expect(moved.layout?.welcome).toEqual({ x: 300, y: 201 });
    expectSchemaValid(moved);
    expectByteStable(moved);
  });
});

describe("setParam", () => {
  it("regenerates the refs index when a reference changes", () => {
    const doc = demoDoc();
    const next = setParam(doc, "check-hours", "HoursOfOperationId", "${cdref:hours:after-hours}");
    expect(next.refs?.map((r) => r.token)).toContain("${cdref:hours:after-hours}");
    expect(next.refs?.map((r) => r.token)).not.toContain("${cdref:hours:main-line}");
    expectSchemaValid(next);
    expectByteStable(next);
  });

  it("drops refs that no longer appear anywhere in content", () => {
    const doc = demoDoc();
    // A JSONPath is a legal LambdaFunctionARN, so the block keeps its typed
    // form and the lambda token becomes unused.
    const next = setParam(doc, "look-up-appointment", "LambdaFunctionARN", "$.Attributes.fn");
    expect(next.refs?.some((r) => r.type === "lambda")).toBe(false);
    expectSchemaValid(next);
  });

  it("refuses to delete a parameter the block class requires", () => {
    // The escape hatch beside setNumberParam: setParam takes any value,
    // including undefined, and deleting LambdaFunctionARN leaves a block only
    // GenericBlock can express. The central guard covers it like every other
    // mutation, so there is no unguarded low-level setter left.
    expect(() =>
      setParam(demoDoc(), "look-up-appointment", "LambdaFunctionARN", undefined),
    ).toThrow(MutationRefused);
  });

  it("clears mutually exclusive keys", () => {
    const doc = demoDoc();
    const next = setParam(doc, "set-working-queue", "AgentId", "${cdref:queue:vips}", {
      clears: ["QueueId"],
    });
    const params = getAction(next, "set-working-queue")?.Parameters;
    expect(params?.AgentId).toBe("${cdref:queue:vips}");
    expect(params?.QueueId).toBeUndefined();
    expectSchemaValid(next);
  });
});

describe("setMessageBody", () => {
  it("keeps exactly one of Text, SSML, PromptId", () => {
    const doc = demoDoc();
    const next = setMessageBody(doc, "welcome", "SSML", "<speak>Hi</speak>");
    const params = getAction(next, "welcome")?.Parameters;
    expect(params?.SSML).toBe("<speak>Hi</speak>");
    expect(params?.Text).toBeUndefined();
    expectSchemaValid(next);
  });
});

describe("addBlock", () => {
  it("appends a schema-valid modeled block with a unique identifier and layout", () => {
    const doc = demoDoc();
    const { doc: next, id } = addBlock(doc, "MessageParticipant", { x: 10, y: 900 });
    expect(id).toBe("message");
    expect(next.content.Actions).toHaveLength(12);
    expect(next.layout?.[id]).toEqual({ x: 10, y: 900 });
    expectSchemaValid(next);
    expectByteStable(next);

    const again = addBlock(next, "MessageParticipant", { x: 10, y: 1000 });
    expect(again.id).toBe("message-2");
    expectSchemaValid(again.doc);
  });

  it("adds every palette type without breaking the schema", () => {
    let doc = demoDoc();
    for (const type of [
      "MessageParticipant",
      "DisconnectParticipant",
      "CheckHoursOfOperation",
      "Compare",
      "TransferToFlow",
      "EndFlowExecution",
      "TransferContactToQueue",
      "UpdateContactTargetQueue",
      "UpdateContactAttributes",
      "UpdateContactRecordingBehavior",
      "InvokeFlowModule",
      "EndFlowModuleExecution",
      "InvokeLambdaFunction",
      "GetParticipantInput",
    ] as const) {
      doc = addBlock(doc, type, { x: 0, y: 0 }).doc;
    }
    expectSchemaValid(doc);
    expectByteStable(doc);
  });
});

describe("deleteBlock", () => {
  it("removes the block, its layout entry, and every incoming transition", () => {
    // Neighbours here are unmodeled blocks, which codegen already emits as
    // GenericBlock, so detaching their transitions costs nothing and the
    // deletion goes through.
    const doc = detachableDoc();
    expect(incomingCount(doc, "target")).toBe(2);
    const next = deleteBlock(doc, "target");
    expect(getAction(next, "target")).toBeUndefined();
    expect(next.layout?.target).toBeUndefined();
    expect(incomingCount(next, "target")).toBe(0);
    expect(getAction(next, "raw-a")?.Transitions.NextAction).toBeUndefined();
    expect(getAction(next, "raw-b")?.Transitions.Errors).toEqual([]);
    expectSchemaValid(next);
    expectByteStable(next);
  });

  it("refuses to delete the StartAction", () => {
    expect(() => deleteBlock(demoDoc(), "enable-logging")).toThrow(/StartAction/);
  });

  it("refuses a delete that would demote the neighbours, and names them", () => {
    // The documented choice: detaching transitions from four MessageParticipants
    // would leave all four inexpressible, so the gesture is refused rather than
    // silently demoting them or inventing new destinations for their edges.
    let refused: MutationRefused | undefined;
    try {
      deleteBlock(demoDoc(), "hang-up");
    } catch (err) {
      refused = err as MutationRefused;
    }
    expect(refused).toBeInstanceOf(MutationRefused);
    expect(refused?.blockIds).toEqual([
      "announce-busy",
      "announce-closed",
      "apologize",
      "transfer",
    ]);
    expect(refused?.message).toContain('"apologize"');
    expect(refused?.message).toContain("Rewire the transitions that point at it");
  });

  it("deletes once the transitions pointing at the block are rewired away", () => {
    // The route the refusal names, followed end to end on the demo flow.
    let doc = demoDoc();
    doc = rewireEdge(doc, "announce-closed:next", "announce-closed", "apologize")!;
    doc = rewireEdge(
      doc,
      "announce-closed:error:0:NoMatchingError",
      "announce-closed",
      "apologize",
    )!;
    doc = rewireEdge(doc, "announce-busy:next", "announce-busy", "apologize")!;
    doc = rewireEdge(doc, "announce-busy:error:0:NoMatchingError", "announce-busy", "apologize")!;
    doc = rewireEdge(doc, "apologize:next", "apologize", "announce-closed")!;
    doc = rewireEdge(doc, "apologize:error:0:NoMatchingError", "apologize", "announce-closed")!;
    doc = rewireEdge(doc, "transfer:next", "transfer", "apologize")!;
    expect(incomingCount(doc, "hang-up")).toBe(0);
    const next = deleteBlock(doc, "hang-up");
    expect(getAction(next, "hang-up")).toBeUndefined();
    expectSchemaValid(next);
  });
});

describe("connectNodes", () => {
  it("creates the success transition when absent", () => {
    const doc = addBlock(demoDoc(), "MessageParticipant", { x: 0, y: 900 }).doc;
    const next = connectNodes(doc, "message", "hang-up");
    expect(next).toBeDefined();
    expect(getAction(next!, "message")?.Transitions.NextAction).toBe("hang-up");
    expectSchemaValid(next!);
  });

  it("wires the missing catch-all error when NextAction exists", () => {
    const doc = addBlock(demoDoc(), "MessageParticipant", { x: 0, y: 900 }).doc;
    const withNext = connectNodes(doc, "message", "hang-up")!;
    const withError = connectNodes(withNext, "message", "apologize")!;
    expect(getAction(withError, "message")?.Transitions.Errors).toEqual([
      { ErrorType: "NoMatchingError", NextAction: "apologize" },
    ]);
    expectSchemaValid(withError);
  });

  it("refuses connections out of terminal actions", () => {
    expect(connectNodes(demoDoc(), "hang-up", "welcome")).toBeUndefined();
  });
});

describe("rewireEdge", () => {
  it("retargets a next edge", () => {
    const doc = demoDoc();
    const next = rewireEdge(doc, "welcome:next", "welcome", "apologize");
    expect(getAction(next!, "welcome")?.Transitions.NextAction).toBe("apologize");
    expectSchemaValid(next!);
    expectByteStable(next!);
  });

  it("retargets an error edge by ErrorType", () => {
    const doc = demoDoc();
    const next = rewireEdge(doc, "transfer:error:0:QueueAtCapacity", "transfer", "apologize");
    const errors = getAction(next!, "transfer")?.Transitions.Errors;
    expect(errors).toContainEqual({ ErrorType: "QueueAtCapacity", NextAction: "apologize" });
    expect(errors).toContainEqual({ ErrorType: "NoMatchingError", NextAction: "apologize" });
    expectSchemaValid(next!);
  });

  it("retargets a condition edge by index", () => {
    const doc = demoDoc();
    const next = rewireEdge(doc, "check-hours:condition:0", "check-hours", "apologize");
    expect(getAction(next!, "check-hours")?.Transitions.Conditions?.[0]?.NextAction).toBe(
      "apologize",
    );
    expectSchemaValid(next!);
  });

  it("rewires transitions on a GenericBlock too", () => {
    const doc = demoDoc();
    const next = rewireEdge(doc, "enable-logging:next", "enable-logging", "apologize");
    expect(getAction(next!, "enable-logging")?.Transitions.NextAction).toBe("apologize");
    expectSchemaValid(next!);
  });

  it("moves an edge to a new source when the slot is free, else rejects", () => {
    const doc = addBlock(demoDoc(), "MessageParticipant", { x: 0, y: 900 }).doc;
    // "enable-logging" is an unmodeled block, so losing its NextAction costs
    // it nothing; "message" is new and unwired, so it gains one.
    const moved = rewireEdge(doc, "enable-logging:next", "message", "check-hours");
    expect(getAction(moved!, "enable-logging")?.Transitions.NextAction).toBeUndefined();
    expect(getAction(moved!, "message")?.Transitions.NextAction).toBe("check-hours");
    expectSchemaValid(moved!);

    // "apologize" already has a NextAction, so moving another next edge there is rejected.
    expect(rewireEdge(doc, "enable-logging:next", "apologize", "check-hours")).toBeUndefined();
  });

  it("refuses a source-end move that would strip the old source bare", () => {
    // Moving "welcome"'s success transition elsewhere leaves a
    // MessageParticipant with no NextAction, which only GenericBlock can hold.
    const doc = addBlock(demoDoc(), "MessageParticipant", { x: 0, y: 900 }).doc;
    expect(() => rewireEdge(doc, "welcome:next", "message", "check-hours")).toThrow(
      MutationRefused,
    );
  });
});

describe("determinism", () => {
  it("the same mutation sequence yields byte-identical serialization", () => {
    const run = () => {
      let doc = demoDoc();
      doc = moveNode(doc, "welcome", { x: 111, y: 222 });
      doc = setParam(doc, "check-hours", "HoursOfOperationId", "${cdref:hours:alt}");
      doc = addBlock(doc, "Compare", { x: 5, y: 5 }).doc;
      doc = rewireEdge(doc, "check-hours:condition:0", "check-hours", "apologize")!;
      return serialize(doc);
    };
    expect(run()).toBe(run());
  });
});
