/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Pure FlowDoc-to-canvas mapping. No React, no DOM: unit-tested directly.
//
// Edge ids are parseable because ":" is a forbidden Identifier character
// (FORBIDDEN_IDENTIFIER_CHARS in @flow-as-code/core), so the source Identifier can
// never contain the separator.

import type { FlowAction, FlowDoc, Point } from "@flow-as-code/core";
import { autoLayout } from "@flow-as-code/core";
import { categoryOf, isModeled, type PaletteCategory } from "./palette.js";

export interface NodeModel {
  id: string;
  position: Point;
  action: FlowAction;
  /** Palette category for modeled actions; "generic" otherwise. */
  category: PaletteCategory | "generic";
  isGeneric: boolean;
  isStart: boolean;
}

export type EdgeKind = "next" | "error" | "condition";

export interface EdgeModel {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  /** ErrorType for error edges, operand summary for condition edges. */
  label?: string;
  errorType?: string;
  errorIndex?: number;
  conditionIndex?: number;
}

/**
 * A transition whose target Identifier is not in the document.
 *
 * The file keeps it and every emitter re-emits it verbatim, but there is no
 * node for it to end at, so it cannot be drawn as an edge. Leaving it at that
 * would make it invisible and unrewirable from the canvas, which is content
 * dropped from the user's view of their own flow. It is surfaced instead: the
 * canvas badges the source block and DanglingPanel lists every one of them.
 * No mutation can create one; documents authored elsewhere can.
 */
export interface DanglingTransition {
  source: string;
  kind: EdgeKind;
  /** The Identifier the transition points at, which no Action carries. */
  target: string;
  /** ErrorType, condition summary, or "next". */
  label: string;
  errorIndex?: number;
  conditionIndex?: number;
}

export interface GraphModel {
  nodes: NodeModel[];
  edges: EdgeModel[];
  dangling: DanglingTransition[];
}

export function nextEdgeId(source: string): string {
  return `${source}:next`;
}

/**
 * Error edges are keyed by index first: the schema does not require ErrorType
 * to be unique within one action, and keying by type alone collapsed two
 * entries with the same ErrorType into a single edge, dropping a transition
 * from the canvas. The type stays in the id so the id is still readable.
 */
export function errorEdgeId(source: string, index: number, errorType: string): string {
  return `${source}:error:${index}:${errorType}`;
}

export function conditionEdgeId(source: string, index: number): string {
  return `${source}:condition:${index}`;
}

export type ParsedEdgeId =
  | { source: string; kind: "next" }
  | { source: string; kind: "error"; errorIndex: number; errorType: string }
  | { source: string; kind: "condition"; conditionIndex: number };

export function parseEdgeId(id: string): ParsedEdgeId | undefined {
  const first = id.indexOf(":");
  if (first < 0) return undefined;
  const source = id.slice(0, first);
  const rest = id.slice(first + 1);
  if (rest === "next") return { source, kind: "next" };
  if (rest.startsWith("error:")) {
    const body = rest.slice(6);
    const sep = body.indexOf(":");
    if (sep < 0) return undefined;
    const errorIndex = Number(body.slice(0, sep));
    if (Number.isInteger(errorIndex) && errorIndex >= 0) {
      return { source, kind: "error", errorIndex, errorType: body.slice(sep + 1) };
    }
    return undefined;
  }
  if (rest.startsWith("condition:")) {
    const index = Number(rest.slice(10));
    if (Number.isInteger(index) && index >= 0)
      return { source, kind: "condition", conditionIndex: index };
  }
  return undefined;
}

/** "Equals True", "NumberGreaterThan 5", capped so labels stay readable. */
export function conditionSummary(operator: string, operands: readonly unknown[]): string {
  const text = operands.map((o) => String(o)).join(", ");
  const capped = text.length > 24 ? `${text.slice(0, 24)}…` : text;
  return `${operator} ${capped}`;
}

/**
 * Positions come from doc.layout; any action without one falls back to the
 * deterministic @flow-as-code/core auto-layout, so a doc with no layout at all still
 * renders sensibly.
 */
export function positionsFor(doc: FlowDoc): Record<string, Point> {
  const layout = doc.layout ?? {};
  const missing = doc.content.Actions.some((a) => layout[a.Identifier] === undefined);
  const fallback = missing ? autoLayout(doc.content.Actions) : {};
  const out: Record<string, Point> = {};
  for (const a of doc.content.Actions) {
    out[a.Identifier] = layout[a.Identifier] ?? fallback[a.Identifier] ?? { x: 0, y: 0 };
  }
  return out;
}

/** Every transition in the document that points at an Identifier nothing has. */
export function danglingTransitions(doc: FlowDoc): DanglingTransition[] {
  const ids = new Set(doc.content.Actions.map((a) => a.Identifier));
  const out: DanglingTransition[] = [];
  for (const action of doc.content.Actions) {
    const t = action.Transitions;
    const source = action.Identifier;
    if (t.NextAction !== undefined && !ids.has(t.NextAction)) {
      out.push({ source, kind: "next", target: t.NextAction, label: "next" });
    }
    (t.Errors ?? []).forEach((e, i) => {
      if (ids.has(e.NextAction)) return;
      out.push({ source, kind: "error", target: e.NextAction, label: e.ErrorType, errorIndex: i });
    });
    (t.Conditions ?? []).forEach((c, i) => {
      if (ids.has(c.NextAction)) return;
      out.push({
        source,
        kind: "condition",
        target: c.NextAction,
        label: conditionSummary(c.Condition.Operator, c.Condition.Operands),
        conditionIndex: i,
      });
    });
  }
  return out;
}

export function docToGraph(doc: FlowDoc): GraphModel {
  const positions = positionsFor(doc);
  const ids = new Set(doc.content.Actions.map((a) => a.Identifier));

  const nodes: NodeModel[] = doc.content.Actions.map((action) => ({
    id: action.Identifier,
    position: positions[action.Identifier] ?? { x: 0, y: 0 },
    action,
    category: isModeled(action.Type) ? categoryOf(action.Type) : "generic",
    isGeneric: !isModeled(action.Type),
    isStart: action.Identifier === doc.content.StartAction,
  }));

  const edges: EdgeModel[] = [];
  for (const action of doc.content.Actions) {
    const t = action.Transitions;
    const source = action.Identifier;
    if (t.NextAction !== undefined && ids.has(t.NextAction)) {
      edges.push({ id: nextEdgeId(source), source, target: t.NextAction, kind: "next" });
    }
    (t.Errors ?? []).forEach((e, i) => {
      if (!ids.has(e.NextAction)) return;
      edges.push({
        id: errorEdgeId(source, i, e.ErrorType),
        source,
        target: e.NextAction,
        kind: "error",
        label: e.ErrorType,
        errorType: e.ErrorType,
        errorIndex: i,
      });
    });
    (t.Conditions ?? []).forEach((c, i) => {
      if (!ids.has(c.NextAction)) return;
      edges.push({
        id: conditionEdgeId(source, i),
        source,
        target: c.NextAction,
        kind: "condition",
        label: conditionSummary(c.Condition.Operator, c.Condition.Operands),
        conditionIndex: i,
      });
    });
  }

  return { nodes, edges, dangling: danglingTransitions(doc) };
}
