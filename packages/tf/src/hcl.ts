/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A very small HCL writer. It writes the handful of shapes this emitter needs
// (comments, `key = expression` arguments, and nested blocks) in the layout
// `terraform fmt` / `tofu fmt` produce, so emitted files are fmt-clean and stay
// byte-stable across runs.
//
// fmt aligns the `=` of a maximal run of consecutive argument lines, and a
// comment or a blank line ends the run. That rule is reproduced in `render`
// below and is asserted against a real `tofu fmt` in the gated validate tests.

/** One line of an HCL body. */
export type HclLine =
  | { kind: "arg"; key: string; value: string }
  | { kind: "objectArg"; key: string; body: HclLine[]; open?: string; close?: string }
  | { kind: "block"; type: string; labels: string[]; body: HclLine[] }
  | { kind: "comment"; text: string }
  | { kind: "blank" };

export const arg = (key: string, value: string): HclLine => ({ kind: "arg", key, value });
export const comment = (text: string): HclLine => ({ kind: "comment", text });
export const blank = (): HclLine => ({ kind: "blank" });
export const block = (type: string, labels: string[], body: HclLine[]): HclLine => ({
  kind: "block",
  type,
  labels,
  body,
});
/**
 * `key = { ... }`: an object value, not a block. `open` and `close` wrap the
 * body in something else, such as a `merge(...)` call around the braces.
 */
export const objectArg = (
  key: string,
  body: HclLine[],
  wrap?: { open: string; close: string },
): HclLine => ({ kind: "objectArg", key, body, ...wrap });

/**
 * A double-quoted HCL string with no template introducer left live. A quoted
 * string in .tf is itself a template, so `${` and `%{` are escaped here too.
 * The `$` replacements are functions because a string replacement would give
 * `$` its substitution meaning and undo the escape.
 */
export function quote(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")
    .replaceAll("${", () => "$${")
    .replaceAll("%{", () => "%%{");
  return `"${escaped}"`;
}

/**
 * Renders body lines at the given indent, aligning the `=` within each run of
 * consecutive argument lines the way fmt does.
 */
export function render(lines: readonly HclLine[], indent = ""): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.kind === "blank") {
      out.push("");
      continue;
    }
    if (line.kind === "comment") {
      out.push(`${indent}# ${line.text}`.trimEnd());
      continue;
    }
    if (line.kind === "block") {
      const labels = line.labels.map((l) => ` ${quote(l)}`).join("");
      out.push(`${indent}${line.type}${labels} {`);
      out.push(...render(line.body, `${indent}  `));
      out.push(`${indent}}`);
      continue;
    }
    if (line.kind === "objectArg") {
      out.push(`${indent}${line.key} = ${line.open ?? "{"}`);
      out.push(...render(line.body, `${indent}  `));
      out.push(`${indent}${line.close ?? "}"}`);
      continue;
    }
    // An argument: gather the whole run so the `=` columns line up.
    const run: { key: string; value: string }[] = [];
    let j = i;
    for (; j < lines.length; j += 1) {
      const next = lines[j];
      if (next === undefined || next.kind !== "arg") break;
      run.push({ key: next.key, value: next.value });
    }
    const width = Math.max(...run.map((a) => a.key.length));
    for (const a of run) out.push(`${indent}${a.key.padEnd(width)} = ${a.value}`);
    i = j - 1;
  }
  return out;
}

/** A whole file: rendered lines plus the trailing newline fmt insists on. */
export function renderFile(lines: readonly HclLine[]): string {
  return `${render(lines).join("\n").replace(/\n+$/, "")}\n`;
}
