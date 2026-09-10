/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The limits Flow enforces at build time. Each of these was enforceable in
// code and unenforced by the suite: deleting the check left every test green.

import { describe, expect, it } from "vitest";
import { Flow, FlowModule, GenericBlock, MAX_ACTIONS_PER_FLOW } from "./index.js";

const block = (i: number): GenericBlock =>
  new GenericBlock({ id: `a${String(i).padStart(3, "0")}`, type: "UpdateFlowLoggingBehavior" });

const blocks = (n: number): GenericBlock[] => Array.from({ length: n }, (_, i) => block(i));

describe("Flow.add enforces the 250 action limit", () => {
  // "No more than 250 Actions per flow."
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-language-example.html
  it("accepts exactly the limit", () => {
    const flow = new Flow({ name: "at-the-limit" }).add(...blocks(MAX_ACTIONS_PER_FLOW));
    expect(flow.all()).toHaveLength(MAX_ACTIONS_PER_FLOW);
  });

  it("throws on the 251st block added in one call", () => {
    expect(() => new Flow({ name: "over" }).add(...blocks(MAX_ACTIONS_PER_FLOW + 1))).toThrow(
      /has 251 actions; Connect allows at most 250/,
    );
  });

  it("throws on the 251st block added one at a time", () => {
    const flow = new Flow({ name: "over" });
    for (const b of blocks(MAX_ACTIONS_PER_FLOW)) flow.add(b);
    expect(() => flow.add(block(MAX_ACTIONS_PER_FLOW))).toThrow(
      /has 251 actions; Connect allows at most 250/,
    );
  });

  it("applies to modules as well as flows", () => {
    expect(() => new FlowModule({ name: "over" }).add(...blocks(MAX_ACTIONS_PER_FLOW + 1))).toThrow(
      /Connect allows at most 250/,
    );
  });

  it("names the flow in the message", () => {
    expect(() => new Flow({ name: "busy-line" }).add(...blocks(MAX_ACTIONS_PER_FLOW + 1))).toThrow(
      /Flow "busy-line"/,
    );
  });
});
