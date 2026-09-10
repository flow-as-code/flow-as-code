/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli simulate <scenarios> --instance <arn> [--resource-map <file>] [--format junit|json] [--out <file>]`.
//
// Runs a scenario suite through @flow-as-code/core's runScenarios, which owns the
// TestCase lifecycle (create published, execute, poll, collect, delete) and the
// documented limits: 5 concurrent, 100 in flight including the running 5,
// 5 minutes per scenario.
// https://docs.aws.amazon.com/connect/latest/adminguide/testing-simulation-execute-test-cases.html
//
// Everything that can fail offline fails before the instance is touched, and
// all at once: every scenario file is schema-validated against the packaged
// byte copy of conformance/schema/scenario-0.1.schema.json, then checked by
// @flow-as-code/core's validateScenario for the cross-field rules the schema cannot
// express, and every ${cdref:...} token is resolved against --resource-map. A
// suite with one broken scenario creates no test case.
//
// The report goes to --out or stdout; failures also go to stderr, one block per
// scenario that did not pass, so a CI log says why without opening the XML.
// Exit 0 means every scenario PASSED. Anything else (FAILED, TIMED_OUT,
// ERRORED, STOPPED) exits 1.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RunOptions, Scenario, ScenarioResult, SimulationRun } from "@flow-as-code/core";
import {
  compileScenario,
  jsonReport,
  junitReport,
  resolveScenario,
  runScenarios,
  validateScenario,
} from "@flow-as-code/core";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema, ValidateFunction } from "ajv";

import { type LiveClients, parseInstanceArn, SDK_CLIENTS } from "./aws.js";
import { readStringMap } from "./docs.js";
import { CliError, messageOf } from "./errors.js";

/** Absolute path of the packaged scenario schema (`../schema` from src or dist). */
export const SCENARIO_SCHEMA_PATH = fileURLToPath(
  new URL("../schema/scenario-0.1.schema.json", import.meta.url),
);

/** The file names a directory argument picks up, matching conformance/simulate/. */
const SCENARIO_FILE = "scenario.json";
const SCENARIO_SUFFIX = ".scenario.json";

const FORMATS = new Set<string>(["junit", "json"]);

/** Errors reported for one scenario before the rest are elided. */
const MAX_SCHEMA_ERRORS = 10;

export interface SimulateOptions {
  instance: string;
  resourceMap?: string;
  format?: string;
  out?: string;
}

export interface LoadedScenario {
  /** Absolute path the scenario was read from. */
  path: string;
  scenario: Scenario;
}

let compiled: ValidateFunction | undefined;

function scenarioValidator(): ValidateFunction {
  if (compiled === undefined) {
    const schema = JSON.parse(readFileSync(SCENARIO_SCHEMA_PATH, "utf8")) as AnySchema;
    compiled = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  }
  return compiled;
}

/**
 * Schema violations for a value that claims to be a scenario, then the
 * cross-field findings for one that passes the schema. Empty when it is valid.
 */
export function scenarioProblems(value: unknown): string[] {
  const validate = scenarioValidator();
  if (!validate(value)) {
    const errors = validate.errors ?? [];
    const shown = errors.slice(0, MAX_SCHEMA_ERRORS).map((error) => {
      const where = error.instancePath === "" ? "(root)" : error.instancePath;
      return `${where} ${error.message ?? "is invalid"}`;
    });
    if (errors.length > MAX_SCHEMA_ERRORS) {
      shown.push(`... and ${String(errors.length - MAX_SCHEMA_ERRORS)} more`);
    }
    return shown;
  }
  return validateScenario(value).map((finding) => `${finding.path}: ${finding.message}`);
}

function isScenarioFile(name: string): boolean {
  return name === SCENARIO_FILE || name.endsWith(SCENARIO_SUFFIX);
}

/**
 * Absolute paths of the scenario files a `<scenarios>` argument names. A file
 * contributes itself. A directory contributes every `scenario.json` and
 * `*.scenario.json` in it and in its immediate subdirectories (the layout of
 * conformance/simulate/, one `<case>/scenario.json` per case), sorted by path.
 */
export function resolveScenarioPaths(target: string): string[] {
  const abs = resolve(target);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    throw new CliError(`No such file or directory: ${abs}`);
  }
  if (!stat.isDirectory()) return [abs];

  const found: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const path = join(abs, entry.name);
    if (entry.isDirectory()) {
      for (const inner of readdirSync(path)) {
        if (isScenarioFile(inner)) found.push(join(path, inner));
      }
    } else if (isScenarioFile(entry.name)) {
      found.push(path);
    }
  }
  if (found.length === 0) {
    throw new CliError(
      `No ${SCENARIO_FILE} or *${SCENARIO_SUFFIX} files in ${abs} or its subdirectories`,
    );
  }
  return found.sort();
}

/** Reads and validates every scenario a `<scenarios>` argument names. */
export function loadScenarios(target: string): LoadedScenario[] {
  const problems: string[] = [];
  const loaded: LoadedScenario[] = [];

  for (const path of resolveScenarioPaths(target)) {
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
    const found = scenarioProblems(parsed);
    if (found.length > 0) {
      for (const problem of found) problems.push(`${path}: ${problem}`);
      continue;
    }
    loaded.push({ path, scenario: parsed as Scenario });
  }

  if (problems.length > 0) {
    throw new CliError(`${String(problems.length)} problem(s):\n  - ${problems.join("\n  - ")}`);
  }
  return loaded;
}

/** The lines stderr gets for one scenario that did not pass. */
function describeFailure(result: ScenarioResult): string {
  const lines = [
    `${result.status}: ${result.name}${result.message === undefined ? "" : `: ${result.message}`}`,
  ];
  for (const detail of result.details ?? []) lines.push(`  ${detail}`);
  return lines.join("\n");
}

/**
 * Runs the suite. `timing` exists for the tests, which must not wait on real
 * poll intervals; it is the subset of RunOptions that changes no behaviour.
 */
export async function runSimulate(
  target: string,
  options: SimulateOptions,
  clients: LiveClients = SDK_CLIENTS,
  timing: Pick<RunOptions, "now" | "sleep" | "pollIntervalMs"> = {},
): Promise<SimulationRun> {
  const format = options.format ?? "junit";
  if (!FORMATS.has(format)) {
    throw new CliError(`Unknown --format "${format}". Use "junit" or "json".`);
  }
  const instance = parseInstanceArn(options.instance);
  const scenarios = loadScenarios(target);
  const resourceMap =
    options.resourceMap === undefined ? {} : readStringMap(options.resourceMap, "resource map");

  // Every unresolved token in the suite, before a single test case exists.
  const unresolved: string[] = [];
  for (const { path, scenario } of scenarios) {
    try {
      resolveScenario(compileScenario(scenario), resourceMap);
    } catch (error) {
      unresolved.push(`${path}: ${messageOf(error)}`);
    }
  }
  if (unresolved.length > 0) {
    throw new CliError(
      `${String(unresolved.length)} scenario(s) cannot be resolved` +
        `${options.resourceMap === undefined ? " (no --resource-map given)" : ""}:\n  - ` +
        unresolved.join("\n  - "),
    );
  }

  const client = await clients.test(instance);
  const run = await runScenarios(
    scenarios.map((s) => s.scenario),
    client,
    { resourceMap, ...timing },
  );

  const report = format === "json" ? jsonReport(run) : junitReport(run);
  if (options.out === undefined) {
    process.stdout.write(report);
  } else {
    const out = resolve(options.out);
    writeFileSync(out, report, "utf8");
    console.log(out);
  }

  const notPassed = run.results.filter((result) => result.status !== "PASSED");
  for (const result of notPassed) console.error(describeFailure(result));
  if (notPassed.length > 0) {
    throw new CliError(
      `${String(notPassed.length)} of ${String(run.results.length)} scenario(s) did not pass`,
    );
  }
  return run;
}
