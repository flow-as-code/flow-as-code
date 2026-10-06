/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli simulate`, offline. Scenario loading and validation run over the
// conformance/simulate/ fixtures; the run itself goes through a fake TestCase
// client on a fake clock, so every terminal status the runner can report is
// exercised without waiting on a poll interval. Exit codes are asserted on the
// CliError in process and, for the paths that need no client, on the built CLI.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateTestCaseInput, Scenario } from "@flow-as-code/core";

import { MISSING_SDK_MESSAGE, STALE_SDK_MESSAGE } from "./aws.js";
import { CliError } from "./errors.js";
import {
  dryRunSimulate,
  loadScenarios,
  resolveScenarioPaths,
  runSimulate,
  scenarioProblems,
  simulateCommand,
  type SimulateOptions,
} from "./simulate.js";
import {
  FakeTestClient,
  fakeTimer,
  fixtureClients,
  INSTANCE,
  REPO,
  RESOURCE_MAP,
  writeDenySdkHook,
  writeStaleSdkHook,
} from "./__fixtures__/live.js";

// readdir order is the file system's: APFS lists names sorted, ext4 in hash
// order. The order test below flips this switch so `resolveScenarioPaths` is
// fed a listing no sort could leave alone, whatever disk the test runs on.
const readdirOrder = vi.hoisted(() => ({ reversed: false }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const readdirSync = ((...args: Parameters<typeof actual.readdirSync>) => {
    const entries = actual.readdirSync(...args) as unknown[];
    return readdirOrder.reversed ? [...entries].reverse() : entries;
  }) as typeof actual.readdirSync;
  return { ...actual, readdirSync };
});

const CLI = join(REPO, "packages", "cli", "dist", "bin.js");
const SUITE = join(REPO, "conformance", "simulate");
const CASES = [
  "after-hours-message",
  "appointment-lookup-transfer",
  "chat-greeting",
  "keypad-press",
  "queue-by-token",
];
const DRY_RUN = join(SUITE, "dry-run");
const SCRATCH_BASE = join(REPO, "packages", "cli", ".vitest");
const scratch: string[] = [];

function tempDir(): string {
  mkdirSync(SCRATCH_BASE, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_BASE, "a06-simulate-"));
  scratch.push(dir);
  return dir;
}

/** A resource map file covering every token the suite uses. */
function mapFile(dir: string, map: Record<string, string> = RESOURCE_MAP): string {
  const path = join(dir, "resource-map.json");
  writeFileSync(path, JSON.stringify(map, null, 2), "utf8");
  return path;
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

interface InvalidCase {
  name: string;
  schemaRejects: boolean;
  expectedPaths: string[];
  scenario: unknown;
}

const invalidCases = (): InvalidCase[] =>
  (
    JSON.parse(readFileSync(join(SUITE, "invalid", "scenarios.json"), "utf8")) as {
      cases: InvalidCase[];
    }
  ).cases;

async function expectCliError(work: Promise<unknown> | (() => unknown)): Promise<CliError> {
  let thrown: unknown;
  try {
    await (typeof work === "function" ? work() : work);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CliError);
  return thrown as CliError;
}

let stdout: string[];
let stderr: string[];
beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(" ") + "\n");
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(" ") + "\n");
  });
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("scenario files", () => {
  it("a directory contributes scenario.json from each case and *.scenario.json beside it", () => {
    expect(resolveScenarioPaths(SUITE)).toEqual(
      CASES.map((name) => join(SUITE, name, "scenario.json")),
    );

    const dir = tempDir();
    writeFileSync(join(dir, "b.scenario.json"), "{}");
    writeFileSync(join(dir, "notes.json"), "{}");
    mkdirSync(join(dir, "a"));
    writeFileSync(join(dir, "a", "scenario.json"), "{}");
    writeFileSync(join(dir, "a", "scenarios.json"), "{}");
    expect(resolveScenarioPaths(dir)).toEqual([
      join(dir, "a", "scenario.json"),
      join(dir, "b.scenario.json"),
    ]);
  });

  it("sorts by path whatever order the file system lists entries in", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "c.scenario.json"), "{}");
    writeFileSync(join(dir, "b.scenario.json"), "{}");
    mkdirSync(join(dir, "a"));
    writeFileSync(join(dir, "a", "scenario.json"), "{}");
    const sorted = [
      join(dir, "a", "scenario.json"),
      join(dir, "b.scenario.json"),
      join(dir, "c.scenario.json"),
    ];
    expect(resolveScenarioPaths(dir)).toEqual(sorted);
    readdirOrder.reversed = true;
    try {
      expect(resolveScenarioPaths(dir)).toEqual(sorted);
    } finally {
      readdirOrder.reversed = false;
    }
  });

  it("a file contributes itself whatever its name", () => {
    const path = join(SUITE, "invalid", "scenarios.json");
    expect(resolveScenarioPaths(path)).toEqual([path]);
  });

  it("names a missing path and an empty directory", async () => {
    const missing = await expectCliError(() => resolveScenarioPaths(join(SUITE, "nope")));
    expect(missing.message).toBe(`No such file or directory: ${join(SUITE, "nope")}`);
    const empty = tempDir();
    const none = await expectCliError(() => resolveScenarioPaths(empty));
    expect(none.message).toBe(
      `No scenario.json or *.scenario.json files in ${empty} or its subdirectories`,
    );
  });

  it("loads every valid scenario in the suite", () => {
    const loaded = loadScenarios(SUITE);
    expect(loaded.map((entry) => entry.scenario.name)).toEqual(CASES);
    expect(loaded.map((entry) => entry.path)).toEqual(resolveScenarioPaths(SUITE));
  });

  it("rejects every invalid fixture, reporting all of them at once", async () => {
    const dir = tempDir();
    const cases = invalidCases();
    for (const entry of cases) {
      writeFileSync(join(dir, `${entry.name}.scenario.json`), JSON.stringify(entry.scenario));
      const problems = scenarioProblems(entry.scenario);
      expect(problems.length, entry.name).toBeGreaterThan(0);
      if (!entry.schemaRejects) {
        for (const path of entry.expectedPaths) {
          expect(problems.join("\n"), entry.name).toContain(`${path}: `);
        }
      }
    }
    writeFileSync(join(dir, "broken.scenario.json"), "{ not json");

    const error = await expectCliError(() => loadScenarios(dir));
    expect(error.exitCode).toBe(1);
    expect(error.message).toMatch(/^\d+ problem\(s\):\n {2}- /);
    for (const entry of cases) {
      expect(error.message, entry.name).toContain(join(dir, `${entry.name}.scenario.json`));
    }
    expect(error.message).toContain(`${join(dir, "broken.scenario.json")}: invalid JSON:`);
  });

  it("caps the schema errors it prints for one file", () => {
    const steps = Array.from({ length: 30 }, () => ({ kind: "no-such-step" }));
    const problems = scenarioProblems({
      scenario: "0.1",
      name: "x",
      entryPoint: { channel: "voice", flow: "${cdref:flow:x}" },
      steps,
    });
    expect(problems).toHaveLength(11);
    expect(problems.at(-1)).toMatch(/^\.\.\. and \d+ more$/);
  });
});

describe("runSimulate", () => {
  const options = (dir: string, extra: Partial<SimulateOptions> = {}): SimulateOptions => ({
    instance: INSTANCE,
    resourceMap: mapFile(dir),
    ...extra,
  });

  function harness(clientOptions: ConstructorParameters<typeof FakeTestClient>[1] = {}) {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, clientOptions);
    return {
      client,
      clients: fixtureClients({ test: client }),
      timing: { now: timer.now, sleep: timer.sleep },
    };
  }

  it("runs every scenario, writes the JUnit report to stdout, and returns the run", async () => {
    const { client, clients, timing } = harness();
    const run = await runSimulate(SUITE, options(tempDir()), clients, timing);

    expect(run.totals).toEqual({
      total: CASES.length,
      passed: CASES.length,
      failed: 0,
      timedOut: 0,
      errored: 0,
      stopped: 0,
    });
    expect(client.created.map((input: CreateTestCaseInput) => [input.name, input.status])).toEqual(
      CASES.map((name) => [name, "PUBLISHED"]),
    );
    expect(client.deleted).toHaveLength(CASES.length);
    // Tokens were resolved before the instance saw them.
    for (const input of client.created) expect(input.content).not.toContain("cdref");

    const report = stdout.join("");
    expect(report).toMatch(
      new RegExp(
        `^<\\?xml version="1.0" encoding="UTF-8"\\?>\\n<testsuites name="flow-simulate" tests="${String(CASES.length)}" failures="0" errors="0"`,
      ),
    );
    for (const name of CASES) expect(report).toContain(`<testcase name="${name}"`);
    expect(stderr).toEqual([]);
  });

  it("--format json writes the JSON report", async () => {
    const { clients, timing } = harness();
    await runSimulate(SUITE, options(tempDir(), { format: "json" }), clients, timing);
    const report = JSON.parse(stdout.join("")) as { schema: string; results: { name: string }[] };
    expect(report.schema).toBe("flow-simulate-report/0.1");
    expect(report.results.map((result) => result.name)).toEqual(CASES);
  });

  it("--out writes the report to a file and prints its path", async () => {
    const dir = tempDir();
    const out = join(dir, "report.xml");
    const { clients, timing } = harness();
    await runSimulate(SUITE, options(dir, { out }), clients, timing);
    expect(stdout).toEqual([`${out}\n`]);
    expect(readFileSync(out, "utf8")).toContain(
      `<testsuites name="flow-simulate" tests="${String(CASES.length)}"`,
    );
  });

  it("a single scenario file runs alone", async () => {
    const { client, clients, timing } = harness();
    const run = await runSimulate(
      join(SUITE, "chat-greeting", "scenario.json"),
      options(tempDir()),
      clients,
      timing,
    );
    expect(run.results.map((result) => result.name)).toEqual(["chat-greeting"]);
    expect(client.created).toHaveLength(1);
  });

  it("a failed scenario exits 1 with its records on stderr, report still written", async () => {
    const { clients, timing } = harness({
      statuses: { "appointment-lookup-transfer": ["IN_PROGRESS", "FAILED"] },
    });
    const error = await expectCliError(runSimulate(SUITE, options(tempDir()), clients, timing));
    expect(error.exitCode).toBe(1);
    expect(error.message).toBe(`1 of ${String(CASES.length)} scenario(s) did not pass`);
    expect(stderr).toEqual([
      "FAILED: appointment-lookup-transfer: 2 of 3 observations failed.\n" +
        "  expected inclusion of 'closed'\n",
    ]);
    expect(stdout.join("")).toContain('failures="1"');
  });

  it("timed out, stopped, and errored scenarios each fail the run", async () => {
    class ErrorsOnChat extends FakeTestClient {
      override createTestCase(input: CreateTestCaseInput): Promise<{ testCaseId: string }> {
        if (input.name === "chat-greeting") {
          return Promise.reject(new Error("InvalidContactFlowException: bad content"));
        }
        return super.createTestCase(input);
      }
    }
    const timer = fakeTimer();
    const client = new ErrorsOnChat(timer.clock, {
      hang: ["after-hours-message"],
      statuses: { "appointment-lookup-transfer": ["STOPPED"] },
    });
    const error = await expectCliError(
      runSimulate(SUITE, options(tempDir()), fixtureClients({ test: client }), {
        now: timer.now,
        sleep: timer.sleep,
      }),
    );
    expect(error.exitCode).toBe(1);
    expect(error.message).toBe(`3 of ${String(CASES.length)} scenario(s) did not pass`);
    expect(stderr.map((line) => line.split("\n")[0])).toEqual([
      expect.stringMatching(/^TIMED_OUT: after-hours-message: No terminal status within \d+ ms\./),
      "STOPPED: appointment-lookup-transfer: Execution was stopped.",
      "ERRORED: chat-greeting: InvalidContactFlowException: bad content",
    ]);
    expect(client.stopped).toHaveLength(1);
    expect(stdout.join("")).toContain('errors="1"');
  });

  describe("before the instance is touched", () => {
    const untouched = fixtureClients({});

    it("every unresolved token in the suite is reported at once", async () => {
      const dir = tempDir();
      const bare = await expectCliError(runSimulate(SUITE, { instance: INSTANCE }, untouched));
      expect(bare.exitCode).toBe(1);
      expect(bare.message).toMatch(
        new RegExp(
          `^${String(CASES.length)} scenario\\(s\\) cannot be resolved \\(no --resource-map given\\):\n`,
        ),
      );
      for (const name of CASES) expect(bare.message).toContain(join(SUITE, name, "scenario.json"));
      expect(bare.message).toContain("${cdref:flow:appointment-line}");

      const { "${cdref:queue:overflow}": _overflow, ...partial } = RESOURCE_MAP;
      const some = await expectCliError(
        runSimulate(SUITE, { instance: INSTANCE, resourceMap: mapFile(dir, partial) }, untouched),
      );
      // Three scenarios substitute the overflow queue.
      expect(some.message).toMatch(/^3 scenario\(s\) cannot be resolved:\n/);
      expect(some.message).toContain("${cdref:queue:overflow}");
      expect(some.message).not.toContain("no --resource-map given");
    });

    it("rejects an unknown --format, a bad --instance, and a missing map file", async () => {
      const dir = tempDir();
      const format = await expectCliError(
        runSimulate(SUITE, options(dir, { format: "xml" }), untouched),
      );
      expect(format.exitCode).toBe(1);
      expect(format.message).toBe('Unknown --format "xml". Use "junit" or "json".');

      const arn = await expectCliError(
        runSimulate(
          SUITE,
          options(dir, { instance: "11111111-2222-3333-4444-555555555555" }),
          untouched,
        ),
      );
      expect(arn.exitCode).toBe(1);
      expect(arn.message).toContain("--instance must be an Amazon Connect instance ARN");

      const map = await expectCliError(
        runSimulate(
          SUITE,
          { instance: INSTANCE, resourceMap: join(dir, "missing.json") },
          untouched,
        ),
      );
      expect(map.message).toBe(`No such file or directory: ${join(dir, "missing.json")}`);
    });

    it("a suite with one broken scenario creates no test case", async () => {
      const dir = tempDir();
      const suite = join(dir, "suite");
      mkdirSync(suite);
      const valid = JSON.parse(
        readFileSync(join(SUITE, "chat-greeting", "scenario.json"), "utf8"),
      ) as Scenario;
      writeFileSync(join(suite, "ok.scenario.json"), JSON.stringify(valid));
      writeFileSync(join(suite, "broken.scenario.json"), JSON.stringify({ scenario: "0.1" }));
      const { client, clients, timing } = harness();
      const error = await expectCliError(runSimulate(suite, options(dir), clients, timing));
      expect(error.message).toContain(join(suite, "broken.scenario.json"));
      expect(client.created).toEqual([]);
    });
  });

  describe("as a subprocess", () => {
    function cli(args: string[], nodeArgs: string[] = []) {
      const result = spawnSync(process.execPath, [...nodeArgs, CLI, ...args], {
        encoding: "utf8",
        cwd: REPO,
      });
      if (result.error !== undefined) throw result.error;
      return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
    }

    it("exits 1 with a one-line message when the SDK is not installed", () => {
      const dir = tempDir();
      const run = cli(
        ["simulate", SUITE, "--instance", INSTANCE, "--resource-map", mapFile(dir)],
        ["--import", writeDenySdkHook(dir)],
      );
      expect(run.status).toBe(1);
      expect(run.stderr.trim()).toBe(MISSING_SDK_MESSAGE);
      expect(run.stderr).not.toMatch(/^\s+at /m);
      expect(run.stdout).toBe("");
    });

    it("exits 1 naming the SDK when it predates the TestCase operations", () => {
      const dir = tempDir();
      const run = cli(
        ["simulate", SUITE, "--instance", INSTANCE, "--resource-map", mapFile(dir)],
        ["--import", writeStaleSdkHook(dir)],
      );
      expect(run.status).toBe(1);
      expect(run.stderr.trim()).toBe(STALE_SDK_MESSAGE);
    });

    it("exits 1 on invalid scenarios and on a bad --format without loading the SDK", () => {
      const dir = tempDir();
      const hook = writeDenySdkHook(dir);
      const invalid = cli(
        ["simulate", join(SUITE, "invalid", "scenarios.json"), "--instance", INSTANCE],
        ["--import", hook],
      );
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toMatch(/^\d+ problem\(s\):/);
      const format = cli(
        ["simulate", SUITE, "--instance", INSTANCE, "--format", "html"],
        ["--import", hook],
      );
      expect(format.status).toBe(1);
      expect(format.stderr.trim()).toBe('Unknown --format "html". Use "junit" or "json".');
    });
  });
});

describe("simulate --dry-run", () => {
  const FLOWS = join(DRY_RUN, "flows");
  const MAP = join(DRY_RUN, "resource-map.json");
  const CLEAN = join(DRY_RUN, "cases", "keypad-clean", "scenario.json");
  const expectedOf = (name: string): { path: string; message: string }[] =>
    JSON.parse(readFileSync(join(DRY_RUN, "cases", name, "expected.problems.json"), "utf8")) as {
      path: string;
      message: string;
    }[];

  it("checks every case against the set and reports each fixture's problems, prefixed by file", async () => {
    const error = await expectCliError(() =>
      dryRunSimulate(join(DRY_RUN, "cases"), FLOWS, { resourceMap: MAP }),
    );
    expect(error.exitCode).toBe(1);
    const lines = error.message.split("\n").slice(1);
    const expected = resolveScenarioPaths(join(DRY_RUN, "cases")).flatMap((path) =>
      expectedOf(path.split("/").at(-2)!).map((f) => `  - ${path}: ${f.path}: ${f.message}`),
    );
    expect(lines).toEqual(expected);
    expect(error.message.startsWith(`${String(expected.length)} problem(s):`)).toBe(true);
  });

  it("a clean scenario returns what it checked", () => {
    const result = dryRunSimulate(CLEAN, FLOWS, { resourceMap: MAP });
    expect(result.problems).toEqual([]);
    expect(result.scenarios).toEqual([CLEAN]);
    expect(result.docs.map((p) => p.split("/").at(-1))).toEqual([
      "billing-menu.flowdoc.json",
      "keypad-line.flowdoc.json",
    ]);
  });

  it("reads an address map for its keys as readily as a resource map, and refuses both", async () => {
    const dir = tempDir();
    const addressMap = join(dir, "refs.tfmap.json");
    writeFileSync(
      addressMap,
      JSON.stringify({
        "queue:overflow": "aws_connect_queue.overflow.arn",
        "hours:always-open": "aws_connect_hours_of_operation.always_open.arn",
      }),
    );
    expect(dryRunSimulate(CLEAN, FLOWS, { addressMap }).problems).toEqual([]);
    const both = await expectCliError(() =>
      dryRunSimulate(CLEAN, FLOWS, { addressMap, resourceMap: MAP }),
    );
    expect(both.message).toBe(
      "--dry-run reads one map: give --resource-map or --address-map, not both.",
    );
  });

  it("fails on a scenario the schema rejects before any set check, like the live run", async () => {
    const error = await expectCliError(() =>
      dryRunSimulate(join(SUITE, "invalid", "scenarios.json"), FLOWS),
    );
    expect(error.message).toMatch(/^\d+ problem\(s\):/);
    expect(error.message).not.toContain("names no flow");
  });

  it("fails on a FlowDoc the schema rejects, naming the file", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "bad.flowdoc.json"), JSON.stringify({ flowdoc: "0.3" }));
    const error = await expectCliError(() => dryRunSimulate(CLEAN, dir));
    expect(error.message).toContain(`${join(dir, "bad.flowdoc.json")}: not a valid FlowDoc`);
  });

  describe("simulateCommand", () => {
    const untouched = fixtureClients({});

    it("prints a one-line summary on a clean dry run and never builds a client", async () => {
      const result = await simulateCommand(
        CLEAN,
        [FLOWS],
        { dryRun: true, resourceMap: MAP },
        untouched,
      );
      expect("problems" in result && result.problems).toEqual([]);
      expect(stdout.join("")).toBe(
        `Checked 1 scenario(s) against 2 document(s) in ${FLOWS}: no problems.\n`,
      );
    });

    it("refuses --dry-run without a flows argument, or with --instance, --out or --format", async () => {
      const noFlows = await expectCliError(simulateCommand(CLEAN, [], { dryRun: true }, untouched));
      expect(noFlows.message).toContain("--dry-run needs the FlowDoc set");
      const withInstance = await expectCliError(
        simulateCommand(CLEAN, [FLOWS], { dryRun: true, instance: INSTANCE }, untouched),
      );
      expect(withInstance.message).toContain("drop --instance");
      const withOut = await expectCliError(
        simulateCommand(CLEAN, [FLOWS], { dryRun: true, out: "report.xml" }, untouched),
      );
      expect(withOut.message).toContain("--format and --out belong to the live run");
      // Any explicit --format, the live run's default included: the dry run
      // has no report to format.
      for (const format of ["json", "junit"]) {
        const withFormat = await expectCliError(
          simulateCommand(CLEAN, [FLOWS], { dryRun: true, format }, untouched),
        );
        expect(withFormat.message).toContain("--format and --out belong to the live run");
      }
    });

    it("reads several flows paths as one set, and refuses two copies of a document", async () => {
      const dir = tempDir();
      const modules = join(dir, "modules");
      mkdirSync(modules);
      writeFileSync(
        join(modules, "billing-menu.flowdoc.json"),
        readFileSync(join(FLOWS, "billing-menu.flowdoc.json")),
      );
      // The module alone would leave the flow's module reference unresolved;
      // the two paths together are the set the scenario runs across.
      const result = await simulateCommand(
        join(DRY_RUN, "cases", "ssml-and-module-text", "scenario.json"),
        [join(FLOWS, "keypad-line.flowdoc.json"), modules],
        { dryRun: true },
        untouched,
      );
      expect("docs" in result && result.docs.length).toBe(2);
      expect(stdout.join("")).toContain(
        `2 document(s) in ${join(FLOWS, "keypad-line.flowdoc.json")}, ${modules}:`,
      );
      const twice = await expectCliError(
        simulateCommand(CLEAN, [FLOWS, modules], { dryRun: true }, untouched),
      );
      expect(twice.message).toContain('both hold the module "billing-menu"');
    });

    it("a live run needs --instance, takes no flows argument and no --address-map", async () => {
      const noInstance = await expectCliError(
        simulateCommand(SUITE, [], { resourceMap: MAP }, untouched),
      );
      expect(noInstance.message).toContain("--instance <arn> is required for a live run");
      expect(noInstance.message).toContain("--dry-run <scenarios> <flows>");
      const extra = await expectCliError(
        simulateCommand(SUITE, [FLOWS], { instance: INSTANCE }, untouched),
      );
      expect(extra.message).toContain("only read with --dry-run");
      const addressMap = await expectCliError(
        simulateCommand(SUITE, [], { instance: INSTANCE, addressMap: MAP }, untouched),
      );
      expect(addressMap.message).toContain("--address-map is read by --dry-run only");
    });
  });

  describe("as a subprocess", () => {
    function cli(args: string[], nodeArgs: string[] = []) {
      const result = spawnSync(process.execPath, [...nodeArgs, CLI, ...args], {
        encoding: "utf8",
        cwd: REPO,
      });
      if (result.error !== undefined) throw result.error;
      return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
    }

    it("exits 0 on a clean suite and 1 listing every problem, with the SDK denied", () => {
      const hook = writeDenySdkHook(tempDir());
      const clean = cli(
        ["simulate", "--dry-run", CLEAN, FLOWS, "--resource-map", MAP],
        ["--import", hook],
      );
      expect(clean.status).toBe(0);
      expect(clean.stderr).toBe("");
      expect(clean.stdout).toBe(
        `Checked 1 scenario(s) against 2 document(s) in ${FLOWS}: no problems.\n`,
      );

      const wrong = join(DRY_RUN, "cases", "keypad-wrong-key", "scenario.json");
      const problems = cli(
        ["simulate", wrong, FLOWS, "--dry-run", "--resource-map", MAP],
        ["--import", hook],
      );
      expect(problems.status).toBe(1);
      expect(problems.stdout).toBe("");
      expect(problems.stderr).toBe(
        `1 problem(s):\n  - ${wrong}: ${expectedOf("keypad-wrong-key")
          .map((f) => `${f.path}: ${f.message}`)
          .join("")}\n`,
      );
    });

    it("every canonical scenario checks clean against the flow set it is written for", () => {
      // keypad-press is written for the dry-run flow set; the rest for the
      // demo flow. Two sets, so two runs: a scenario is held to one set.
      const demo = join(REPO, "conformance", "demo");
      const dir = tempDir();
      const hook = writeDenySdkHook(dir);
      for (const name of CASES) {
        const flows = name === "keypad-press" ? FLOWS : demo;
        const map = name === "keypad-press" ? MAP : mapFile(dir);
        const run = cli(
          [
            "simulate",
            "--dry-run",
            join(SUITE, name, "scenario.json"),
            flows,
            "--resource-map",
            map,
          ],
          ["--import", hook],
        );
        expect(run.stderr, name).toBe("");
        expect(run.status, name).toBe(0);
        expect(run.stdout).toContain("Checked 1 scenario(s) against");
      }
    });
  });
});
