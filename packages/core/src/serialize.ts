/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Deterministic serialization. Invariant 1 of the FlowDoc spec: same inputs,
// byte-identical output. Two authorings of the same flow must produce the same
// bytes, so key order is fixed rather than insertion-dependent.

import type { FlowAction, FlowDoc, Transitions } from "./flowdoc.js";

/** Recursively sorts object keys. Arrays keep their order, which is meaningful. */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
}

/** Emits keys in the given order, then anything else alphabetically. */
export function ordered<T extends Record<string, unknown>>(value: T, keys: (keyof T)[]): T {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (value[k as string] !== undefined) out[k as string] = value[k as string];
  }
  for (const k of Object.keys(value).sort()) {
    if (!keys.includes(k) && value[k] !== undefined) out[k] = value[k];
  }
  return out as T;
}

function canonicalTransitions(t: Transitions): Transitions {
  // The arrays' ELEMENTS need canonicalizing too. Ordering only the top level
  // copied Errors and Conditions by reference, so { ErrorType, NextAction } and
  // { NextAction, ErrorType } serialized to different bytes: two authorings of
  // the same flow produced different output, and downstream a different
  // CloudFormation logical id.
  const canonical: Record<string, unknown> = { ...(t as Record<string, unknown>) };
  if (t.Errors !== undefined) {
    canonical.Errors = t.Errors.map((e) => ordered({ ...e }, ["ErrorType", "NextAction"]));
  }
  if (t.Conditions !== undefined) {
    canonical.Conditions = t.Conditions.map((c) =>
      ordered(
        {
          NextAction: c.NextAction,
          Condition: ordered({ ...c.Condition }, ["Operator", "Operands"]),
        },
        ["NextAction", "Condition"],
      ),
    );
  }
  return ordered(canonical, ["NextAction", "Errors", "Conditions"]) as unknown as Transitions;
}

export function canonicalAction(a: FlowAction): FlowAction {
  return {
    Identifier: a.Identifier,
    Type: a.Type,
    // Parameters are opaque to us for GenericBlocks, so sort for stability.
    Parameters: sortKeys(a.Parameters) as Record<string, unknown>,
    Transitions: canonicalTransitions(a.Transitions),
  };
}

/**
 * Canonical in-memory form. Key order below is the byte order of the output.
 */
export function canonicalize(doc: FlowDoc): FlowDoc {
  const out: Record<string, unknown> = {
    flowdoc: doc.flowdoc,
    kind: doc.kind,
    name: doc.name,
    connectType: doc.connectType,
    content: ordered(
      {
        Version: doc.content.Version,
        StartAction: doc.content.StartAction,
        ...(doc.content.Settings === undefined ? {} : { Settings: sortKeys(doc.content.Settings) }),
        ...(doc.content.Metadata === undefined ? {} : { Metadata: sortKeys(doc.content.Metadata) }),
        Actions: doc.content.Actions.map(canonicalAction),
      } as Record<string, unknown>,
      ["Version", "StartAction", "Settings", "Metadata", "Actions"],
    ),
  };
  if (doc.layout !== undefined) out.layout = sortKeys(doc.layout);
  if (doc.refs !== undefined)
    out.refs = doc.refs.map((r) => ordered({ ...r }, ["token", "type", "name", "alias"]));
  if (doc.meta !== undefined) out.meta = sortKeys(doc.meta);
  return out as unknown as FlowDoc;
}

/** Canonical JSON text, two-space indented, newline terminated. */
export function serialize(doc: FlowDoc): string {
  return JSON.stringify(canonicalize(doc), null, 2) + "\n";
}
