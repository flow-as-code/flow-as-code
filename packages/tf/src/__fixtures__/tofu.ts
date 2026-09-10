/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The `tofu` harness, shared by every test that runs the real tool.
//
// It lives beside the conformance case loader because it is used from two
// packages now: src/validate.test.ts checks what the emitter produces, and
// packages/studio/tests/exportTofu.test.ts checks that the studio's
// Terraform export button produces something that still validates. One harness,
// one gate, one provider cache; a second copy would be a second thing to keep
// in step and a second cold download.
//
// The gate is RUN_TOFU_VALIDATE=1, because `tofu init` fetches the aws and awscc
// providers over the network and takes minutes on a cold cache. The emit-tf job
// in .github/workflows/ci.yml sets it, and a test in each package asserts that
// the job still runs that package, so the gate cannot quietly stop running.
//
// TF_PLUGIN_CACHE_DIR points at .tofu-cache in the repo root (gitignored) so the
// providers are fetched once per machine.
// https://opentofu.org/docs/cli/config/config-file/#provider-plugin-cache
//
// TF_PLUGIN_CACHE_MAY_BREAK_DEPENDENCY_LOCK_FILE goes with it, and without it
// the cache buys nothing here. OpenTofu will not install from the cache until a
// dependency lock file already records upstream checksums for the package, so
// it installs from upstream "the first time you use it with a particular
// configuration" (same doc). Every test materializes a brand new configuration
// directory, so every init was a first time: the providers were re-downloaded
// per test, which is most of why the emit-tf job took 610s. On OpenTofu 1.7.0
// that also raced, since parallel test files re-extract into the one cache
// directory while another process is running a provider binary out of it
// ("Unrecognized remote plugin message", and a lock file checksum mismatch).
// The caveat the doc gives is that such a lock file is only valid on the
// machine that wrote it, which costs nothing for throwaway directories whose
// lock files are never committed and never reused.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { REPO_ROOT } from "./cases.js";

/** True when the gated tofu tests should run. */
export const TOFU_ENABLED = process.env.RUN_TOFU_VALIDATE === "1";

const cacheDir = fileURLToPath(new URL(".tofu-cache/", REPO_ROOT));

/** What every `tofu` call in this harness runs with. */
const tofuEnv = {
  TF_PLUGIN_CACHE_DIR: cacheDir,
  TF_PLUGIN_CACHE_MAY_BREAK_DEPENDENCY_LOCK_FILE: "1",
  TF_IN_AUTOMATION: "1",
};

export interface TofuRun {
  status: number;
  /** stdout alone, for the calls whose stdout is a value rather than a report. */
  stdout: string;
  /** stdout and stderr together, for assertions about what the tool said. */
  output: string;
}

/** Runs `tofu` in `cwd` with the shared plugin cache. */
export function tofu(args: string[], cwd: string, timeoutMs = 600_000): TofuRun {
  mkdirSync(cacheDir, { recursive: true });
  const result = spawnSync("tofu", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...tofuEnv },
    // A cold provider download is minutes; a warm one is seconds.
    timeout: timeoutMs,
  });
  if (result.error !== undefined) throw result.error;
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

/** The output block tofuEvaluateString writes, and the file it writes it to. */
const EVAL_OUTPUT = "flow_as_code_evaluate";

/** Base64 as `tofu output -raw` should hand it back: one line, no whitespace. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Evaluates `expr` (an HCL expression producing a string) with the real tool
 * and returns exactly the bytes it produced.
 *
 * Deliberately not `tofu console`. The console is an interactive REPL, and
 * driving a REPL through a pipe is fragile in ways that have nothing to do with
 * the expression under test: it only evaluates once stdin reaches EOF, so any
 * parent that holds the write end open deadlocks it. That is not theoretical.
 * opentofu/setup-opentofu installs a Node wrapper named `tofu` by default
 * (input `tofu_wrapper`, default true, unchanged at v2) whose wrapper/tofu.js
 * calls @actions/exec without `options.input`, so the child's stdin is a pipe
 * the wrapper never writes to and never ends. Every `tofu console` call in CI
 * hung until its timeout, on a version that answers the same piped expression
 * in 30ms locally.
 *
 * `output` + `apply` + `output -raw` needs no stdin at all. There are no
 * providers in the directories this is used on, so the apply is offline,
 * needs no credentials, and writes local state into the throwaway temp dir.
 *
 * base64 is what keeps this byte-exact: the value crosses the CLI boundary as
 * one line of ASCII with nothing for `-raw` or a terminal to reinterpret, so
 * awkward bytes (CRLF, tabs, control characters, combining marks) arrive
 * unchanged. conformance/emit-tf/hostile-text is the case that proves it.
 */
export function tofuEvaluateString(cwd: string, expr: string, timeoutMs = 300_000): string {
  writeFileSync(
    join(cwd, `${EVAL_OUTPUT}.tf`),
    `output "${EVAL_OUTPUT}" {\n  value = base64encode(${expr})\n}\n`,
    "utf8",
  );

  const step = (args: string[]): TofuRun => {
    const run = tofu(args, cwd, timeoutMs);
    if (run.status !== 0) {
      throw new Error(`tofu ${args.join(" ")} exited ${run.status}:\n${run.output}`);
    }
    return run;
  };

  step(["init", "-backend=false", "-input=false", "-no-color"]);
  step(["apply", "-auto-approve", "-input=false", "-no-color"]);
  const encoded = step(["output", "-raw", "-no-color", EVAL_OUTPUT]).stdout.trim();

  // Loud rather than silent: Buffer.from(x, "base64") ignores anything it does
  // not recognise, so a changed output format would decode to quiet garbage.
  if (!BASE64.test(encoded)) {
    throw new Error(`tofu output -raw ${EVAL_OUTPUT} was not base64: ${JSON.stringify(encoded)}`);
  }
  return Buffer.from(encoded, "base64").toString("utf8");
}

/** Writes a path -> content map into a fresh temp directory and returns it. */
export function materializeFiles(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "flow-tf-tofu-"));
  for (const [relative, content] of Object.entries(files)) {
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  return dir;
}

/**
 * The emit-tf CI job's text. Every package with gated tofu tests asserts
 * against this that the job still sets RUN_TOFU_VALIDATE and still runs that
 * package, so a gate cannot go quiet by being dropped from the job.
 */
export function emitTfCiJob(): string {
  const ci = readFileSync(new URL(".github/workflows/ci.yml", REPO_ROOT), "utf8");
  const start = ci.indexOf("\n  emit-tf:\n");
  const end = ci.indexOf("\n  packaging:\n");
  // Both markers are asserted rather than trusted. `indexOf` returns -1 when a
  // job is renamed or moved out of the file, and `slice(-1)` or `slice(x, -1)`
  // silently returns a different, wider span, which would let every assertion
  // below keep passing against the wrong text. The job that used to end this
  // slice, `integration`, moved to .github/workflows/integration.yml on
  // 2026-09-09, which is exactly that failure.
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      "cannot locate the emit-tf job in .github/workflows/ci.yml: expected an `emit-tf:` job followed by a `packaging:` job",
    );
  }
  return ci.slice(start, end);
}

/**
 * The OpenTofu versions the emit-tf job runs the gated suite against, read from
 * its matrix. packages/tf/src/validate.test.ts asserts this still covers the
 * floor the emitter promises, so the job cannot silently stop testing it.
 */
export function emitTfCiTofuVersions(): string[] {
  const matrix = /^\s*tofu_version:\s*\[(?<list>[^\]]*)\]\s*$/m.exec(emitTfCiJob());
  if (matrix?.groups?.list === undefined) {
    throw new Error("the emit-tf job has no `tofu_version: [...]` matrix");
  }
  return [...matrix.groups.list.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}
