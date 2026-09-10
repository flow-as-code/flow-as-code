/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Materialization: FlowDoc in, deployable Flow language content out.
//
// Two backends resolve `${cdref:...}` tokens (SPEC.md, Materialization):
//   - materializeWithMap: strict lookup in a token -> value map; every missing
//     token is reported at once in a MaterializeError.
//   - materializeWithBinder: the binder returns opaque strings (CDK or
//     CloudFormation tokens). They pass through byte-for-byte with no
//     validation and no arn-shape checks, because intrinsics are resolved by
//     CloudFormation long after this code runs.
//
// Both backends emit content ONLY: `layout`, `refs`, and `meta` are tool
// metadata and are dropped. Before dropping, `layout` is projected into
// `content.Metadata` so the flow lays out correctly in the Connect console
// (docs/01-flowdoc-spec.md). The Metadata shape follows the Flow language
// example, which uses EntryPointPosition and ActionMetadata.<id>.Position:
// https://docs.aws.amazon.com/connect/latest/devguide/flow-language-example.html

import type { FlowAction, FlowContent, FlowDoc, Point, RefEntry } from "./flowdoc.js";
import { InvalidFlowDocError, assertFlowDoc } from "./flowdoc.js";
import { autoLayout } from "./layout.js";
import { collectRefs, lookupRefValue, parseToken, refMapKeys } from "./refs.js";
import { canonicalAction, ordered, sortKeys } from "./serialize.js";

/**
 * One sentence naming the three key forms a reference map accepts, worked
 * through the first reference that is missing so the reader can copy it.
 *
 * The three forms are the emitter's (packages/core/src/refs.ts). Saying so at
 * the point of failure is the difference between "your map is incomplete" and
 * "your map is wrong", which matters because a map keyed the way
 * `@flow-as-code/tf`'s own TODO comment teaches used to be rejected here with
 * no hint that a different spelling would have worked.
 */
function keyFormsSentence(missingRefs: readonly RefEntry[]): string {
  const first = missingRefs[0];
  if (first === undefined) return "";
  const [tokenForm, keyForm, variableForm] = refMapKeys(first);
  return (
    ` Key each one by its token ("${tokenForm}"), by type and name ("${keyForm}"), ` +
    `or by the variable the terraform emitter writes ("${variableForm}").`
  );
}

/**
 * Strict map materialization failed: one or more tokens in the document have
 * no entry in the resource map. `missingTokens` is sorted and complete, so a
 * caller fixes the map once, not one missing key per run.
 *
 * `missingRefs` carries the same references parsed, and is what lets the
 * message name the key forms the map could have used. It is empty for the other
 * failure this error reports, a token that survived materialization, where the
 * map is not the problem.
 */
export class MaterializeError extends Error {
  readonly missingTokens: readonly string[];
  readonly missingRefs: readonly RefEntry[];

  constructor(
    missingTokens: readonly string[],
    reason?: string,
    missingRefs: readonly RefEntry[] = [],
  ) {
    super(
      reason === undefined
        ? `Cannot materialize: ${String(missingTokens.length)} unmapped token(s): ` +
            missingTokens.join(", ") +
            keyFormsSentence(missingRefs)
        : `Cannot materialize: ${reason} Offending token(s): ${missingTokens.join(", ")}`,
    );
    this.name = "MaterializeError";
    this.missingTokens = missingTokens;
    this.missingRefs = missingRefs;
  }

  /** The error for references no key form of the map matched. */
  static missingKeys(missingRefs: readonly RefEntry[]): MaterializeError {
    return new MaterializeError(
      missingRefs.map((entry) => entry.token),
      undefined,
      missingRefs,
    );
  }
}

/**
 * A reference token occupies an entire field value and is never interpolated
 * into a longer string (FlowDoc invariant 4), so replacement only ever swaps
 * whole string values. Binder output is inserted exactly as returned.
 */
function resolveDeep(value: unknown, resolve: (entry: RefEntry) => string): unknown {
  if (typeof value === "string") {
    const entry = parseToken(value);
    return entry === undefined ? value : resolve(entry);
  }
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, resolve));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        resolveDeep(v, resolve),
      ]),
    );
  }
  return value;
}

/** How far left of the StartAction block the console entry point marker sits. */
const ENTRY_POINT_OFFSET_X = 100;

/**
 * Projects `layout` into the Metadata shape the console reads. Positions come
 * from the document's layout; any action without one gets the same
 * deterministic auto-layout synth would have assigned. Keys an imported
 * document may already carry in content.Metadata are preserved; only the
 * position keys are overwritten, because `layout` is the single source of
 * truth for position (docs/01-flowdoc-spec.md).
 */
function projectLayout(
  doc: FlowDoc,
  resolve: (entry: RefEntry) => string,
): Record<string, unknown> {
  const actions = doc.content.Actions;
  const layout = doc.layout ?? {};
  const missing = actions.some((a) => layout[a.Identifier] === undefined);
  const auto = missing ? autoLayout(actions) : {};

  // Pre-existing Metadata (an imported document, say) is carried through, and
  // it is RESOLVED like everything else: the strictness check scans the whole
  // content, so substitution must cover the whole content too, or a token
  // could survive into deployable output.
  const existing = resolveDeep(doc.content.Metadata ?? {}, resolve) as Record<string, unknown>;
  const existingRaw = existing.ActionMetadata;
  const existingActionMetadata =
    existingRaw !== null && typeof existingRaw === "object" && !Array.isArray(existingRaw)
      ? (existingRaw as Record<string, unknown>)
      : {};

  // Start from what was already there (entries for unknown ids survive; never
  // drop content), then overlay Position per action: layout is the single
  // source of truth for position, but sibling keys inside an entry are kept.
  const actionMetadata: Record<string, unknown> = { ...existingActionMetadata };
  const positions: Record<string, Point> = {};
  for (const a of actions) {
    const p = layout[a.Identifier] ?? auto[a.Identifier] ?? { x: 0, y: 0 };
    positions[a.Identifier] = p;
    const prior = actionMetadata[a.Identifier];
    const priorEntry =
      prior !== null && typeof prior === "object" && !Array.isArray(prior)
        ? (prior as Record<string, unknown>)
        : {};
    actionMetadata[a.Identifier] = { ...priorEntry, Position: { x: p.x, y: p.y } };
  }

  // The example places the entry point marker left of the first block
  // (EntryPointPosition x=88 vs first Action x=270).
  const start = positions[doc.content.StartAction] ?? { x: 0, y: 0 };
  const entryPointPosition = { x: Math.max(start.x - ENTRY_POINT_OFFSET_X, 0), y: start.y };

  return {
    ...existing,
    EntryPointPosition: entryPointPosition,
    ActionMetadata: actionMetadata,
  };
}

function materialize(doc: FlowDoc, resolve: (entry: RefEntry) => string): FlowContent {
  // A module requires a top-level Settings in its deployable content; Connect
  // rejects the create without it. Default to {} when the doc does not carry
  // one; resolve tokens in it for consistency with the rest of the content.
  const settings =
    doc.kind === "module" || doc.content.Settings !== undefined
      ? (resolveDeep(doc.content.Settings ?? {}, resolve) as Record<string, unknown>)
      : undefined;
  return {
    Version: doc.content.Version,
    StartAction: doc.content.StartAction,
    ...(settings === undefined ? {} : { Settings: settings }),
    Metadata: projectLayout(doc, resolve),
    Actions: doc.content.Actions.map((a) => resolveDeep(a, resolve) as FlowAction),
  };
}

/**
 * Strict materialization against a reference map. Every reference in the
 * content must have an entry under one of the three key forms
 * (packages/core/src/refs.ts); otherwise a MaterializeError lists ALL missing
 * references (sorted), not just the first, and names the forms it would have
 * taken. Mapped values are not validated: at this point literal ARNs are the
 * goal, not a mistake.
 */
export function materializeWithMap(doc: FlowDoc, resourceMap: Record<string, string>): FlowContent {
  assertFlowDoc(doc, "materializeWithMap");
  if (typeof resourceMap !== "object" || resourceMap === null || Array.isArray(resourceMap)) {
    throw new InvalidFlowDocError(
      "materializeWithMap expects a token to value map object as its second argument.",
    );
  }
  const missing = collectRefs(doc.content).filter(
    (entry) => lookupRefValue(resourceMap, entry) === undefined,
  );
  if (missing.length > 0) throw MaterializeError.missingKeys(missing);

  const content = materialize(doc, (entry) => lookupRefValue(resourceMap, entry) as string);

  // Completeness is not enough. collectRefs finds a token anywhere in a string
  // while substitution only replaces a whole-value token, so an interpolated
  // token used to satisfy the check above and then survive into deployable
  // output as literal text that Connect would read aloud. Refusing here means
  // render and emit, which do not run lint, cannot ship one either.
  const leaked = [...new Set(JSON.stringify(content).match(/\$\{cdref:[^}"]*\}/g) ?? [])].sort();
  if (leaked.length > 0) {
    throw new MaterializeError(
      leaked,
      "Token(s) survived materialization because they are embedded in a longer string. " +
        "A reference must be the entire field value (FlowDoc invariant 4).",
    );
  }
  return content;
}

/**
 * Binder materialization for IaC backends (@flow-as-code/cdk). The binder returns an
 * opaque string per reference, typically a CDK token that CloudFormation later
 * resolves to an ARN. Output passes through exactly as returned, with no
 * validation and no arn-shape lint (SPEC.md, Materialization).
 */
export function materializeWithBinder(
  doc: FlowDoc,
  binder: (ref: RefEntry) => string,
): FlowContent {
  assertFlowDoc(doc, "materializeWithBinder");
  if (typeof binder !== "function") {
    throw new InvalidFlowDocError(
      "materializeWithBinder expects a binder function as its second argument.",
    );
  }
  return materialize(doc, binder);
}

// --- Deterministic serialization of deployable content -----------------------
// Mirrors serialize.ts: fixed first-class key order, alphabetical for the
// rest, two-space indent, trailing newline. Byte-identical for the same
// content regardless of insertion order.

/**
 * Canonical JSON text of deployable content, two-space indented, newline
 * terminated. Metadata leads with EntryPointPosition then ActionMetadata,
 * matching the Flow language example; everything nested is key-sorted.
 */
export function serializeContent(content: FlowContent): string {
  const canonical = ordered(
    {
      Version: content.Version,
      StartAction: content.StartAction,
      ...(content.Settings === undefined ? {} : { Settings: sortKeys(content.Settings) }),
      ...(content.Metadata === undefined
        ? {}
        : {
            Metadata: ordered(sortKeys(content.Metadata) as Record<string, unknown>, [
              "EntryPointPosition",
              "ActionMetadata",
            ]),
          }),
      Actions: content.Actions.map(canonicalAction),
    },
    ["Version", "StartAction", "Settings", "Metadata", "Actions"],
  );
  return JSON.stringify(canonical, null, 2) + "\n";
}
