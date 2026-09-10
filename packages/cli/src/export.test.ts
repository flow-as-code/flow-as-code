/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli export`, offline. The command body runs in process over the
// recorded conformance/export/ fixtures through the LiveClients seam, which is
// where exit codes are decided (a CliError's exitCode is what run.ts hands to
// process.exitCode). The paths that must fail before any client exists, bad
// arguments and a missing SDK, run the built CLI as a subprocess as well, since
// "no stack trace, exit 1" is only observable there.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ContactFlowModuleSummary,
  ContactFlowSummary,
  DescribedContactFlow,
  DescribedContactFlowModule,
  FlowDoc,
  ResourceSummary,
} from "@flow-as-code/core";
import { serialize } from "@flow-as-code/core";

import { MISSING_SDK_MESSAGE, SDK_PACKAGE } from "./aws.js";
import { CliError } from "./errors.js";
import { runExport } from "./export.js";
import { generator, sha256Hex } from "./synth.js";
import {
  BROKEN_SDK_DEPENDENCY,
  BROKEN_SDK_STUB,
  FixtureClient,
  fixtureClients,
  INSTANCE,
  REPO,
  writeBrokenSdkHook,
  writeDenySdkHook,
} from "./__fixtures__/live.js";

const CLI = join(REPO, "packages", "cli", "dist", "bin.js");
const EXPECTED = join(REPO, "conformance", "export", "demo-instance", "expected");
const SCRATCH_BASE = join(REPO, "packages", "cli", ".vitest");
const scratch: string[] = [];

function tempDir(): string {
  mkdirSync(SCRATCH_BASE, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_BASE, "a06-export-"));
  scratch.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const readDoc = (path: string): FlowDoc => JSON.parse(readFileSync(path, "utf8")) as FlowDoc;
const withoutMeta = (doc: FlowDoc): string => serialize({ ...doc, meta: undefined });

/** Runs the command and returns the CliError it threw, or fails the test. */
async function expectCliError(work: Promise<unknown>): Promise<CliError> {
  let thrown: unknown;
  try {
    await work;
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
    stdout.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("export", () => {
  it("writes a FlowDoc and a source file per flow and module", async () => {
    const out = tempDir();
    const outcome = await runExport(
      { instance: INSTANCE, out },
      fixtureClients({ exportCase: "demo-instance" }),
    );

    expect(outcome.written.map((w) => [w.name, w.kind, w.saved])).toEqual([
      ["appointment-line", "flow", false],
      ["draft-line", "flow", true],
      ["recording-consent", "module", false],
    ]);
    expect(outcome.failures).toEqual([]);
    expect(readdirSync(out).sort()).toEqual([
      "appointment-line.flow.ts",
      "appointment-line.flowdoc.json",
      "draft-line.flow.ts",
      "draft-line.flowdoc.json",
      "recording-consent.flow.ts",
      "recording-consent.flowdoc.json",
    ]);

    // Content matches the exporter goldens. meta differs by design: the CLI
    // stamps its own generator and the hash of the source it wrote.
    for (const name of ["appointment-line", "draft-line", "recording-consent"]) {
      const written = readDoc(join(out, `${name}.flowdoc.json`));
      const golden = readDoc(join(EXPECTED, `${name}.flowdoc.json`));
      expect(withoutMeta(written), name).toBe(withoutMeta(golden));
      expect(written.meta?.source, name).toEqual(golden.meta?.source);
      expect(written.meta?.generator, name).toBe(generator());
      const source = readFileSync(join(out, `${name}.flow.ts`), "utf8");
      expect(written.meta?.sourceHash, name).toBe(`sha256:${sha256Hex(source)}`);
    }
    expect(readFileSync(join(out, "appointment-line.flow.ts"), "utf8")).toBe(
      readFileSync(join(EXPECTED, "appointment-line.flow.ts"), "utf8"),
    );
    expect(readFileSync(join(out, "appointment-line.flowdoc.json"), "utf8")).not.toContain(
      "arn:aws",
    );
  });

  it("prints one line per document and a summary", async () => {
    const out = tempDir();
    await runExport({ instance: INSTANCE, out }, fixtureClients({ exportCase: "demo-instance" }));
    expect(stdout).toEqual([
      "appointment-line (flow): appointment-line.flowdoc.json, appointment-line.flow.ts",
      "draft-line (flow, $SAVED): draft-line.flowdoc.json, draft-line.flow.ts",
      "recording-consent (module): recording-consent.flowdoc.json, recording-consent.flow.ts",
      `Exported 3 of 3 to ${out}`,
    ]);
    // The exporter's warnings (a V1 bot, a CAMPAIGN flow, module settings) go
    // to stderr so stdout stays a plain list.
    expect(stderr).toHaveLength(3);
    for (const line of stderr) expect(line).toMatch(/^warning: /);
  });

  it("--no-codegen writes only the documents, with no sourceHash", async () => {
    const out = tempDir();
    const outcome = await runExport(
      { instance: INSTANCE, out, codegen: false },
      fixtureClients({ exportCase: "demo-instance" }),
    );
    expect(outcome.written.map((w) => w.files)).toEqual([
      ["appointment-line.flowdoc.json"],
      ["draft-line.flowdoc.json"],
      ["recording-consent.flowdoc.json"],
    ]);
    expect(readdirSync(out).filter((f) => f.endsWith(".ts"))).toEqual([]);
    const written = readDoc(join(out, "appointment-line.flowdoc.json"));
    expect(written.meta?.sourceHash).toBeUndefined();
    expect(withoutMeta(written)).toBe(
      withoutMeta(readDoc(join(EXPECTED, "appointment-line.flowdoc.json"))),
    );
  });

  it("creates --out and defaults it to the working directory", async () => {
    const out = join(tempDir(), "nested", "deeper");
    await runExport({ instance: INSTANCE, out }, fixtureClients({ exportCase: "demo-instance" }));
    expect(existsSync(join(out, "appointment-line.flowdoc.json"))).toBe(true);

    const cwd = tempDir();
    const spy = vi.spyOn(process, "cwd").mockReturnValue(cwd);
    try {
      const outcome = await runExport(
        { instance: INSTANCE },
        fixtureClients({ exportCase: "demo-instance" }),
      );
      expect(outcome.outDir).toBe(cwd);
    } finally {
      spy.mockRestore();
    }
    expect(existsSync(join(cwd, "recording-consent.flowdoc.json"))).toBe(true);
  });

  it("carries @keep comments of an existing source file through", async () => {
    const out = tempDir();
    const clients = fixtureClients({ exportCase: "demo-instance" });
    await runExport({ instance: INSTANCE, out }, clients);
    const ts = join(out, "appointment-line.flow.ts");
    writeFileSync(
      ts,
      readFileSync(ts, "utf8").replace(
        "export function appointmentLine()",
        "// @keep this note survives\nexport function appointmentLine()",
      ),
    );

    await runExport({ instance: INSTANCE, out }, clients);
    const regenerated = readFileSync(ts, "utf8");
    expect(regenerated).toContain("// @keep this note survives");
    // The hash covers the source as written, comment included.
    expect(readDoc(join(out, "appointment-line.flowdoc.json")).meta?.sourceHash).toBe(
      `sha256:${sha256Hex(regenerated)}`,
    );
  });

  describe("failures", () => {
    /**
     * unknown-arns with the same stale flow listed twice, so a run has more
     * than one failure to report.
     */
    class TwoStaleFlows extends FixtureClient {
      constructor() {
        super("unknown-arns");
      }
      override async listContactFlows(types?: readonly string[]): Promise<ContactFlowSummary[]> {
        const [first] = await super.listContactFlows(types);
        if (first === undefined) return [];
        return [
          first,
          {
            ...first,
            id: "cccc3333-0000-4000-8000-000000000010",
            arn: `${INSTANCE}/contact-flow/cccc3333-0000-4000-8000-000000000010`,
            name: "Stale Refs Two",
          },
        ];
      }
      override async describeContactFlow(id: string): Promise<DescribedContactFlow> {
        const described = await super.describeContactFlow(
          id.replace(
            "cccc3333-0000-4000-8000-000000000010",
            "cccc3333-0000-4000-8000-000000000009",
          ),
        );
        return id.includes("0010") ? { ...described, id, name: "Stale Refs Two" } : described;
      }
    }

    it("collect (the default) reports every failure and exits 1", async () => {
      const out = tempDir();
      const error = await expectCliError(
        runExport(
          { instance: INSTANCE, out },
          { ...fixtureClients({}), inventory: () => Promise.resolve(new TwoStaleFlows()) },
        ),
      );
      expect(error.exitCode).toBe(1);
      expect(error.message).toBe("2 flow(s) could not be exported");
      expect(stderr).toHaveLength(2);
      expect(stderr[0]).toMatch(
        /^failed: Stale Refs \(arn:aws:connect:[^)]+\): Cannot export "stale-refs": 4 ARN\(s\) not found/,
      );
      expect(stderr[1]).toContain("failed: Stale Refs Two (");
      expect(stderr[1]).toContain('Cannot export "stale-refs-two"');
      expect(stdout).toEqual([`Exported 0 of 2 to ${out}`]);
      expect(readdirSync(out)).toEqual([]);
    });

    it("--on-error abort stops at the first failure and writes nothing", async () => {
      const out = join(tempDir(), "never-created");
      const error = await expectCliError(
        runExport(
          { instance: INSTANCE, out, onError: "abort" },
          { ...fixtureClients({}), inventory: () => Promise.resolve(new TwoStaleFlows()) },
        ),
      );
      expect(error.exitCode).toBe(1);
      expect(error.message).toMatch(
        /^export aborted \(--on-error abort\): Cannot export "stale-refs": 4 ARN\(s\)/,
      );
      expect(existsSync(out)).toBe(false);
      expect(stdout).toEqual([]);
    });

    /** demo-instance whose queue listing is refused, as a missing IAM action would be. */
    class DeniedQueues extends FixtureClient {
      constructor() {
        super("demo-instance");
      }
      override listQueues(): Promise<ResourceSummary[]> {
        return Promise.reject(new Error("AccessDeniedException: connect:ListQueues"));
      }
    }

    it("an inventory failure exits 1 with the SDK's message, in either mode", async () => {
      // The listing fails before any flow is read, so it is not a flow failure
      // and not something --on-error decides; the message is passed through.
      for (const onError of [undefined, "collect", "abort"]) {
        stderr.length = 0;
        const out = join(tempDir(), "never-created");
        const error = await expectCliError(
          runExport(
            { instance: INSTANCE, out, ...(onError === undefined ? {} : { onError }) },
            { ...fixtureClients({}), inventory: () => Promise.resolve(new DeniedQueues()) },
          ),
        );
        expect(error.exitCode, String(onError)).toBe(1);
        expect(error.message, String(onError)).toBe("AccessDeniedException: connect:ListQueues");
        expect(existsSync(out), String(onError)).toBe(false);
      }
      expect(stdout).toEqual([]);
    });

    it("writes what it can when only some flows fail", async () => {
      // demo-instance plus the stale flow: three documents land, one is reported.
      class Mixed extends FixtureClient {
        private readonly stale = new FixtureClient("unknown-arns");
        constructor() {
          super("demo-instance");
        }
        override async listContactFlows(types?: readonly string[]): Promise<ContactFlowSummary[]> {
          return [
            ...(await super.listContactFlows(types)),
            ...(await this.stale.listContactFlows(types)),
          ];
        }
        override describeContactFlow(id: string): Promise<DescribedContactFlow> {
          return id.startsWith("cccc3333-0000-4000-8000-000000000009")
            ? this.stale.describeContactFlow(id)
            : super.describeContactFlow(id);
        }
      }
      const out = tempDir();
      const error = await expectCliError(
        runExport(
          { instance: INSTANCE, out },
          { ...fixtureClients({}), inventory: () => Promise.resolve(new Mixed()) },
        ),
      );
      expect(error.message).toBe("1 flow(s) could not be exported");
      expect(
        readdirSync(out)
          .filter((f) => f.endsWith(".flowdoc.json"))
          .sort(),
      ).toEqual([
        "appointment-line.flowdoc.json",
        "draft-line.flowdoc.json",
        "recording-consent.flowdoc.json",
      ]);
      expect(stdout.at(-1)).toBe(`Exported 3 of 4 to ${out}`);
    });

    it("refuses a second document of the same name instead of overwriting", async () => {
      // A module called "Appointment Line" slugs like the flow of that name.
      class Colliding extends FixtureClient {
        constructor() {
          super("demo-instance");
        }
        override async listContactFlowModules(): Promise<ContactFlowModuleSummary[]> {
          const [module] = await super.listContactFlowModules();
          if (module === undefined) return [];
          return [
            module,
            {
              ...module,
              id: "dddd4444-0000-4000-8000-000000000099",
              arn: `${INSTANCE}/flow-module/dddd4444-0000-4000-8000-000000000099`,
              name: "Appointment Line",
            },
          ];
        }
        override async describeContactFlowModule(id: string): Promise<DescribedContactFlowModule> {
          if (!id.startsWith("dddd4444-0000-4000-8000-000000000099")) {
            return super.describeContactFlowModule(id);
          }
          const [module] = await super.listContactFlowModules();
          const described = await super.describeContactFlowModule(module?.id ?? "");
          return { ...described, id, name: "Appointment Line" };
        }
      }
      const out = tempDir();
      const error = await expectCliError(
        runExport(
          { instance: INSTANCE, out },
          { ...fixtureClients({}), inventory: () => Promise.resolve(new Colliding()) },
        ),
      );
      expect(error.exitCode).toBe(1);
      expect(error.message).toBe("1 flow(s) could not be exported");
      const failed = stderr.filter((line) => line.startsWith("failed: "));
      expect(failed).toHaveLength(1);
      expect(failed[0]).toContain(
        'a flow and a module both slug to "appointment-line"; not written, appointment-line.flowdoc.json holds the flow',
      );
      expect(readDoc(join(out, "appointment-line.flowdoc.json")).kind).toBe("flow");
      expect(readdirSync(out).filter((f) => f.endsWith(".flowdoc.json"))).toHaveLength(3);
    });
  });

  describe("arguments", () => {
    const untouched = fixtureClients({});

    it("rejects an unknown --on-error before connecting", async () => {
      const error = await expectCliError(
        runExport({ instance: INSTANCE, onError: "sometimes" }, untouched),
      );
      expect(error.exitCode).toBe(1);
      expect(error.message).toBe('Unknown --on-error "sometimes". Use "abort" or "collect".');
    });

    it("rejects anything but an instance ARN, before connecting", async () => {
      for (const bad of [
        "11111111-2222-3333-4444-555555555555",
        `${INSTANCE}/contact-flow/cccc3333-0000-4000-8000-000000000001`,
        "arn:aws:lambda:us-east-1:111122223333:function:lookup",
      ]) {
        const error = await expectCliError(runExport({ instance: bad }, untouched));
        expect(error.exitCode, bad).toBe(1);
        expect(error.message, bad).toContain("--instance must be an Amazon Connect instance ARN");
        expect(error.message, bad).toContain(bad);
      }
      const noRegion = await expectCliError(
        runExport(
          {
            instance: "arn:aws:connect::111122223333:instance/11111111-2222-3333-4444-555555555555",
          },
          untouched,
        ),
      );
      expect(noRegion.message).toContain("has no Region");
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
      const hook = writeDenySdkHook(dir);
      const run = cli(["export", "--instance", INSTANCE, "--out", dir], ["--import", hook]);
      expect(run.status).toBe(1);
      expect(run.stderr.trim()).toBe(MISSING_SDK_MESSAGE);
      expect(run.stderr).not.toMatch(/^\s+at /m);
      expect(run.stdout).toBe("");
      expect(readdirSync(dir)).toEqual(["deny-sdk.mjs"]);
    });

    it("names the loader's reason when the SDK is installed but cannot be loaded", () => {
      // An install command is not the answer to a half-installed SDK, so the
      // "not installed" line is reserved for the package itself being absent.
      const dir = tempDir();
      const hook = writeBrokenSdkHook(dir);
      const run = cli(["export", "--instance", INSTANCE, "--out", dir], ["--import", hook]);
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(
        new RegExp(
          `^${SDK_PACKAGE} could not be loaded: Cannot find package '${BROKEN_SDK_DEPENDENCY}' imported from `,
        ),
      );
      // The loader names the stub's own path, which carries the SDK's name the
      // way a real node_modules does. Only the quoted specifier means "absent".
      expect(run.stderr).toContain(join(dir, BROKEN_SDK_STUB));
      expect(run.stderr).not.toContain(`'${SDK_PACKAGE}'`);
      expect(run.stderr.trim().split("\n")).toHaveLength(1);
      expect(run.stderr).not.toContain("Install it");
      expect(run.stderr).not.toMatch(/^\s+at /m);
      expect(run.stdout).toBe("");
    });

    it("exits 1 on a bad --instance or --on-error without loading the SDK", () => {
      const dir = tempDir();
      const hook = writeDenySdkHook(dir);
      const bad = cli(["export", "--instance", "not-an-arn"], ["--import", hook]);
      expect(bad.status).toBe(1);
      expect(bad.stderr).toContain("--instance must be an Amazon Connect instance ARN");
      const mode = cli(
        ["export", "--instance", INSTANCE, "--on-error", "maybe"],
        ["--import", hook],
      );
      expect(mode.status).toBe(1);
      expect(mode.stderr.trim()).toBe('Unknown --on-error "maybe". Use "abort" or "collect".');
    });

    it("requires --instance", () => {
      const run = cli(["export"]);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("--instance");
    });
  });
});
