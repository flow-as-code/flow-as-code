/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  autoLayout,
  collectRefs,
  modeledEntry,
  serialize,
  type FlowAction,
  type FlowDoc,
} from "@flow-as-code/core";

/**
 * Rule 18's transitions: `Errors` and `Conditions` present on every action
 * with anything wired and on every modeled, non-terminal type; `{}` on an
 * action with nothing wired whose type is terminal or unmodeled. An exported
 * flow keeps what Connect returned, which for API-authored content can be
 * `Errors` without `Conditions`.
 */
function normalTransitions(action: FlowAction): FlowAction {
  const t = action.Transitions;
  const errors = t.Errors ?? [];
  const conditions = t.Conditions ?? [];
  const bare = modeledEntry(action.Type);
  const idle = t.NextAction === undefined && errors.length === 0 && conditions.length === 0;
  return {
    ...action,
    Transitions:
      idle && (bare === undefined || bare.terminal)
        ? {}
        : { ...t, Errors: errors, Conditions: conditions },
  };
}

/**
 * What any view of a document holds (conformance/hcl/README.md rule 26): the
 * synth normal form, which derives refs, gives a module its Settings, writes
 * rule 18's transitions and lays out every action, less content.Metadata,
 * which no view authors, with positions rounded to the integers the canvas
 * and the provider use.
 */
export function viewed(doc: FlowDoc): FlowDoc {
  const { Metadata: _metadata, ...rest } = doc.content;
  const content = { ...rest, Actions: rest.Actions.map(normalTransitions) };
  if (doc.kind === "module") content.Settings ??= {};
  const auto = autoLayout(content.Actions, content.StartAction);
  const layout = Object.fromEntries(
    content.Actions.map((a) => {
      const p = doc.layout?.[a.Identifier] ?? auto[a.Identifier]!;
      return [a.Identifier, { x: Math.round(p.x), y: Math.round(p.y) }];
    }),
  );
  return { ...doc, content, layout, refs: collectRefs(content) };
}

/** A document without meta, in canonical bytes: what the invariant compares. */
export function bytes(doc: FlowDoc): string {
  const { meta: _meta, ...rest } = doc;
  return serialize(rest as FlowDoc);
}
