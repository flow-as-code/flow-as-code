/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// docs/02-studio-design.md: "A refs sidebar lists every token in the doc with
// usage counts." This pins the counting; tests/app.test.tsx renders it.

import { describe, expect, it } from "vitest";
import { addBlock, setParam } from "../src/model/mutations.js";
import { refUsage } from "../src/model/refUsage.js";
import { demoDoc } from "./helpers.js";

describe("refUsage", () => {
  it("lists every token in the demo doc with its type, name, and users", () => {
    const usage = refUsage(demoDoc());
    expect(usage.map((r) => r.token)).toEqual(demoDoc().refs?.map((r) => r.token));
    const hours = usage.find((r) => r.type === "hours");
    expect(hours).toMatchObject({ name: "main-line", count: 1, actions: ["check-hours"] });
    const lambda = usage.find((r) => r.type === "lambda");
    expect(lambda?.actions).toEqual(["look-up-appointment"]);
  });

  it("counts every occurrence, including two actions sharing one token", () => {
    const token = "${cdref:queue:appointments}";
    const doc = setParam(demoDoc(), "record-lookup-result", "Attributes", { queue: token });
    const queue = refUsage(doc).find((r) => r.token === token);
    // set-working-queue already used it; record-lookup-result now does too.
    expect(queue?.count).toBe(2);
    expect(queue?.actions).toEqual(["set-working-queue", "record-lookup-result"]);
  });

  it("counts a token used only in a condition operand", () => {
    // The sidebar scans whole actions, not just Parameters. Counting over
    // Parameters alone showed such a token with count 0, which reads as dead
    // and invites deleting a reference the flow depends on.
    const token = "${cdref:queue:vips}";
    const doc = demoDoc();
    const compare = doc.content.Actions.find((a) => a.Identifier === "check-hours")!;
    compare.Transitions.Conditions![0]!.Condition.Operands = [token];
    const entry = refUsage(doc).find((r) => r.token === token);
    expect(entry?.count).toBe(1);
    expect(entry?.actions).toEqual(["check-hours"]);
  });

  it("counts a token used twice inside one action once per occurrence", () => {
    const token = "${cdref:queue:vips}";
    const doc = setParam(demoDoc(), "record-lookup-result", "Attributes", {
      primary: token,
      backup: token,
    });
    const entry = refUsage(doc).find((r) => r.token === token);
    expect(entry?.count).toBe(2);
    expect(entry?.actions).toEqual(["record-lookup-result"]);
  });

  it("carries the module alias through", () => {
    const { doc, id } = addBlock(demoDoc(), "InvokeFlowModule", { x: 0, y: 900 });
    const withRef = setParam(doc, id, "FlowModuleId", "${cdref:module:consent@prod}");
    const entry = refUsage(withRef).find((r) => r.type === "module");
    expect(entry).toMatchObject({ name: "consent", alias: "prod", count: 1, actions: [id] });
  });

  it("drops a token as soon as nothing references it", () => {
    const doc = setParam(demoDoc(), "check-hours", "HoursOfOperationId", undefined);
    expect(refUsage(doc).some((r) => r.type === "hours")).toBe(false);
  });

  it("is stable: the same doc yields the same order", () => {
    expect(refUsage(demoDoc())).toEqual(refUsage(demoDoc()));
  });
});
