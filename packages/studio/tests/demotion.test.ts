/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The demotion oracle must agree with codegen exactly, and must fail loudly
// rather than answer "nothing is demoted", because every guard in
// model/mutations.ts is only as strong as this answer.

import type { FlowAction, FlowDoc } from "@flow-as-code/core";
import { codegen } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { demotedIds, demotionDelta, probeDemotion } from "../src/model/demotion.js";
import { addBlock } from "../src/model/mutations.js";
import { compareDoc, demoDoc, menuDoc } from "./helpers.js";

/**
 * An independent reading of the same fact: block class by id, taken straight
 * off each construction in the generated source. Deliberately a different
 * implementation from the oracle's character walk (one regex, no tokenizer),
 * so the two agreeing is evidence rather than a tautology.
 */
const CONSTRUCTION = /new ([A-Za-z]+)\(\{\s*id: ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;

function classByIdFromSource(doc: FlowDoc): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of codegen(doc).matchAll(CONSTRUCTION)) {
    out.set(JSON.parse(m[2]!.startsWith("'") ? `"${m[2]!.slice(1, -1)}"` : m[2]!) as string, m[1]!);
  }
  return out;
}

function expectAgreesWithCodegen(doc: FlowDoc): void {
  const fromSource = classByIdFromSource(doc);
  const expected = [...fromSource.entries()]
    .filter(([, cls]) => cls === "GenericBlock")
    .map(([id]) => id)
    .sort();
  expect([...demotedIds(doc)].sort()).toEqual(expected);
  // Every action was accounted for, so neither reading skipped one.
  expect(fromSource.size).toBe(doc.content.Actions.length);
}

describe("the oracle agrees with codegen", () => {
  it("on the demo flow, where exactly the unmodeled action is generic", () => {
    expect([...demotedIds(demoDoc())]).toEqual(["enable-logging"]);
    expectAgreesWithCodegen(demoDoc());
  });

  it("on a flow with no unmodeled actions at all", () => {
    expect([...demotedIds(compareDoc())]).toEqual([]);
    expectAgreesWithCodegen(compareDoc());
  });

  it("on a fully wired DTMF menu, which is typed", () => {
    expect([...demotedIds(menuDoc())]).toEqual([]);
    expectAgreesWithCodegen(menuDoc());
  });

  it("on every palette type inserted unwired", () => {
    let doc = demoDoc();
    for (const type of [
      "MessageParticipant",
      "Compare",
      "InvokeLambdaFunction",
      "GetParticipantInput",
    ] as const) {
      doc = addBlock(doc, type, { x: 0, y: 0 }).doc;
    }
    expectAgreesWithCodegen(doc);
  });

  it("when a parameter string contains the GenericBlock marker itself", () => {
    // The oracle walks the source skipping string literals, so a message body
    // that quotes generated code cannot forge an entry. Note the naive regex
    // reading above IS fooled here, which is why the oracle does not use one.
    const doc = demoDoc();
    doc.content.Actions = doc.content.Actions.map((a) =>
      a.Identifier === "welcome"
        ? { ...a, Parameters: { Text: 'new GenericBlock({ id: "welcome", type: "x" })' } }
        : a,
    );
    expect([...demotedIds(doc)]).toEqual(["enable-logging"]);
    expect(classByIdFromSource(doc).get("welcome")).toBe("GenericBlock");
  });

  it("when an identifier needs escaping in the generated source", () => {
    const doc = demoDoc();
    const quoted = 'odd"name';
    doc.content.Actions = doc.content.Actions.map((a): FlowAction =>
      a.Identifier === "enable-logging" ? { ...a, Identifier: quoted } : a,
    );
    doc.content.StartAction = quoted;
    doc.content.Actions = doc.content.Actions.map((a) =>
      a.Transitions.NextAction === "enable-logging"
        ? { ...a, Transitions: { ...a.Transitions, NextAction: quoted } }
        : a,
    );
    expect([...demotedIds(doc)]).toEqual([quoted]);
  });
});

describe("probeDemotion reports rather than pretends", () => {
  it("says so when codegen cannot run at all", () => {
    const empty = demoDoc();
    empty.content.Actions = [];
    const probe = probeDemotion(empty);
    expect(probe.generated).toBe(false);
    if (!probe.generated) expect(probe.error).toMatch(/no actions/);
  });

  it("caches per document value, so a repeated probe is the same object", () => {
    const doc = demoDoc();
    expect(probeDemotion(doc)).toBe(probeDemotion(doc));
  });
});

describe("demotionDelta counts only what the user already had", () => {
  it("reports a block that lost its typed form", () => {
    const before = demoDoc();
    const after = demoDoc();
    after.content.Actions = after.content.Actions.map((a) =>
      a.Identifier === "welcome" ? { ...a, Transitions: {} } : a,
    );
    expect(demotionDelta(before, after).demoted).toEqual(["welcome"]);
  });

  it("ignores a block the change just created", () => {
    const before = demoDoc();
    const { doc: after, id } = addBlock(before, "MessageParticipant", { x: 0, y: 0 });
    // The new block IS generic (it has no transitions yet)...
    expect(demotedIds(after).has(id)).toBe(true);
    // ...but nothing was lost, so it is not a demotion.
    expect(demotionDelta(before, after).demoted).toEqual([]);
  });

  it("reports a change that makes the flow ungeneratable outright", () => {
    const before = demoDoc();
    const after = demoDoc();
    after.content.Actions = [];
    expect(demotionDelta(before, after).ungeneratable).toMatch(/no actions/);
  });
});
