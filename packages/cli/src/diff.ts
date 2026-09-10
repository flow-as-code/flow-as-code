/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli diff <dir> --instance <arn>`.
//
// For every FlowDoc in <dir>, finds the live flow or module of the same kind
// and name, exports it to FlowDoc through the same exporter `export` uses (so
// the live side carries tokens, not ARNs, and the same slug names), and
// compares the two canonical serializations with `layout` and `meta` removed.
// Positions and provenance are not differences anyone deploys.
//
// Output is one line per local document, in path order, and a unified diff of
// the canonical JSON under each changed one, so the same two states always
// print the same bytes. Live flows with no local document are not reported:
// the question is whether what is checked in matches what is deployed.
//
// A live flow that has never been published has no published content to
// compare; the exporter reads its saved content through the `$SAVED` alias
// (packages/core/src/export.ts, savedFallback), and this command says
// so on the status line, `unchanged ($SAVED)`, and in the diff label,
// `live/<name>:$SAVED`. "Unchanged" against a draft is not "deployed".
//
// Exit codes are three-way so a script can tell "differs" from "could not
// tell": 0 when nothing differs, 1 when any document is changed or has no live
// counterpart, 2 when the comparison itself failed (bad arguments, no SDK,
// the instance unreadable, or a matched live flow that cannot be exported).

import { relative } from "node:path";

import type { ExportedFlow, ExportFailure, FlowDoc } from "@flow-as-code/core";
import { exportInstance, normalizeArn, serialize } from "@flow-as-code/core";

import { type LiveClients, parseInstanceArn, SDK_CLIENTS } from "./aws.js";
import { loadDocs } from "./docs.js";
import { CliError, messageOf } from "./errors.js";

export interface DiffOptions {
  instance: string;
}

export type DiffStatus = "unchanged" | "changed" | "missing-live" | "error";

export interface DiffEntry {
  /** Path of the local document, relative to the working directory. */
  path: string;
  name: string;
  kind: FlowDoc["kind"];
  status: DiffStatus;
  /** Unified diff for `changed`, the exporter's reason for `error`. */
  detail?: string;
  /**
   * True when the live twin has never been published and its saved content
   * was compared instead (read through the `$SAVED` alias).
   */
  saved?: boolean;
}

/** The marker on a status line and a diff label for a `$SAVED` twin. */
export const SAVED_MARKER = "$SAVED";

/** Exit code for a failure of the comparison itself. */
export const EXIT_DIFF_ERROR = 2;

/** Lines of the canonical text with layout and meta removed. */
export function comparableLines(doc: FlowDoc): string[] {
  const { layout: _layout, meta: _meta, ...rest } = doc;
  const lines = serialize(rest as FlowDoc).split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

// --- Unified diff ------------------------------------------------------------
// A plain longest-common-subsequence over lines, common prefix and suffix
// trimmed first. FlowDocs are small, but the table is quadratic, so a middle
// larger than MAX_CELLS is reported as wholly replaced rather than aligned.

/** Cap on the LCS table. 1e6 cells is 4 MB in a Uint32Array. */
const MAX_CELLS = 1_000_000;

/** Context lines on each side of a change. */
const CONTEXT = 3;

interface Edit {
  kind: " " | "-" | "+";
  text: string;
}

function align(left: string[], right: string[]): Edit[] {
  const edits: Edit[] = [];
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) {
    edits.push({ kind: " ", text: left[start]! });
    start++;
  }
  let endL = left.length;
  let endR = right.length;
  const suffix: Edit[] = [];
  while (endL > start && endR > start && left[endL - 1] === right[endR - 1]) {
    endL--;
    endR--;
    suffix.unshift({ kind: " ", text: left[endL]! });
  }

  const a = left.slice(start, endL);
  const b = right.slice(start, endR);
  if (a.length === 0 || b.length === 0 || a.length * b.length > MAX_CELLS) {
    for (const text of a) edits.push({ kind: "-", text });
    for (const text of b) edits.push({ kind: "+", text });
    return [...edits, ...suffix];
  }

  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      edits.push({ kind: " ", text: a[i]! });
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      edits.push({ kind: "-", text: a[i]! });
      i++;
    } else {
      edits.push({ kind: "+", text: b[j]! });
      j++;
    }
  }
  while (i < a.length) edits.push({ kind: "-", text: a[i++]! });
  while (j < b.length) edits.push({ kind: "+", text: b[j++]! });
  return [...edits, ...suffix];
}

/** `start,count` as unified diff writes it: no count when 1, previous line when 0. */
function range(start: number, count: number): string {
  const shown = count === 0 ? start - 1 : start;
  return count === 1 ? String(shown) : `${String(shown)},${String(count)}`;
}

/**
 * Unified diff of two line arrays, with the usual three lines of context.
 * Empty when the sides are identical.
 */
export function unifiedDiff(
  left: string[],
  right: string[],
  leftLabel: string,
  rightLabel: string,
): string {
  const edits = align(left, right);
  if (edits.every((edit) => edit.kind === " ")) return "";

  const out = [`--- ${leftLabel}`, `+++ ${rightLabel}`];
  // Line numbers of the edit at each index, for hunk headers.
  let leftNo = 1;
  let rightNo = 1;
  const positions = edits.map((edit) => {
    const at = { left: leftNo, right: rightNo };
    if (edit.kind !== "+") leftNo++;
    if (edit.kind !== "-") rightNo++;
    return at;
  });

  let index = 0;
  while (index < edits.length) {
    if (edits[index]!.kind === " ") {
      index++;
      continue;
    }
    const hunkStart = Math.max(0, index - CONTEXT);
    let lastChange = index;
    let cursor = index + 1;
    // Extend while the next change is within two contexts of the last one.
    while (cursor < edits.length && cursor - lastChange <= 2 * CONTEXT) {
      if (edits[cursor]!.kind !== " ") lastChange = cursor;
      cursor++;
    }
    const hunkEnd = Math.min(edits.length, lastChange + CONTEXT + 1);

    const slice = edits.slice(hunkStart, hunkEnd);
    const leftCount = slice.filter((edit) => edit.kind !== "+").length;
    const rightCount = slice.filter((edit) => edit.kind !== "-").length;
    const at = positions[hunkStart]!;
    out.push(`@@ -${range(at.left, leftCount)} +${range(at.right, rightCount)} @@`);
    for (const edit of slice) out.push(`${edit.kind}${edit.text}`);
    index = hunkEnd;
  }
  return out.join("\n") + "\n";
}

// --- The command -------------------------------------------------------------

/** Runs `work`, turning any failure into the operational exit code. */
async function operational<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new CliError(messageOf(error), EXIT_DIFF_ERROR, { cause: error });
  }
}

const keyOf = (kind: string, name: string): string => `${kind}/${name}`;

export async function runDiff(
  dir: string,
  options: DiffOptions,
  clients: LiveClients = SDK_CLIENTS,
): Promise<DiffEntry[]> {
  const target = parseInstanceArn(options.instance, EXIT_DIFF_ERROR);
  const docs = await operational(() => loadDocs(dir));
  const client = await operational(() => clients.inventory(target));
  const result = await operational(() => exportInstance(client, { onError: "collect" }));

  const live = new Map<string, ExportedFlow>();
  for (const flow of result.flows) live.set(keyOf(flow.doc.kind, flow.doc.name), flow);
  // A failed export still has a reverse-map entry, which says what it would
  // have been called; that is how a local document learns its live twin is
  // unreadable rather than absent.
  const failed = new Map<string, ExportFailure>();
  for (const failure of result.failures) {
    const entry = result.reverseMap.byArn.get(normalizeArn(failure.arn));
    if (entry !== undefined) failed.set(keyOf(entry.type, entry.name), failure);
  }

  const entries: DiffEntry[] = docs.map(({ path, doc }) => {
    const rel = relative(process.cwd(), path);
    const key = keyOf(doc.kind, doc.name);
    const base = { path: rel, name: doc.name, kind: doc.kind };
    const twin = live.get(key);
    if (twin !== undefined) {
      const saved = twin.saved === true;
      const diff = unifiedDiff(
        comparableLines(doc),
        comparableLines(twin.doc),
        `local/${rel}`,
        saved ? `live/${doc.name}:${SAVED_MARKER}` : `live/${doc.name}`,
      );
      const matched =
        diff === ""
          ? { status: "unchanged" as const }
          : { status: "changed" as const, detail: diff };
      return { ...base, ...matched, ...(saved ? { saved } : {}) };
    }
    const failure = failed.get(key);
    if (failure !== undefined) return { ...base, status: "error", detail: failure.reason };
    return { ...base, status: "missing-live" };
  });

  for (const entry of entries) {
    const marker = entry.saved === true ? ` (${SAVED_MARKER})` : "";
    const suffix = entry.status === "error" ? `: ${entry.detail ?? ""}` : "";
    console.log(`${entry.path}: ${entry.status}${marker}${suffix}`);
    if (entry.status === "changed") process.stdout.write(entry.detail ?? "");
  }

  const errors = entries.filter((entry) => entry.status === "error").length;
  if (errors > 0) {
    throw new CliError(
      `${String(errors)} document(s) could not be compared with ${target.arn}`,
      EXIT_DIFF_ERROR,
    );
  }
  const differing = entries.filter((entry) => entry.status !== "unchanged").length;
  if (differing > 0) {
    throw new CliError(
      `${String(differing)} of ${String(entries.length)} document(s) differ from ${target.arn}`,
    );
  }
  return entries;
}
