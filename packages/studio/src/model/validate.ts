/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The single validity gate. docs/02-studio-design.md: "The studio can never
// save a doc that fails no-literal-arn or no-unresolved-token." Enforcing that
// in the UI alone is vacuous, so this module is called by every path that
// turns a doc into bytes (MemoryStore.write, DirectoryStore.write, and
// Export-as-download) and by every path that reads bytes back in.
//
// Two independent checks, both required:
//   1. the two hard lint rules, via @flow-as-code/core's own hasBlockingFindings, and
//   2. structural validity against conformance/schema/flowdoc-0.1.schema.json,
//      the cross-language contract the Go provider validates against too.
// A mutation bug can produce a schema-invalid doc that lints clean (a
// MessageParticipant with no body, say), so the schema check is not optional.

import type { FlowDoc } from "@flow-as-code/core";
import type { Finding } from "@flow-as-code/core/lint";
import { allRules, hasBlockingFindings, lint } from "@flow-as-code/core/lint";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
// Imported, not fetched: the schema is bundled at build time so the studio
// validates with no network access (docs/02-studio-design.md, local-first).
import schema from "../../../../conformance/schema/flowdoc-0.1.schema.json" with { type: "json" };

export const FLOWDOC_VERSION = "0.1";

/**
 * The rules that block a save (no-literal-arn, no-unresolved-token today).
 * @flow-as-code/core owns the flag; this list is derived from it so the studio can name
 * the offending findings without hard-coding rule ids.
 */
export const HARD_RULES: readonly string[] = allRules
  .filter((r) => r.hard === true)
  .map((r) => r.id);

const HARD_RULE_IDS = new Set(HARD_RULES);

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema: ValidateFunction = ajv.compile(schema as object);

function describe(error: ErrorObject): string {
  const where = error.instancePath === "" ? "(root)" : error.instancePath;
  return `${where} ${error.message ?? "is invalid"}`;
}

/** Schema violations for a doc, empty when it is structurally valid. */
export function schemaErrorsFor(doc: unknown): string[] {
  return validateSchema(doc) ? [] : (validateSchema.errors ?? []).map(describe);
}

export interface DocValidation {
  ok: boolean;
  /** Human-readable schema violations, empty when the doc is structurally valid. */
  schemaErrors: string[];
  /** Findings from the hard lint rules only. */
  blockers: Finding[];
}

/** Runs both checks and reports everything wrong, without throwing. */
export function validateDoc(doc: FlowDoc): DocValidation {
  const schemaErrors = schemaErrorsFor(doc);
  const findings = lint(doc);
  const blockers = hasBlockingFindings(findings)
    ? findings.filter((f) => HARD_RULE_IDS.has(f.rule))
    : [];
  return { ok: schemaErrors.length === 0 && blockers.length === 0, schemaErrors, blockers };
}

/** Thrown by every write path when the doc must not be persisted. */
export class SaveRefusedError extends Error {
  readonly validation: DocValidation;

  constructor(validation: DocValidation) {
    const parts = [
      ...validation.blockers.map((f) => `${f.rule}: ${f.message}`),
      ...validation.schemaErrors.map((e) => `schema: ${e}`),
    ];
    super(`Refusing to write an invalid FlowDoc. ${parts.join("; ")}`);
    this.name = "SaveRefusedError";
    this.validation = validation;
  }
}

/**
 * The guard every write path calls. Throws SaveRefusedError when the doc fails
 * a hard lint rule or the FlowDoc schema. Never returns a value: callers that
 * want to explain the problem inspect SaveRefusedError.validation.
 */
export function assertSaveable(doc: FlowDoc): void {
  const validation = validateDoc(doc);
  if (!validation.ok) throw new SaveRefusedError(validation);
}

/**
 * Parses text read from disk into a FlowDoc, refusing anything that is not a
 * schema-valid FlowDoc 0.1. Used by every read path (opened file, directory
 * store) so a malformed document can never reach the canvas.
 */
export function parseFlowDoc(text: string): FlowDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not JSON: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
  const doc = parsed as FlowDoc;
  if (doc === null || typeof doc !== "object" || doc.flowdoc !== FLOWDOC_VERSION) {
    throw new Error(`Not a FlowDoc ${FLOWDOC_VERSION} file.`);
  }
  if (!validateSchema(doc)) {
    const errors = (validateSchema.errors ?? []).map(describe).slice(0, 5).join("; ");
    throw new Error(`Not a valid FlowDoc ${FLOWDOC_VERSION}: ${errors}`);
  }
  return doc;
}
