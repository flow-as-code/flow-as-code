/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Deterministic auto-layout. The studio persists user positions; synth fills in
// positions only for actions that have none, so hand-placed nodes survive.

import dagre from "dagre";
import type { FlowAction, Point } from "./flowdoc.js";

/** Node box used for layout. Matches the studio's default node size. */
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 60;

function transitionTargets(action: FlowAction): string[] {
  const t = action.Transitions;
  return [
    ...(t.NextAction === undefined ? [] : [t.NextAction]),
    ...(t.Errors ?? []).map((e) => e.NextAction),
    ...(t.Conditions ?? []).map((c) => c.NextAction),
  ];
}

/**
 * Left-to-right dagre layout. Deterministic for a given action list: dagre is
 * seeded only by insertion order, and actions are already in canonical order by
 * the time this runs.
 */
export function autoLayout(actions: FlowAction[]): Record<string, Point> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(actions.map((a) => a.Identifier));
  for (const a of actions) g.setNode(a.Identifier, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const a of actions) {
    for (const target of transitionTargets(a)) {
      // Dangling targets are a lint finding, not a layout crash.
      if (ids.has(target)) g.setEdge(a.Identifier, target);
    }
  }

  dagre.layout(g);

  const positions: Record<string, Point> = {};
  for (const a of actions) {
    const node = g.node(a.Identifier) as { x: number; y: number } | undefined;
    // dagre reports centres; FlowDoc stores top-left, as the console does.
    positions[a.Identifier] = node
      ? { x: Math.round(node.x - NODE_WIDTH / 2), y: Math.round(node.y - NODE_HEIGHT / 2) }
      : { x: 0, y: 0 };
  }
  return positions;
}
