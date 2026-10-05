/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A document's companion source: `<name>.flow.ts` (the TypeScript builder,
// @flow-as-code/core's codegen) or `<name>.flow.tf` (a flowascode resource,
// @flow-as-code/hcl). One per document, chosen when it is created and
// recorded in meta.sourceKind (docs/06-terraform-provider.md, "Companions").
// Every command that writes or reads a companion goes through here, so the
// two kinds are generated and read one way each.

import { codegen, extractKeepComments, type FlowDoc, type SourceKind } from "@flow-as-code/core";
import { HclError, fromFlowDoc, toFlowDoc, type KeptComments } from "@flow-as-code/hcl";

import { CliError } from "./errors.js";

export type { SourceKind };

export const TS_SUFFIX = ".flow.ts";
export const TF_SUFFIX = ".flow.tf";
export const SOURCE_KINDS: readonly SourceKind[] = ["ts", "tf"];

export function suffixOf(kind: SourceKind): string {
  return kind === "tf" ? TF_SUFFIX : TS_SUFFIX;
}

/** The companion kind a file name has, or undefined for any other file. */
export function kindOfPath(path: string): SourceKind | undefined {
  if (path.endsWith(TS_SUFFIX)) return "ts";
  if (path.endsWith(TF_SUFFIX)) return "tf";
  return undefined;
}

export function parseKind(value: string, flag: string): SourceKind {
  if (value === "ts" || value === "tf") return value;
  throw new CliError(`Unknown ${flag} "${value}". Use "ts" or "tf".`);
}

export interface GenerateOptions {
  /** The companion on disk, whose @keep comments (and for tf, carried values) survive. */
  previous?: string;
  /** Where `previous` was read from, named in an error reading it. */
  previousPath?: string;
  /** tf only: reference key -> terraform address, for keys `previous` does not bind. */
  bindings?: Record<string, string | null>;
  /** Kept comments from the other kind, used when there is no `previous`. */
  keep?: KeptComments;
  /** ts only: codegen's banner line (packages/core/src/codegen.ts). */
  banner?: string;
}

/** The companion source for `doc`, of the given kind. */
export function generateCompanion(
  doc: FlowDoc,
  kind: SourceKind,
  options: GenerateOptions = {},
): string {
  if (kind === "tf") {
    try {
      return fromFlowDoc(doc, {
        ...(options.previous === undefined ? {} : { previous: options.previous }),
        ...(options.previousPath === undefined ? {} : { previousFileName: options.previousPath }),
        ...(options.bindings === undefined ? {} : { bindings: options.bindings }),
        ...(options.keep === undefined ? {} : { keep: options.keep }),
        fileName: `${doc.name}.flowdoc.json`,
      });
    } catch (error) {
      if (error instanceof HclError) throw new CliError(error.message, 1, { cause: error });
      throw error;
    }
  }
  const keep =
    options.previous === undefined && options.keep !== undefined
      ? {
          beforeExport: options.keep.resource.map(asLineComment),
          beforeBlock: new Map(
            Object.entries(options.keep.actions).map(([id, lines]) => [
              id,
              lines.map(asLineComment),
            ]),
          ),
        }
      : undefined;
  return codegen(doc, {
    ...(options.previous === undefined ? {} : { previous: options.previous }),
    ...(keep === undefined ? {} : { keep }),
    ...(options.banner === undefined ? {} : { banner: options.banner }),
  });
}

/** A `.flow.ts` source's kept comments, as a `.flow.tf` writes them. */
export function keptFromTs(source: string): KeptComments {
  const keep = extractKeepComments(source);
  return {
    resource: keep.beforeExport.map(asHashComment),
    actions: Object.fromEntries(
      [...keep.beforeBlock].map(([id, lines]) => [id, lines.map(asHashComment)]),
    ),
  };
}

/** `# @keep x` -> `// @keep x`. */
function asLineComment(line: string): string {
  return line.replace(/^(#|\/\/)\s?/, "// ");
}

/** `// @keep x` -> `# @keep x`. */
function asHashComment(line: string): string {
  return line.replace(/^(#|\/\/)\s?/, "# ");
}

export interface ReadTfResult {
  doc: FlowDoc;
  warnings: string[];
  keep: KeptComments | undefined;
  /** Reference key -> terraform expression, from refs and normalized sugar. */
  bindings: Record<string, string | null>;
}

/**
 * A `.flow.tf` read to its document, in process: HCL is parsed, never
 * executed. A refusal becomes a CliError carrying the contract's message,
 * which names the file, line, column and code.
 */
export function readTfCompanion(text: string, fileName: string): ReadTfResult {
  try {
    const { doc, sidecar, warnings } = toFlowDoc(text, { fileName });
    const normalized = sidecar.normalized.map(
      (n) => `${n.attribute}: ${n.from} is written as "${n.to}" on the next regeneration`,
    );
    return {
      doc,
      warnings: [...warnings, ...normalized],
      keep: sidecar.keep,
      bindings: sidecar.refs,
    };
  } catch (error) {
    if (error instanceof HclError) throw new CliError(error.message, 1, { cause: error });
    throw error;
  }
}
