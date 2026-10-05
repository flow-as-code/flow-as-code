/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli lint <dir-or-file...>`.
//
// Each argument is a SET, and each set goes to @flow-as-code/core's lint in ONE
// call. Rules receive `all` alongside `doc` (packages/core/src/lint/types.ts),
// and the ones that follow module references or attribute writes need the
// rest of the set to answer at all: linting file by file would silently
// downgrade module-depth-5, attribute-set-before-read and every other
// cross-document rule to a no-op.
//
// Several arguments are several sets, never one merged set: a cross-document
// rule reaches across a set and stops at its edge, so `flows/ seasonal/` lints
// exactly as two runs would, in one process, with each finding naming the set
// it came from. Merging them silently would make a module in one set resolve
// a reference in another, which no deployment of the two sets separately does.
//
// Exit status is severity, not finding count, and the worst across sets: any
// `error` exits 1, warnings alone exit 0.

import type { Finding } from "@flow-as-code/core";
import { lint, toText } from "@flow-as-code/core";
import { resolve } from "node:path";

import { loadDocs } from "./docs.js";
import { CliError } from "./errors.js";

export type LintFormat = "text" | "json";

export interface LintOptions {
  format?: string;
}

/**
 * The id of the JSON report's shape. A change to the shape is a new id; the
 * schema is conformance/schema/lint-report-0.1.schema.json and
 * src/lint.test.ts validates the command's output against it.
 */
export const LINT_REPORT_FORMAT = "flow-lint-report/0.1";

export interface LintSummary {
  total: number;
  errors: number;
  warnings: number;
}

/** One finding as the report carries it: core's Finding plus the set it came from. */
export interface LintReportFinding {
  /** The set, as the argument that named it resolved to an absolute path. */
  set: string;
  rule: string;
  severity: Finding["severity"];
  /** Name of the FlowDoc the finding belongs to. */
  doc: string;
  /** Action Identifier, when the finding is about one action. */
  blockId?: string;
  message: string;
}

export interface LintSetReport {
  set: string;
  /** The documents linted, by name, in file order. */
  documents: string[];
  summary: LintSummary;
}

export interface LintReport {
  format: typeof LINT_REPORT_FORMAT;
  /** Across every set. */
  summary: LintSummary;
  /** One entry per argument, in argument order. */
  sets: LintSetReport[];
  /** Every finding, set by set in argument order, in core's order within a set. */
  findings: LintReportFinding[];
}

const FORMATS = new Set<string>(["text", "json"]);

function summarize(findings: readonly { severity: Finding["severity"] }[]): LintSummary {
  const errors = findings.filter((f) => f.severity === "error").length;
  return { total: findings.length, errors, warnings: findings.length - errors };
}

/** Lints each argument as its own set. Loading problems in any set fail the whole run first. */
export function lintSets(targets: readonly string[]): LintReport {
  const loaded = targets.map((target) => ({ set: resolve(target), docs: loadDocs(target) }));
  const sets: LintSetReport[] = [];
  const findings: LintReportFinding[] = [];
  for (const { set, docs } of loaded) {
    const found = lint(docs.map((l) => l.doc));
    sets.push({ set, documents: docs.map((l) => l.doc.name), summary: summarize(found) });
    for (const f of found) {
      findings.push({
        set,
        rule: f.rule,
        severity: f.severity,
        doc: f.doc,
        ...(f.blockId === undefined ? {} : { blockId: f.blockId }),
        message: f.message,
      });
    }
  }
  return { format: LINT_REPORT_FORMAT, summary: summarize(findings), sets, findings };
}

/** The `--format json` document, key order as the schema lists it. */
export function lintReportJson(report: LintReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}

/**
 * The `--format text` document. One set prints exactly core's text report;
 * more than one prints each set under its path, then a line across sets.
 */
export function lintReportText(report: LintReport): string {
  const perSet = report.sets.map((set) => toText(report.findings.filter((f) => f.set === set.set)));
  if (report.sets.length === 1) return perSet[0] ?? "";
  const out: string[] = [];
  report.sets.forEach((set, i) => {
    out.push(`${set.set}:`);
    out.push(perSet[i] ?? "");
  });
  const { total, errors, warnings } = report.summary;
  out.push(
    `${String(report.sets.length)} set(s): ${String(total)} finding(s), ${String(errors)} error(s), ${String(warnings)} warning(s).\n`,
  );
  return out.join("\n");
}

export function runLint(targets: readonly string[], options: LintOptions): void {
  const format = options.format ?? "text";
  if (!FORMATS.has(format)) {
    throw new CliError(`Unknown --format "${format}". Use "text" or "json".`);
  }

  const report = lintSets(targets);
  process.stdout.write(format === "json" ? lintReportJson(report) : lintReportText(report));

  const failed = report.sets.filter((set) => set.summary.errors > 0);
  if (failed.length > 0) {
    throw new CliError(
      `lint failed: ${String(report.summary.errors)} error-severity finding(s) in ${failed
        .map((set) => set.set)
        .join(", ")}`,
    );
  }
}
