/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Library entry points against malformed input.
//
// Every one of these used to fail with a raw TypeError from whichever property
// access happened first: "Cannot read properties of undefined (reading
// 'Actions')" named neither the function called nor the argument.
// @flow-as-code/core is a library other tools embed, so the first thing a
// caller sees when they hand it the wrong thing has to say what was wrong.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FlowDoc } from "./index.js";
import {
  Flow,
  GenericBlock,
  InvalidFlowDocError,
  assertFlowDoc,
  codegen,
  lint,
  materializeWithBinder,
  materializeWithMap,
  synth,
} from "./index.js";

const root = new URL("../../../", import.meta.url);
const valid = (): FlowDoc =>
  JSON.parse(
    readFileSync(new URL("conformance/demo/appointment-line.flowdoc.json", root), "utf8"),
  ) as FlowDoc;

const without = (mutate: (doc: Record<string, any>) => void): unknown => {
  const doc = valid() as unknown as Record<string, any>;
  mutate(doc);
  return doc;
};

const malformed: [string, unknown][] = [
  ["undefined", undefined],
  ["null", null],
  ["an empty object", {}],
  ["a string", "flow.json"],
  ["a number", 7],
  ["an array", []],
  ["a doc with no content", without((d) => delete d.content)],
  ["a doc with no content.Actions", without((d) => delete d.content.Actions)],
  ["a doc whose Actions is not an array", without((d) => (d.content.Actions = {}))],
  ["a doc whose Actions holds a string", without((d) => (d.content.Actions = ["welcome"]))],
  ["a doc with an action with no Type", without((d) => delete d.content.Actions[0].Type)],
  [
    "a doc with an action with no Parameters",
    without((d) => delete d.content.Actions[0].Parameters),
  ],
  [
    "a doc with an action with no Transitions",
    without((d) => delete d.content.Actions[0].Transitions),
  ],
  ["a doc with no name", without((d) => delete d.name)],
  ["a doc with no StartAction", without((d) => delete d.content.StartAction)],
];

/** The failure mode this guard exists to replace. */
const isRaw = (e: unknown): boolean =>
  (e instanceof TypeError || e instanceof RangeError) && !(e instanceof InvalidFlowDocError);

function expectClearError(call: () => unknown, entryPoint: string): void {
  let thrown: unknown;
  expect(() => {
    try {
      call();
    } catch (e) {
      thrown = e;
      throw e;
    }
  }).toThrow();
  expect(isRaw(thrown), `raw ${String(thrown)}`).toBe(false);
  expect(thrown).toBeInstanceOf(InvalidFlowDocError);
  const message = (thrown as Error).message;
  expect(message).toContain(entryPoint);
  expect(message).toContain("FlowDoc");
  expect(message.length).toBeGreaterThan(entryPoint.length + 10);
}

describe.each(malformed)("codegen with %s", (_label, value) => {
  it("throws a clear error naming the entry point", () => {
    expectClearError(() => codegen(value as FlowDoc), "codegen");
  });
});

// `lint` takes one document or a list, so a bare array is a list of documents,
// not a malformed document. The empty list has its own test below.
const malformedForLint = malformed.filter(([label]) => label !== "an array");

describe.each(malformedForLint)("lint with %s", (_label, value) => {
  it("throws a clear error naming the entry point", () => {
    expectClearError(() => lint(value as FlowDoc), "lint");
  });

  it("throws the same way for a list containing it", () => {
    expectClearError(() => lint([valid(), value as FlowDoc]), "lint");
  });
});

describe("lint of a list", () => {
  it("accepts the empty list", () => {
    expect(lint([])).toEqual([]);
  });

  it("rejects a list holding something that is not a document", () => {
    expectClearError(() => lint([[]] as unknown as FlowDoc[]), "lint");
  });
});

describe.each(malformed)("materializeWithMap with %s", (_label, value) => {
  it("throws a clear error naming the entry point", () => {
    expectClearError(() => materializeWithMap(value as FlowDoc, {}), "materializeWithMap");
  });
});

describe.each(malformed)("materializeWithBinder with %s", (_label, value) => {
  it("throws a clear error naming the entry point", () => {
    expectClearError(
      () => materializeWithBinder(value as FlowDoc, () => "x"),
      "materializeWithBinder",
    );
  });
});

describe("the second argument", () => {
  it("materializeWithMap wants a map object", () => {
    expect(() => materializeWithMap(valid(), undefined as never)).toThrow(InvalidFlowDocError);
    expect(() => materializeWithMap(valid(), "map" as never)).toThrow(/token to value map/);
  });

  it("materializeWithBinder wants a function", () => {
    expect(() => materializeWithBinder(valid(), undefined as never)).toThrow(InvalidFlowDocError);
    expect(() => materializeWithBinder(valid(), {} as never)).toThrow(/binder function/);
  });
});

describe("synth rejects what is not a Flow", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a plain object", { name: "x" }],
    ["a string", "flow"],
    // The commonest mistake: handing synth the document it produces.
    ["a FlowDoc", { flowdoc: "0.1", kind: "flow", name: "x", connectType: "CONTACT_FLOW" }],
  ])("throws a clear error for %s", (_label, value) => {
    expect(() => synth(value as never)).toThrow(/synth expects a Flow built with new Flow/);
    expect(() => synth(value as never)).not.toThrow(TypeError);
  });

  it("still synthesizes a real Flow", () => {
    const flow = new Flow({ name: "one" }).add(
      new GenericBlock({ id: "only", type: "UpdateFlowLoggingBehavior" }),
    );
    expect(synth(flow, { includeMeta: false }).content.Actions).toHaveLength(1);
  });
});

describe("assertFlowDoc", () => {
  it("names the offending action by index and id", () => {
    const doc = without((d) => delete d.content.Actions[1].Parameters);
    expect(() => assertFlowDoc(doc, "emit")).toThrow(/content\.Actions\[1\]/);
    expect(() => assertFlowDoc(doc, "emit")).toThrow(/Parameters/);
  });

  it("accepts a valid document and narrows it", () => {
    const value: unknown = valid();
    assertFlowDoc(value, "test");
    expect(value.content.Actions.length).toBeGreaterThan(0);
  });
});

describe("valid input is unaffected", () => {
  it("codegen, lint, and both materializers still run", () => {
    const doc = valid();
    expect(codegen(doc)).toContain("export function");
    expect(lint(doc)).toEqual([]);
    expect(materializeWithBinder(doc, (ref) => `bound:${ref.name}`).Actions.length).toBe(
      doc.content.Actions.length,
    );
    const map = Object.fromEntries((doc.refs ?? []).map((r) => [r.token, `mapped:${r.name}`]));
    expect(materializeWithMap(doc, map).StartAction).toBe(doc.content.StartAction);
  });
});
