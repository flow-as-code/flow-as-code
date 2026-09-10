/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import {
  conditionSummary,
  danglingTransitions,
  docToGraph,
  parseEdgeId,
} from "../src/model/graph.js";
import { demoDoc } from "./helpers.js";

describe("docToGraph on the demo doc", () => {
  const graph = docToGraph(demoDoc());

  it("maps one node per Action (11 for the demo)", () => {
    expect(graph.nodes).toHaveLength(11);
    expect(graph.nodes.map((n) => n.id)).toContain("welcome");
  });

  it("marks the unmodeled UpdateFlowLoggingBehavior action as a GenericBlock", () => {
    const generic = graph.nodes.filter((n) => n.isGeneric);
    expect(generic.map((n) => n.id)).toEqual(["enable-logging"]);
    expect(generic[0]?.category).toBe("generic");
  });

  it("flags the start node", () => {
    expect(graph.nodes.find((n) => n.isStart)?.id).toBe("enable-logging");
  });

  it("categorizes modeled nodes by palette group", () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get("welcome")?.category).toBe("Interact");
    expect(byId.get("check-hours")?.category).toBe("Branch");
    expect(byId.get("set-working-queue")?.category).toBe("Set");
    expect(byId.get("look-up-appointment")?.category).toBe("Integrate");
    expect(byId.get("hang-up")?.category).toBe("Terminate");
  });

  it("uses doc.layout positions verbatim", () => {
    const welcome = graph.nodes.find((n) => n.id === "welcome");
    expect(welcome?.position).toEqual({ x: 280, y: 170 });
  });

  it("emits one edge per transition, error edges flagged and labeled", () => {
    const errors = graph.edges.filter((e) => e.kind === "error");
    // Every action except hang-up carries at least the catch-all; transfer has two.
    expect(errors).toHaveLength(10);
    expect(errors.every((e) => e.label === e.errorType)).toBe(true);
    const capacity = errors.find((e) => e.errorType === "QueueAtCapacity");
    expect(capacity?.source).toBe("transfer");
    expect(capacity?.target).toBe("announce-busy");
  });

  it("labels condition edges with the operand summary", () => {
    const conditions = graph.edges.filter((e) => e.kind === "condition");
    expect(conditions).toHaveLength(2);
    expect(conditions.map((e) => e.label)).toEqual(["Equals True", "Equals False"]);
  });

  it("emits next edges including the terminal fan-in to hang-up", () => {
    const next = graph.edges.filter((e) => e.kind === "next");
    expect(next).toHaveLength(10);
  });
});

describe("layout fallback", () => {
  it("assigns deterministic auto-layout positions when layout is missing", () => {
    const doc = demoDoc();
    delete doc.layout;
    const a = docToGraph(doc);
    const b = docToGraph(doc);
    expect(a.nodes.every((n) => Number.isFinite(n.position.x))).toBe(true);
    expect(a.nodes.map((n) => n.position)).toEqual(b.nodes.map((n) => n.position));
    // Not all stacked at the origin.
    expect(new Set(a.nodes.map((n) => `${n.position.x},${n.position.y}`)).size).toBeGreaterThan(1);
  });

  it("keeps authored positions and fills only the missing ones", () => {
    const doc = demoDoc();
    delete doc.layout!.welcome;
    const graph = docToGraph(doc);
    expect(graph.nodes.find((n) => n.id === "check-hours")?.position).toEqual({ x: 540, y: 50 });
    expect(graph.nodes.find((n) => n.id === "welcome")?.position).toBeDefined();
  });
});

describe("edge ids", () => {
  it("round-trip through parseEdgeId", () => {
    expect(parseEdgeId("welcome:next")).toEqual({ source: "welcome", kind: "next" });
    expect(parseEdgeId("transfer:error:0:QueueAtCapacity")).toEqual({
      source: "transfer",
      kind: "error",
      errorIndex: 0,
      errorType: "QueueAtCapacity",
    });
    // The index is required: an id without it is not a rewireable edge.
    expect(parseEdgeId("transfer:error:QueueAtCapacity")).toBeUndefined();
    expect(parseEdgeId("check-hours:condition:1")).toEqual({
      source: "check-hours",
      kind: "condition",
      conditionIndex: 1,
    });
    expect(parseEdgeId("nonsense")).toBeUndefined();
  });

  it("caps long condition labels", () => {
    expect(conditionSummary("Equals", ["x".repeat(40)])).toContain("…");
  });
});

describe("dangling transitions", () => {
  /** A document whose transitions point at Identifiers no Action carries. */
  function withDangling() {
    const doc = demoDoc();
    doc.content.Actions.find((a) => a.Identifier === "welcome")!.Transitions.NextAction =
      "gone-missing";
    doc.content.Actions.find(
      (a) => a.Identifier === "transfer",
    )!.Transitions.Errors![0]!.NextAction = "also-gone";
    doc.content.Actions.find(
      (a) => a.Identifier === "check-hours",
    )!.Transitions.Conditions![0]!.NextAction = "third-gone";
    return doc;
  }

  it("reports every transition whose target is not in the document", () => {
    expect(danglingTransitions(withDangling())).toEqual([
      { source: "welcome", kind: "next", target: "gone-missing", label: "next" },
      {
        source: "check-hours",
        kind: "condition",
        target: "third-gone",
        label: "Equals True",
        conditionIndex: 0,
      },
      {
        source: "transfer",
        kind: "error",
        target: "also-gone",
        label: "QueueAtCapacity",
        errorIndex: 0,
      },
    ]);
  });

  it("reports nothing on a document whose transitions all land", () => {
    expect(danglingTransitions(demoDoc())).toEqual([]);
    expect(docToGraph(demoDoc()).dangling).toEqual([]);
  });

  it("surfaces on the graph what cannot be drawn as an edge", () => {
    // The transition is preserved in the file and re-emitted either way. What
    // must not happen is the canvas showing the block as if it were not there.
    const graph = docToGraph(withDangling());
    expect(graph.edges.some((e) => e.target === "gone-missing")).toBe(false);
    expect(graph.dangling).toHaveLength(3);
    expect(graph.dangling.map((d) => d.source)).toContain("welcome");
  });
});
