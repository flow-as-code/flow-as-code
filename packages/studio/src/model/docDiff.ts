/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A line diff over two FlowDocs, for the conflict dialog.
//
// The comparison is of the CANONICAL serialization (@flow-as-code/core's serialize), not
// of whatever bytes each side happened to have: key order and layout rounding
// are not differences a user should be asked to arbitrate, and two documents
// that serialize identically are the same document. That also means the dialog
// can say "these are identical" instead of showing a diff with no rows.
//
// No dependency: this is a plain longest-common-subsequence over lines, with
// the usual common prefix and suffix trimmed off first. FlowDocs are small
// (250 actions at the Connect limit), but the DP is quadratic, so a middle
// section bigger than MAX_CELLS falls back to "everything here changed" rather
// than allocating a matrix nobody can afford. The fallback is still correct,
// just less granular, and it is reported so the UI can say so.

import type { FlowDoc } from "@flow-as-code/core";
import { serialize } from "@flow-as-code/core";

/** Cap on the LCS matrix. 1e6 cells is 4 MB in a Uint32Array. */
const MAX_CELLS = 1_000_000;

export type DiffKind = "same" | "changed" | "added" | "removed";

export interface DiffRow {
  kind: DiffKind;
  /** Text on the left side, absent when the line was added on the right. */
  left?: string;
  /** Text on the right side, absent when the line was removed. */
  right?: string;
  /** 1-based line numbers, for the gutters. */
  leftNo?: number;
  rightNo?: number;
}

export interface DocDiff {
  rows: DiffRow[];
  /** True when the two sides serialize identically. */
  identical: boolean;
  added: number;
  removed: number;
  /** True when the middle was too large to align line by line. */
  coarse: boolean;
}

/** The canonical text of a document, split into lines. */
export function docLines(doc: FlowDoc): string[] {
  const text = serialize(doc);
  const lines = text.split("\n");
  // serialize() always ends with a newline; that trailing "" is not a line.
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

interface Edit {
  kind: "same" | "added" | "removed";
  left?: string;
  right?: string;
}

/** Longest common subsequence alignment of two line arrays. */
function align(left: string[], right: string[]): { edits: Edit[]; coarse: boolean } {
  const edits: Edit[] = [];
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) {
    edits.push({ kind: "same", left: left[start], right: right[start] });
    start++;
  }
  let endL = left.length;
  let endR = right.length;
  const suffix: Edit[] = [];
  while (endL > start && endR > start && left[endL - 1] === right[endR - 1]) {
    endL--;
    endR--;
    suffix.unshift({ kind: "same", left: left[endL], right: right[endR] });
  }

  const a = left.slice(start, endL);
  const b = right.slice(start, endR);
  let coarse = false;

  if (a.length * b.length > MAX_CELLS) {
    coarse = true;
    for (const line of a) edits.push({ kind: "removed", left: line });
    for (const line of b) edits.push({ kind: "added", right: line });
  } else if (a.length === 0 || b.length === 0) {
    for (const line of a) edits.push({ kind: "removed", left: line });
    for (const line of b) edits.push({ kind: "added", right: line });
  } else {
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
        edits.push({ kind: "same", left: a[i], right: b[j] });
        i++;
        j++;
      } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
        edits.push({ kind: "removed", left: a[i] });
        i++;
      } else {
        edits.push({ kind: "added", right: b[j] });
        j++;
      }
    }
    while (i < a.length) edits.push({ kind: "removed", left: a[i++] });
    while (j < b.length) edits.push({ kind: "added", right: b[j++] });
  }

  edits.push(...suffix);
  return { edits, coarse };
}

/**
 * Pairs each run of removed lines with the run of added lines that follows it,
 * so the two columns line up the way a side-by-side diff is read. Leftovers
 * stay one-sided.
 */
function pair(edits: Edit[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let leftNo = 0;
  let rightNo = 0;
  for (let i = 0; i < edits.length;) {
    const edit = edits[i]!;
    if (edit.kind === "same") {
      rows.push({
        kind: "same",
        left: edit.left,
        right: edit.right,
        leftNo: ++leftNo,
        rightNo: ++rightNo,
      });
      i++;
      continue;
    }
    const removed: string[] = [];
    while (edits[i]?.kind === "removed") removed.push(edits[i++]!.left!);
    const added: string[] = [];
    while (edits[i]?.kind === "added") added.push(edits[i++]!.right!);
    const span = Math.max(removed.length, added.length);
    for (let k = 0; k < span; k++) {
      const l = removed[k];
      const r = added[k];
      if (l !== undefined && r !== undefined) {
        rows.push({ kind: "changed", left: l, right: r, leftNo: ++leftNo, rightNo: ++rightNo });
      } else if (l !== undefined) {
        rows.push({ kind: "removed", left: l, leftNo: ++leftNo });
      } else {
        rows.push({ kind: "added", right: r, rightNo: ++rightNo });
      }
    }
  }
  return rows;
}

/** Diffs two line arrays. Exported for tests; diffDocs is the real entry. */
export function diffLines(left: string[], right: string[]): DocDiff {
  const { edits, coarse } = align(left, right);
  const rows = pair(edits);
  return {
    rows,
    identical: rows.every((r) => r.kind === "same"),
    added: rows.filter((r) => r.kind === "added" || r.kind === "changed").length,
    removed: rows.filter((r) => r.kind === "removed" || r.kind === "changed").length,
    coarse,
  };
}

/** The side-by-side diff of two FlowDocs, in canonical form. */
export function diffDocs(left: FlowDoc | null, right: FlowDoc | null): DocDiff {
  return diffLines(left === null ? [] : docLines(left), right === null ? [] : docLines(right));
}
