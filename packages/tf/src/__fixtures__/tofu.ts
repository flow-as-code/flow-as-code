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
//
// That env var is necessary and not sufficient. OpenTofu 1.7.0 honours it (the
// binary carries the name, and it does install from the cache), but it still
// corrupts what it records when two `tofu init` processes populate the same
// cache directory with the same not-yet-cached provider package at the same
// time: init exits 0, and the lock file it wrote holds a hash that the package
// finally sitting in .terraform/providers does not have. Nothing complains
// until the next command reads the lock file, which is why this surfaced as
//
//   Error: registry.opentofu.org/hashicorp/aws: the cached package for
//   registry.opentofu.org/hashicorp/aws 6.64.0 (in .terraform/providers) does
//   not match any of the checksums recorded in the dependency lock file
//
// out of `tofu validate` rather than out of the init that caused it. Six
// concurrent cold inits reproduce it on 1.7.0 every time and never on 1.12.6,
// so it is a bug that release fixed rather than anything about this repo. The
// two gated test files run in parallel, so a cold cache is exactly that race.
//
// prewarmTofuCache below is the fix: it runs every distinct provider set
// through one sequential `tofu init` before any test worker starts, so the
// parallel inits only ever read a cache that is already populated, which is
// safe on both versions. Pinning the fixtures to exact provider versions
// (conformance/emit-tf/*/validate/providers.tf) is the other half, and it is
// the half that decides *when* the cache goes cold: under a `~> 6.0` range it
// went cold on whatever day the aws provider shipped a release, which is how a
// lane that had been green for weeks turned red with no commit behind it.
// Neither half alone is enough. Without the prewarm, the first run after a pin
// bump races and fails, and actions/cache does not save on a failed job, so
// that red would be permanent.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { REPO_ROOT, loadCases } from "./cases.js";

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

/** One `required_providers` entry from a case's validate fixture. */
export interface PinnedProvider {
  /** The conformance case the fixture belongs to. */
  case: string;
  /** The registry address, e.g. `hashicorp/aws`. */
  source: string;
  /** The version constraint as written. Expected to be an exact version. */
  version: string;
}

// The fixtures are small and uniformly formatted by `tofu fmt`, so a regex
// beats pulling in an HCL parser for four files. It matches the whole
// `name = { source = "..." version = "..." }` shape rather than the two
// arguments separately, which keeps a source bound to its own version.
const REQUIRED_PROVIDER =
  /\w+\s*=\s*\{\s*source\s*=\s*"(?<source>[^"]+)"\s*version\s*=\s*"(?<version>[^"]+)"\s*\}/g;

/**
 * Every provider pin in the conformance cases' `validate/providers.tf`.
 *
 * Two tests read this: one that the pins are exact, and one that the emit-tf
 * cache key in CI names them. Neither needs a tofu binary, so both run in the
 * default suite and a fixture cannot drift back to a range unnoticed.
 */
export function pinnedProviders(): PinnedProvider[] {
  const pins: PinnedProvider[] = [];
  for (const testCase of loadCases()) {
    const providers = testCase.support["providers.tf"];
    if (providers === undefined) continue;
    for (const match of providers.matchAll(REQUIRED_PROVIDER)) {
      pins.push({
        case: testCase.name,
        source: match.groups?.source ?? "",
        version: match.groups?.version ?? "",
      });
    }
  }
  if (pins.length === 0) {
    throw new Error(
      "no required_providers entries found in conformance/emit-tf/*/validate/providers.tf",
    );
  }
  return pins;
}

/**
 * Downloads every provider the gated tests need into the shared plugin cache,
 * one `tofu init` at a time, before any test worker starts.
 *
 * Wired as the root vitest `globalSetup`, which runs once for the whole run
 * even across projects, so it serializes the one operation that is not safe to
 * run concurrently on OpenTofu 1.7.0. The header comment has the mechanism.
 * Once this returns, every init the tests run finds its provider already in the
 * cache and only reads, which is safe on both versions in the CI matrix.
 *
 * A no-op unless RUN_TOFU_VALIDATE=1, so the default suite pays nothing.
 */
export function prewarmTofuCache(): void {
  if (!TOFU_ENABLED) return;
  // Deduplicated by content: three of the four cases share one aws-only
  // fixture, and re-initializing an identical set would just be slower.
  const seen = new Set<string>();
  for (const testCase of loadCases()) {
    const providers = testCase.support["providers.tf"];
    if (providers === undefined || seen.has(providers)) continue;
    seen.add(providers);
    // Only the provider block. `init` needs nothing else to resolve and
    // download, and leaving the stub resources out keeps this independent of
    // whether a case is expected to validate clean.
    const dir = materializeFiles({ "providers.tf": providers });
    const run = tofu(["init", "-backend=false", "-input=false", "-no-color"], dir);
    if (run.status !== 0) {
      throw new Error(
        `tofu init failed while warming the provider cache from ${testCase.name}:\n${run.output}`,
      );
    }
  }
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
