/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The `tofu` harness, shared by every test that runs the real tool.
//
// It lives beside the conformance case loader because it is used from three
// test files now: src/validate.test.ts checks what the emitter produces,
// packages/studio/tests/exportTofu.test.ts checks that the studio's Terraform
// export button produces something that still validates, and
// tests/promoteAcrossEnvironments.test.ts validates each emitted tree against
// the example environment's own configuration. One harness, one gate, one
// provider cache; a second copy would be a second thing to keep in step and a
// second cold download.
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
// three gated test files run in parallel, so a cold cache is exactly that race.
// (This said "two" until 2026-09-10, and the miscount was not harmless: the
// third file was also the one site the pinning below did not reach.)
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
//
// The cost of that pin is that the gated lane stopped noticing the day a newer
// aws or awscc provider stops accepting the HCL this emitter writes: it now
// only ever asks for 6.64.0. TOFU_PROVIDER_MODE below is the seam that buys
// that back, and .github/workflows/provider-drift.yml is the job that uses it.
//
// WHAT THE SEAM COVERS, and why it is a registry rather than a helper anyone
// may remember to call. Every `providers.tf` a gated test can init is named by
// providerSites() below; prewarmTofuCache() downloads exactly that set, and
// tofu() refuses an `init` whose workspace asks for anything else. Both halves
// read one function, so "add a gated test, forget the seam" is a failure at the
// first init rather than a lane that quietly depends on a third party's release
// day again. It did happen: fc369c5 pinned the four conformance fixtures and
// missed tests/promoteAcrossEnvironments.test.ts, whose two example
// environments kept resolving `~> 6.0` cold in the middle of the parallel
// suite.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EMITTED_PROVIDER_CONSTRAINTS } from "../emit.js";
import { type EmitCase, REPO_ROOT, loadCases } from "./cases.js";

/** True when the gated tofu tests should run. */
export const TOFU_ENABLED = process.env.RUN_TOFU_VALIDATE === "1";

/**
 * How a run constrains the providers the validate fixtures ask for.
 *
 * `pinned` is what the committed fixtures say and what every blocking lane
 * runs. `float` widens each exact pin to its major before the files reach a
 * temp directory, so the run resolves whatever is newest today.
 */
export type ProviderMode = "pinned" | "float";

/** This run's mode, from TOFU_PROVIDER_MODE. Unset means `pinned`. */
export const PROVIDER_MODE = readProviderMode();

function readProviderMode(): ProviderMode {
  const raw = process.env.TOFU_PROVIDER_MODE ?? "pinned";
  if (raw !== "pinned" && raw !== "float") {
    // Loud rather than defaulting: a typo that silently ran the pinned suite
    // would make the drift canary green for the wrong reason forever.
    throw new Error(`TOFU_PROVIDER_MODE must be "pinned" or "float", not ${JSON.stringify(raw)}.`);
  }
  return raw;
}

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
  // `init` is the only command that resolves and downloads, so it is the only
  // one that can go outside what the prewarm covered. assertProviderSetCovered
  // is the guard; its doc comment has the reasoning.
  if (args[0] === "init") assertProviderSetCovered(cwd);
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

// The files this reads are small and uniformly formatted by `tofu fmt`, so a
// regex beats pulling in an HCL parser for six of them. It matches the whole
// `name = { source = "..." version = "..." }` shape rather than the two
// arguments separately, which keeps a source bound to its own version.
const REQUIRED_PROVIDER =
  /\w+\s*=\s*\{\s*source\s*=\s*"(?<source>[^"]+)"\s*version\s*=\s*"(?<version>[^"]+)"\s*\}/g;

/** One `required_providers` entry: a registry address and its constraint. */
export interface ProviderRequirement {
  /** The registry address, e.g. `hashicorp/aws`. */
  source: string;
  /** The version constraint exactly as the file writes it. */
  version: string;
}

/** A `required_providers` block found in some HCL, with where it sits. */
interface RequiredProvidersBlock {
  /** Index of its opening brace. */
  start: number;
  /** Index one past its closing brace. */
  end: number;
  text: string;
}

/**
 * Every `required_providers { ... }` block in `text`, brace-matched.
 *
 * Scoped rather than scanning the whole file for `version =`, because a `.tf`
 * that is not a providers file can carry an argument of that name and rewriting
 * it would corrupt the configuration under test. The brace counter is honest
 * about what it handles: these blocks contain quoted versions and nothing that
 * puts a brace inside a string.
 */
function requiredProvidersBlocks(text: string): RequiredProvidersBlock[] {
  const blocks: RequiredProvidersBlock[] = [];
  const marker = /required_providers\s*\{/g;
  let found: RegExpExecArray | null = marker.exec(text);
  while (found !== null) {
    const open = found.index + found[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) throw new Error("unterminated `required_providers` block");
    blocks.push({ start: open, end, text: text.slice(open, end) });
    marker.lastIndex = end;
    found = marker.exec(text);
  }
  return blocks;
}

/**
 * What `text` requires, sorted, as `source constraint` pairs.
 *
 * Loud when the regex above matches fewer entries than the block has `source`
 * arguments. A silently unmatched entry would be a provider the prewarm never
 * fetched and the coverage guard never noticed, which is the whole class of
 * defect this file is trying to close.
 */
export function providerRequirements(text: string): ProviderRequirement[] {
  const requirements: ProviderRequirement[] = [];
  for (const block of requiredProvidersBlocks(text)) {
    const entries = [...block.text.matchAll(REQUIRED_PROVIDER)];
    const sources = [...block.text.matchAll(/\bsource\s*=/g)].length;
    if (entries.length !== sources) {
      throw new Error(
        `a required_providers block has ${sources} source arguments but ${entries.length} parse as ` +
          `\`name = { source = "..." version = "..." }\`; the block is:\n${block.text}`,
      );
    }
    for (const entry of entries) {
      requirements.push({
        source: entry.groups?.source ?? "",
        version: entry.groups?.version ?? "",
      });
    }
  }
  return requirements.sort((a, b) => (requirementKey(a) < requirementKey(b) ? -1 : 1));
}

const requirementKey = (r: ProviderRequirement): string => `${r.source} ${r.version}`;

/** One string standing for a whole provider set, order-independent. */
export function providerSetKey(requirements: ProviderRequirement[]): string {
  return requirements.map(requirementKey).sort().join(", ");
}

/** Rewrites every constraint inside `text`'s `required_providers` blocks. */
function rewriteRequiredProviders(
  text: string,
  next: (source: string, version: string) => string,
): string {
  let out = "";
  let cursor = 0;
  for (const block of requiredProvidersBlocks(text)) {
    out += text.slice(cursor, block.start);
    out += block.text.replace(REQUIRED_PROVIDER, (entry) => {
      const source = /\bsource\s*=\s*"([^"]+)"/.exec(entry)?.[1] ?? "";
      const version = /\bversion\s*=\s*"([^"]+)"/.exec(entry)?.[1] ?? "";
      const replacement = next(source, version);
      return entry.replace(
        /(\bversion\s*=\s*")([^"]+)(")/,
        (_all, open: string, _old: string, close: string) => `${open}${replacement}${close}`,
      );
    });
    cursor = block.end;
  }
  return out + text.slice(cursor);
}

/** An exact `x.y.z` pin. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/** Newest last, on `x.y.z` pins. */
function compareExactVersions(a: string, b: string): number {
  const parts = (v: string): number[] => v.split(".").map((n) => Number.parseInt(n, 10));
  const [left, right] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Where a `providers.tf` came from, and therefore whose promise it keeps.
 *
 * `fixture` is a TEST-ONLY file: conformance/emit-tf/<case>/validate/providers.tf
 * exists to give `tofu validate` something to resolve against, and no user ever
 * reads it. Its user-facing counterpart is the `versions.tf.example` the
 * emitter writes beside the configuration, which asks for `>= 5.0` and
 * `>= 1.74`.
 *
 * `example` is the opposite: examples/*\/terraform/<env>/providers.tf is
 * published, read, and copied, and what it says is the advice this repository
 * gives.
 */
export type ProviderSurface = "fixture" | "example";

/** A committed `providers.tf` the harness knows how to run. */
export interface ProviderSite {
  /** Repo-relative path, so a failure names a file rather than a temp dir. */
  path: string;
  surface: ProviderSurface;
  /** The text as committed, before the mode. */
  committed: string;
}

const EXAMPLES_ROOT = new URL("examples/", REPO_ROOT);

const subdirectories = (dir: URL): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];

/**
 * Every committed `providers.tf` a gated test can init against.
 *
 * The single list. prewarmTofuCache() downloads exactly these, and tofu()
 * refuses an `init` asking for anything else, so the two cannot disagree about
 * what is covered. Discovered rather than enumerated: a new conformance case or
 * a new example environment is covered by existing in the tree, which is the
 * only version of this that survives someone adding a test in a hurry.
 */
export function providerSites(): ProviderSite[] {
  const sites: ProviderSite[] = [];
  for (const testCase of loadCases()) {
    const providers = testCase.support["providers.tf"];
    if (providers === undefined) continue;
    sites.push({
      path: `conformance/emit-tf/${testCase.name}/validate/providers.tf`,
      surface: "fixture",
      committed: providers,
    });
  }
  for (const example of subdirectories(EXAMPLES_ROOT)) {
    const environments = new URL(`${example}/terraform/`, EXAMPLES_ROOT);
    for (const environment of subdirectories(environments)) {
      const file = new URL(`${environment}/providers.tf`, environments);
      if (!existsSync(file)) continue;
      sites.push({
        path: `examples/${example}/terraform/${environment}/providers.tf`,
        surface: "example",
        committed: readFileSync(file, "utf8"),
      });
    }
  }
  if (sites.length === 0) {
    throw new Error("no committed providers.tf found under conformance/emit-tf or examples/");
  }
  return sites;
}

/** One `required_providers` entry from a case's validate fixture. */
export interface PinnedProvider extends ProviderRequirement {
  /** The conformance case the fixture belongs to. */
  case: string;
}

/**
 * Every provider pin in the conformance cases' `validate/providers.tf`.
 *
 * Two tests read this: one that the pins are exact, and one that the emit-tf
 * cache key in CI names them. Neither needs a tofu binary, so both run in the
 * default suite and a fixture cannot drift back to a range unnoticed.
 */
export function pinnedProviders(): PinnedProvider[] {
  const pins: PinnedProvider[] = [];
  for (const site of providerSites()) {
    if (site.surface !== "fixture") continue;
    const name = site.path.split("/")[2] ?? "";
    for (const requirement of providerRequirements(site.committed)) {
      pins.push({ case: name, ...requirement });
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
 * The exact version this repository has adopted for `source`.
 *
 * Read off the conformance pins, so the pinned lane has one place to bump
 * rather than one per surface. Newest wins when the fixtures disagree, which
 * they do only mid-bump, with one case moved and the rest not: the newer
 * version is the one being adopted, and picking it deterministically beats
 * throwing in a state a contributor reaches on the way to a green commit.
 */
function adoptedPin(source: string): string {
  // EXACT_VERSION rather than every pin for the source: a fixture that drifted
  // back to a range has no exact version to offer, and quietly sorting `~> 6.0`
  // among real pins would put a range back into the lane this exists to keep
  // deterministic. validate.test.ts fails that fixture separately and loudly.
  const versions = pinnedProviders()
    .filter((pin) => pin.source === source && EXACT_VERSION.test(pin.version))
    .map((pin) => pin.version)
    .sort(compareExactVersions);
  const newest = versions.at(-1);
  if (newest === undefined) {
    throw new Error(
      `no conformance/emit-tf fixture pins ${source} to an exact version, so the pinned lane has ` +
        `nothing to narrow it to. Add a fixture that pins it, or the lane goes back to depending ` +
        `on when a third party published.`,
    );
  }
  return newest;
}

/** The range every emitted `versions.tf.example` gives users for `source`. */
function emittedConstraint(source: string): string {
  const constraint = EMITTED_PROVIDER_CONSTRAINTS[source];
  if (constraint === undefined) {
    throw new Error(
      `the emitter never writes a constraint for ${source}, so float mode has no user-facing ` +
        `range to resolve it under. EMITTED_PROVIDER_CONSTRAINTS in packages/tf/src/emit.ts is ` +
        `the list.`,
    );
  }
  return constraint;
}

/**
 * A `providers.tf` as this run should use it.
 *
 * The seam the drift canary runs through, and it works on the TEXT on its way
 * to a temp directory rather than on the file in the working tree. That
 * placement is the whole point: `pinnedProviders()` above reads the committed
 * fixtures, so the two ungated guards in validate.test.ts still see `6.64.0`
 * and stay exactly as strict in either mode. A seam that rewrote the fixtures
 * in place would make the canary fail its own pin guard before it ever reached
 * tofu, and relaxing that guard to tolerate a range would throw away the
 * protection it exists for.
 *
 * `pinned` narrows every surface to the exact versions this repository has
 * adopted, which is what a blocking lane needs: one version per provider, known
 * before the run starts, unaffected by anything published this morning. A
 * fixture already says that; an example says a range, and is narrowed here
 * rather than on disk.
 *
 * `float` asks the question the surface's own user-facing artifact asks, and
 * the two surfaces do not ask the same one:
 *
 *   - A fixture's counterpart is the emitted `versions.tf.example`, so it
 *     resolves under EMITTED_PROVIDER_CONSTRAINTS. Those are open-ended
 *     (`>= 5.0`), so this crosses a major the day one ships, which is the
 *     release most likely to stop accepting the emitted HCL and exactly what a
 *     user with no lock file would get. Widening the pin to its own major
 *     instead, as this did until 2026-09-10, capped the canary at 6.x and made
 *     it blind to the only release worth waking up for.
 *   - An example IS the user-facing file. It resolves under its own committed
 *     range, and it keeps that range on disk: an exact pin is bad advice in an
 *     example and rots the moment nobody bumps it.
 */
export function providersForMode(
  providers: string,
  surface: ProviderSurface,
  mode: ProviderMode = PROVIDER_MODE,
): string {
  return rewriteRequiredProviders(providers, (source, version) => {
    if (mode === "pinned") return surface === "fixture" ? version : adoptedPin(source);
    return surface === "fixture" ? emittedConstraint(source) : version;
  });
}

/** A case's validate support files, with `providers.tf` put through the mode. */
export function supportFor(testCase: EmitCase): Record<string, string> {
  const providers = testCase.support["providers.tf"];
  if (providers === undefined) return testCase.support;
  return { ...testCase.support, "providers.tf": providersForMode(providers, "fixture") };
}

/** Every provider set this run's prewarm covers, as providerSetKey strings. */
export function coveredProviderSets(mode: ProviderMode = PROVIDER_MODE): Set<string> {
  const keys = new Set<string>();
  for (const site of providerSites()) {
    const key = providerSetKey(
      providerRequirements(providersForMode(site.committed, site.surface, mode)),
    );
    if (key !== "") keys.add(key);
  }
  return keys;
}

/**
 * What a workspace directory requires, the way `tofu init` will read it.
 *
 * Top-level `*.tf` only, which is what the tool loads as the root module;
 * `versions.tf.example` is deliberately not a `.tf` and is deliberately not
 * read here either.
 */
function workspaceRequirements(dir: string): ProviderRequirement[] {
  const requirements: ProviderRequirement[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    if (!entry.isFile() || !entry.name.endsWith(".tf")) continue;
    requirements.push(...providerRequirements(readFileSync(join(dir, entry.name), "utf8")));
  }
  return requirements;
}

/**
 * Refuses an `init` whose workspace asks for providers the prewarm did not get.
 *
 * The guard that keeps this defect from recurring. prewarmTofuCache() and this
 * both derive their answer from providerSites(), so a gated test that builds a
 * workspace some other way fails at its first init, naming the set it asked
 * for, instead of quietly downloading a provider in the middle of the parallel
 * suite. That download is not a theoretical cost: it is what broke the 1.7.0
 * lane on 2026-09-10, and the same miss reproduced on 1.12.6 with the four
 * conformance fixtures moved to 6.63.0 and the two example environments left
 * floating, where every fixture site locked 6.63.0 and both example sites
 * locked 6.64.0.
 *
 * A workspace with no `required_providers` at all is fine and common: the
 * template-rendering tests init directories with no providers, and there is
 * nothing to download or race over.
 */
function assertProviderSetCovered(dir: string): void {
  const requirements = workspaceRequirements(dir);
  if (requirements.length === 0) return;

  const key = providerSetKey(requirements);
  const covered = coveredProviderSets();
  if (covered.has(key)) return;

  throw new Error(
    `tofu init in ${dir} asks for a provider set the harness does not cover:\n` +
      `  wanted:  ${key}\n` +
      `  covered: ${[...covered].sort().join("\n           ")}\n` +
      `Every gated init has to go through the TOFU_PROVIDER_MODE seam, so that prewarmTofuCache() ` +
      `has already fetched what it resolves and the blocking lane does not depend on when a third ` +
      `party published. Put the workspace's providers.tf through providersForMode(text, surface), ` +
      `and make sure providerSites() names the committed file it came from.`,
  );
}

/** One entry of a `.terraform.lock.hcl`, which is what `init` actually chose. */
export interface ResolvedProvider {
  /** The registry address without its host, e.g. `hashicorp/aws`. */
  source: string;
  /** The version `init` selected. */
  version: string;
  /** The constraint it selected it under, `""` when the lock records none. */
  constraints: string;
}

const LOCKED_PROVIDER =
  /provider\s+"(?<address>[^"]+)"\s*\{\s*version\s*=\s*"(?<version>[^"]+)"(?:\s*constraints\s*=\s*"(?<constraints>[^"]+)")?/g;

/**
 * What `tofu init` resolved in `dir`, read from the lock file it wrote.
 *
 * The lock file is the only honest answer to "which version is this run
 * actually testing": in `float` mode the constraint in the configuration names
 * a range, and the answer is decided by the registry on the day of the run.
 */
/** Identity of one resolution: which source, at which version, under what. */
const resolvedKey = (p: ResolvedProvider): string => `${p.source}@${p.version}@${p.constraints}`;

/**
 * One row per distinct resolution, sorted, for the report.
 *
 * The key carries the constraint as well as the source and the version, and
 * both halves of that were defects found by running the thing rather than
 * reading it. Keyed by source alone, the last init to finish overwrote the
 * others and the report named one version as though it were the only one:
 * reachable mid-bump, with one fixture at 6.63.0 and the rest at 6.64.0, and
 * confirmed in that state. Keyed by source and version, float mode collapsed
 * two rows the day the two constraints agreed, which is float mode's normal
 * state now rather than an edge: the fixtures ask the emitter's open-ended
 * range and the examples ask their own `~> 6.0`, and today both land on
 * 6.64.0. The report then named `~> 6.0` and never mentioned the range whose
 * answer can move to a new major, which is the whole reason the job exists.
 * Confirmed on the float run of 2026-09-10 before this key was widened.
 *
 * The comparator is total rather than one that returns 1 for equal elements.
 */
export function distinctResolutions(providers: ResolvedProvider[]): ResolvedProvider[] {
  const unique = new Map<string, ResolvedProvider>();
  for (const provider of providers) unique.set(resolvedKey(provider), provider);
  return [...unique.values()].sort((a, b) => {
    const [left, right] = [resolvedKey(a), resolvedKey(b)];
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export function resolvedProviders(dir: string): ResolvedProvider[] {
  const lock = join(dir, ".terraform.lock.hcl");
  if (!existsSync(lock)) return [];
  return [...readFileSync(lock, "utf8").matchAll(LOCKED_PROVIDER)].map((match) => ({
    source: (match.groups?.address ?? "").split("/").slice(-2).join("/"),
    version: match.groups?.version ?? "",
    constraints: match.groups?.constraints ?? "",
  }));
}

/**
 * Says which mode the run used and which versions it resolved.
 *
 * A drift failure that does not name the version costs a re-run to diagnose,
 * and by then the registry may have moved. Always to stdout, so it is in the
 * log; also to JSON when TOFU_RESOLVED_REPORT names a path, which is how
 * .github/workflows/provider-drift.yml builds its step summary.
 */
function reportResolvedProviders(providers: ResolvedProvider[]): void {
  const lines = [
    `[tofu] provider mode: ${PROVIDER_MODE}`,
    ...providers.map(
      (p) =>
        `[tofu] resolved ${p.source} ${p.version} (constraint ${p.constraints === "" ? "none" : p.constraints})`,
    ),
  ];
  process.stdout.write(`${lines.join("\n")}\n`);

  const target = process.env.TOFU_RESOLVED_REPORT;
  if (target === undefined || target === "") return;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify({ mode: PROVIDER_MODE, providers }, null, 2)}\n`, "utf8");
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
 * It is also where the run says what it resolved, because this is the first
 * and only place a version is chosen sequentially, with one constraint per
 * init and nothing else in the log.
 *
 * A no-op unless RUN_TOFU_VALIDATE=1, so the default suite pays nothing.
 */
export function prewarmTofuCache(): void {
  if (!TOFU_ENABLED) return;
  // Every site, not just the conformance cases. The example environments in
  // examples/*/terraform/* are init'd by tests/promoteAcrossEnvironments.test.ts
  // and went uncovered here until 2026-09-10, which left two cold downloads
  // running inside the parallel suite.
  //
  // Deduplicated by provider set rather than by file text: three of the four
  // conformance cases share one aws-only requirement, in pinned mode the
  // example environments join them, and re-initializing an identical set would
  // just be slower. Keyed on what this run will actually resolve, so the dedup
  // follows the mode; in float mode the fixtures ask `>= 5.0` and the examples
  // ask `~> 6.0`, which are two sets and are fetched as two.
  const seen = new Set<string>();
  const resolved: ResolvedProvider[] = [];
  for (const site of providerSites()) {
    const providers = providersForMode(site.committed, site.surface);
    const key = providerSetKey(providerRequirements(providers));
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    // Only the provider block. `init` needs nothing else to resolve and
    // download, and leaving the stub resources out keeps this independent of
    // whether a case is expected to validate clean.
    const dir = materializeFiles({ "providers.tf": providers });
    const run = tofu(["init", "-backend=false", "-input=false", "-no-color"], dir);
    if (run.status !== 0) {
      throw new Error(
        `tofu init failed while warming the provider cache from ${site.path}:\n${run.output}`,
      );
    }
    resolved.push(...resolvedProviders(dir));
  }
  reportResolvedProviders(distinctResolutions(resolved));
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
 * .github/workflows/provider-drift.yml, the non-blocking float lane.
 *
 * packages/tf/src/validate.test.ts holds its shape in the default suite: the
 * design that makes it worth having (float mode, no provider cache, and not on
 * the version with the cold-init race) is not something to rediscover from a
 * red Monday morning.
 */
export function driftCanaryWorkflow(): string {
  return readFileSync(new URL(".github/workflows/provider-drift.yml", REPO_ROOT), "utf8");
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
