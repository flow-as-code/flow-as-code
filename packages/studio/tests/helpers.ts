/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Shared test helpers: the demo doc and schema validation against the
// conformance contract, so every mutation is proven to keep docs schema-valid.
//
// The schema comes from src/model/validate.ts, the same compiled validator the
// app's write paths use, rather than a second copy read with node:fs. That
// keeps the helper usable from the happy-dom test files too, and means a test
// asserting schema validity is asserting exactly what the save gate asserts.

import type { FlowDoc } from "@flow-as-code/core";
import { serialize } from "@flow-as-code/core";
import { expect } from "vitest";
import { schemaErrorsFor } from "../src/model/validate.js";
import { demoDoc } from "../src/store/demoStore.js";

export { demoDoc };

/** Asserts the doc validates against conformance/schema/flowdoc-0.1.schema.json. */
export function expectSchemaValid(doc: FlowDoc): void {
  expect(schemaErrorsFor(doc)).toEqual([]);
}

/** Asserts serialize is byte-stable: parse(serialize(doc)) serializes identically. */
export function expectByteStable(doc: FlowDoc): void {
  const once = serialize(doc);
  const twice = serialize(JSON.parse(once) as FlowDoc);
  expect(twice).toBe(once);
}

/**
 * A minimal flow built around a Compare, the one modeled type that authors
 * free-form condition branches. Its operands are the studio's only free-text
 * authoring surface inside Transitions, which is where the branch editor and
 * the no-literal-arn rule meet.
 */
export function compareDoc(): FlowDoc {
  return {
    flowdoc: "0.1",
    kind: "flow",
    name: "compare-line",
    connectType: "CONTACT_FLOW",
    content: {
      Version: "2019-10-30",
      StartAction: "compare",
      Actions: [
        {
          Identifier: "compare",
          Type: "Compare",
          Parameters: { ComparisonValue: "$.Attributes.tier" },
          Transitions: {
            Errors: [{ ErrorType: "NoMatchingCondition", NextAction: "say" }],
            Conditions: [
              { NextAction: "say", Condition: { Operator: "Equals", Operands: ["gold"] } },
              { NextAction: "say", Condition: { Operator: "Equals", Operands: ["silver"] } },
            ],
          },
        },
        {
          Identifier: "say",
          Type: "MessageParticipant",
          Parameters: { Text: "One moment." },
          Transitions: {
            NextAction: "hang-up",
            Errors: [{ ErrorType: "NoMatchingError", NextAction: "hang-up" }],
            Conditions: [],
          },
        },
        { Identifier: "hang-up", Type: "DisconnectParticipant", Parameters: {}, Transitions: {} },
      ],
    },
    layout: {
      compare: { x: 0, y: 0 },
      say: { x: 240, y: 0 },
      "hang-up": { x: 480, y: 0 },
    },
    refs: [],
  };
}

/**
 * A DTMF menu in the exact shape @flow-as-code/core's GetParticipantInput class emits
 * (packages/core/src/blocks.ts): a Text body, the console's string
 * timeout, StoreInput "False", one Equals condition per key, the three errors
 * in the class's order, and NextAction mirroring the NoMatchingCondition
 * target. Hand-written rather than loaded from conformance/roundtrip/dtmf-menu
 * so the happy-dom test files can use it without node:fs.
 */
export function menuDoc(): FlowDoc {
  const say = (id: string, text: string, next: string) => ({
    Identifier: id,
    Type: "MessageParticipant",
    Parameters: { Text: text },
    Transitions: {
      NextAction: next,
      Errors: [{ ErrorType: "NoMatchingError", NextAction: "bye" }],
      Conditions: [],
    },
  });
  return {
    flowdoc: "0.1",
    kind: "flow",
    name: "menu-line",
    connectType: "CONTACT_FLOW",
    content: {
      Version: "2019-10-30",
      StartAction: "menu",
      Actions: [
        {
          Identifier: "menu",
          Type: "GetParticipantInput",
          Parameters: {
            InputTimeLimitSeconds: "5",
            StoreInput: "False",
            Text: "For sales, press 1. For support, press 2. To hear this again, press star.",
          },
          Transitions: {
            NextAction: "no-match",
            Errors: [
              { ErrorType: "InputTimeLimitExceeded", NextAction: "timeout-notice" },
              { ErrorType: "NoMatchingCondition", NextAction: "no-match" },
              { ErrorType: "NoMatchingError", NextAction: "bye" },
            ],
            Conditions: [
              { NextAction: "sales", Condition: { Operator: "Equals", Operands: ["1"] } },
              { NextAction: "support", Condition: { Operator: "Equals", Operands: ["2"] } },
              { NextAction: "menu", Condition: { Operator: "Equals", Operands: ["*"] } },
            ],
          },
        },
        say("timeout-notice", "We did not hear a selection.", "menu"),
        say("no-match", "That is not a valid option.", "menu"),
        say("sales", "Connecting you to sales.", "bye"),
        say("support", "Connecting you to support.", "bye"),
        { Identifier: "bye", Type: "DisconnectParticipant", Parameters: {}, Transitions: {} },
      ],
    },
    layout: {
      menu: { x: 0, y: 120 },
      "timeout-notice": { x: 280, y: 0 },
      "no-match": { x: 280, y: 120 },
      sales: { x: 280, y: 240 },
      support: { x: 280, y: 360 },
      bye: { x: 560, y: 120 },
    },
    refs: [],
  };
}

/**
 * A flow whose "target" block has two incoming transitions from UNMODELED
 * blocks. codegen already emits those two as GenericBlock, so detaching their
 * transitions demotes nothing and deleting "target" is allowed. That is what
 * makes it the right fixture for testing deleteBlock's detaching, separately
 * from the demotion invariant that refuses the same gesture on the demo flow.
 */
export function detachableDoc(): FlowDoc {
  return {
    flowdoc: "0.1",
    kind: "flow",
    name: "detachable",
    connectType: "CONTACT_FLOW",
    content: {
      Version: "2019-10-30",
      StartAction: "raw-a",
      Actions: [
        {
          Identifier: "raw-a",
          Type: "UpdateFlowLoggingBehavior",
          Parameters: { FlowLoggingBehavior: "Enabled" },
          Transitions: { NextAction: "target", Errors: [], Conditions: [] },
        },
        {
          Identifier: "raw-b",
          Type: "UpdateFlowLoggingBehavior",
          Parameters: { FlowLoggingBehavior: "Disabled" },
          Transitions: {
            NextAction: "raw-a",
            Errors: [{ ErrorType: "NoMatchingError", NextAction: "target" }],
            Conditions: [],
          },
        },
        { Identifier: "target", Type: "DisconnectParticipant", Parameters: {}, Transitions: {} },
      ],
    },
    layout: {
      "raw-a": { x: 0, y: 0 },
      "raw-b": { x: 0, y: 120 },
      target: { x: 240, y: 60 },
    },
    refs: [],
  };
}
