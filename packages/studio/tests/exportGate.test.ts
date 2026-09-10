/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A12 acceptance: "Exports never bypass the save gate. A document failing a
// hard lint rule cannot be exported by any target."
//
// Every test here calls an export function directly, with no UI involved, so
// deleting the gate from src/export/targets.ts fails a test rather than merely
// changing a button's disabled attribute. It is the same arrangement
// tests/saveGate.test.ts uses for the store write paths, and it is written this
// way because a gate that only exists in a button is not a gate.
//
// The gate is asserted three ways for each target: it throws, it throws the
// specific SaveRefusedError naming the rule, and it emits NOTHING (no partial
// file map reaches the caller).

import type { FlowDoc } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { SaveRefusedError } from "../src/model/validate.js";
import {
  buildExport,
  exportCdk,
  exportRaw,
  exportTf,
  type ExportInput,
} from "../src/export/targets.js";
import { demoDoc } from "./helpers.js";

const ARN = "arn:aws:lambda:us-east-1:123456789012:function:lookup";

/** A doc failing no-literal-arn: the hard rule the studio may never write. */
function withLiteralArn(): FlowDoc {
  const doc = demoDoc();
  doc.content.Actions = doc.content.Actions.map((a) =>
    a.Identifier === "look-up-appointment"
      ? { ...a, Parameters: { ...a.Parameters, LambdaFunctionARN: ARN } }
      : a,
  );
  return doc;
}

/** A doc failing no-unresolved-token: a token interpolated into a sentence. */
function withUnresolvedToken(): FlowDoc {
  const doc = demoDoc();
  doc.content.Actions = doc.content.Actions.map((a) =>
    a.Identifier === "welcome"
      ? { ...a, Parameters: { ...a.Parameters, Text: "Call ${cdref:queue:appointments} now" } }
      : a,
  );
  return doc;
}

/** Schema-invalid but lint-clean: a MessageParticipant with no body at all. */
function withNoMessageBody(): FlowDoc {
  const doc = demoDoc();
  doc.content.Actions = doc.content.Actions.map((a) =>
    a.Identifier === "welcome" ? { ...a, Parameters: {} } : a,
  );
  return doc;
}

/** A complete map for each target, so only the document can be the refusal. */
const inputsFor = (docs: FlowDoc[]): ExportInput[] => [
  { target: "cdk", docs },
  {
    target: "tf",
    docs,
    addressMap: {
      "hours:main-line": "aws_connect_hours_of_operation.main_line.arn",
      "lambda:appointment-lookup": "data.aws_lambda_function.appointment_lookup.arn",
      "queue:appointments": "aws_connect_queue.appointments.arn",
    },
  },
  {
    target: "raw",
    docs,
    resourceMap: {
      "${cdref:hours:main-line}": "arn:aws:connect:us-east-1:1:instance/i/operating-hours/h",
      "${cdref:lambda:appointment-lookup}": "arn:aws:lambda:us-east-1:1:function:lookup",
      "${cdref:queue:appointments}": "arn:aws:connect:us-east-1:1:instance/i/queue/q",
    },
  },
];

const brokenDocs: [string, () => FlowDoc][] = [
  ["no-literal-arn", withLiteralArn],
  ["no-unresolved-token", withUnresolvedToken],
  ["a schema violation", withNoMessageBody],
];

describe("the save gate covers every export target", () => {
  for (const [what, make] of brokenDocs) {
    for (const input of inputsFor([make()])) {
      it(`${input.target} refuses a document failing ${what}`, () => {
        expect(() => buildExport(input)).toThrow(SaveRefusedError);
      });
    }
  }

  it("refuses the whole set when one document of several is invalid", () => {
    // A half-written export of a set is worse than none: @flow-as-code/tf emits one
    // configuration for all of them, so a partial write leaves a broken tree.
    for (const input of inputsFor([demoDoc(), withLiteralArn()])) {
      expect(() => buildExport(input)).toThrow(SaveRefusedError);
    }
  });

  it("names the rule that refused, so the dialog can say why", () => {
    let thrown: unknown;
    try {
      exportTf({ target: "tf", docs: [withLiteralArn()], addressMap: {} });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(SaveRefusedError);
    expect((thrown as SaveRefusedError).message).toContain("no-literal-arn");
    expect((thrown as SaveRefusedError).validation.blockers.map((f) => f.rule)).toContain(
      "no-literal-arn",
    );
  });

  it("gates before emitting: the ARN never reaches a file map", () => {
    // Not "it throws" but "nothing came out". A gate that ran after emission
    // would still throw here while having already built the bytes.
    for (const input of inputsFor([withLiteralArn()])) {
      let files: Record<string, string> | undefined;
      try {
        files = buildExport(input).files;
      } catch {
        files = undefined;
      }
      expect(files).toBeUndefined();
    }
  });

  it("still exports the demo, so the gate is not simply refusing everything", () => {
    for (const input of inputsFor([demoDoc()])) {
      expect(Object.keys(buildExport(input).files).length).toBeGreaterThan(0);
    }
    expect(Object.keys(exportCdk({ target: "cdk", docs: [demoDoc()] }).files)).toEqual([
      "flow-stack.ts",
    ]);
    expect(
      exportRaw({
        target: "raw",
        docs: [demoDoc()],
        resourceMap: {
          "${cdref:hours:main-line}": "arn:aws:connect:us-east-1:1:instance/i/operating-hours/h",
          "${cdref:lambda:appointment-lookup}": "arn:aws:lambda:us-east-1:1:function:lookup",
          "${cdref:queue:appointments}": "arn:aws:connect:us-east-1:1:instance/i/queue/q",
        },
      }).files["appointment-line.json"],
    ).toContain("arn:aws:lambda");
  });
});
