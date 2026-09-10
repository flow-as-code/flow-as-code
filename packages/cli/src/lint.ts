/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli lint <dir-or-file>`.
//
// The whole document set goes to @flow-as-code/core's lint in ONE call. Rules receive
// `all` alongside `doc` (packages/core/src/lint/types.ts), and the ones
// that follow module references need the rest of the set to answer at all:
// linting file by file would silently downgrade module-depth-5 and every other
// cross-document rule to a no-op.
//
// Exit status is severity, not finding count: any `error` exits 1, warnings
// alone exit 0.

import { lint, toJson, toText } from "@flow-as-code/core";

import { loadDocs } from "./docs.js";
import { CliError } from "./errors.js";

export type LintFormat = "text" | "json";

export interface LintOptions {
  format?: string;
}

const FORMATS = new Set<string>(["text", "json"]);

export function runLint(target: string, options: LintOptions): void {
  const format = options.format ?? "text";
  if (!FORMATS.has(format)) {
    throw new CliError(`Unknown --format "${format}". Use "text" or "json".`);
  }

  const findings = lint(loadDocs(target).map((l) => l.doc));
  process.stdout.write(format === "json" ? toJson(findings) : toText(findings));

  const errors = findings.filter((f) => f.severity === "error").length;
  if (errors > 0) {
    throw new CliError(`lint failed: ${String(errors)} error-severity finding(s) in ${target}`);
  }
}
