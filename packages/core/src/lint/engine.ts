/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FlowDoc } from "../flowdoc.js";
import { assertFlowDoc } from "../flowdoc.js";
import { allRules } from "./rules/index.js";
import type { Finding, Rule } from "./types.js";

export interface LintOptions {
  /** Defaults to every built-in rule. */
  rules?: readonly Rule[];
  /** Rule ids to skip. */
  disable?: readonly string[];
}

const order = (a: Finding, b: Finding): number =>
  a.doc.localeCompare(b.doc) ||
  a.rule.localeCompare(b.rule) ||
  (a.blockId ?? "").localeCompare(b.blockId ?? "") ||
  a.message.localeCompare(b.message);

/**
 * Runs every rule over every document. Findings are sorted so output is stable
 * regardless of rule execution order.
 */
export function lint(input: FlowDoc | readonly FlowDoc[], options: LintOptions = {}): Finding[] {
  const docs = Array.isArray(input) ? input : [input as FlowDoc];
  // Rules read doc.content.Actions and doc.name directly. A malformed document
  // used to surface as a TypeError from whichever rule happened to run first,
  // which named neither lint nor the document.
  for (const doc of docs) assertFlowDoc(doc, "lint");
  const disabled = new Set(options.disable ?? []);
  const rules = (options.rules ?? allRules).filter((r) => !disabled.has(r.id));

  const findings: Finding[] = [];
  for (const doc of docs) {
    for (const rule of rules) {
      rule.check({
        doc,
        all: docs,
        report: (f) => findings.push({ ...f, rule: rule.id, doc: doc.name }),
      });
    }
  }
  return findings.sort(order);
}

/** True when any finding would block a studio save. */
export function hasBlockingFindings(
  findings: readonly Finding[],
  rules: readonly Rule[] = allRules,
): boolean {
  const hard = new Set(rules.filter((r) => r.hard).map((r) => r.id));
  return findings.some((f) => hard.has(f.rule));
}
