/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Reference tokens. A reference occupies an entire field value and is never
// interpolated into a longer string: Connect requires the fields that hold
// references to be "either fully static or a single valid JSONPath
// identifier". See conformance/flow-language/actions.md.

import { REFERENCE_FIELDS } from "./actions.js";
import type { RefEntry, RefType } from "./flowdoc.js";
import { SLUG_PATTERN } from "./flowdoc.js";
import { readPath, type PathHit } from "./paths.js";

/**
 * A reference token, branded with the kind of resource it points at, so a
 * queue cannot be passed where a Lambda is expected.
 */
export type Ref<T extends RefType = RefType> = string & { readonly __ref: T };

/** A single JSONPath identifier, the dynamic alternative to a reference. */
export type JsonPath = string & { readonly __jsonPath: true };

/** A value legal in a reference-bearing parameter. */
export type RefValue<T extends RefType> = Ref<T> | JsonPath;

export const TOKEN_PATTERN =
  /^\$\{cdref:(queue|hours|lambda|lex|prompt|flow|module|view):([a-z0-9]+(?:-[a-z0-9]+)*)(?:@([a-z0-9]+(?:-[a-z0-9]+)*))?\}$/;

/** Where a token can begin; `parseToken` decides whether what follows is one. */
const TOKEN_OPEN = "${cdref:";

/**
 * Every candidate token in a string, for building the refs index: each
 * `${cdref:` up to the next `}`. A hand-written scan rather than a regex: the
 * scan runs over a whole serialized document, and a pattern with an unbounded
 * class before its closing brace was flagged by code scanning as polynomial on
 * a run of openings with no close. This is one pass, each opening visited
 * once, and `parseToken` is the only judge of what is a token.
 */
function tokenCandidates(text: string): string[] {
  const out: string[] = [];
  let open = text.indexOf(TOKEN_OPEN);
  // Both searches only ever move forward: the next opening starts after this
  // one, and the closing brace is looked up again only once the opening has
  // passed it, so a run of openings sharing one close costs one search.
  let close = -1;
  while (open !== -1) {
    const body = open + TOKEN_OPEN.length;
    if (close < body) close = text.indexOf("}", body);
    if (close === -1) return out;
    out.push(text.slice(open, close + 1));
    open = text.indexOf(TOKEN_OPEN, open + 1);
  }
  return out;
}

const JSONPATH_PATTERN = /^\$\.[A-Za-z0-9_$.[\]'-]+$/;

function assertSlug(kind: string, value: string): void {
  if (!SLUG_PATTERN.test(value)) {
    throw new Error(
      `Invalid ${kind} "${value}". Names must be lowercase words separated by single hyphens.`,
    );
  }
}

/**
 * The token for a reference, built from its parts. `Refs.queue("front-desk")`
 * and the six siblings beside it are this function with the type fixed, which
 * is the form to reach for in a builder file; this generic one is for code that
 * has a `RefType` in a variable, such as a round trip through `parseToken`.
 * Both names are rejected unless they are slugs, so a token is never malformed.
 */
export function token<T extends RefType>(type: T, name: string, alias?: string): Ref<T> {
  assertSlug(`${type} name`, name);
  if (alias !== undefined) assertSlug("module alias", alias);
  const suffix = alias === undefined ? "" : `@${alias}`;
  return `\${cdref:${type}:${name}${suffix}}` as Ref<T>;
}

export const Refs = {
  queue: (name: string): Ref<"queue"> => token("queue", name),
  hours: (name: string): Ref<"hours"> => token("hours", name),
  lambda: (name: string): Ref<"lambda"> => token("lambda", name),
  lex: (name: string): Ref<"lex"> => token("lex", name),
  prompt: (name: string): Ref<"prompt"> => token("prompt", name),
  flow: (name: string): Ref<"flow"> => token("flow", name),
  /** Module references carry an alias so a flow can pin which version it invokes. */
  module: (name: string, alias: string): Ref<"module"> => token("module", name, alias),
  /**
   * A view, optionally pinned to a version. The console writes the version
   * into the ARN (`arn:aws:connect:<region>:aws:view/after-contact-work:1`),
   * so the token carries it in the alias slot: `${cdref:view:after-contact-work@1}`.
   * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-showview.html
   */
  view: (name: string, version?: string): Ref<"view"> => token("view", name, version),
} as const;

/** Wraps a JSONPath expression for use in a reference-bearing parameter. */
export function jsonPath(path: string): JsonPath {
  if (!JSONPATH_PATTERN.test(path)) {
    throw new Error(
      `Invalid JSONPath "${path}". Expected a single identifier such as $.Attributes.queueId.`,
    );
  }
  return path as JsonPath;
}

export function isToken(value: unknown): value is Ref {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function parseToken(value: string): RefEntry | undefined {
  const m = TOKEN_PATTERN.exec(value);
  if (!m) return undefined;
  const [, type, name, alias] = m;
  const entry: RefEntry = { token: value, type: type as RefType, name: name! };
  if (alias !== undefined) entry.alias = alias;
  return entry;
}

// --- Reference-bearing paths -------------------------------------------------
//
// REFERENCE_FIELDS names each reference-bearing field by a catalog path (see
// paths.ts), because the fields the modeled set grows into sit inside objects,
// list elements and map values, which a flat key cannot name.

/** A reference-bearing field of an action type, by path. */
export interface RefPath {
  path: string;
  ref: RefType;
}

/** The reference-bearing paths of an action type, in table order; empty when it has none. */
export function refPathsOf(type: string): RefPath[] {
  return Object.entries(REFERENCE_FIELDS[type] ?? {}).map(([path, ref]) => ({ path, ref }));
}

/** Every value at a reference-bearing path within an action's Parameters. */
export function readRefPath(params: Record<string, unknown>, path: string): PathHit[] {
  return readPath(params, path);
}

// --- Reference map keys ------------------------------------------------------
//
// A reference map (`render --resources`, `simulate --resource-map`, `emit
// --target tf --address-map`) is keyed by reference, and there are three ways a
// person reasonably writes one down. All three are accepted everywhere, because
// a map written for one command and rejected by the next reads as a tool bug
// rather than as a rule: `@flow-as-code/tf` has always taken all three, its own
// TODO comment teaches the middle one, and `render` used to take only the first.
//
//   ${cdref:module:survey@prod}   the token, exactly as it appears in the document
//   module:survey@prod            the token without its wrapper (refKey)
//   module_survey_prod_arn        the variable @flow-as-code/tf emits (refVariableName)
//
// The forms cannot collide: a token is the only one with `${`, and no slug
// contains `:` or `@`, so nothing but a refKey has one.

/**
 * A slug as an identifier: hyphens become underscores, and a leading digit
 * takes an underscore prefix.
 *
 * A slug may start with a digit (SLUG_PATTERN allows it) but Terraform
 * identifiers may not: OpenTofu rejects `resource "aws_connect_contact_flow"
 * "2fa_line"` with "Invalid resource name". Deterministic and collision-free
 * against other slugs, since no slug can contain an underscore.
 */
export function slugIdentifier(slug: string): string {
  const underscored = slug.replaceAll("-", "_");
  return /^[0-9]/.test(underscored) ? `_${underscored}` : underscored;
}

/** `queue:front-desk`, `module:survey@prod`: the token without its wrapper. */
export function refKey(entry: RefEntry): string {
  return `${entry.type}:${entry.name}${entry.alias === undefined ? "" : `@${entry.alias}`}`;
}

/**
 * `queue_front_desk_arn`, `module_survey_prod_arn`: the name `@flow-as-code/tf`
 * gives the reference in `local.flow_refs`, with the module alias folded in.
 * Stable by contract, and single-sourced here so the name a map may be keyed by
 * and the name the emitter writes cannot drift apart.
 */
export function refVariableName(entry: RefEntry): string {
  const alias = entry.alias === undefined ? "" : `_${slugIdentifier(entry.alias)}`;
  return `${entry.type}_${slugIdentifier(entry.name)}${alias}_arn`;
}

/** The three key forms a reference map may use for one reference, in lookup order. */
export function refMapKeys(entry: RefEntry): [string, string, string] {
  return [entry.token, refKey(entry), refVariableName(entry)];
}

/**
 * The value a reference map holds for a reference, whichever of the three forms
 * keys it, or undefined when none of them does.
 *
 * Presence rather than truthiness, so a deliberately empty value counts as
 * mapped: this same call decides both what a reference resolves to and whether
 * the map is complete, and the two must not disagree.
 */
export function lookupRefValue(
  map: Readonly<Record<string, string>>,
  entry: RefEntry,
): string | undefined {
  for (const key of refMapKeys(entry)) {
    if (Object.hasOwn(map, key)) return map[key];
  }
  return undefined;
}

/** What a map is missing for a reference, written so the reader can fix it. */
export function describeMissingRefKey(entry: RefEntry): string {
  const [tokenForm, keyForm, variableForm] = refMapKeys(entry);
  return `${tokenForm} (key it as "${tokenForm}", "${keyForm}", or "${variableForm}")`;
}

/**
 * Derived index of every token in a document, sorted by token so the output is
 * stable. Regenerated on save; never hand-maintained.
 */
export function collectRefs(value: unknown): RefEntry[] {
  const found = new Map<string, RefEntry>();
  for (const raw of tokenCandidates(JSON.stringify(value ?? null))) {
    const entry = parseToken(raw);
    if (entry) found.set(entry.token, entry);
  }
  return [...found.values()].sort((a, b) => (a.token < b.token ? -1 : a.token > b.token ? 1 : 0));
}
