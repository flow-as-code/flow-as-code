/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli diff`, offline. The live side is the recorded demo-instance export
// fixture; the local side is written per test from the exporter goldens, so
// unchanged, changed, missing-live, and error each have a document that
// provokes them. The three exit codes are the contract: 0 nothing differs, 1
// something does, 2 the comparison itself failed.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContactFlowSummary, FlowDoc } from "@flow-as-code/core";

import { MISSING_SDK_MESSAGE } from "./aws.js";
import { comparableLines, EXIT_DIFF_ERROR, runDiff, SAVED_MARKER, unifiedDiff } from "./diff.js";
import { CliError } from "./errors.js";
import {
  FixtureClient,
  fixtureClients,
  INSTANCE,
  REPO,
  writeDenySdkHook,
} from "./__fixtures__/live.js";

const CLI = join(REPO, "packages", "cli", "dist", "bin.js");
const EXPECTED = join(REPO, "conformance", "export", "demo-instance", "expected");
const DEMO = join(REPO, "conformance", "demo");
const SCRATCH_BASE = join(REPO, "packages", "cli", ".vitest");
const scratch: string[] = [];

function tempDir(): string {
  mkdirSync(SCRATCH_BASE, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_BASE, "a06-diff-"));
  scratch.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const readDoc = (path: string): FlowDoc => JSON.parse(readFileSync(path, "utf8")) as FlowDoc;
const writeDoc = (path: string, doc: FlowDoc): void => {
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");
};

/** A copy of one exporter golden, optionally edited, in a fresh directory. */
function local(
  dir: string,
  name: string,
  edit?: (doc: FlowDoc) => void,
  file: string = `${name}.flowdoc.json`,
): string {
  const doc = readDoc(join(EXPECTED, `${name}.flowdoc.json`));
  edit?.(doc);
  const path = join(dir, file);
  writeDoc(path, doc);
  return path;
}

/** Rewrites the welcome prompt, a content change that must show as a diff. */
function editWelcome(doc: FlowDoc): void {
  const welcome = doc.content.Actions.find((action) => action.Identifier === "welcome");
  if (welcome === undefined) throw new Error("fixture has no welcome action");
  welcome.Parameters = { ...welcome.Parameters, Text: "Edited locally" };
}

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

const demoClients = fixtureClients({ exportCase: "demo-instance" });

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

describe("unifiedDiff", () => {
  it("is empty for identical input", () => {
    expect(unifiedDiff(["a", "b"], ["a", "b"], "l", "r")).toBe("");
    expect(unifiedDiff([], [], "l", "r")).toBe("");
  });

  it("prints hunks with three lines of context and unified headers", () => {
    const left = Array.from({ length: 20 }, (_, i) => `line ${String(i + 1)}`);
    const right = [...left];
    right[4] = "changed 5";
    right.splice(15, 1);
    expect(unifiedDiff(left, right, "l", "r")).toBe(
      [
        "--- l",
        "+++ r",
        "@@ -2,7 +2,7 @@",
        " line 2",
        " line 3",
        " line 4",
        "-line 5",
        "+changed 5",
        " line 6",
        " line 7",
        " line 8",
        "@@ -13,7 +13,6 @@",
        " line 13",
        " line 14",
        " line 15",
        "-line 16",
        " line 17",
        " line 18",
        " line 19",
        "",
      ].join("\n"),
    );
  });

  it("writes single-line and empty ranges the way diff does", () => {
    expect(unifiedDiff(["a"], ["b"], "l", "r")).toBe("--- l\n+++ r\n@@ -1 +1 @@\n-a\n+b\n");
    expect(unifiedDiff([], ["a"], "l", "r")).toBe("--- l\n+++ r\n@@ -0,0 +1 @@\n+a\n");
    expect(unifiedDiff(["a"], [], "l", "r")).toBe("--- l\n+++ r\n@@ -1 +0,0 @@\n-a\n");
  });

  it("merges nearby changes into one hunk", () => {
    const left = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const right = ["a", "B", "c", "d", "e", "f", "G", "h"];
    const out = unifiedDiff(left, right, "l", "r");
    expect(out.match(/^@@/gm)).toHaveLength(1);
    expect(out).toContain("-b\n+B\n c\n d\n e\n f\n-g\n+G\n h\n");
  });
});

describe("comparableLines", () => {
  it("drops layout and meta and nothing else", () => {
    const doc = readDoc(join(EXPECTED, "appointment-line.flowdoc.json"));
    const text = comparableLines(doc).join("\n");
    expect(text).not.toContain('"layout"');
    expect(text).not.toContain('"meta"');
    expect(text).toContain('"refs"');
    expect(text).toContain("${cdref:");
    expect(comparableLines({ ...doc, layout: undefined, meta: undefined })).toEqual(
      comparableLines(doc),
    );
  });
});

describe("runDiff", () => {
  it("exits 0 when every local document matches its live twin", async () => {
    const dir = tempDir();
    // The exporter goldens, with meta rewritten and layout dropped: neither counts.
    local(dir, "appointment-line", (doc) => {
      doc.meta = { generator: "someone-else", note: "provenance is not content" };
      delete doc.layout;
    });
    local(dir, "recording-consent");
    local(dir, "draft-line");
    const entries = await runDiff(dir, { instance: INSTANCE }, demoClients);
    // draft-line has never been published: the live side is its saved content,
    // and the entry and the line both say so.
    expect(entries.map((entry) => [entry.name, entry.kind, entry.status, entry.saved])).toEqual([
      ["appointment-line", "flow", "unchanged", undefined],
      ["draft-line", "flow", "unchanged", true],
      ["recording-consent", "module", "unchanged", undefined],
    ]);
    const rel = (name: string) => relative(process.cwd(), join(dir, `${name}.flowdoc.json`));
    expect(stdout.join("")).toBe(
      `${rel("appointment-line")}: unchanged\n${rel("draft-line")}: unchanged (${SAVED_MARKER})\n${rel("recording-consent")}: unchanged\n`,
    );
    expect(stderr).toEqual([]);
  });

  it("labels a changed draft's live side with the alias it was read through", async () => {
    const dir = tempDir();
    const path = local(dir, "draft-line", (doc) => {
      const greet = doc.content.Actions.find((action) => action.Identifier === "greet");
      if (greet === undefined) throw new Error("fixture has no greet action");
      greet.Parameters = { ...greet.Parameters, Text: "Edited locally" };
    });
    const rel = relative(process.cwd(), path);
    const error = await expectCliError(runDiff(dir, { instance: INSTANCE }, demoClients));
    expect(error.exitCode).toBe(1);
    expect(
      stdout
        .join("")
        .startsWith(
          `${rel}: changed (${SAVED_MARKER})\n--- local/${rel}\n+++ live/draft-line:${SAVED_MARKER}\n@@ `,
        ),
    ).toBe(true);
  });

  it("the demo FlowDoc is unchanged against the demo instance", async () => {
    const entries = await runDiff(DEMO, { instance: INSTANCE }, demoClients);
    expect(entries).toEqual([
      {
        path: relative(process.cwd(), join(DEMO, "appointment-line.flowdoc.json")),
        name: "appointment-line",
        kind: "flow",
        status: "unchanged",
      },
    ]);
  });

  it("exits 1 with a unified diff of the canonical JSON for a changed document", async () => {
    const dir = tempDir();
    const path = local(dir, "appointment-line", editWelcome);
    const rel = relative(process.cwd(), path);
    const error = await expectCliError(runDiff(dir, { instance: INSTANCE }, demoClients));
    expect(error.exitCode).toBe(1);
    expect(error.message).toBe(`1 of 1 document(s) differ from ${INSTANCE}`);
    const out = stdout.join("");
    expect(
      out.startsWith(`${rel}: changed\n--- local/${rel}\n+++ live/appointment-line\n@@ `),
    ).toBe(true);
    expect(out).not.toContain(SAVED_MARKER);
    expect(out).toMatch(/^-\s+"Text": "Edited locally"$/m);
    expect(out).toMatch(
      /^\+\s+"Text": "Thanks for calling\. Let's get you to the right place\."$/m,
    );
    expect(out).not.toContain("arn:aws");
  });

  it("is byte-stable across runs", async () => {
    const dir = tempDir();
    local(dir, "appointment-line", editWelcome);
    await expectCliError(runDiff(dir, { instance: INSTANCE }, demoClients));
    const first = stdout.join("");
    stdout.length = 0;
    await expectCliError(runDiff(dir, { instance: INSTANCE }, demoClients));
    expect(stdout.join("")).toBe(first);
  });

  it("matches by kind as well as name", async () => {
    // A local module called appointment-line is not the live flow of that name.
    const dir = tempDir();
    local(dir, "recording-consent", (doc) => {
      doc.name = "appointment-line";
    });
    const error = await expectCliError(runDiff(dir, { instance: INSTANCE }, demoClients));
    expect(error.exitCode).toBe(1);
    expect(stdout.join("")).toMatch(/recording-consent\.flowdoc\.json: missing-live\n$/);
  });

  it("reports a document with no live counterpart and still exits 1", async () => {
    const dir = tempDir();
    local(dir, "appointment-line");
    local(dir, "recording-consent", (doc) => {
      doc.name = "retired-module";
    });
    const error = await expectCliError(runDiff(dir, { instance: INSTANCE }, demoClients));
    expect(error.exitCode).toBe(1);
    expect(error.message).toBe(`1 of 2 document(s) differ from ${INSTANCE}`);
    expect(stdout.join("")).toMatch(
      /appointment-line\.flowdoc\.json: unchanged\n.*recording-consent\.flowdoc\.json: missing-live\n$/,
    );
  });

  it("exits 2 when a matched live flow cannot be exported", async () => {
    // demo-instance plus the unknown-arns flow, checked in locally as stale-refs.
    class WithStale extends FixtureClient {
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
      override describeContactFlow(id: string) {
        return id.startsWith("cccc3333-0000-4000-8000-000000000009")
          ? this.stale.describeContactFlow(id)
          : super.describeContactFlow(id);
      }
    }
    const dir = tempDir();
    local(dir, "appointment-line", editWelcome);
    local(
      dir,
      "appointment-line",
      (doc) => {
        doc.name = "stale-refs";
      },
      "stale-refs.flowdoc.json",
    );
    const error = await expectCliError(
      runDiff(
        dir,
        { instance: INSTANCE },
        { ...demoClients, inventory: () => Promise.resolve(new WithStale()) },
      ),
    );
    expect(error.exitCode).toBe(EXIT_DIFF_ERROR);
    expect(error.message).toBe(`1 document(s) could not be compared with ${INSTANCE}`);
    const out = stdout.join("");
    expect(out).toMatch(/appointment-line\.flowdoc\.json: changed\n/);
    expect(out).toMatch(
      /stale-refs\.flowdoc\.json: error: Cannot export "stale-refs": 4 ARN\(s\) not found/,
    );
  });

  describe("operational failures exit 2", () => {
    it("on a bad --instance, before anything is read", async () => {
      const error = await expectCliError(
        runDiff(DEMO, { instance: "not-an-arn" }, fixtureClients({})),
      );
      expect(error.exitCode).toBe(EXIT_DIFF_ERROR);
      expect(error.message).toContain("--instance must be an Amazon Connect instance ARN");
    });

    it("on a missing or empty directory", async () => {
      const dir = tempDir();
      const error = await expectCliError(
        runDiff(join(dir, "nope"), { instance: INSTANCE }, fixtureClients({})),
      );
      expect(error.exitCode).toBe(EXIT_DIFF_ERROR);
      expect(error.message).toContain(join(dir, "nope"));
    });

    it("when the inventory cannot be read", async () => {
      const dir = tempDir();
      local(dir, "appointment-line");
      const error = await expectCliError(
        runDiff(
          dir,
          { instance: INSTANCE },
          {
            ...fixtureClients({}),
            inventory: () =>
              Promise.reject(new Error("AccessDeniedException: no connect:ListContactFlows")),
          },
        ),
      );
      expect(error.exitCode).toBe(EXIT_DIFF_ERROR);
      expect(error.message).toBe("AccessDeniedException: no connect:ListContactFlows");
      expect(stdout).toEqual([]);
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

    it("exits 2 with a one-line message when the SDK is not installed", () => {
      const dir = tempDir();
      cpSync(
        join(DEMO, "appointment-line.flowdoc.json"),
        join(dir, "appointment-line.flowdoc.json"),
      );
      const run = cli(["diff", dir, "--instance", INSTANCE], ["--import", writeDenySdkHook(dir)]);
      expect(run.status).toBe(EXIT_DIFF_ERROR);
      expect(run.stderr.trim()).toBe(MISSING_SDK_MESSAGE);
      expect(run.stderr).not.toMatch(/^\s+at /m);
      expect(run.stdout).toBe("");
    });

    it("exits 2 on a bad --instance", () => {
      const bad = cli(["diff", DEMO, "--instance", "nope"]);
      expect(bad.status).toBe(EXIT_DIFF_ERROR);
      expect(bad.stderr).toContain("--instance must be an Amazon Connect instance ARN");
    });

    it("exits 2 on commander's own usage errors, which default to 1", () => {
      // Bad arguments are "could not tell", not "differs"; other commands
      // keep commander's 1 for these, so the override is diff's alone.
      const none = cli(["diff", DEMO]);
      expect(none.status).toBe(EXIT_DIFF_ERROR);
      expect(none.stderr).toContain("required option '--instance <arn>' not specified");
      const unknown = cli(["diff", DEMO, "--instance", INSTANCE, "--bogus"]);
      expect(unknown.status).toBe(EXIT_DIFF_ERROR);
      expect(unknown.stderr).toContain("unknown option '--bogus'");
      const noDir = cli(["diff", "--instance", INSTANCE]);
      expect(noDir.status).toBe(EXIT_DIFF_ERROR);
      expect(noDir.stderr).toContain("missing required argument 'dir'");
      for (const run of [none, unknown, noDir]) {
        expect(run.stdout).toBe("");
        expect(run.stderr).not.toMatch(/^\s+at /m);
      }
      expect(cli(["export"]).status).toBe(1);
      expect(cli(["diff", "--help"]).status).toBe(0);
    });
  });
});
