/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// What regeneration carries from the companion on disk (conformance/hcl/
// README.md rule 24). Read leniently: only the resource's own attributes, its
// meta-blocks, reference bindings and @keep comments matter here, so a file
// whose actions the reader would refuse still gives up its carried values.

import type { Attribute, Block, Expr, HclFile } from "./ast.js";
import { ADDRESS_SUGAR, FLOW_RESOURCE, MODULE_RESOURCE } from "./contract.js";
import { evaluateLiteral } from "./literal.js";
import { parse } from "./parser.js";
import { sourceOf } from "./print.js";
import { arnAddress, keptComments, slugFromLabel } from "./read.js";

export interface Carry {
  /** Reference key -> expression source, or null for a key written unbound. */
  bindings: Record<string, string | null>;
  /** @keep lines above the resource, as written. */
  keepResource: string[];
  /** @keep lines above each action block, by id, without indentation. */
  keepActions: Map<string, string[]>;
  provider?: string;
  instanceId?: string;
  state?: string;
  externalInvocation?: string;
  /** The `tags` expression's source. */
  tags?: string;
  /** Whole blocks and attributes, as written. */
  lint?: string;
  lifecycle?: string;
  dependsOn?: string;
}

/** The carried values of a previous companion. A file with no resource carries nothing. */
export function readCarry(text: string, fileName = "<previous>"): Carry {
  const file = parse(text, fileName);
  const carry: Carry = { bindings: {}, keepResource: [], keepActions: new Map() };
  const resource = file.body.items.find(
    (i): i is Block =>
      i.kind === "block" &&
      i.type === "resource" &&
      (i.labels[0] === FLOW_RESOURCE || i.labels[0] === MODULE_RESOURCE),
  );
  if (resource === undefined) return carry;

  const expr = (a: Attribute): string => sourceOf(file, a.expr);
  for (const item of resource.body.items) {
    if (item.kind === "attribute") {
      switch (item.name) {
        case "provider":
          carry.provider = expr(item);
          break;
        case "instance_id":
          carry.instanceId = expr(item);
          break;
        case "state":
          carry.state = expr(item);
          break;
        case "external_invocation_enabled":
          carry.externalInvocation = expr(item);
          break;
        case "tags":
          carry.tags = expr(item);
          break;
        case "depends_on":
          carry.dependsOn = sourceOf(file, item);
          break;
        case "refs":
          if (item.expr.kind === "object") {
            for (const entry of item.expr.items) {
              const key = keyOf(file, entry.key);
              if (key === undefined) continue;
              const v = entry.value;
              carry.bindings[key] =
                v.kind === "literal" && v.value === null ? null : sourceOf(file, v);
            }
          }
          break;
      }
    } else if (item.type === "lint") carry.lint = sourceOf(file, item);
    else if (item.type === "lifecycle") carry.lifecycle = sourceOf(file, item);
    else if (item.type === "action") sugarBindings(file, item, carry.bindings);
  }

  const keep = keptComments(file, resource);
  if (keep !== undefined) {
    carry.keepResource = keep.resource;
    for (const [id, lines] of Object.entries(keep.actions)) carry.keepActions.set(id, lines);
  }
  return carry;
}

function keyOf(file: HclFile, key: Expr): string | undefined {
  if (key.kind === "traversal" && key.steps.length === 0) return key.root;
  try {
    const v = evaluateLiteral(key, file);
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Bindings an action's sugar implies (rule 21), where refs does not already bind the key. */
function sugarBindings(file: HclFile, block: Block, out: Record<string, string | null>): void {
  const visit = (e: Expr): void => {
    const address = arnAddress(e);
    if (address !== undefined) {
      const sugar = ADDRESS_SUGAR.find((s) => s.prefix === address.type);
      const name = slugFromLabel(address.label);
      if (sugar !== undefined && name !== undefined) {
        const key = `${sugar.type}:${name}`;
        if (out[key] === undefined || out[key] === null) out[key] = sourceOf(file, e);
      }
      return;
    }
    if (e.kind === "object") for (const item of e.items) visit(item.value);
    if (e.kind === "tuple") e.items.forEach(visit);
  };
  const walk = (b: Block): void => {
    for (const item of b.body.items) {
      if (item.kind === "attribute") visit(item.expr);
      else walk(item);
    }
  };
  walk(block);
}
