/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// fromFlowDoc: a FlowDoc as its `.flow.tf` companion, by conformance/hcl/
// README.md rules 1 to 18 and, given the previous companion, rule 24. The
// writer lays the resource out line by line with its indentation and leaves
// spacing and `=` alignment to format(), so the output is a fmt fixed point
// by construction.

import {
  autoLayout,
  collectRefs,
  modeledEntry,
  parseToken,
  refKey,
  slugIdentifier,
  type CatalogElement,
  type CatalogParameter,
  type FlowAction,
  type FlowDoc,
} from "@flow-as-code/core";
import { FLOW_RESOURCE, MODULE_RESOURCE, banner } from "./contract.js";
import { format } from "./format.js";
import { quote } from "./quote.js";
import { readCarry, type Carry } from "./carry.js";
import type { KeptComments } from "./read.js";

export interface FromFlowDocOptions {
  /** The companion on disk, whose carried values and @keep comments survive (rule 24). */
  previous?: string;
  /** Reference key -> terraform address expression. Overrides what `previous` carried. */
  bindings?: Record<string, string | null>;
  /** The expression for `instance_id` on a first write; default `var.connect_instance_id`. */
  instanceId?: string;
  tags?: Record<string, string>;
  lintDisable?: readonly string[];
  /** The document's file name, for the banner; default `<name>.flowdoc.json`. */
  fileName?: string;
  /**
   * Kept comment lines to write when there is no `previous`: what
   * `flow-cli convert` carries over from a `.flow.ts`, rewritten as `# @keep`.
   */
  keep?: KeptComments;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const key = (k: string): string => (IDENT.test(k) ? k : quote(k));

/** The companion text for `doc`. */
export function fromFlowDoc(doc: FlowDoc, options: FromFlowDocOptions = {}): string {
  const carry: Carry = options.previous === undefined ? emptyCarry() : readCarry(options.previous);
  if (options.keep !== undefined && options.previous === undefined) {
    carry.keepResource = [...options.keep.resource];
    carry.keepActions = new Map(Object.entries(options.keep.actions));
  }
  const out = banner(options.fileName ?? `${doc.name}.flowdoc.json`).split("\n");
  out.push(...carry.keepResource);
  out.push(...resourceLines(doc, { ...options, carry }));
  return format(`${out.join("\n")}\n`);
}

export interface ResourceOptions {
  carry?: Carry;
  bindings?: Record<string, string | null>;
  instanceId?: string;
  tags?: Record<string, string>;
  lintDisable?: readonly string[];
}

/**
 * The resource block for `doc`, one line per element, indented but not
 * aligned: callers join the lines and run format() over the whole file.
 */
export function resourceLines(doc: FlowDoc, options: ResourceOptions = {}): string[] {
  const carry = options.carry ?? emptyCarry();
  const bindings = { ...carry.bindings, ...(options.bindings ?? {}) };
  const out: string[] = [];
  const line = (depth: number, text: string) => out.push(`${"  ".repeat(depth)}${text}`);

  const isModule = doc.kind === "module";
  const resource = isModule ? MODULE_RESOURCE : FLOW_RESOURCE;
  line(0, `resource "${resource}" ${quote(slugIdentifier(doc.name))} {`);

  if (carry.provider !== undefined) line(1, `provider = ${carry.provider}`);
  line(1, `instance_id = ${carry.instanceId ?? options.instanceId ?? "var.connect_instance_id"}`);
  line(1, `name = ${quote(doc.name)}`);
  if (!isModule) line(1, `type = ${quote(doc.connectType)}`);
  if (doc.description !== undefined) line(1, `description = ${quote(doc.description)}`);
  if (carry.state !== undefined) line(1, `state = ${carry.state}`);
  if (isModule && carry.externalInvocation !== undefined) {
    line(1, `external_invocation_enabled = ${carry.externalInvocation}`);
  }
  if (doc.content.StartAction !== doc.content.Actions[0]?.Identifier) {
    line(1, `start = ${quote(doc.content.StartAction)}`);
  }

  // refs (rule 6): one entry per document reference, keys in byte order.
  const keys = collectRefs(doc.content)
    .map((r) => refKey(r))
    .sort(byteOrder);
  if (keys.length > 0) {
    out.push("");
    line(1, "refs = {");
    for (const k of keys) {
      const bound = bindings[k];
      if (bound === undefined || bound === null) {
        line(2, `# TODO: no terraform address for \${cdref:${k}}.`);
        line(2, `${quote(k)} = null`);
      } else line(2, `${quote(k)} = ${bound}`);
    }
    line(1, "}");
  }

  const settings = doc.content.Settings;
  if (isModule && settings !== undefined && Object.keys(settings).length > 0) {
    out.push("");
    out.push(...jsonencode(1, "settings", settings));
  }

  if (carry.tags !== undefined) {
    out.push("");
    line(1, `tags = ${carry.tags}`);
  } else if (options.tags !== undefined && Object.keys(options.tags).length > 0) {
    out.push("");
    line(1, "tags = {");
    for (const [k, v] of Object.entries(options.tags).sort(([a], [b]) => byteOrder(a, b))) {
      line(2, `${key(k)} = ${quote(v)}`);
    }
    line(1, "}");
  }

  if (carry.lint !== undefined) {
    out.push("");
    line(1, carry.lint);
  } else if (options.lintDisable !== undefined && options.lintDisable.length > 0) {
    out.push("");
    line(1, "lint {");
    line(2, `disable = [${options.lintDisable.map(quote).join(", ")}]`);
    line(1, "}");
  }

  const auto = autoLayout(doc.content.Actions, doc.content.StartAction);
  for (const a of doc.content.Actions) {
    out.push("");
    out.push(...(carry.keepActions.get(a.Identifier) ?? []).map((c) => `  ${c}`));
    out.push(...action(a, doc.layout?.[a.Identifier], auto[a.Identifier]));
  }

  for (const extra of [carry.lifecycle, carry.dependsOn]) {
    if (extra === undefined) continue;
    out.push("");
    line(1, extra);
  }
  line(0, "}");
  return out;
}

function emptyCarry(): Carry {
  return { bindings: {}, keepResource: [], keepActions: new Map() };
}

function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One action block (rules 9 to 15). */
function action(
  a: FlowAction,
  position: { x: number; y: number } | undefined,
  auto: { x: number; y: number } | undefined,
): string[] {
  const out: string[] = ["  action {", `    id = ${quote(a.Identifier)}`];
  const t = a.Transitions;
  if (t.NextAction !== undefined) out.push(`    next = ${quote(t.NextAction)}`);
  const entry = modeledEntry(a.Type);
  if (entry !== undefined && accepts(a.Parameters, entry.parameters)) {
    const byKey = new Map(entry.parameters.map((p) => [p.key, p]));
    const params = sortedEntries(a.Parameters);
    if (params.length === 0) out.push(`    ${entry.block} {}`);
    else {
      out.push(`    ${entry.block} {`);
      for (const [k, v] of params) out.push(...value(3, byKey.get(k)!.attr, v, byKey.get(k)!));
      out.push("    }");
    }
  } else {
    out.push("    generic {", `      type = ${quote(a.Type)}`);
    if (Object.keys(a.Parameters).length > 0)
      out.push(...jsonencode(3, "parameters", a.Parameters));
    out.push("    }");
  }
  for (const c of t.Conditions ?? []) {
    out.push(
      "    condition {",
      `      operator = ${quote(c.Condition.Operator)}`,
      `      operands = [${c.Condition.Operands.map((o) => quote(String(o))).join(", ")}]`,
      `      next = ${quote(c.NextAction)}`,
      "    }",
    );
  }
  for (const e of t.Errors ?? []) {
    out.push(
      "    error {",
      `      type = ${quote(e.ErrorType)}`,
      `      next = ${quote(e.NextAction)}`,
      "    }",
    );
  }
  // Rule 15: positions are integers; an exported flow's console coordinates are not.
  const at =
    position === undefined ? undefined : { x: Math.round(position.x), y: Math.round(position.y) };
  if (at !== undefined && (auto === undefined || auto.x !== at.x || auto.y !== at.y)) {
    out.push("    position {", `      x = ${at.x}`, `      y = ${at.y}`, "    }");
  }
  out.push("  }");
  return out;
}

function sortedEntries(o: Record<string, unknown>): [string, unknown][] {
  return Object.entries(o).sort(([a], [b]) => byteOrder(a, b));
}

/**
 * Whether the catalog's shape accepts these Parameters (rule 10): every key a
 * parameter, every required parameter present, objects and lists of objects
 * matching their fields, each value of its kind's JSON type.
 */
export function accepts(
  params: Record<string, unknown>,
  elems: readonly CatalogParameter[],
): boolean {
  const byKey = new Map(elems.map((p) => [p.key, p]));
  for (const [k, v] of Object.entries(params)) {
    const e = byKey.get(k);
    if (e === undefined || !acceptsValue(v, e)) return false;
  }
  return elems.every((e) => !e.required || e.key in params);
}

function acceptsValue(v: unknown, e: CatalogElement): boolean {
  switch (e.kind) {
    case "object":
      return isObject(v) && accepts(v, e.fields ?? []);
    case "list":
      return Array.isArray(v) && (e.of === undefined || v.every((x) => acceptsValue(x, e.of!)));
    case "map":
      return (
        isObject(v) &&
        Object.values(v).every((x) =>
          e.of === undefined ? typeof x === "string" : acceptsValue(x, e.of),
        )
      );
    case "integer":
      return typeof v === "number" || (typeof v === "string" && v.startsWith("$."));
    case "json":
      return true;
    default:
      return typeof v === "string";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** One parameter or field, by its catalog kind (rule 11), as lines at `depth`. */
function value(depth: number, name: string, v: unknown, e: CatalogElement): string[] {
  const pad = "  ".repeat(depth);
  switch (e.kind) {
    case "ref":
      return [`${pad}${name} = ${quote(refValue(v as string))}`];
    case "integerString":
      return [
        `${pad}${name} = ${/^-?(0|[1-9][0-9]*)$/.test(v as string) ? (v as string) : quote(v as string)}`,
      ];
    case "integer":
      return [`${pad}${name} = ${typeof v === "number" ? String(v) : quote(v as string)}`];
    case "json":
      return jsonencode(depth, name, v);
    case "list": {
      const items = v as unknown[];
      if (items.every((x) => typeof x !== "object" || x === null)) {
        return [`${pad}${name} = [${items.map((x) => scalar(x, e.of)).join(", ")}]`];
      }
      const out = [`${pad}${name} = [`];
      for (const item of items) {
        out.push(`${pad}  {`);
        out.push(...fields(depth + 2, item as Record<string, unknown>, e.of));
        out.push(`${pad}  },`);
      }
      out.push(`${pad}]`);
      return out;
    }
    case "map":
    case "object": {
      const o = v as Record<string, unknown>;
      if (Object.keys(o).length === 0) return [`${pad}${name} = {}`];
      return [`${pad}${name} = {`, ...fields(depth + 1, o, e), `${pad}}`];
    }
    default:
      return [`${pad}${name} = ${quote(v as string)}`];
  }
}

/** An object's entries: fields by their attr names, map entries by their keys. */
function fields(
  depth: number,
  o: Record<string, unknown>,
  e: CatalogElement | undefined,
): string[] {
  const byKey = new Map((e?.fields ?? []).map((f) => [f.key, f]));
  const out: string[] = [];
  for (const [k, v] of sortedEntries(o)) {
    const f = byKey.get(k);
    if (f !== undefined) out.push(...value(depth, f.attr, v, f));
    else if (e?.kind === "map" && e.of !== undefined) out.push(...value(depth, key(k), v, e.of));
    else out.push(...value(depth, key(k), v, { kind: "string" }));
  }
  return out;
}

function scalar(v: unknown, e: CatalogElement | undefined): string {
  if (typeof v === "string") return quote(e?.kind === "ref" ? refValue(v) : v);
  return v === null ? "null" : String(v);
}

/** A reference field's value: the key for a token, anything else (a JSONPath) as itself. */
function refValue(v: string): string {
  const entry = parseToken(v);
  return entry === undefined ? v : refKey(entry);
}

/** `name = jsonencode({...})` (rules 11 and 12). */
function jsonencode(depth: number, name: string, v: unknown): string[] {
  const pad = "  ".repeat(depth);
  if (isObject(v) && Object.keys(v).length === 0) return [`${pad}${name} = jsonencode({})`];
  return [
    `${pad}${name} = jsonencode({`,
    ...jsonBody(depth + 1, v as Record<string, unknown>),
    `${pad}})`,
  ];
}

function jsonBody(depth: number, o: Record<string, unknown>): string[] {
  return sortedEntries(o).flatMap(([k, v]) => jsonEntry(depth, `${key(k)} = `, v));
}

/** One JSON value at `depth` after `prefix` (`key = ` in an object, empty in a tuple). */
function jsonEntry(depth: number, prefix: string, v: unknown, comma = ""): string[] {
  const pad = "  ".repeat(depth);
  if (isObject(v)) {
    if (Object.keys(v).length === 0) return [`${pad}${prefix}{}${comma}`];
    return [`${pad}${prefix}{`, ...jsonBody(depth + 1, v), `${pad}}${comma}`];
  }
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || typeof x !== "object")) {
      return [`${pad}${prefix}[${v.map(jsonScalar).join(", ")}]${comma}`];
    }
    return [
      `${pad}${prefix}[`,
      ...v.flatMap((x) => jsonEntry(depth + 1, "", x, ",")),
      `${pad}]${comma}`,
    ];
  }
  return [`${pad}${prefix}${jsonScalar(v)}${comma}`];
}

function jsonScalar(v: unknown): string {
  return typeof v === "string" ? quote(v) : v === null ? "null" : String(v);
}
