/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Offline stand-ins for the AWS side of `export`, `simulate`, and `diff`, ported
// from @flow-as-code/core's own tests so the CLI runs the same recorded conformance
// fixtures through the same code a live instance would. Nothing here touches
// the network; the instance ARN is the documentation placeholder the fixtures
// already use.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  ConnectInventoryClient,
  ContactFlowModuleSummary,
  ContactFlowSummary,
  CreateTestCaseInput,
  DescribedContactFlow,
  DescribedContactFlowModule,
  ExecutionRecordSummary,
  ExecutionSummary,
  FlowTestClient,
  InstanceInventory,
  LexBotSummary,
  ResourceSummary,
  TestExecutionStatus,
} from "@flow-as-code/core";

import type { LiveClients } from "../aws.js";

/** Repo root, from src/__fixtures__/ and from the compiled dist/__fixtures__/. */
export const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

export const INSTANCE =
  "arn:aws:connect:us-east-1:111122223333:instance/11111111-2222-3333-4444-555555555555";

/** Maps every token the conformance/simulate scenarios use to a fixture ARN. */
export const RESOURCE_MAP: Record<string, string> = {
  "${cdref:flow:appointment-line}": `${INSTANCE}/contact-flow/cccc3333-0000-4000-8000-000000000001`,
  "${cdref:hours:main-line}": `${INSTANCE}/operating-hours/bbbb2222-0000-4000-8000-000000000001`,
  "${cdref:hours:closed}": `${INSTANCE}/operating-hours/bbbb2222-0000-4000-8000-000000000002`,
  "${cdref:lambda:appointment-lookup}":
    "arn:aws:lambda:us-east-1:111122223333:function:appointment-lookup",
  "${cdref:queue:appointments}": `${INSTANCE}/queue/aaaa1111-0000-4000-8000-000000000001`,
  "${cdref:queue:overflow}": `${INSTANCE}/queue/aaaa1111-0000-4000-8000-000000000002`,
};

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/**
 * The recorded-fixture inventory client over conformance/export/<case>/.
 * `flows/<id>.json` is published content; `flows/<id>.saved.json` alone means a
 * flow that has never been published, which the API reports as
 * ContactFlowNotPublishedException unless the $SAVED alias is used.
 */
export class FixtureClient implements ConnectInventoryClient {
  private readonly inventory: InstanceInventory;
  private readonly dir: string;

  constructor(caseName: string) {
    this.dir = join(REPO, "conformance", "export", caseName);
    this.inventory = readJson<InstanceInventory>(join(this.dir, "inventory.json"));
  }

  private content(id: string): string {
    const saved = id.endsWith(":$SAVED");
    const base = saved ? id.slice(0, -":$SAVED".length) : id;
    const published = join(this.dir, "flows", `${base}.json`);
    const draft = join(this.dir, "flows", `${base}.saved.json`);
    if (saved) {
      if (existsSync(draft)) return readFileSync(draft, "utf8");
      if (existsSync(published)) return readFileSync(published, "utf8");
    } else if (existsSync(published)) {
      return readFileSync(published, "utf8");
    } else if (existsSync(draft)) {
      const error = new Error(`Flow ${base} has not been published.`);
      error.name = "ContactFlowNotPublishedException";
      throw error;
    }
    const error = new Error(`No fixture for ${id}`);
    error.name = "ResourceNotFoundException";
    throw error;
  }

  private summaryOf(id: string): ResourceSummary | undefined {
    return [...this.inventory.contactFlows, ...this.inventory.contactFlowModules].find(
      (s) => s.id === id,
    );
  }

  listContactFlows(contactFlowTypes?: readonly string[]): Promise<ContactFlowSummary[]> {
    const all = this.inventory.contactFlows;
    return Promise.resolve(
      contactFlowTypes === undefined
        ? all
        : all.filter((f) => contactFlowTypes.includes(f.contactFlowType ?? "")),
    );
  }

  describeContactFlow(contactFlowId: string): Promise<DescribedContactFlow> {
    const content = this.content(contactFlowId);
    const base = contactFlowId.replace(":$SAVED", "");
    const summary = this.summaryOf(base);
    return Promise.resolve({
      arn: summary?.arn ?? "",
      id: base,
      name: summary?.name ?? "",
      status: "PUBLISHED",
      content,
    });
  }

  listContactFlowModules(): Promise<ContactFlowModuleSummary[]> {
    return Promise.resolve(this.inventory.contactFlowModules);
  }

  describeContactFlowModule(id: string): Promise<DescribedContactFlowModule> {
    const content = this.content(id);
    const base = id.replace(":$SAVED", "");
    const summary = this.summaryOf(base);
    return Promise.resolve({
      arn: summary?.arn ?? "",
      id: base,
      name: summary?.name ?? "",
      content,
      settings: "{}",
    });
  }

  listQueues(): Promise<ResourceSummary[]> {
    return Promise.resolve(this.inventory.queues);
  }
  listHoursOfOperations(): Promise<ResourceSummary[]> {
    return Promise.resolve(this.inventory.hoursOfOperations);
  }
  listPrompts(): Promise<ResourceSummary[]> {
    return Promise.resolve(this.inventory.prompts);
  }
  listLambdaFunctions(): Promise<string[]> {
    return Promise.resolve(this.inventory.lambdaFunctions);
  }
  listBots(): Promise<LexBotSummary[]> {
    return Promise.resolve(this.inventory.lexBots);
  }
}

export interface FakeClientOptions {
  /** Statuses returned by successive getExecutionSummary calls, per scenario. */
  statuses?: Record<string, TestExecutionStatus[]>;
  /** Scenario names whose execution never leaves IN_PROGRESS. */
  hang?: string[];
}

/** A TestCase client that resolves every scenario the way `options` says. */
export class FakeTestClient implements FlowTestClient {
  readonly created: CreateTestCaseInput[] = [];
  readonly deleted: string[] = [];
  readonly stopped: string[] = [];
  private readonly nameById = new Map<string, string>();
  private readonly polls = new Map<string, number>();
  private counter = 0;

  constructor(
    private readonly clock: { now: number },
    private readonly options: FakeClientOptions = {},
  ) {}

  createTestCase(input: CreateTestCaseInput): Promise<{ testCaseId: string }> {
    this.created.push(input);
    this.counter += 1;
    const id = `tc-${String(this.counter)}`;
    this.nameById.set(id, input.name);
    return Promise.resolve({ testCaseId: id });
  }

  startExecution(
    testCaseId: string,
  ): Promise<{ testCaseExecutionId: string; status: TestExecutionStatus }> {
    return Promise.resolve({ testCaseExecutionId: `ex-${testCaseId}`, status: "INITIATED" });
  }

  getExecutionSummary(testCaseId: string): Promise<ExecutionSummary> {
    const name = this.nameById.get(testCaseId) ?? "";
    if (this.options.hang?.includes(name) === true) {
      // Never terminal: the harness must notice the deadline itself.
      this.clock.now += 60_000;
      return Promise.resolve({ status: "IN_PROGRESS" });
    }
    const seq = this.options.statuses?.[name] ?? ["PASSED"];
    const index = Math.min(this.polls.get(testCaseId) ?? 0, seq.length - 1);
    this.polls.set(testCaseId, index + 1);
    const status = seq[index]!;
    return Promise.resolve({
      status,
      observations: {
        total: 3,
        passed: status === "PASSED" ? 3 : 1,
        failed: status === "PASSED" ? 0 : 2,
      },
    });
  }

  listExecutionRecords(): Promise<ExecutionRecordSummary[]> {
    return Promise.resolve([
      {
        observationId: "observation-2",
        status: "FAILED",
        record: "expected inclusion of 'closed'",
      },
      { observationId: "observation-1", status: "PASSED", record: "ok" },
    ]);
  }

  stopExecution(testCaseId: string): Promise<void> {
    this.stopped.push(testCaseId);
    return Promise.resolve();
  }

  deleteTestCase(testCaseId: string): Promise<void> {
    this.deleted.push(testCaseId);
    return Promise.resolve();
  }
}

/** A clock that only moves when the runner sleeps, so no test waits on wall time. */
export function fakeTimer() {
  const clock = { now: 0 };
  return {
    clock,
    now: () => clock.now,
    sleep: (ms: number) => {
      clock.now += ms;
      return Promise.resolve();
    },
  };
}

/** LiveClients over the fixtures: an export case and a fake TestCase client. */
export function fixtureClients(options: {
  exportCase?: string;
  test?: FlowTestClient;
}): LiveClients {
  return {
    inventory: () => {
      if (options.exportCase === undefined) throw new Error("no inventory in this test");
      return Promise.resolve(new FixtureClient(options.exportCase));
    },
    test: () => {
      if (options.test === undefined) throw new Error("no test client in this test");
      return Promise.resolve(options.test);
    },
  };
}

/**
 * Writes a Node loader hook that makes @aws-sdk/client-connect unresolvable,
 * for `node --import <hook> dist/bin.js`. The monorepo has the SDK installed
 * as an @flow-as-code/core devDependency, so "not installed" has to be simulated.
 * https://nodejs.org/api/module.html#customization-hooks
 */
export function writeDenySdkHook(dir: string): string {
  const path = join(dir, "deny-sdk.mjs");
  writeFileSync(
    path,
    hookModule(`
  if (specifier === "@aws-sdk/client-connect" || specifier.startsWith("@aws-sdk/client-connect/")) {
    const error = new Error("Cannot find package '@aws-sdk/client-connect' imported from " + context.parentURL);
    error.code = "ERR_MODULE_NOT_FOUND";
    throw error;
  }
  return next(specifier, context);
`),
    "utf8",
  );
  return path;
}

/**
 * Writes a hook that resolves @aws-sdk/client-connect to a module exporting a
 * ConnectClient and nothing else: an SDK predating the TestCase operations.
 */
export function writeStaleSdkHook(dir: string): string {
  const path = join(dir, "stale-sdk.mjs");
  const stale = "data:text/javascript,export class ConnectClient { constructor() {} }";
  writeFileSync(
    path,
    hookModule(`
  if (specifier === "@aws-sdk/client-connect") {
    return { url: ${JSON.stringify(stale)}, shortCircuit: true };
  }
  return next(specifier, context);
`),
    "utf8",
  );
  return path;
}

/** The package `writeBrokenSdkHook`'s stand-in SDK fails to import. */
export const BROKEN_SDK_DEPENDENCY = "no-such-transitive-dependency";

/** Where `writeBrokenSdkHook` puts its stand-in SDK, relative to `dir`. */
export const BROKEN_SDK_STUB = join("node_modules", "@aws-sdk", "client-connect", "index.mjs");

/**
 * Writes a hook that resolves @aws-sdk/client-connect to a module in `dir`
 * whose first line imports a package that does not exist: an SDK that is
 * installed but cannot be loaded, which is not the same failure as one that
 * is absent. Node reports it as ERR_MODULE_NOT_FOUND for the dependency's
 * specifier, the shape a half-installed node_modules produces.
 *
 * The stub sits at `<dir>/node_modules/@aws-sdk/client-connect/index.mjs`,
 * where an install would put it, so the loader's message names that path:
 * the SDK's name appears in it unquoted, as it does for a real half-install,
 * and a guard matching the bare name rather than the quoted specifier would
 * take this for "not installed".
 */
export function writeBrokenSdkHook(dir: string): string {
  const stub = join(dir, BROKEN_SDK_STUB);
  mkdirSync(dirname(stub), { recursive: true });
  writeFileSync(stub, `import ${JSON.stringify(BROKEN_SDK_DEPENDENCY)};\n`, "utf8");
  const path = join(dir, "broken-sdk-hook.mjs");
  writeFileSync(
    path,
    hookModule(`
  if (specifier === "@aws-sdk/client-connect") {
    return { url: ${JSON.stringify(pathToFileURL(stub).href)}, shortCircuit: true };
  }
  return next(specifier, context);
`),
    "utf8",
  );
  return path;
}

/**
 * Source of a `--import` module installing `body` as a resolve hook. Node 22.15
 * and later take the synchronous registerHooks form; older Node has only the
 * threaded module.register, which Node 25 deprecates with a warning on stderr,
 * and the tests assert stderr byte for byte.
 */
function hookModule(body: string): string {
  const fn = `function resolve(specifier, context, next) {${body}}`;
  const url = `data:text/javascript,${encodeURIComponent(`export async ${fn}`)}`;
  return [
    'import * as mod from "node:module";',
    `if (typeof mod.registerHooks === "function") mod.registerHooks({ resolve: ${fn} });`,
    `else mod.register(${JSON.stringify(url)});`,
    "",
  ].join("\n");
}
