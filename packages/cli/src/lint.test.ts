/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli lint` over several sets, and the shape of its JSON report. The
// report is a contract (conformance/schema/lint-report-0.1.schema.json, the id
// in `format`), so the command's own output is validated against the schema
// here, and the two-set run is held to what two separate runs report.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, describe, expect, it } from "vitest";

import type { FlowDoc } from "@flow-as-code/core";

import { LINT_REPORT_FORMAT, lintReportText, lintSets, type LintReport } from "./lint.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const CLI = join(REPO, "packages", "cli", "dist", "bin.js");
const DEMO = join(REPO, "conformance", "demo", "appointment-line.flowdoc.json");
const SCHEMA = join(REPO, "conformance", "schema", "lint-report-0.1.schema.json");
const SCRATCH_BASE = join(REPO, "packages", "cli", ".vitest");
const scratch: string[] = [];

function workspace(): string {
  mkdirSync(SCRATCH_BASE, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_BASE, "c15-lint-"));
  scratch.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function cli(...args: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: REPO });
  if (result.error !== undefined) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
  JSON.parse(readFileSync(SCHEMA, "utf8")) as object,
);

/** A set whose whisper reads an attribute the set never sets: one warning. */
function warningSet(dir: string): string {
  const set = join(dir, "warning-set");
  mkdirSync(set);
  cpSync(DEMO, join(set, "appointment-line.flowdoc.json"));
  const whisper: FlowDoc = {
    flowdoc: "0.3",
    kind: "flow",
    name: "agent-whisper",
    connectType: "AGENT_WHISPER",
    content: {
      Version: "2019-10-30",
      StartAction: "say",
      Actions: [
        {
          Identifier: "say",
          Type: "MessageParticipant",
          Parameters: { Text: "Caller tier is $.Attributes.tier." },
          Transitions: { NextAction: "end", Errors: [], Conditions: [] },
        },
        { Identifier: "end", Type: "EndFlowExecution", Parameters: {}, Transitions: {} },
      ],
    },
  };
  writeFileSync(join(set, "agent-whisper.flowdoc.json"), JSON.stringify(whisper, null, 2) + "\n");
  return set;
}

/** A set with an error-severity finding: a transition to a block that does not exist. */
function errorSet(dir: string): string {
  const set = join(dir, "error-set");
  mkdirSync(set);
  const doc = JSON.parse(readFileSync(DEMO, "utf8")) as FlowDoc;
  doc.content.Actions.push({
    Identifier: "orphan",
    Type: "DisconnectParticipant",
    Parameters: {},
    Transitions: { NextAction: "ghost", Errors: [], Conditions: [] },
  });
  delete doc.layout;
  writeFileSync(join(set, "appointment-line.flowdoc.json"), JSON.stringify(doc, null, 2) + "\n");
  return set;
}

describe("lint report", () => {
  it("carries the format id, one entry per set, and every finding named by set", () => {
    const dir = workspace();
    const warning = warningSet(dir);
    const clean = join(dir, "clean");
    mkdirSync(clean);
    cpSync(DEMO, join(clean, "appointment-line.flowdoc.json"));

    const report = lintSets([warning, clean]);
    expect(report.format).toBe(LINT_REPORT_FORMAT);
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    expect(report.sets.map((s) => s.set)).toEqual([warning, clean]);
    expect(report.sets[0]?.documents).toEqual(["agent-whisper", "appointment-line"]);
    expect(report.sets[0]?.summary).toEqual({ total: 1, errors: 0, warnings: 1 });
    expect(report.sets[1]?.summary).toEqual({ total: 0, errors: 0, warnings: 0 });
    expect(report.summary).toEqual({ total: 1, errors: 0, warnings: 1 });
    expect(report.findings).toEqual([
      {
        set: warning,
        rule: "attribute-set-before-read",
        severity: "warning",
        doc: "agent-whisper",
        blockId: "say",
        message: expect.stringContaining("$.Attributes.tier"),
      },
    ]);
  });

  it("keeps sets apart: an attribute set in one set does not satisfy a read in another", () => {
    // Linting the two directories as one merged set would report nothing,
    // because the setter in one would cover the reader in the other.
    const dir = workspace();
    const reader = warningSet(dir);
    const setter = join(dir, "setter");
    mkdirSync(setter);
    const doc = JSON.parse(readFileSync(DEMO, "utf8")) as FlowDoc;
    const record = doc.content.Actions.find((a) => a.Identifier === "record-lookup-result")!;
    record.Parameters.Attributes = { tier: "gold" };
    writeFileSync(
      join(setter, "appointment-line.flowdoc.json"),
      JSON.stringify(doc, null, 2) + "\n",
    );

    const report = lintSets([reader, setter]);
    expect(report.findings.map((f) => [f.set, f.rule])).toEqual([
      [reader, "attribute-set-before-read"],
    ]);
  });

  it("prints one set as core's text report, and several under their paths", () => {
    const dir = workspace();
    const warning = warningSet(dir);
    const one = lintReportText(lintSets([warning]));
    expect(one).toMatch(/^agent-whisper\n {2}warning \(say\): /);
    expect(one).not.toContain(warning);

    const two = lintReportText(lintSets([warning, errorSet(dir)]));
    expect(two).toContain(`${warning}:\n`);
    expect(two).toContain(`${join(dir, "error-set")}:\n`);
    // The orphan is reachable-blocks twice: unreachable (warning) and a
    // transition to a block that does not exist (error).
    expect(two).toMatch(/\n2 set\(s\): 3 finding\(s\), 1 error\(s\), 2 warning\(s\)\.\n$/);
  });
});

describe("flow-cli lint over several sets", () => {
  it("validates against the schema and exits with the worst severity across sets", () => {
    const dir = workspace();
    const warning = warningSet(dir);
    const error = errorSet(dir);

    const warn = cli("lint", warning, "--format", "json");
    expect(warn.status).toBe(0);
    const warnReport = JSON.parse(warn.stdout) as LintReport;
    expect(validate(warnReport), JSON.stringify(validate.errors)).toBe(true);
    expect(warnReport.summary).toEqual({ total: 1, errors: 0, warnings: 1 });

    const both = cli("lint", warning, error, "--format", "json");
    expect(both.status).toBe(1);
    const report = JSON.parse(both.stdout) as LintReport;
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    expect(report.sets.map((s) => s.set)).toEqual([warning, error]);
    expect(report.findings.map((f) => f.set)).toEqual([warning, error, error]);
    expect(report.summary).toEqual({ total: 3, errors: 1, warnings: 2 });
    expect(both.stderr).toBe(`lint failed: 1 error-severity finding(s) in ${error}\n`);
  });

  it("fails the whole run on a set that does not load, naming the file", () => {
    const dir = workspace();
    const broken = join(dir, "broken");
    mkdirSync(broken);
    writeFileSync(join(broken, "bad.flowdoc.json"), "{ not json");
    const run = cli("lint", warningSet(dir), broken);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain(join(broken, "bad.flowdoc.json"));
  });
});
