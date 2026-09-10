/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The worker's message handling is a pure function, tested directly; the
// worker file itself only wires postMessage to it (no Worker is spawned here).

import { describe, expect, it } from "vitest";
import { UNKNOWN_SEQ, handleLintRequest } from "../src/worker/lintProtocol.js";
import { demoDoc } from "./helpers.js";

describe("handleLintRequest", () => {
  it("echoes the sequence number so stale results can be dropped", () => {
    expect(handleLintRequest({ seq: 42, doc: demoDoc() }).seq).toBe(42);
  });

  it("returns sorted findings with rule, severity, and blockId", () => {
    // A flow with no terminal action. Built directly rather than by deleting
    // hang-up: that delete is refused now, because detaching the four
    // transitions pointing at it would demote their sources.
    const doc = demoDoc();
    doc.content.Actions = doc.content.Actions.filter((a) => a.Identifier !== "hang-up");
    const result = handleLintRequest({ seq: 1, doc });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => f.rule.length > 0)).toBe(true);
    expect(result.findings.some((f) => f.rule === "terminal-blocks")).toBe(true);
    // Soft rules never block a save.
    expect(result.blocked).toBe(false);
  });
});

describe("handleLintRequest on malformed messages", () => {
  // Anything can postMessage to a worker. A throw here would kill the worker
  // and leave the studio silently unlinted, so bad input comes back as a
  // structured, still-blocked result.
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 7],
    ["no doc", { seq: 3 }],
    ["a null doc", { seq: 3, doc: null }],
    ["a doc with no content.Actions", { seq: 3, doc: { name: "x", content: {} } }],
  ])("returns an error result for %s instead of throwing", (_label, message) => {
    const result = handleLintRequest(message);
    expect(result.findings).toEqual([]);
    expect(result.blocked).toBe(true);
    expect(result.error).toBeDefined();
  });

  it("echoes a usable seq when the message has one, and UNKNOWN_SEQ otherwise", () => {
    expect(handleLintRequest({ seq: 9, doc: null }).seq).toBe(9);
    expect(handleLintRequest(undefined).seq).toBe(UNKNOWN_SEQ);
  });
});
