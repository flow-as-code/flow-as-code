/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The three export targets (docs/02-studio-design.md, "Export targets (in-app
// buttons and CLI parity)"):
//
//   cdk  a FlowSet stack scaffold with a TODO TokenBinder, one entry per
//        reference type the document set actually uses.
//   tf   the @flow-as-code/tf emitter, against a user-supplied address map.
//   raw  materialized Flow language JSON against a resource map, for console
//        import or debugging.
//
// Parity with the CLI is the point of the feature, so nothing here reimplements
// an emitter. `flow-cli emit --target cdk` and this module call the same
// `cdkScaffold` in @flow-as-code/cdk/scaffold; `--target tf` and this
// module call the same `emitTf`; `flow-cli render` and this module call the
// same `materializeWithMap` plus `serializeContent`, and use the same
// `<name>.json` file name. tests/exportParity.test.ts runs the built CLI and
// compares the bytes.
//
// Two rules hold for every target:
//
//   1. The save gate runs first, on every document, in this module rather than
//      in a button handler. An export is a write path like any other and the
//      studio may never emit a document that fails a hard lint rule or the
//      FlowDoc schema (docs/02-studio-design.md). tests/exportGate.test.ts
//      calls these functions directly, with no UI involved.
//   2. Output is deterministic: the same documents and maps produce
//      byte-identical files, and the file map is sorted by path.

import { CDK_SCAFFOLD_FILE, cdkScaffold, sourceForDepth } from "@flow-as-code/cdk/scaffold";
import type { FlowDoc } from "@flow-as-code/core";
import {
  MaterializeError,
  collectRefs,
  materializeWithMap,
  serializeContent,
} from "@flow-as-code/core";
import { emitTf } from "@flow-as-code/tf/emit";
import { assertSaveable } from "../model/validate.js";
import { isExportSubdir, type ExportTarget } from "../store/bridgeProtocol.js";

export type { ExportTarget };

export interface ExportBundle {
  target: ExportTarget;
  /** Where the files go, relative to the export root. "" is the root itself. */
  subdir: string;
  /** Relative POSIX path to content, sorted by path. */
  files: Record<string, string>;
}

interface CommonInput {
  docs: readonly FlowDoc[];
  /** Subdirectory to write into; "" means the served directory itself. */
  subdir?: string;
}

export interface CdkExportInput extends CommonInput {
  target: "cdk";
}

export interface TfExportInput extends CommonInput {
  target: "tf";
  /** Reference key to terraform address expression. See @flow-as-code/tf EmitTfOptions. */
  addressMap: Record<string, string>;
}

export interface RawExportInput extends CommonInput {
  target: "raw";
  /** Token to resolved value. Literal ARNs are the goal here, not a mistake. */
  resourceMap: Record<string, string>;
}

export type ExportInput = CdkExportInput | TfExportInput | RawExportInput;

/** Raw export refused: one or more tokens have no entry in the resource map. */
export class ExportMapError extends Error {
  /** Every unmapped token across every document, sorted and deduplicated. */
  readonly missingTokens: readonly string[];

  constructor(missingTokens: readonly string[]) {
    super(
      `Cannot export: ${String(missingTokens.length)} token(s) have no resource map entry: ` +
        missingTokens.join(", "),
    );
    this.name = "ExportMapError";
    this.missingTokens = missingTokens;
  }
}

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sortFiles = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).sort(([a], [b]) => byPath(a, b)));

/**
 * The save gate, run on the whole set before anything is emitted. Throws
 * SaveRefusedError naming the first offending document; nothing is emitted for
 * any document when one of them fails, because a half-written export of a set
 * is worse than none.
 */
function gate(docs: readonly FlowDoc[]): readonly FlowDoc[] {
  if (docs.length === 0) throw new Error("There is nothing to export.");
  for (const doc of docs) assertSaveable(doc);
  return docs;
}

function checkSubdir(subdir: string): string {
  if (!isExportSubdir(subdir)) {
    throw new Error(
      `"${subdir}" is not a usable subdirectory: use POSIX segments of letters, digits, ` +
        "dot, dash, and underscore, at most three deep.",
    );
  }
  return subdir;
}

/** Depth of a subdirectory, which is how far the scaffold sits below the docs. */
const depthOf = (subdir: string): number => (subdir === "" ? 0 : subdir.split("/").length);

/**
 * The CDK scaffold: a FlowSet stack plus a TokenBinder with a TODO on exactly
 * the reference types the set uses. Identical to `flow-cli emit --target cdk`
 * for the same documents and the same output directory, because it is the same
 * generator (@flow-as-code/cdk/scaffold).
 */
export function exportCdk(input: CdkExportInput): ExportBundle {
  const subdir = checkSubdir(input.subdir ?? "");
  const docs = gate(input.docs);
  return {
    target: "cdk",
    subdir,
    files: { [CDK_SCAFFOLD_FILE]: cdkScaffold({ docs, source: sourceForDepth(depthOf(subdir)) }) },
  };
}

/**
 * The terraform configuration, from @flow-as-code/tf. References with no address in the
 * map become loud TODO placeholders that fail `terraform validate`, exactly as
 * `flow-cli emit --target tf` leaves them; the address-map editor says which
 * are missing before the user gets there.
 */
export function exportTf(input: TfExportInput): ExportBundle {
  const subdir = checkSubdir(input.subdir ?? "");
  const docs = gate(input.docs);
  return {
    target: "tf",
    subdir,
    files: sortFiles(emitTf(docs, { addressMap: input.addressMap }).files),
  };
}

/**
 * Materialized Flow language JSON, one `<name>.json` per document, the same
 * name and the same bytes `flow-cli render` writes.
 *
 * Every unmapped token in the whole set is reported at once: @flow-as-code/core's
 * MaterializeError already lists all of a document's, and this unions them
 * across documents, so one round of map edits fixes the export.
 */
export function exportRaw(input: RawExportInput): ExportBundle {
  const subdir = checkSubdir(input.subdir ?? "");
  const docs = gate(input.docs);

  const missing = new Set<string>();
  const files: Record<string, string> = {};
  for (const doc of docs) {
    try {
      files[`${doc.name}.json`] = serializeContent(materializeWithMap(doc, input.resourceMap));
    } catch (err) {
      if (!(err instanceof MaterializeError)) throw err;
      for (const token of err.missingTokens) missing.add(token);
    }
  }
  if (missing.size > 0) throw new ExportMapError([...missing].sort(byPath));
  return { target: "raw", subdir, files: sortFiles(files) };
}

/** One entry point, so no caller can reach a target without the save gate. */
export function buildExport(input: ExportInput): ExportBundle {
  switch (input.target) {
    case "cdk":
      return exportCdk(input);
    case "tf":
      return exportTf(input);
    case "raw":
      return exportRaw(input);
  }
}

/** Every reference token in the set, sorted, for the two map editors. */
export function tokensIn(docs: readonly FlowDoc[]): string[] {
  const tokens = new Set<string>();
  for (const doc of docs) for (const ref of collectRefs(doc.content)) tokens.add(ref.token);
  return [...tokens].sort(byPath);
}
