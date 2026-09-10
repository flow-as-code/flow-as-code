/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Usage index behind the refs sidebar (docs/02-studio-design.md: "A refs
// sidebar lists every token in the doc with usage counts").
//
// Counted from content, not from doc.refs: the index is derived data, and the
// sidebar must describe what the actions actually hold even if an index were
// ever stale.

import type { FlowDoc, RefEntry, RefType } from "@flow-as-code/core";
import { collectRefs } from "@flow-as-code/core";

export interface RefUsage extends RefEntry {
  /** Total occurrences across every action, parameters and transitions alike. */
  count: number;
  /** Identifiers of the actions holding it, in document order, deduplicated. */
  actions: string[];
}

function occurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  let n = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return n;
    n++;
    from = at + needle.length;
  }
}

/**
 * Every token in the doc with its type, name, alias, usage count, and the
 * actions that use it. Sorted by token, the same stable order collectRefs
 * produces, so the sidebar never reorders under an edit.
 */
export function refUsage(doc: FlowDoc): RefUsage[] {
  const entries = collectRefs(doc.content);
  // The WHOLE action, not just its Parameters. collectRefs walks all of the
  // content, so a token used only in a condition operand was listed in the
  // sidebar with a count of 0 and read as dead. Identifier and Type cannot
  // contain a token ("$", ":" and "{" are forbidden in an Identifier), so
  // widening the scan cannot invent a hit.
  const perAction = doc.content.Actions.map((a) => ({
    id: a.Identifier,
    json: JSON.stringify(a),
  }));

  return entries.map((entry) => {
    let count = 0;
    const actions: string[] = [];
    for (const { id, json } of perAction) {
      const hits = occurrences(json, entry.token);
      if (hits === 0) continue;
      count += hits;
      actions.push(id);
    }
    return { ...entry, count, actions };
  });
}

/** Group heading order in the sidebar. */
export const REF_TYPE_ORDER: readonly RefType[] = [
  "queue",
  "hours",
  "lambda",
  "lex",
  "prompt",
  "flow",
  "module",
];
