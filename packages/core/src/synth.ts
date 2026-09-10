/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// synth: builder model in, FlowDoc out.

import type { Block } from "./blocks.js";
import type { Flow } from "./flow.js";
import { assertFlow } from "./flow.js";
import type { FlowAction, FlowContent, FlowDoc, Point } from "./flowdoc.js";
import { FLOW_LANGUAGE_VERSION, FLOWDOC_VERSION } from "./flowdoc.js";
import { autoLayout } from "./layout.js";
import { collectRefs } from "./refs.js";

export interface SynthOptions {
  /** Recorded in meta.generator. Defaults to the package identity. */
  generator?: string;
  /** Set false to emit no `meta` block, which keeps fixtures free of versions. */
  includeMeta?: boolean;
}

function targets(action: FlowAction): string[] {
  const t = action.Transitions;
  return [
    ...(t.NextAction === undefined ? [] : [t.NextAction]),
    ...(t.Errors ?? []).map((e) => e.NextAction),
    ...(t.Conditions ?? []).map((c) => c.NextAction),
  ];
}

/**
 * Reachability order: breadth-first from StartAction, then anything unreachable
 * sorted by Identifier.
 *
 * This is NOT the order synth emits. Synth preserves declaration order, because
 * codegen has to produce TypeScript a human would plausibly have written, and a
 * human writes the happy path before the error handlers. Reachability order
 * interleaves them. Preserving declaration order also makes codegen(synth(code))
 * stable with no normalization pass at all, rather than one.
 *
 * Kept for lint (`reachable-blocks`) and for diffing two flows that are
 * semantically identical but declared in a different order.
 */
export function canonicalOrder(blocks: readonly Block[], startId: string): Block[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  if (!byId.has(startId)) {
    throw new Error(`StartAction "${startId}" is not one of the flow's blocks.`);
  }

  const ordered: Block[] = [];
  const seen = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const block = byId.get(id);
    if (block === undefined) continue; // dangling target; lint reports it
    seen.add(id);
    ordered.push(block);
    for (const t of targets(block.toAction())) {
      if (!seen.has(t)) queue.push(t);
    }
  }

  const unreachable = blocks.filter((b) => !seen.has(b.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  return [...ordered, ...unreachable];
}

export function synth(flow: Flow, options: SynthOptions = {}): FlowDoc {
  assertFlow(flow, "synth");
  const startId = flow.startId();
  if (!flow.all().some((b) => b.id === startId)) {
    throw new Error(`StartAction "${startId}" is not one of the flow's blocks.`);
  }
  // Declaration order, deliberately. See canonicalOrder above.
  const actions = flow.all().map((b) => b.toAction());

  // Hand-placed positions win; everything else gets deterministic auto-layout.
  const auto = autoLayout(actions);
  const layout: Record<string, Point> = {};
  for (const a of actions) {
    layout[a.Identifier] = flow.layout[a.Identifier] ?? auto[a.Identifier]!;
  }

  const content: FlowContent = {
    Version: FLOW_LANGUAGE_VERSION,
    StartAction: startId,
    // A module requires a top-level Settings; a flow must not carry one.
    ...(flow.kind === "module"
      ? { Settings: (flow as { settings?: Record<string, unknown> }).settings ?? {} }
      : {}),
    Actions: actions,
  };

  const doc: FlowDoc = {
    flowdoc: FLOWDOC_VERSION,
    kind: flow.kind,
    name: flow.name,
    connectType: flow.connectType,
    content,
    layout,
    refs: collectRefs(content),
  };

  if (options.includeMeta !== false) {
    doc.meta = { generator: options.generator ?? `core@${FLOWDOC_VERSION}` };
  }
  return doc;
}
