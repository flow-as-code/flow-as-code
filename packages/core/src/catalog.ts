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
  /** list: the element shape; map: the value shape, when it is not a string */
  of?: CatalogElement;
  /** integer and integerString: the value's bounds; list and map: the entry count's. */
  min?: number;
  max?: number;
  /** map: the keys the page allows, when it lists them. */
  keys?: readonly string[];
  /**
   * The page also accepts a single JSONPath identifier in this position
   * ("fully static or fully dynamic"). The kind describes the static form.
   */
  dynamic?: boolean;
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
  /**
   * Whether a form the builder models wires this branch, which is also the
   * vocabulary the studio offers when a drag from the error handle looks for a
   * branch to create. False for an error that exists only in a form the
   * builder does not model. A type with more than one modeled form
   * (GetParticipantInput) flags the union; builderErrorsFor narrows it to the
   * form an action is in. The stored form wires InvalidPhoneNumber on every
   * phone number validation, before the catch-all (actions.md, rule 13).
   */
  builder: boolean;
  /** Free text from the action page, when the error exists only in some forms. */
  when?: string;
  /**
   * A top-level Parameters key whose presence makes the branch required
   * (UpdateContactRecordingAndAnalyticsBehavior's
   * InFlightRedactionConfigurationFailed with ChatBehavior); error-branches
   * reports it missing on such an action. `required` stays false: the
   * branch is not required on every form.
   */
  requiredWhenKey?: string;
}

/** `required`, `none`, `mirrors:error:<type>`, or `mirrors:condition:<operand>`. */
export type NextRule = string;

/**
 * What an action's Conditions may hold:
 *   none     no conditions at all
 *   fixed    exactly the Equals conditions conditionOperands lists, no others
 *   dtmf     Equals on one key each, 0 to 9, * or #
 *   enum     Equals on values the action defines at run time (intent names,
 *            view actions, events), one branch each
 *   numeric  the Number* operators over a value the action produces
 *   custom   any operator over any operand, as Compare takes
 */
export type ConditionsKind = "none" | "fixed" | "dtmf" | "enum" | "numeric" | "custom";

export interface CatalogTransitions {
  next: NextRule;
  conditions: ConditionsKind;
  /**
   * The fewest conditions the service accepts, when it refuses an action
   * without any (CheckMetricData, observed 2026-09-29). error-branches
   * reports an action with fewer.
   */
  minConditions?: number;
  /**
   * For kind fixed: the operands, in the order the builder emits them. For
   * kind enum: the operands the page names, when it names them, in the order
   * the studio offers them.
   */
  conditionOperands?: readonly string[];
  /** In the order the builder emits them. */
  errors: readonly CatalogError[];
  /**
   * The action holds the participant until something outside the flow moves
   * them on (an agent answers, an interrupt fires), so a flow may end in it:
   * the console's hold flows do. terminal-blocks treats such an action with
   * no NextAction as an end, whatever its error and interrupt branches wire.
   * A waiting type has `next: none`, which catalog.test.ts holds.
   */
  waits?: boolean;
}

/**
 * Which Developer Guide category page lists the type (contact, participant,
 * flowControl, interaction), or `other`: a type no category page lists, known
 * from an admin-guide block page or a console export (see `CatalogSource`).
 */
export type ActionCategory = "contact" | "participant" | "flowControl" | "interaction" | "other";

/**
 * Where a type's `doc` comes from. Absent means `devguide`: the entry's page
 * is on one of the four Developer Guide category pages. `adminguide` is an
 * Administrator Guide block page that names the Type. `console-export` is a
 * Type no AWS page documents, known from a console export kept under
 * `conformance/`; its `doc` is that export's repository path, or the API
 * Reference page once one exists.
 */
export type CatalogSource = "devguide" | "adminguide" | "console-export";

/**
 * A contact channel, as the service's Channel enum spells it.
 * https://docs.aws.amazon.com/connect/latest/APIReference/API_Contact.html
 */
export type Channel = "VOICE" | "CHAT" | "TASK" | "EMAIL";

/**
 * A shape an action must take when one of its parameters has, or lacks, a
 * static value: GetParticipantInput with StoreInput "True" needs
 * InputValidation and takes no conditions. The conditional-shape lint rule
 * reads these. An absent parameter counts as not equal to any value.
 */
export interface CatalogShape {
  when: { key: string; equals?: string; notEquals?: string };
  requires?: { parameters?: readonly string[]; errors?: readonly string[] };
  forbids?: { parameters?: readonly string[]; errors?: readonly string[]; conditions?: boolean };
  /** Where the rule comes from: the action's page, or an observation with its date. */
  source: string;
}

export interface ModeledAction {
  category: ActionCategory;
  doc: string;
  modeled: true;
  source?: CatalogSource;
  /** The HCL sub-block name, snakeCaseKey of the Type. */
  block: string;
  terminal: boolean;
  /** ConnectType values the action is legal in, or the recorded absence of a restriction. */
  flowTypes: readonly string[] | "unrestricted";
  /**
   * The channels the action's page says it supports, when it names any
   * (Wait and ShowView: "only ... the chat channel"). Absent means the page
   * states no channel restriction. A document does not record which channels
   * its flow serves, so channel-restricted-action reports a warning, not an
   * error, wherever such an action appears.
   */
  channels?: readonly Channel[];
  parameters: readonly CatalogParameter[];
  constraints?: readonly CatalogConstraint[];
  /** Parameter-dependent shapes; see CatalogShape. */
  shapes?: readonly CatalogShape[];
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
  source?: CatalogSource;
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

/**
 * The error branches a document must wire on this action: the always
 * required ones and those required by a parameter the action carries
 * (`requiredWhenKey`), in the catalog's order.
 */
export function requiredErrorsFor(type: string, parameters: Record<string, unknown>): string[] {
  return (modeledEntry(type)?.transitions.errors ?? [])
    .filter(
      (e) =>
        e.required ||
        (e.requiredWhenKey !== undefined && parameters[e.requiredWhenKey] !== undefined),
    )
    .map((e) => e.type);
}

/** The error branches the builder's modeled form wires, in its order; empty when none. */
export function builderErrors(type: string): string[] {
  return (modeledEntry(type)?.transitions.errors ?? []).filter((e) => e.builder).map((e) => e.type);
}

/**
 * The error branches the builder wires on this action, in its order: the
 * builder flags narrowed to the form the action is in. Only GetParticipantInput
 * has more than one modeled form. Its `shapes` say which branches each value
 * of StoreInput forbids, and that narrows the menu form (no InvalidPhoneNumber)
 * and the stored form (no InputTimeLimitExceeded or NoMatchingCondition);
 * InvalidPhoneNumber is then the stored form's only when the digits are a
 * phone number ("Must be defined only if StoreInput is true, and
 * PhoneNumberValidation is specified"), which no shape records because the
 * deciding value is nested.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 */
export function builderErrorsFor(action: {
  Type: string;
  Parameters: Record<string, unknown>;
}): string[] {
  const entry = modeledEntry(action.Type);
  if (entry === undefined) return [];
  const forbidden = new Set<string>();
  for (const shape of entry.shapes ?? []) {
    const value = action.Parameters[shape.when.key];
    const holds =
      shape.when.equals !== undefined
        ? value === shape.when.equals
        : value !== shape.when.notEquals;
    if (!holds) continue;
    for (const type of shape.forbids?.errors ?? []) forbidden.add(type);
  }
  if (action.Type === "GetParticipantInput") {
    const validation = action.Parameters.InputValidation;
    const phone =
      validation !== null &&
      typeof validation === "object" &&
      (validation as Record<string, unknown>).PhoneNumberValidation !== undefined;
    if (!phone) forbidden.add("InvalidPhoneNumber");
  }
  return builderErrors(action.Type).filter((e) => !forbidden.has(e));
}

/** How an action of this type uses Conditions, or undefined for an unmodeled type. */
export function conditionsKind(type: string): ConditionsKind | undefined {
  return modeledEntry(type)?.transitions.conditions;
}

/** The fewest conditions an action of this type must carry; 0 when the catalog sets none. */
export function minConditionsFor(type: string): number {
  return modeledEntry(type)?.transitions.minConditions ?? 0;
}

/** The catalog's rule for NextAction on this type, or undefined for an unmodeled type. */
export function nextRule(type: string): NextRule | undefined {
  return modeledEntry(type)?.transitions.next;
}

/** Whether a flow may end in this action with nothing wired (see CatalogTransitions.waits). */
export function holdsParticipant(type: string): boolean {
  return modeledEntry(type)?.transitions.waits === true;
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

/** The channels an action of this type is restricted to, or undefined when its page names none. */
export function channelRestriction(type: string): readonly Channel[] | undefined {
  return modeledEntry(type)?.channels;
}
