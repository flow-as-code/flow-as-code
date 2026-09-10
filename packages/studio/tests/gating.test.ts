/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Acceptance: a lint failure on either hard rule (no-literal-arn,
// no-unresolved-token) blocks save; fixing the doc unblocks it.

import { describe, expect, it } from "vitest";
import { setCondition, setParam } from "../src/model/mutations.js";
import { checkRefValue, makeToken } from "../src/model/refValues.js";
import { assertSaveable } from "../src/model/validate.js";
import { handleLintRequest } from "../src/worker/lintProtocol.js";
import { compareDoc, demoDoc } from "./helpers.js";

describe("save gating", () => {
  it("the demo doc lints clean and is saveable", () => {
    const result = handleLintRequest({ seq: 1, doc: demoDoc() });
    expect(result.findings).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it("an ARN typed into a branch operand blocks save; fixing it unblocks", () => {
    // The branch operand box is the studio's one free-text authoring surface
    // inside Transitions, and any operand string keeps a Compare expressible,
    // so the mutation layer allows this and lint is what must catch it. It did
    // not: findingsForActions walked only Parameters, so an ARN here was
    // invisible to both halves of the save gate.
    const doc = compareDoc();
    expect(handleLintRequest({ seq: 1, doc }).blocked).toBe(false);

    const broken = setCondition(doc, "compare", 0, {
      Operator: "Equals",
      Operands: ["arn:aws:lambda:us-east-1:123456789012:function:lookup"],
    })!;
    const blocked = handleLintRequest({ seq: 2, doc: broken });
    expect(blocked.blocked).toBe(true);
    expect(blocked.findings.some((f) => f.rule === "no-literal-arn")).toBe(true);
    expect(blocked.findings.some((f) => f.blockId === "compare")).toBe(true);
    expect(() => assertSaveable(broken)).toThrow(/no-literal-arn/);

    const fixed = setCondition(broken, "compare", 0, {
      Operator: "Equals",
      Operands: ["gold"],
    })!;
    expect(handleLintRequest({ seq: 3, doc: fixed }).blocked).toBe(false);
    expect(() => assertSaveable(fixed)).not.toThrow();
  });

  it("a malformed token in a branch operand blocks save too", () => {
    const broken = setCondition(compareDoc(), "compare", 0, {
      Operator: "Equals",
      Operands: ["tier ${cdref:queue:gold} tier"],
    })!;
    const result = handleLintRequest({ seq: 4, doc: broken });
    expect(result.blocked).toBe(true);
    expect(result.findings.some((f) => f.rule === "no-unresolved-token")).toBe(true);
  });

  it("a malformed token blocks save via no-unresolved-token", () => {
    const doc = setParam(demoDoc(), "welcome", "Text", "Call ${cdref:queue:appointments} now");
    const result = handleLintRequest({ seq: 4, doc });
    expect(result.blocked).toBe(true);
    expect(result.findings.some((f) => f.rule === "no-unresolved-token")).toBe(true);
  });
});

describe("ref picker validation (same rules as lint)", () => {
  it("rejects literal ARNs with an inline error", () => {
    const result = checkRefValue("lambda", "arn:aws:lambda:us-east-1:1:function:x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no-literal-arn/);
  });

  it("accepts a token of the right type and rejects the wrong type", () => {
    expect(checkRefValue("queue", "${cdref:queue:front-desk}")).toEqual({
      ok: true,
      value: "${cdref:queue:front-desk}",
    });
    const wrong = checkRefValue("queue", "${cdref:lambda:lookup}");
    expect(wrong.ok).toBe(false);
  });

  it("accepts a single JSONPath identifier", () => {
    expect(checkRefValue("queue", "$.Attributes.queueId").ok).toBe(true);
  });

  it("builds tokens from validated slugs, alias required for modules", () => {
    expect(makeToken("queue", "front-desk")).toEqual({
      ok: true,
      value: "${cdref:queue:front-desk}",
    });
    expect(makeToken("queue", "Front Desk").ok).toBe(false);
    expect(makeToken("module", "consent").ok).toBe(false);
    expect(makeToken("module", "consent", "prod")).toEqual({
      ok: true,
      value: "${cdref:module:consent@prod}",
    });
  });
});
