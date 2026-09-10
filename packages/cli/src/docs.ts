/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Loading FlowDocs for the commands that take a `<dir-or-file>` argument.
//
// One entry point, one set of diagnostics: a path that does not exist, a file
// that is not JSON, and a document that does not satisfy the FlowDoc schema all
// come out as a CliError naming the offending path. Every problem in the set is
// reported, not just the first, so one run fixes one round of edits.
//
// schema/flowdoc-0.1.schema.json is a byte copy of
// conformance/schema/flowdoc-0.1.schema.json, kept inside the package because
// the conformance tree is not published. src/schema.test.ts fails if the two
// drift, so the CLI and the cross-language contract cannot disagree.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FlowDoc } from "@flow-as-code/core";
import { NO_LITERAL_ARN, literalArnMessage, literalArnPaths } from "@flow-as-code/core";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema, ValidateFunction } from "ajv";

import { CliError, messageOf } from "./errors.js";

/** A directory argument loads every file with this suffix, sorted by name. */
export const FLOWDOC_SUFFIX = ".flowdoc.json";

/** Errors reported for one document before the rest are elided. */
const MAX_SCHEMA_ERRORS = 10;

/** Absolute path of the packaged FlowDoc schema (`../schema` from src or dist). */
export const SCHEMA_PATH = fileURLToPath(
  new URL("../schema/flowdoc-0.1.schema.json", import.meta.url),
);

export interface LoadedDoc {
  /** Absolute path the document was read from. */
  path: string;
  doc: FlowDoc;
}

let compiled: ValidateFunction | undefined;

function flowDocValidator(): ValidateFunction {
  if (compiled === undefined) {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as AnySchema;
    compiled = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  }
  return compiled;
}

/** One schema violation, as "<where> <what>". */
function describeSchemaError(error: { instancePath: string; message?: string }): string {
  const where = error.instancePath === "" ? "(root)" : error.instancePath;
  return `${where} ${error.message ?? "is invalid"}`;
}

/**
 * An ajv instancePath (`/content/Actions/3/Parameters/QueueId`) in the dotted
 * form @flow-as-code/core's string walker produces
 * (`content.Actions[3].Parameters.QueueId`), so the two can be compared.
 */
function pointerToPath(instancePath: string): string {
  let out = "";
  for (const raw of instancePath.split("/").slice(1)) {
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (/^\d+$/.test(segment)) out += `[${segment}]`;
    else out += out === "" ? segment : `.${segment}`;
  }
  return out;
}

/** True when this schema error is describing one of the literal ARNs found. */
function causedByLiteralArn(instancePath: string, arnPaths: readonly string[]): boolean {
  const path = pointerToPath(instancePath);
  const under = (parent: string, child: string): boolean =>
    child.startsWith(`${parent}.`) || child.startsWith(`${parent}[`);
  return arnPaths.some((arn) => arn === path || under(path, arn) || under(arn, path));
}

/**
 * Problems with a value that claims to be a FlowDoc, empty when it is one. The
 * studio bridge validates documents arriving over HTTP with exactly the
 * validator every command uses on documents read from disk.
 *
 * A literal ARN is reported once per offending field, by rule id, rather than
 * as the several schema pattern errors one ARN produces: the token pattern
 * fails, the alternative `$.` pattern fails, their `oneOf` fails, and the
 * enclosing `if/then` fails, none of which say "literal ARN". The schema stays
 * the backstop, and every schema error the ARN did not cause is still shown.
 *
 * The ARN scan runs whether or not the schema is satisfied. Only ref-shaped
 * fields carry a `${cdref:...}` pattern, so an ARN pasted into free text
 * (`Parameters.Text`, a prompt, a label) is schema-valid; `no-literal-arn` is
 * a hard rule and the bridge write path has no other lint step, so scanning
 * only after a schema failure would let exactly those documents onto disk.
 */
export function flowDocProblems(value: unknown): string[] {
  const validate = flowDocValidator();
  const valid = validate(value);
  const errors = valid ? [] : (validate.errors ?? []);
  const arnPaths = literalArnPaths(value);
  if (valid && arnPaths.length === 0) return [];
  const problems = [
    ...arnPaths.map((path) => `${NO_LITERAL_ARN}: ${literalArnMessage(path)}`),
    ...errors.filter((e) => !causedByLiteralArn(e.instancePath, arnPaths)).map(describeSchemaError),
  ];
  const shown = problems.slice(0, MAX_SCHEMA_ERRORS);
  if (problems.length > MAX_SCHEMA_ERRORS) {
    shown.push(`... and ${String(problems.length - MAX_SCHEMA_ERRORS)} more`);
  }
  return shown;
}

/** A problem that names a lint rule already reads as a sentence on its own. */
function isRuleProblem(problem: string): boolean {
  return problem.startsWith(`${NO_LITERAL_ARN}: `);
}

/**
 * Absolute paths of the documents a `<dir-or-file>` argument names. A directory
 * contributes every `*.flowdoc.json` in it, sorted, and is not walked
 * recursively; a file contributes itself whatever its extension.
 */
export function resolveDocPaths(target: string): string[] {
  const abs = resolve(target);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    throw new CliError(`No such file or directory: ${abs}`);
  }
  if (!stat.isDirectory()) return [abs];

  const files = readdirSync(abs)
    .filter((f) => f.endsWith(FLOWDOC_SUFFIX))
    .sort()
    .map((f) => join(abs, f));
  if (files.length === 0) {
    throw new CliError(`No *${FLOWDOC_SUFFIX} files in ${abs}`);
  }
  return files;
}

/** Reads and schema-validates every document a `<dir-or-file>` argument names. */
export function loadDocs(target: string): LoadedDoc[] {
  const validate = flowDocValidator();
  const problems: string[] = [];
  const loaded: LoadedDoc[] = [];

  for (const path of resolveDocPaths(target)) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch (error) {
      problems.push(`${path}: ${messageOf(error)}`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      problems.push(`${path}: invalid JSON: ${messageOf(error)}`);
      continue;
    }

    if (!validate(parsed)) {
      for (const problem of flowDocProblems(parsed)) {
        problems.push(
          problem.startsWith("... and ") || isRuleProblem(problem)
            ? `${path}: ${problem}`
            : `${path}: not a valid FlowDoc: ${problem}`,
        );
      }
      continue;
    }

    loaded.push({ path, doc: parsed as FlowDoc });
  }

  if (problems.length > 0) {
    throw new CliError(`${String(problems.length)} problem(s):\n  - ${problems.join("\n  - ")}`);
  }
  return loaded;
}

/** Loads the one document a single-file argument names, refusing a directory. */
export function loadOneDoc(target: string, command: string): LoadedDoc {
  const abs = resolve(target);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    throw new CliError(`No such file or directory: ${abs}`);
  }
  if (stat.isDirectory()) {
    throw new CliError(`${command} takes a single FlowDoc file, not a directory: ${abs}`);
  }
  const [only] = loadDocs(abs);
  if (only === undefined) throw new CliError(`No FlowDoc loaded from ${abs}`);
  return only;
}

/** Where a command writes when `--out` is absent: the directory of its input. */
export function defaultOutDir(target: string): string {
  const abs = resolve(target);
  try {
    return statSync(abs).isDirectory() ? abs : dirname(abs);
  } catch {
    throw new CliError(`No such file or directory: ${abs}`);
  }
}

/**
 * Reads a JSON file that must hold a flat string to string object: the resource
 * map for `render` and the address map for `emit --target tf`.
 */
export function readStringMap(path: string, what: string): Record<string, string> {
  const abs = resolve(path);
  let raw: string;
  try {
    raw = readFileSync(abs, "utf8");
  } catch {
    throw new CliError(`No such file or directory: ${abs}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliError(`${abs}: invalid JSON: ${messageOf(error)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError(`${abs}: the ${what} must be a JSON object of string to string.`);
  }

  const bad = Object.entries(parsed as Record<string, unknown>)
    .filter(([, value]) => typeof value !== "string")
    .map(([key]) => key)
    .sort();
  if (bad.length > 0) {
    throw new CliError(`${abs}: the ${what} has non-string value(s) for: ${bad.join(", ")}`);
  }
  return parsed as Record<string, string>;
}
