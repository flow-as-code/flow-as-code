/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// toFlowDoc: a `.flow.tf` companion read to its FlowDoc and the sidecar of
// values the file carries beside it, by conformance/hcl/README.md rules 18 to
// 23. Every refusal is an HclError carrying the contract's code and the path
// of the offending attribute.

import {
  FLOW_LANGUAGE_VERSION,
  FLOWDOC_VERSION,
  SLUG_PATTERN,
  allRules,
  autoLayout,
  collectRefs,
  isValidIdentifier,
  modeledEntry,
  parseToken,
  slugIdentifier,
  type CatalogElement,
  type ModeledAction,
  type ConditionOperator,
  type ConnectType,
  type FlowAction,
  type FlowDoc,
  type Point,
  type RefType,
  type Transitions,
} from "@flow-as-code/core";
import type { Attribute, Block, Expr, HclFile } from "./ast.js";
import {
  ADDRESS_SUGAR,
  FLOW_RESOURCE,
  banner,
  MODULE_RESOURCE,
  REF_KEY,
  RESOURCE_ATTRIBUTES,
  byAttr,
  entryByBlock,
  type ErrorCode,
} from "./contract.js";
import { HclError } from "./errors.js";
import { evaluateLiteral, type LiteralValue } from "./literal.js";
import { parse } from "./parser.js";
import { sourceOf } from "./print.js";

/** One value the reader rewrote: a full token to its key, or an address to its key and binding. */
export interface Normalization {
  attribute: string;
  from: string;
  to: string;
  binding?: string;
}

/** Comment lines marked @keep, above the resource and above each action by id. */
export interface KeptComments {
  resource: string[];
  actions: Record<string, string[]>;
}

/** What the file carries beside the document (rule 23). */
export interface Sidecar {
  /** Reference key -> the terraform expression bound to it, or null. */
  refs: Record<string, string | null>;
  lint: string[];
  tags: Record<string, string>;
  instanceId: string;
  normalized: Normalization[];
  keep?: KeptComments;
}

export interface ReadResult {
  doc: FlowDoc;
  sidecar: Sidecar;
  /** Non-fatal findings: a refs key no action references (rule 22). */
  warnings: string[];
}

export interface ToFlowDocOptions {
  /** Named in every error; default `<input>`. */
  fileName?: string;
}

const HARD_RULES = new Set(allRules.filter((r) => r.hard).map((r) => r.id));
const RULE_IDS = new Set(allRules.map((r) => r.id));
const META_BLOCKS = new Set(["lifecycle"]);

/** The document and sidecar a companion reads to. */
export function toFlowDoc(text: string, options: ToFlowDocOptions = {}): ReadResult {
  const file = parse(text, options.fileName ?? "<input>");
  return new Reader(file).read();
}

class Reader {
  readonly normalized: Normalization[] = [];
  /** Bindings the sugar produced, by key. */
  readonly sugar = new Map<string, string>();
  refs: Record<string, string | null> = {};

  constructor(readonly file: HclFile) {}

  fail(code: ErrorCode, node: { first: number }, path: string | undefined, detail: string): never {
    throw new HclError(detail, {
      file: this.file.file,
      position: this.file.tokens[node.first]!.start,
      code,
      path,
    });
  }

  literal(expr: Expr, path: string): LiteralValue {
    try {
      return evaluateLiteral(expr, this.file);
    } catch (e) {
      if (e instanceof HclError && e.code !== undefined) {
        throw new HclError(`${path}: ${e.detail}`, {
          file: e.file,
          position: e.position,
          code: e.code,
          path,
        });
      }
      throw e;
    }
  }

  string(expr: Expr, path: string): string {
    const v = this.literal(expr, path);
    if (typeof v !== "string")
      this.fail("NON_LITERAL_VALUE", expr, path, `${path} must be a string.`);
    return v;
  }

  read(): ReadResult {
    const resources = this.file.body.items.filter((i): i is Block => i.kind === "block");
    const resource = resources[0];
    for (const item of this.file.body.items) {
      if (item.kind === "attribute") {
        this.fail(
          "UNKNOWN_ATTRIBUTE",
          item,
          item.name,
          `${item.name} is not allowed outside the resource.`,
        );
      }
    }
    if (resource === undefined) {
      throw new HclError(`The file holds no ${FLOW_RESOURCE} or ${MODULE_RESOURCE} resource.`, {
        file: this.file.file,
        code: "SECOND_RESOURCE",
      });
    }
    if (resources.length > 1) {
      this.fail(
        "SECOND_RESOURCE",
        resources[1]!,
        undefined,
        "A companion holds exactly one resource.",
      );
    }
    const [type, label] = resource.labels;
    if (resource.type !== "resource" || (type !== FLOW_RESOURCE && type !== MODULE_RESOURCE)) {
      this.fail(
        "UNKNOWN_BLOCK",
        resource,
        undefined,
        `Expected resource "${FLOW_RESOURCE}" or "${MODULE_RESOURCE}", found ${resource.type} ${resource.labels.map((l) => JSON.stringify(l)).join(" ")}.`,
      );
    }
    const isModule = type === MODULE_RESOURCE;
    const body = resource.body;
    const attrs = new Map<string, Attribute>();
    for (const item of body.items) {
      if (item.kind !== "attribute") continue;
      if (item.name === "count" || item.name === "for_each") {
        this.fail(
          "COUNT_OR_FOR_EACH",
          item,
          item.name,
          `${item.name} is not allowed: a companion is one flow.`,
        );
      }
      if (!(RESOURCE_ATTRIBUTES as readonly string[]).includes(item.name)) {
        this.fail(
          "UNKNOWN_ATTRIBUTE",
          item,
          item.name,
          `${item.name} is not an attribute of ${type}.`,
        );
      }
      if (attrs.has(item.name)) this.duplicate(item, item.name, attrs.get(item.name)!);
      attrs.set(item.name, item);
    }
    if (isModule && attrs.has("type")) {
      this.fail("MODULE_WITH_TYPE", attrs.get("type")!, "type", "A module resource has no type.");
    }
    if (!isModule && attrs.has("settings")) {
      this.fail(
        "FLOW_WITH_SETTINGS",
        attrs.get("settings")!,
        "settings",
        "Only a module resource has settings.",
      );
    }
    if (!isModule && attrs.has("external_invocation_enabled")) {
      const a = attrs.get("external_invocation_enabled")!;
      this.fail(
        "UNKNOWN_ATTRIBUTE",
        a,
        a.name,
        `${a.name} is an attribute of ${MODULE_RESOURCE} only.`,
      );
    }

    const name = this.required(attrs, "name", resource);
    if (!SLUG_PATTERN.test(name)) {
      this.fail(
        "NON_LITERAL_VALUE",
        attrs.get("name")!,
        "name",
        `name must be a slug, got ${JSON.stringify(name)}.`,
      );
    }
    if (label !== slugIdentifier(name)) {
      this.fail(
        "LABEL_MISMATCH",
        resource,
        "label",
        `The resource label must be "${slugIdentifier(name)}" for name "${name}", got "${label ?? ""}".`,
      );
    }
    const connectType = (
      isModule ? "MODULE" : this.required(attrs, "type", resource)
    ) as ConnectType;
    const description = attrs.has("description")
      ? this.string(attrs.get("description")!.expr, "description")
      : undefined;
    const instance = attrs.get("instance_id");
    if (instance === undefined) {
      this.fail("NON_LITERAL_VALUE", resource, "instance_id", "instance_id is required.");
    }

    this.readRefs(attrs.get("refs"));
    const tags = this.readTags(attrs.get("tags"));
    const settings = attrs.has("settings")
      ? this.jsonencode(attrs.get("settings")!.expr, "settings")
      : undefined;

    let lint: string[] = [];
    const actions: FlowAction[] = [];
    const positions: Record<string, Point> = {};
    const seen = new Set<string>();
    const single = new Map<string, Block>();
    for (const item of body.items) {
      if (item.kind !== "block") continue;
      if (item.type === "lint" || item.type === "lifecycle") {
        const first = single.get(item.type);
        if (first !== undefined) this.duplicate(item, item.type, first);
        single.set(item.type, item);
      }
      if (item.type === "lint") lint = this.readLint(item);
      else if (item.type === "action") {
        const { action, position } = this.readAction(item, seen);
        actions.push(action);
        if (position !== undefined) positions[action.Identifier] = position;
      } else if (!META_BLOCKS.has(item.type)) {
        this.fail("UNKNOWN_BLOCK", item, item.type, `${item.type} is not a block of ${type}.`);
      }
    }

    let start = actions[0]?.Identifier ?? "";
    const startAttr = attrs.get("start");
    if (startAttr !== undefined) {
      start = this.string(startAttr.expr, "start");
      if (!seen.has(start))
        this.fail("START_UNKNOWN", startAttr, "start", `start names no action: "${start}".`);
    }

    const content: FlowDoc["content"] = {
      Version: FLOW_LANGUAGE_VERSION,
      StartAction: start,
      ...(isModule ? { Settings: (settings ?? {}) as Record<string, unknown> } : {}),
      Actions: actions,
    };
    const layout = { ...autoLayout(actions, start), ...positions };
    const refs = collectRefs(content);
    const doc: FlowDoc = {
      flowdoc: FLOWDOC_VERSION,
      kind: isModule ? "module" : "flow",
      name,
      ...(description === undefined ? {} : { description }),
      connectType,
      content,
      layout,
      refs,
    };

    const keys = new Set(
      refs.map((r) => `${r.type}:${r.name}${r.alias === undefined ? "" : `@${r.alias}`}`),
    );
    const bound: Record<string, string | null> = { ...this.refs };
    for (const [k, v] of this.sugar)
      if (!Object.hasOwn(bound, k) || bound[k] === null) bound[k] = v;
    const warnings: string[] = [];
    for (const k of Object.keys(this.refs)) {
      if (!keys.has(k))
        warnings.push(`refs["${k}"] is referenced by no action; the next regeneration drops it.`);
    }
    const sidecar: Sidecar = {
      refs: Object.fromEntries(
        Object.entries(bound).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
      lint,
      tags,
      instanceId: sourceOf(this.file, instance.expr),
      normalized: this.normalized,
    };
    const keep = keptComments(this.file, resource);
    if (keep !== undefined) sidecar.keep = keep;
    return { doc, sidecar, warnings };
  }

  required(attrs: Map<string, Attribute>, name: string, resource: Block): string {
    const a = attrs.get(name);
    if (a === undefined) this.fail("NON_LITERAL_VALUE", resource, name, `${name} is required.`);
    return this.string(a.expr, name);
  }

  readRefs(attr: Attribute | undefined): void {
    if (attr === undefined) return;
    if (attr.expr.kind !== "object") {
      this.fail(
        "NON_LITERAL_VALUE",
        attr.expr,
        "refs",
        "refs must be an object literal keyed by reference key.",
      );
    }
    for (const item of attr.expr.items) {
      const key =
        item.bareKey && item.key.kind === "traversal"
          ? item.key.root
          : this.string(item.key, "refs");
      const path = `refs[${key}]`;
      if (Object.hasOwn(this.refs, key)) this.duplicate(item.key, path, attr);
      if (!REF_KEY.test(key)) {
        this.fail(
          "REF_KEY_MALFORMED",
          item.key,
          path,
          `"${key}" is not a reference key such as "queue:front-desk".`,
        );
      }
      const v = item.value;
      if (v.kind === "literal" && v.value === null) {
        this.refs[key] = null;
        continue;
      }
      if (v.kind === "template" && v.parts.every((p) => p.kind === "text")) {
        const s = this.string(v, path);
        if (s.startsWith("arn:")) {
          this.fail(
            "LITERAL_ARN",
            v,
            path,
            `${path} holds a literal ARN; bind the key to a terraform address instead.`,
          );
        }
      }
      this.refs[key] = sourceOf(this.file, v);
    }
  }

  readTags(attr: Attribute | undefined): Record<string, string> {
    if (attr === undefined) return {};
    let v: LiteralValue;
    try {
      v = evaluateLiteral(attr.expr, this.file);
    } catch {
      return {};
    }
    if (v === null || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
    return out;
  }

  readLint(block: Block): string[] {
    const out: string[] = [];
    for (const item of block.body.items) {
      if (item.kind !== "attribute" || item.name !== "disable") {
        const n = item.kind === "attribute" ? item.name : item.type;
        this.fail("UNKNOWN_ATTRIBUTE", item, `lint.${n}`, `lint holds only disable.`);
      }
      const v = this.literal(item.expr, "lint.disable");
      if (!Array.isArray(v))
        this.fail(
          "NON_LITERAL_VALUE",
          item.expr,
          "lint.disable",
          "lint.disable must be a list of rule ids.",
        );
      v.forEach((id, k) => {
        const path = `lint.disable[${k}]`;
        const node = item.expr.kind === "tuple" ? item.expr.items[k]! : item.expr;
        if (typeof id !== "string" || !RULE_IDS.has(id)) {
          this.fail(
            "UNKNOWN_LINT_RULE",
            node,
            path,
            `${JSON.stringify(id)} is not a lint rule id.`,
          );
        }
        if (HARD_RULES.has(id)) {
          this.fail(
            "UNKNOWN_LINT_RULE",
            node,
            path,
            `"${id}" is a hard rule and cannot be disabled.`,
          );
        }
        out.push(id);
      });
    }
    return out;
  }

  jsonencode(expr: Expr, path: string): LiteralValue {
    if (
      expr.kind !== "call" ||
      expr.name !== "jsonencode" ||
      expr.args.length !== 1 ||
      expr.expandFinal
    ) {
      this.fail("NON_LITERAL_VALUE", expr, path, `${path} must be jsonencode({...}) of a literal.`);
    }
    return this.literal(expr.args[0]!, path);
  }

  readAction(block: Block, seen: Set<string>): { action: FlowAction; position?: Point } {
    const attrs = new Map<string, Attribute>();
    const blocks: Block[] = [];
    for (const item of block.body.items) {
      if (item.kind === "attribute") {
        if (attrs.has(item.name))
          this.duplicate(item, `action.${item.name}`, attrs.get(item.name)!);
        attrs.set(item.name, item);
      } else blocks.push(item);
    }
    const idAttr = attrs.get("id");
    if (idAttr === undefined)
      this.fail("INVALID_IDENTIFIER", block, "action", "An action needs an id.");
    const id = this.string(idAttr.expr, "action.id");
    const at = `action[${id}]`;
    if (!isValidIdentifier(id)) {
      this.fail(
        "INVALID_IDENTIFIER",
        idAttr,
        at,
        `"${id}" is not an identifier the Flow language allows.`,
      );
    }
    if (seen.has(id)) this.fail("DUPLICATE_ACTION_ID", idAttr, at, `Two actions have id "${id}".`);
    seen.add(id);
    for (const [name, a] of attrs) {
      if (name !== "id" && name !== "next") {
        this.fail(
          "UNKNOWN_ATTRIBUTE",
          a,
          `${at}.${name}`,
          `${name} is not an attribute of an action.`,
        );
      }
    }

    const byBlock = entryByBlock();
    let typed: { type: string; parameters: Record<string, unknown> } | undefined;
    let typeBlock: Block | undefined;
    const conditions: NonNullable<Transitions["Conditions"]> = [];
    const errors: NonNullable<Transitions["Errors"]> = [];
    let position: Point | undefined;
    for (const b of blocks) {
      const path = `${at}.${b.type}`;
      if (b.type === "condition") conditions.push(this.readCondition(b, path));
      else if (b.type === "error") {
        const f = this.fields(b, path, ["type", "next"]);
        errors.push({ ErrorType: f.type!, NextAction: f.next! });
      } else if (b.type === "position") position = this.readPosition(b, path);
      else if (b.type === "generic" || byBlock.has(b.type)) {
        if (typeBlock !== undefined) {
          this.fail(
            "MULTIPLE_TYPE_BLOCKS",
            b,
            at,
            `${at} has both ${typeBlock.type} and ${b.type}; an action is one type.`,
          );
        }
        typeBlock = b;
        typed =
          b.type === "generic"
            ? this.readGeneric(b, path)
            : this.readTyped(b, path, byBlock.get(b.type)!);
      } else {
        this.fail("UNKNOWN_BLOCK", b, at, `${b.type} is not an action type block or generic.`);
      }
    }
    if (typed === undefined)
      this.fail("NO_TYPE_BLOCK", block, at, `${at} has no action type block.`);

    const next = attrs.has("next") ? this.string(attrs.get("next")!.expr, `${at}.next`) : undefined;
    // Rule 18: nothing wired reads as {} on a type the catalog marks terminal
    // or does not model, and as empty lists on any other, as synth writes it.
    const bare = modeledEntry(typed.type);
    const transitions: Transitions =
      next === undefined &&
      conditions.length === 0 &&
      errors.length === 0 &&
      (bare === undefined || bare.terminal)
        ? {}
        : {
            ...(next === undefined ? {} : { NextAction: next }),
            Errors: errors,
            Conditions: conditions,
          };
    return {
      action: {
        Identifier: id,
        Type: typed.type,
        Parameters: typed.parameters,
        Transitions: transitions,
      },
      ...(position === undefined ? {} : { position }),
    };
  }

  /** A block of string attributes, each required. */
  fields(b: Block, path: string, names: readonly string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const item of b.body.items) {
      const n = item.kind === "attribute" ? item.name : item.type;
      if (item.kind !== "attribute" || !names.includes(n)) {
        this.fail(
          "UNKNOWN_ATTRIBUTE",
          item,
          `${path}.${n}`,
          `${n} is not an attribute of ${b.type}.`,
        );
      }
      out[n] = this.string(item.expr, `${path}.${n}`);
    }
    for (const n of names) {
      if (out[n] === undefined)
        this.fail("NON_LITERAL_VALUE", b, `${path}.${n}`, `${b.type} needs ${n}.`);
    }
    return out;
  }

  readCondition(b: Block, path: string): NonNullable<Transitions["Conditions"]>[number] {
    const attrs = this.attributes(b, path, ["operator", "operands", "next"]);
    const operands = this.literal(attrs.operands!.expr, `${path}.operands`);
    if (!Array.isArray(operands) || operands.some((o) => typeof o !== "string")) {
      this.fail(
        "NON_LITERAL_VALUE",
        attrs.operands!.expr,
        `${path}.operands`,
        "operands must be a list of strings.",
      );
    }
    return {
      NextAction: this.string(attrs.next!.expr, `${path}.next`),
      Condition: {
        Operator: this.string(attrs.operator!.expr, `${path}.operator`) as ConditionOperator,
        Operands: operands as string[],
      },
    };
  }

  readPosition(b: Block, path: string): Point {
    const attrs = this.attributes(b, path, ["x", "y"]);
    const coord = (n: "x" | "y"): number => {
      const v = this.literal(attrs[n]!.expr, `${path}.${n}`);
      if (typeof v !== "number" || !Number.isInteger(v)) {
        this.fail(
          "POSITION_NOT_INTEGER",
          attrs[n]!.expr,
          `${path}.${n}`,
          `${path}.${n} must be an integer.`,
        );
      }
      return v;
    };
    return { x: coord("x"), y: coord("y") };
  }

  /** A block's attributes by name, every one required, no others, no nested blocks. */
  attributes(b: Block, path: string, names: readonly string[]): Record<string, Attribute> {
    const out: Record<string, Attribute> = {};
    for (const item of b.body.items) {
      const n = item.kind === "attribute" ? item.name : item.type;
      if (item.kind !== "attribute" || !names.includes(n)) {
        this.fail(
          "UNKNOWN_ATTRIBUTE",
          item,
          `${path}.${n}`,
          `${n} is not an attribute of ${b.type}.`,
        );
      }
      out[n] = item;
    }
    for (const n of names) {
      if (out[n] === undefined)
        this.fail("NON_LITERAL_VALUE", b, `${path}.${n}`, `${b.type} needs ${n}.`);
    }
    return out;
  }

  readGeneric(b: Block, path: string): { type: string; parameters: Record<string, unknown> } {
    let type: string | undefined;
    let parameters: Record<string, unknown> = {};
    for (const item of b.body.items) {
      const n = item.kind === "attribute" ? item.name : item.type;
      if (item.kind === "attribute" && n === "type") type = this.string(item.expr, `${path}.type`);
      else if (item.kind === "attribute" && n === "parameters") {
        const v = this.jsonencode(item.expr, `${path}.parameters`);
        if (v === null || typeof v !== "object" || Array.isArray(v)) {
          this.fail(
            "NON_LITERAL_VALUE",
            item.expr,
            `${path}.parameters`,
            "parameters must encode an object.",
          );
        }
        parameters = v;
      } else
        this.fail(
          "UNKNOWN_ATTRIBUTE",
          item,
          `${path}.${n}`,
          `${n} is not an attribute of generic.`,
        );
    }
    if (type === undefined)
      this.fail("NON_LITERAL_VALUE", b, `${path}.type`, "generic needs type.");
    return { type, parameters };
  }

  readTyped(
    b: Block,
    path: string,
    { type, entry }: { type: string; entry: ModeledAction },
  ): { type: string; parameters: Record<string, unknown> } {
    const params = byAttr(entry.parameters);
    const out: Record<string, unknown> = {};
    const given = new Map<string, Attribute>();
    for (const item of b.body.items) {
      const n = item.kind === "attribute" ? item.name : item.type;
      const p = params.get(n);
      if (item.kind !== "attribute" || p === undefined) {
        this.fail("UNKNOWN_ATTRIBUTE", item, `${path}.${n}`, `${n} is not a parameter of ${type}.`);
      }
      if (given.has(n)) this.duplicate(item, `${path}.${n}`, given.get(n)!);
      given.set(n, item);
      // Terraform reads an attribute set to null as unset, so the provider's
      // document has no such key; neither does this one.
      if (isNull(item.expr)) continue;
      out[p.key] = this.value(item.expr, p, `${path}.${n}`);
    }
    return { type, parameters: out };
  }

  /** One value by its catalog shape (rule 11, read backwards). */
  value(expr: Expr, e: CatalogElement, path: string): unknown {
    while (expr.kind === "paren") expr = expr.inner;
    switch (e.kind) {
      case "ref":
        return this.ref(expr, e.ref!, path);
      case "json":
        return this.jsonencode(expr, path);
      case "integer": {
        const v = this.literal(expr, path);
        if (typeof v !== "number") {
          this.fail("NON_LITERAL_VALUE", expr, path, `${path} must be a number.`);
        }
        return v;
      }
      case "integerString": {
        const v = this.literal(expr, path);
        return typeof v === "number" ? String(v) : v;
      }
      case "object": {
        if (expr.kind !== "object") return this.shapeRefused(expr, path, "an object");
        const fields = byAttr(e.fields ?? []);
        const out: Record<string, unknown> = {};
        const keys = new Map<string, Expr>();
        for (const item of expr.items) {
          const k = this.objectKey(item, path);
          if (keys.has(k)) this.duplicate(item.key, `${path}.${k}`, keys.get(k)!);
          keys.set(k, item.key);
          if (isNull(item.value)) continue;
          const f = fields.get(k);
          if (f === undefined) {
            this.fail(
              "UNKNOWN_ATTRIBUTE",
              item.key,
              `${path}.${k}`,
              `${k} is not a field of ${path}.`,
            );
          }
          out[f.key] = this.value(item.value, f, `${path}.${k}`);
        }
        return out;
      }
      case "list":
        if (expr.kind !== "tuple") return this.shapeRefused(expr, path, "a list");
        if (e.of === undefined)
          return expr.items.map((x, k) => this.stringScalar(x, `${path}[${k}]`));
        return expr.items.map((x, k) => this.value(x, e.of!, `${path}[${k}]`));
      case "map": {
        if (expr.kind !== "object") return this.shapeRefused(expr, path, "a map");
        const out: Record<string, unknown> = {};
        const keys = new Map<string, Expr>();
        for (const item of expr.items) {
          const k = this.objectKey(item, path);
          if (keys.has(k)) this.duplicate(item.key, `${path}.${k}`, keys.get(k)!);
          keys.set(k, item.key);
          if (isNull(item.value)) continue;
          out[k] =
            e.of === undefined
              ? this.stringScalar(item.value, `${path}.${k}`)
              : this.value(item.value, e.of, `${path}.${k}`);
        }
        return out;
      }
      default:
        return this.stringScalar(expr, path);
    }
  }

  /**
   * A value where the provider's attribute is a string, a map of strings or a
   * list of strings (every kind above that reaches here). Terraform converts
   * a number or a bool to its string and refuses anything else, so this does
   * the same, and both sides read one file to one document. A number whose
   * JavaScript string is not the one Terraform writes (past 2^53, or in
   * exponent form) is refused rather than guessed: quote it.
   */
  stringScalar(expr: Expr, path: string): string {
    const v = this.literal(expr, path);
    if (typeof v === "string") return v;
    if (typeof v === "boolean") return String(v);
    if (typeof v === "number") {
      const text = String(v);
      if (!/e/i.test(text) && (!Number.isInteger(v) || Number.isSafeInteger(v))) return text;
      return this.fail(
        "NON_LITERAL_VALUE",
        expr,
        path,
        `${path} is a number a string cannot hold exactly here; write it as a string.`,
      );
    }
    return this.shapeRefused(expr, path, "a string");
  }

  /** A value of the wrong shape for its catalog kind: an expression, or a literal of another type. */
  shapeRefused(expr: Expr, path: string, shape: string): never {
    return this.fail("NON_LITERAL_VALUE", expr, path, `${path} must be ${shape} literal.`);
  }

  /** A second definition of something HCL allows once (Terraform refuses it too). */
  duplicate(node: { first: number }, path: string, first: { first: number }): never {
    const at = this.file.tokens[first.first]!.start;
    return this.fail(
      "DUPLICATE_ATTRIBUTE",
      node,
      path,
      `${path} is already defined at line ${String(at.line)}, column ${String(at.column)}.`,
    );
  }

  objectKey(item: { key: Expr; bareKey: boolean }, path: string): string {
    return item.bareKey && item.key.kind === "traversal"
      ? item.key.root
      : this.string(item.key, path);
  }

  /** A reference attribute (rules 20 and 21): a key, a JSONPath, the full token, or sugar. */
  ref(expr: Expr, type: RefType, path: string): string {
    while (expr.kind === "paren") expr = expr.inner;
    const example = `"${type}:<name>"`;
    if (expr.kind === "template" && expr.parts.every((p) => p.kind === "text")) {
      const s = this.string(expr, path);
      if (s.startsWith("$.")) return s;
      if (s.startsWith("arn:")) {
        this.fail(
          "LITERAL_ARN",
          expr,
          path,
          `${path} holds a literal ARN; write a reference key such as ${example} and bind it in refs.`,
        );
      }
      let key = s;
      const token = parseToken(s);
      if (token !== undefined) {
        key = s.slice("${cdref:".length, -1);
      }
      const m = REF_KEY.exec(key);
      if (m === null || m[1] !== type) {
        this.fail(
          "REF_KEY_MALFORMED",
          expr,
          path,
          `${path} must hold a ${type} reference key such as ${example}, a JSONPath, or the full token; got ${JSON.stringify(s)}.`,
        );
      }
      if (token !== undefined) this.normalized.push({ attribute: path, from: s, to: key });
      return `\${cdref:${key}}`;
    }
    const text = sourceOf(this.file, expr);
    const boundTo = Object.entries(this.refs).find(([, v]) => v === text)?.[0];
    const instead =
      boundTo === undefined
        ? `write a reference key such as ${example} here and bind it in refs: ${example} = ${text}`
        : `write "${boundTo}" here; refs already binds it to ${text}`;
    const address = arnAddress(expr);
    if (address !== undefined) {
      const sugar = ADDRESS_SUGAR.find((s) => s.prefix === address.type);
      if (sugar === undefined) {
        this.fail(
          "REF_SUGAR_UNSUPPORTED_TYPE",
          expr,
          path,
          `${path}: ${address.type} addresses are not rewritten to a key; ${instead}.`,
        );
      }
      const name = slugFromLabel(address.label);
      if (name !== undefined) {
        const key = `${sugar.type}:${name}`;
        if (sugar.type !== type) {
          this.fail(
            "REF_KEY_MALFORMED",
            expr,
            path,
            `${path} takes a ${type} reference; ${text} is a ${sugar.type}.`,
          );
        }
        // One key, one address. Two addresses that read to the same key, or a
        // refs entry binding the key elsewhere, would leave one action pointing
        // somewhere its author did not write.
        const bound = Object.hasOwn(this.refs, key) ? this.refs[key] : null;
        const earlier = this.sugar.get(key);
        const other =
          bound !== null && bound !== text
            ? bound
            : earlier !== undefined && earlier !== text
              ? earlier
              : undefined;
        if (other !== undefined) {
          this.fail(
            "REF_EXPRESSION_REFUSED",
            expr,
            path,
            `${path}: ${text} reads as "${key}", which is already bound to ${other}; ` +
              `give the two resources distinct reference keys in refs and write the keys.`,
          );
        }
        this.normalized.push({ attribute: path, from: text, to: key, binding: text });
        if (bound === null) this.sugar.set(key, text);
        return `\${cdref:${key}}`;
      }
    }
    return this.fail(
      "REF_EXPRESSION_REFUSED",
      expr,
      path,
      `${path} holds the expression ${text}; ${instead}.`,
    );
  }
}

/** `<type>.<label>.arn` or `data.<type>.<label>.arn`, as the type (with `data.`) and label. */
export function arnAddress(expr: Expr): { type: string; label: string } | undefined {
  if (expr.kind !== "traversal") return undefined;
  const names = expr.steps.map((s) => (s.kind === "attr" ? s.name : undefined));
  if (names.some((n) => n === undefined)) return undefined;
  if (
    ["var", "local", "module", "path", "terraform", "count", "each", "self"].includes(expr.root)
  ) {
    return undefined;
  }
  if (expr.root === "data") {
    if (names.length !== 3 || names[2] !== "arn") return undefined;
    return { type: `data.${names[0]!}`, label: names[1]! };
  }
  if (names.length !== 2 || names[1] !== "arn") return undefined;
  return { type: expr.root, label: names[0]! };
}

/** The inverse of slugIdentifier, or undefined when the label is not one. */
export function slugFromLabel(label: string): string | undefined {
  const name = (/^_[0-9]/.test(label) ? label.slice(1) : label).replaceAll("_", "-");
  return SLUG_PATTERN.test(name) && slugIdentifier(name) === label ? name : undefined;
}

/**
 * Comment lines marked @keep in the run of line comments directly above the
 * resource and above each action block (rule 24).
 */
export function keptComments(file: HclFile, resource: Block): KeptComments | undefined {
  const out: KeptComments = { resource: keepAbove(file, resource.first), actions: {} };
  for (const item of resource.body.items) {
    if (item.kind !== "block" || item.type !== "action") continue;
    const kept = keepAbove(file, item.first);
    if (kept.length === 0) continue;
    const id = actionId(file, item);
    if (id !== undefined) out.actions[id] = kept;
  }
  return out.resource.length === 0 && Object.keys(out.actions).length === 0 ? undefined : out;
}

function actionId(file: HclFile, block: Block): string | undefined {
  const a = block.body.items.find((i): i is Attribute => i.kind === "attribute" && i.name === "id");
  if (a === undefined) return undefined;
  try {
    const v = evaluateLiteral(a.expr, file);
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

function keepAbove(file: HclFile, first: number): string[] {
  const lines: string[] = [];
  let k = first - 1;
  // The newline ending the previous line belongs to the comment above or is a blank line.
  while (k >= 0) {
    const t = file.tokens[k]!;
    if (t.type === "Comment" && t.text.endsWith("\n") && lineStarts(file, k)) {
      lines.unshift(t.text.trimEnd());
      k -= 1;
    } else break;
  }
  // The banner's second line mentions @keep; it is the banner, not a kept comment.
  return lines.filter((l) => l.includes("@keep") && !BANNER_LINES.some((b) => l.startsWith(b)));
}

const [BANNER_FIRST = "", BANNER_SECOND = ""] = banner("").split("\n");
/** The banner's first line up to the file name, and its second line whole. */
const BANNER_LINES = [BANNER_FIRST.slice(0, -1), BANNER_SECOND];

/** An attribute set to the literal null, which Terraform treats as unset. */
function isNull(expr: Expr): boolean {
  while (expr.kind === "paren") expr = expr.inner;
  return expr.kind === "literal" && expr.value === null;
}

/** Whether token k is the first on its line. */
function lineStarts(file: HclFile, k: number): boolean {
  if (k === 0) return true;
  const prev = file.tokens[k - 1]!;
  return prev.type === "Newline" || (prev.type === "Comment" && prev.text.endsWith("\n"));
}
