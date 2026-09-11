/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Deterministic auto-layout. The studio persists user positions; synth fills in
// positions only for actions that have none, so hand-placed nodes survive.
//
// The algorithm is specified in conformance/layout/README.md and pinned by
// the cases beside it, because a `.flow.tf` omits an action's position block
// exactly when the action sits where auto-layout puts it: a second
// implementation has to reach the same integers, so the algorithm is owned and
// written down rather than borrowed from a layout library.

import type { FlowAction, Point } from "./flowdoc.js";

/** Node box used for layout. Matches the studio's default node size. */
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 60;

/** Horizontal gap between ranks and vertical gap between nodes in a rank. */
export const RANK_GAP = 80;
export const NODE_GAP = 40;

/** Where the first node sits. */
export const LAYOUT_MARGIN = 20;

/** An action's transition targets in order, each at most once, actions only. */
function edgesOf(action: FlowAction, ids: ReadonlySet<string>): string[] {
  const t = action.Transitions;
  const out: string[] = [];
  for (const target of [
    ...(t.NextAction === undefined ? [] : [t.NextAction]),
    ...(t.Errors ?? []).map((e) => e.NextAction),
    ...(t.Conditions ?? []).map((c) => c.NextAction),
  ]) {
    // Dangling targets are a lint finding, not a layout crash.
    if (ids.has(target) && !out.includes(target)) out.push(target);
  }
  return out;
}

/**
 * Left-to-right layered layout, per conformance/layout/README.md. Deterministic
 * for a given action array: document order is part of the input.
 *
 * `start` is the document's StartAction. It defaults to the first action, which
 * is what it is unless the author declared an explicit start; callers that
 * hold the document pass it.
 */
export function autoLayout(
  actions: FlowAction[],
  start: string | undefined = actions[0]?.Identifier,
): Record<string, Point> {
  const byId = new Map<string, FlowAction>();
  for (const a of actions) if (!byId.has(a.Identifier)) byId.set(a.Identifier, a);
  const ids = new Set(byId.keys());
  const edges = new Map<string, string[]>();
  for (const [id, a] of byId) edges.set(id, edgesOf(a, ids));

  // Depth-first from the start action: discovery order, kept edges (back edges
  // dropped), and post-order, whose reverse is a topological order.
  const discovery = new Map<string, number>();
  const kept = new Map<string, string[]>();
  const postOrder: string[] = [];
  const onStack = new Set<string>();

  function visit(id: string): void {
    discovery.set(id, discovery.size);
    onStack.add(id);
    const out: string[] = [];
    for (const target of edges.get(id) ?? []) {
      if (onStack.has(target)) continue; // back edge
      out.push(target);
      if (!discovery.has(target)) visit(target);
    }
    kept.set(id, out);
    onStack.delete(id);
    postOrder.push(id);
  }
  if (start !== undefined && byId.has(start)) visit(start);

  // Longest kept path from the start, one pass in topological order.
  const rank = new Map<string, number>();
  for (const id of [...postOrder].reverse()) {
    const r = rank.get(id) ?? 0;
    rank.set(id, r);
    for (const target of kept.get(id) ?? []) {
      rank.set(target, Math.max(rank.get(target) ?? 0, r + 1));
    }
  }

  // Reachable actions in discovery order, then the rest in document order.
  const deepest = Math.max(-1, ...rank.values());
  const ordered = [...byId.keys()].sort((a, b) => {
    const da = discovery.get(a);
    const db = discovery.get(b);
    if (da !== undefined && db !== undefined) return da - db;
    if (da !== undefined) return -1;
    if (db !== undefined) return 1;
    return 0; // sort() is stable, so document order holds
  });

  const computed = new Map<string, Point>();
  const nextIndex = new Map<number, number>();
  for (const id of ordered) {
    const r = rank.get(id) ?? deepest + 1;
    const index = nextIndex.get(r) ?? 0;
    nextIndex.set(r, index + 1);
    computed.set(id, {
      x: LAYOUT_MARGIN + r * (NODE_WIDTH + RANK_GAP),
      y: LAYOUT_MARGIN + index * (NODE_HEIGHT + NODE_GAP),
    });
  }

  // Keyed in document order, so a fixture's layout reads like its actions.
  const positions: Record<string, Point> = {};
  for (const id of byId.keys()) positions[id] = computed.get(id)!;
  return positions;
}
