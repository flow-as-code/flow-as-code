/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The action catalog: conformance/flow-language/catalog.json as typed data.
//
// The catalog is the machine-readable twin of conformance/flow-language/
// actions.md and the single source for every per-type fact both languages
// need: block name, parameters with their HCL attribute names and kinds,
// reference-bearing paths, terminal-ness, flow-type restrictions, and the
// errors and conditions each action carries. The Go provider generates its
// resource schema from it; this package keeps its own tables in src/actions.ts
// (with a citation beside every entry) and catalog.test.ts holds them to the
// catalog, so the two cannot drift.
//
// ./catalog/catalog.json is a byte copy of the conformance file, kept inside
// src because the conformance tree is not published and because the lint
// rules that read it run in the studio's worker, where nothing may touch the
// filesystem. `npm run sync:schema` refreshes it; catalog.test.ts fails if
// the two differ.

import type { RefType } from "./flowdoc.js";
import data from "./catalog/catalog.json" with { type: "json" };

export type ParameterKind =
  | "string"
  | "integer"
  | "integerString"
  | "enum"
  | "ref"
  | "jsonPath"
  | "stringOrJsonPath"
  | "map"
  | "list"
  | "object"
  | "json";

export interface CatalogConstraint {
  rule: "exactlyOne" | "atMostOne" | "neverBoth";
  keys: readonly string[];
}

/** The shape of a value: a parameter without its key, as list elements are. */
export interface CatalogElement {
  kind: ParameterKind;
  /** enum */
  values?: readonly string[];
  /** ref */
  ref?: RefType;
  /** object */
  fields?: readonly CatalogParameter[];
  constraints?: readonly CatalogConstraint[];
  /** list */
  of?: CatalogElement;
  /** integer and integerString */
  min?: number;
  max?: number;
}

export interface CatalogParameter extends CatalogElement {
  /** The Flow language key. */
  key: string;
  /** The HCL attribute name, always snakeCaseKey(key). */
  attr: string;
  required: boolean;
}

export interface CatalogRef {
  /** A catalog path (see paths.ts) into Parameters. */
  path: string;
  ref: RefType;
}

export interface CatalogError {
  type: string;
  /** Whether error-branches reports the branch as missing. */
  required: boolean;
  /** Free text from the action page, when the error exists only in some forms. */
  when?: string;
}

/** `required`, `none`, `mirrors:error:<type>`, or `mirrors:condition:<operand>`. */
export type NextRule = string;
export type ConditionsKind = "none" | "boolean" | "dtmf" | "custom";

export interface CatalogTransitions {
  next: NextRule;
  conditions: ConditionsKind;
  /** In the order the builder emits them. */
  errors: readonly CatalogError[];
}

export type ActionCategory = "contact" | "participant" | "flowControl" | "interaction";

export interface ModeledAction {
  category: ActionCategory;
  doc: string;
  modeled: true;
  /** The HCL sub-block name, snakeCaseKey of the Type. */
  block: string;
  terminal: boolean;
  /** ConnectType values the action is legal in, or the recorded absence of a restriction. */
  flowTypes: readonly string[] | "unrestricted";
  parameters: readonly CatalogParameter[];
  constraints?: readonly CatalogConstraint[];
  refs: readonly CatalogRef[];
  /** Paths whose string is billed prompt text (Text and SSML forms). */
  textBodies?: readonly string[];
  /** Paths whose non-blank string means the participant hears something. */
  announces?: readonly string[];
  /** Path to a list whose non-empty value turns recording on. */
  recordingEnabler?: string;
  transitions: CatalogTransitions;
}

export interface UnmodeledAction {
  category: ActionCategory;
  doc: string;
  modeled: false;
}

export type CatalogAction = ModeledAction | UnmodeledAction;

export interface ActionCatalog {
  catalog: string;
  recorded: string;
  flowLanguage: { version: string; root: string; actions: string };
  categories: Readonly<Record<ActionCategory, { doc: string; types: readonly string[] }>>;
  refTypes: readonly RefType[];
  flowTypeGroups: Readonly<Record<string, readonly string[]>>;
  actions: Readonly<Record<string, CatalogAction>>;
}

export const actionCatalog: ActionCatalog = data as unknown as ActionCatalog;

export function catalogEntry(type: string): CatalogAction | undefined {
  return Object.hasOwn(actionCatalog.actions, type) ? actionCatalog.actions[type] : undefined;
}

/** The entry for a modeled type, or undefined for an unmodeled or unknown one. */
export function modeledEntry(type: string): ModeledAction | undefined {
  const entry = catalogEntry(type);
  return entry !== undefined && entry.modeled ? entry : undefined;
}

/** Every modeled type, in catalog order. */
export function modeledTypes(): string[] {
  return Object.entries(actionCatalog.actions)
    .filter(([, a]) => a.modeled)
    .map(([type]) => type);
}

/** Error branches a document must wire on an action of this type; empty when none. */
export function requiredErrors(type: string): string[] {
  return (modeledEntry(type)?.transitions.errors ?? [])
    .filter((e) => e.required)
    .map((e) => e.type);
}

/** Paths that hold billed prompt text; empty for actions that play nothing. */
export function textBodyPaths(type: string): readonly string[] {
  return modeledEntry(type)?.textBodies ?? [];
}

/** Paths whose non-blank string means the participant is played something. */
export function announcePaths(type: string): readonly string[] {
  return modeledEntry(type)?.announces ?? [];
}

/** The list whose non-empty value enables recording, when the action can. */
export function recordingEnablerPath(type: string): string | undefined {
  return modeledEntry(type)?.recordingEnabler;
}
