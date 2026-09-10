/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// FlowDoc: the single interchange format. See docs/01-flowdoc-spec.md and
// conformance/schema/flowdoc-0.1.schema.json, which is the normative form of
// these types.

export const FLOWDOC_VERSION = "0.1";

/** The only Flow language version Connect supports. */
export const FLOW_LANGUAGE_VERSION = "2019-10-30";

/** A single flow holds no more than 250 Actions. */
export const MAX_ACTIONS_PER_FLOW = 250;

/** Identifiers are unique within a flow and at most 50 characters. */
export const MAX_IDENTIFIER_LENGTH = 50;

/**
 * Characters Connect rejects in an Identifier.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-language-actions.html
 */
export const FORBIDDEN_IDENTIFIER_CHARS = [
  "%",
  ":",
  "(",
  "\\",
  "/",
  ")",
  "=",
  "$",
  ",",
  ";",
  "[",
  "]",
  "{",
  "}",
] as const;

/** Identifier values Connect rejects outright (prototype pollution names). */
export const FORBIDDEN_IDENTIFIERS = [
  "__proto__",
  "constructor",
  "__defineGetter__",
  "__defineSetter__",
  "toString",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "valueOf",
] as const;

export type ConnectType =
  | "CONTACT_FLOW"
  | "CUSTOMER_QUEUE"
  | "CUSTOMER_HOLD"
  | "CUSTOMER_WHISPER"
  | "AGENT_HOLD"
  | "AGENT_WHISPER"
  | "OUTBOUND_WHISPER"
  | "AGENT_TRANSFER"
  | "QUEUE_TRANSFER"
  | "MODULE";

export type ConditionOperator =
  | "Equals"
  | "TextStartsWith"
  | "TextEndsWith"
  | "TextContains"
  | "NumberGreaterThan"
  | "NumberGreaterOrEqualTo"
  | "NumberLessThan"
  | "NumberLessOrEqualTo";

export interface Condition {
  Operator: ConditionOperator;
  Operands: string[];
}

export interface ErrorTransition {
  ErrorType: string;
  NextAction: string;
}

export interface ConditionTransition {
  NextAction: string;
  Condition: Condition;
}

export interface Transitions {
  NextAction?: string;
  Errors?: ErrorTransition[];
  Conditions?: ConditionTransition[];
}

export interface FlowAction {
  Identifier: string;
  Type: string;
  Parameters: Record<string, unknown>;
  Transitions: Transitions;
}

export interface FlowContent {
  Version: typeof FLOW_LANGUAGE_VERSION;
  StartAction: string;
  /**
   * Not authored. Materialization projects `layout` into this so the flow lays
   * out correctly in the Connect console. See docs/01-flowdoc-spec.md.
   */
  Metadata?: Record<string, unknown>;
  /**
   * Module configuration. Connect requires a top-level `Settings` object in a
   * flow MODULE's content and rejects CreateContactFlowModule without it
   * ("JSON field is missing or null for field name: settings"); a regular flow
   * has no Settings. Empty is valid and is what the console stores for a module
   * with no special configuration. Verified against a live instance 2026-09-01.
   */
  Settings?: Record<string, unknown>;
  Actions: FlowAction[];
}

export interface Point {
  x: number;
  y: number;
}

export type RefType = "queue" | "hours" | "lambda" | "lex" | "prompt" | "flow" | "module";

export interface RefEntry {
  token: string;
  type: RefType;
  name: string;
  alias?: string;
}

export interface FlowDocMeta {
  generator?: string;
  sourceHash?: string;
  [key: string]: unknown;
}

export interface FlowDoc {
  flowdoc: typeof FLOWDOC_VERSION;
  kind: "flow" | "module";
  name: string;
  connectType: ConnectType;
  content: FlowContent;
  layout?: Record<string, Point>;
  refs?: RefEntry[];
  meta?: FlowDocMeta;
}

/** Names are slugs: lowercase, digits, single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidIdentifier(id: string): boolean {
  if (id.length === 0 || id.length > MAX_IDENTIFIER_LENGTH) return false;
  if ((FORBIDDEN_IDENTIFIERS as readonly string[]).includes(id)) return false;
  return !FORBIDDEN_IDENTIFIER_CHARS.some((c) => id.includes(c));
}

// ---------------------------------------------------------------------------
// Entry-point guard
// ---------------------------------------------------------------------------

/**
 * A public entry point was handed something that is not a usable FlowDoc.
 *
 * Without this, the first property access decided the message, so calling
 * `codegen(undefined)` or linting a document with no `content` reported
 * "Cannot read properties of undefined (reading 'Actions')", which names
 * neither the entry point, the argument, nor what was wrong with it.
 */
export class InvalidFlowDocError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFlowDocError";
  }
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") return `a string (${JSON.stringify(value)})`;
  return `a ${typeof value}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural check that a value can be treated as a FlowDoc, run at every
 * public entry point that reads one.
 *
 * Deliberately shallow: it checks the shape the library dereferences without
 * asking, not the FlowDoc schema. Full validation is
 * conformance/schema/flowdoc-0.1.schema.json, which `flow-cli lint` runs;
 * doing it here would make every entry point pay for an Ajv compile and would
 * reject documents the studio legitimately holds mid-edit.
 *
 * @param context the entry point name, so the message says who was called.
 */
export function assertFlowDoc(value: unknown, context: string): asserts value is FlowDoc {
  if (!isPlainObject(value)) {
    throw new InvalidFlowDocError(`${context} expects a FlowDoc object, got ${typeName(value)}.`);
  }
  for (const key of ["name", "kind", "connectType"] as const) {
    if (typeof value[key] !== "string") {
      throw new InvalidFlowDocError(
        `${context} expects a FlowDoc with a string "${key}", got ${typeName(value[key])}.`,
      );
    }
  }
  const content = value.content;
  if (!isPlainObject(content)) {
    throw new InvalidFlowDocError(
      `${context} expects a FlowDoc with an object "content", got ${typeName(content)}.`,
    );
  }
  if (typeof content.StartAction !== "string") {
    throw new InvalidFlowDocError(
      `${context} expects a FlowDoc with a string "content.StartAction", got ${typeName(
        content.StartAction,
      )}.`,
    );
  }
  const actions = content.Actions;
  if (!Array.isArray(actions)) {
    throw new InvalidFlowDocError(
      `${context} expects a FlowDoc with an array "content.Actions", got ${typeName(actions)}.`,
    );
  }
  for (const [i, action] of actions.entries()) {
    const at = `${context}: FlowDoc content.Actions[${String(i)}]`;
    if (!isPlainObject(action)) {
      throw new InvalidFlowDocError(`${at} must be an action object, got ${typeName(action)}.`);
    }
    for (const key of ["Identifier", "Type"] as const) {
      if (typeof action[key] !== "string") {
        throw new InvalidFlowDocError(
          `${at} must have a string "${key}", got ${typeName(action[key])}.`,
        );
      }
    }
    // Parameters and Transitions are dereferenced without a guard by codegen,
    // materialization, and several lint rules.
    for (const key of ["Parameters", "Transitions"] as const) {
      if (!isPlainObject(action[key])) {
        throw new InvalidFlowDocError(
          `${at} ("${String(action.Identifier)}") must have an object "${key}", got ${typeName(
            action[key],
          )}.`,
        );
      }
    }
  }
}
