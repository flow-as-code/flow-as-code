/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli simulate <scenarios> --instance <arn> [--resource-map <file>] [--format junit|json] [--out <file>]`
// and `flow-cli simulate --dry-run <scenarios> <flows...> [--resource-map <file> | --address-map <file>]`.
//
// The live run goes through @flow-as-code/core's runScenarios, which owns the
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
//
// The dry run stops after the offline checks and adds @flow-as-code/core's
// dryRunScenario over the FlowDoc set the paths after the scenarios name, read
// as ONE set (a scenario runs across a flow and the modules it calls, wherever
// those live, which is the opposite of lint's and emit's one-set-per-argument):
// the entry
// flow is in the set, every token is referenced by the set or keyed in the map
// (a resource map or an address map, since only keys are read), every
// expect-prompt is a text some block plays, every send-dtmf answers a keypad
// prompt with a key it takes. No AWS call, no credentials, no SDK. Exit 0
// means nothing offline says a scenario cannot pass; any problem exits 1 with
// every problem listed.
//
// This module is also the package's `./simulate` entry, so a consumer's own
// tests can run the same checks without reaching into dist/.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  FlowDoc,
  RunOptions,
  Scenario,
  ScenarioFinding,
  ScenarioResult,
  SimulationRun,
} from "@flow-as-code/core";
import {
  compileScenario,
  dryRunScenario,
  jsonReport,
  junitReport,
  resolveScenario,
  runScenarios,
  validateScenario,
} from "@flow-as-code/core";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema, ValidateFunction } from "ajv";

import { type LiveClients, parseInstanceArn, SDK_CLIENTS } from "./aws.js";
import { loadDocs, readStringMap } from "./docs.js";
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
  /** Required for a live run; refused with `dryRun`. */
  instance?: string;
  resourceMap?: string;
  format?: string;
  out?: string;
  /** Check the suite against `flows` offline instead of running it. */
  dryRun?: boolean;
  /** Dry run only: an address map serves as well as a resource map, since only keys are read. */
  addressMap?: string;
}

/** What a dry run found, per scenario file. */
export interface DryRunResult {
  /** Scenario files checked, in path order. */
  scenarios: string[];
  /** The FlowDoc set they were checked against: every file of every path, in argument then path order. */
  docs: string[];
  /** Every problem, as `<scenario path>: <finding path>: <message>`, in scenario order. */
  problems: string[];
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

/** `<scenario path>: <finding path>: <message>`, the line a problem gets. */
function describeProblem(path: string, finding: ScenarioFinding): string {
  return `${path}: ${finding.path === "" ? "(root)" : finding.path}: ${finding.message}`;
}

/**
 * Checks every scenario `<scenarios>` names against the FlowDoc set the
 * `flows` paths name, read together as one set, offline. Scenario loading
 * already failed on anything the schema or the cross-field rules reject; what
 * comes back here is the rest. Throws a CliError listing every problem when
 * there is one, and returns what it checked otherwise.
 */
export function dryRunSimulate(
  target: string,
  flows: string | readonly string[],
  options: Pick<SimulateOptions, "resourceMap" | "addressMap"> = {},
): DryRunResult {
  if (options.resourceMap !== undefined && options.addressMap !== undefined) {
    throw new CliError("--dry-run reads one map: give --resource-map or --address-map, not both.");
  }
  const paths = typeof flows === "string" ? [flows] : flows;
  if (paths.length === 0) {
    throw new CliError(
      "--dry-run needs the FlowDoc set to check against: flow-cli simulate --dry-run <scenarios> <flows...>",
    );
  }
  const scenarios = loadScenarios(target);
  const docs = paths.flatMap((path) => loadDocs(path));
  const names = new Map<string, string>();
  for (const { path, doc } of docs) {
    const key = `${doc.kind}:${doc.name}`;
    const other = names.get(key);
    if (other !== undefined) {
      throw new CliError(`${path} and ${other} both hold the ${doc.kind} "${doc.name}".`);
    }
    names.set(key, path);
  }
  const map =
    options.resourceMap !== undefined
      ? readStringMap(options.resourceMap, "resource map")
      : options.addressMap !== undefined
        ? readStringMap(options.addressMap, "address map")
        : undefined;
  const set: FlowDoc[] = docs.map((d) => d.doc);

  const problems: string[] = [];
  for (const { path, scenario } of scenarios) {
    for (const finding of dryRunScenario(
      scenario,
      set,
      map === undefined ? {} : { resourceMap: map },
    )) {
      problems.push(describeProblem(path, finding));
    }
  }
  if (problems.length > 0) {
    throw new CliError(`${String(problems.length)} problem(s):\n  - ${problems.join("\n  - ")}`);
  }
  return {
    scenarios: scenarios.map((s) => s.path),
    docs: docs.map((d) => d.path),
    problems,
  };
}

/**
 * The command: a dry run when `--dry-run` is set, the live run otherwise.
 * Prints the dry run's one-line summary on success; the live run prints its
 * own report. Returns the dry run's result, or the live run's.
 */
export async function simulateCommand(
  target: string,
  flows: readonly string[],
  options: SimulateOptions,
  clients: LiveClients = SDK_CLIENTS,
  timing: Pick<RunOptions, "now" | "sleep" | "pollIntervalMs"> = {},
): Promise<DryRunResult | SimulationRun> {
  if (options.dryRun === true) {
    if (options.instance !== undefined) {
      throw new CliError("--dry-run never touches an instance; drop --instance for the dry run.");
    }
    if (options.out !== undefined || options.format !== undefined) {
      throw new CliError(
        "--format and --out belong to the live run's report; the dry run prints its problems.",
      );
    }
    const result = dryRunSimulate(target, flows, options);
    console.log(
      `Checked ${String(result.scenarios.length)} scenario(s) against ${String(result.docs.length)} document(s) in ${flows.map((f) => resolve(f)).join(", ")}: no problems.`,
    );
    return result;
  }
  if (flows.length > 0) {
    throw new CliError(
      `A live run takes one argument, the scenarios; "${flows.join('", "')}" is only read with --dry-run.`,
    );
  }
  return runSimulate(target, options, clients, timing);
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
  if (options.instance === undefined) {
    throw new CliError(
      "--instance <arn> is required for a live run (or pass --dry-run <scenarios> <flows> to check offline).",
    );
  }
  if (options.addressMap !== undefined) {
    throw new CliError("--address-map is read by --dry-run only; a live run takes --resource-map.");
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
