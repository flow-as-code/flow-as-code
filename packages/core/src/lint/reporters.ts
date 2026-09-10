/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Finding } from "./types.js";

/** Machine-readable. Stable shape; the CLI's --format json emits this. */
export function toJson(findings: readonly Finding[]): string {
  const errors = findings.filter((f) => f.severity === "error").length;
  return (
    JSON.stringify(
      {
        summary: { total: findings.length, errors, warnings: findings.length - errors },
        findings,
      },
      null,
      2,
    ) + "\n"
  );
}

/** Human-readable, one finding per line, grouped by document. */
export function toText(findings: readonly Finding[]): string {
  if (findings.length === 0) return "No findings.\n";

  const lines: string[] = [];
  let current = "";
  for (const f of findings) {
    if (f.doc !== current) {
      if (current !== "") lines.push("");
      lines.push(f.doc);
      current = f.doc;
    }
    const where = f.blockId === undefined ? "" : ` (${f.blockId})`;
    lines.push(`  ${f.severity}${where}: ${f.message} [${f.rule}]`);
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  lines.push("");
  lines.push(
    `${findings.length} finding(s): ${errors} error(s), ${findings.length - errors} warning(s).`,
  );
  return lines.join("\n") + "\n";
}
