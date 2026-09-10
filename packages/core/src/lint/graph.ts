/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Shared traversal helpers. Browser-safe: no Node builtins.

import type { FlowAction, FlowDoc } from "../flowdoc.js";

export function transitionTargets(action: FlowAction): string[] {
  const t = action.Transitions;
  return [
    ...(t.NextAction === undefined ? [] : [t.NextAction]),
    ...(t.Errors ?? []).map((e) => e.NextAction),
    ...(t.Conditions ?? []).map((c) => c.NextAction),
  ];
}

export function isTerminal(action: FlowAction): boolean {
  return Object.keys(action.Transitions).length === 0;
}

export function actionsById(doc: FlowDoc): Map<string, FlowAction> {
  return new Map(doc.content.Actions.map((a) => [a.Identifier, a]));
}

/** Identifiers reachable from StartAction. */
export function reachable(doc: FlowDoc): Set<string> {
  const byId = actionsById(doc);
  const seen = new Set<string>();
  const queue = [doc.content.StartAction];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const action = byId.get(id);
    if (action === undefined) continue;
    seen.add(id);
    queue.push(...transitionTargets(action));
  }
  return seen;
}

/** Walks every string in a value, yielding [jsonPath, value] pairs. */
export function walkStrings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => walkStrings(v, `${path}[${i}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      walkStrings(v, path === "" ? k : `${path}.${k}`),
    );
  }
  return [];
}

/**
 * Every authored string in an action, with the path it sits at, for attributing
 * a finding to a block.
 *
 * Transitions are included, not just Parameters. A condition operand is
 * authored content like any other, and scanning only Parameters left a literal
 * ARN or a malformed token in `Transitions.Conditions[n].Condition.Operands`
 * completely undetected. Identifiers appearing here cannot produce false
 * positives: Connect forbids ":" in an Identifier, so a NextAction can never
 * look like an ARN or a token.
 */
/**
 * Authored strings that belong to the document rather than to any one action:
 * today that is `content.Metadata`.
 *
 * materialize carries Metadata into deployable output and resolves tokens in
 * it, so it is authored content by any reasonable reading, but nothing scanned
 * it. A literal ARN placed there passed every gate and reached both deploy
 * paths, including @flow-as-code/cdk, which refuses the identical ARN in Parameters.
 */
export function documentStrings(doc: FlowDoc): [string, string][] {
  if (doc.content.Metadata === undefined) return [];
  return walkStrings(doc.content.Metadata, "content.Metadata");
}

export function findingsForActions(
  doc: FlowDoc,
): { action: FlowAction; strings: [string, string][] }[] {
  return doc.content.Actions.map((action) => ({
    action,
    strings: [...walkStrings(action.Parameters), ...walkStrings(action.Transitions, "Transitions")],
  }));
}
