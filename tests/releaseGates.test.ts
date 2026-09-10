/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// .github/workflows/release.yml reuses ci.yml as its gate set, so a release
// passes exactly the gates a pull request passes. That reuse has one sharp
// edge: "The `GITHUB_TOKEN` permissions passed from the caller workflow can be
// only downgraded (not elevated) by the called workflow"
// (https://docs.github.com/en/actions/reference/workflows-and-actions/reusable-workflows),
// and GitHub checks it statically. A job in ci.yml asking for a permission the
// release does not grant does not fail when that job runs, and does not fail on
// the pull request that added it. It fails the whole release run before any job
// starts, with "The workflow is requesting 'id-token: write', but is only
// allowed 'id-token: none'." Dispatch time is the worst moment to learn that,
// so this moves the failure to the pull request that would cause it.
//
// This is why the live sandbox job lives in .github/workflows/integration.yml
// rather than in ci.yml: it needs `id-token: write` to assume the AWS role, and
// a release must hold no such permission.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WORKFLOWS = join(ROOT, ".github", "workflows");
const CI = join(WORKFLOWS, "ci.yml");
const RELEASE = join(WORKFLOWS, "release.yml");
const DEPENDABOT = join(ROOT, ".github", "dependabot.yml");

/** GitHub's three access levels, weakest first. */
const LEVELS = ["none", "read", "write"] as const;
type Level = (typeof LEVELS)[number];

const rank = (level: Level): number => LEVELS.indexOf(level);

/**
 * Every `permissions:` block in a workflow, flattened to the strongest level
 * requested per scope.
 *
 * Deliberately not a YAML parse: `yaml` and `js-yaml` are only transitive
 * dependencies here, and the shape being read is narrow enough to scan. A
 * `permissions:` mapping is a line ending in `permissions:`, followed by more
 * deeply indented `<scope>: <level>` entries. The two other spellings GitHub
 * accepts, `permissions: {}` and `permissions: read-all`/`write-all`, are
 * rejected outright rather than guessed at, so this cannot quietly read a block
 * it does not understand as an empty one.
 */
function permissionsRequested(yaml: string, file: string): Map<string, Level> {
  const out = new Map<string, Level>();
  const lines = yaml.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const header = /^(?<indent>\s*)permissions:(?<rest>.*)$/.exec(line);
    if (!header?.groups) continue;
    if (header.groups.rest?.trim() !== "") {
      throw new Error(
        `${file}:${i + 1}: inline \`permissions:\` is not supported by this test. Write the block form so the levels can be read.`,
      );
    }
    const indent = (header.groups.indent ?? "").length;

    for (let j = i + 1; j < lines.length; j += 1) {
      const entry = lines[j] ?? "";
      if (entry.trim() === "" || entry.trim().startsWith("#")) continue;
      const entryIndent = entry.length - entry.trimStart().length;
      if (entryIndent <= indent) break;
      const parsed = /^\s*(?<scope>[a-z-]+):\s*(?<level>[a-z-]+)\s*$/.exec(entry);
      if (!parsed?.groups) {
        throw new Error(`${file}:${j + 1}: cannot read \`${entry.trim()}\` as a permission.`);
      }
      const scope = parsed.groups.scope ?? "";
      const level = parsed.groups.level ?? "";
      if (!LEVELS.includes(level as Level)) {
        throw new Error(
          `${file}:${j + 1}: \`${scope}: ${level}\` is not one of ${LEVELS.join(", ")}.`,
        );
      }
      const previous = out.get(scope);
      if (previous === undefined || rank(level as Level) > rank(previous)) {
        out.set(scope, level as Level);
      }
    }
  }

  return out;
}

/** The `permissions:` block of release.yml's `gates` job, which calls ci.yml. */
function gatesGrant(release: string): Map<string, Level> {
  const start = release.indexOf("\n  gates:\n");
  const end = release.indexOf("\n  publish:\n");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      "cannot locate the `gates` job in .github/workflows/release.yml: expected a `gates:` job followed by a `publish:` job",
    );
  }
  const job = release.slice(start, end);
  if (!job.includes("uses: ./.github/workflows/ci.yml")) {
    throw new Error("release.yml's `gates` job no longer calls ./.github/workflows/ci.yml");
  }
  return permissionsRequested(job, "release.yml (gates job)");
}

describe("the release gate set stays inside the permissions the release grants", () => {
  const ci = readFileSync(CI, "utf8");
  const release = readFileSync(RELEASE, "utf8");

  it("grants ci.yml something, so an empty parse cannot pass by accident", () => {
    expect([...gatesGrant(release)]).toEqual([["contents", "read"]]);
  });

  it("reads ci.yml's own permissions rather than finding none", () => {
    expect(permissionsRequested(ci, "ci.yml").size).toBeGreaterThan(0);
  });

  it("asks for no permission the caller does not grant", () => {
    const granted = gatesGrant(release);
    const requested = permissionsRequested(ci, "ci.yml");

    const over = [...requested].filter(([scope, level]) => {
      const ceiling = granted.get(scope) ?? "none";
      return rank(level) > rank(ceiling);
    });

    // Named so a failure says what to do rather than only what is wrong.
    expect(
      over.map(
        ([scope, level]) =>
          `ci.yml asks for \`${scope}: ${level}\` but release.yml's gates job grants \`${scope}: ${granted.get(scope) ?? "none"}\`. Move the job that needs it out of ci.yml, or raise the grant.`,
      ),
    ).toEqual([]);
  });

  it("keeps the live sandbox job out of the reusable gate set", () => {
    // The concrete instance of the rule above. A release must not depend on a
    // reachable AWS account, and this is what makes that structural.
    // `uses:`, not a bare mention: ci.yml's action-pinning comment still names
    // the action, and a comment cannot assume a role.
    expect(ci).not.toContain("uses: aws-actions/configure-aws-credentials");
    expect(readFileSync(join(ROOT, ".github", "workflows", "integration.yml"), "utf8")).toContain(
      "uses: aws-actions/configure-aws-credentials",
    );
  });
});

/**
 * Every `uses:` in a workflow, as `{ file, line, ref }`.
 *
 * Deliberately not a YAML parse, for the reason `permissionsRequested` above
 * gives. A `uses:` is a scalar: either a list item (`- uses: x`) or a key on a
 * step that names itself first (`uses: x` under a `- name:`). A trailing `#`
 * comment is stripped, since the version comment this rule requires is exactly
 * that. Anything else on the line is reported rather than skipped, so this
 * cannot quietly read a shape it does not understand as absent.
 */
function usesRefs(yaml: string, file: string): { file: string; line: number; ref: string }[] {
  const out: { file: string; line: number; ref: string }[] = [];
  for (const [i, raw] of yaml.split("\n").entries()) {
    const line = raw.trim();
    if (line.startsWith("#")) continue;
    const match = /^(?:-\s+)?uses:\s*(?<ref>\S+)(?<rest>.*)$/.exec(line);
    if (!match?.groups) continue;
    const rest = (match.groups.rest ?? "").trim();
    if (rest !== "" && !rest.startsWith("#")) {
      throw new Error(`${file}:${String(i + 1)}: cannot read \`${line}\` as a \`uses:\`.`);
    }
    out.push({ file, line: i + 1, ref: match.groups.ref ?? "" });
  }
  return out;
}

describe("every third-party action is pinned to a commit", () => {
  // A major tag is mutable and lives in a repository this project does not
  // control. release.yml holds npm publish rights and integration.yml assumes
  // an AWS role, so `actions/checkout@v7` in either of them is a standing
  // request for whatever that account decides the tag means on the day of the
  // run. GitHub: "Pinning an action to a full-length commit SHA is currently
  // the only way to use an action as an immutable release."
  // https://docs.github.com/en/actions/reference/security/secure-use
  //
  // Enforced by reading until now, which is how the four workflows came to hold
  // eight floating tags at once.
  const files = readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
  const sources = new Map(files.map((name) => [name, readFileSync(join(WORKFLOWS, name), "utf8")]));
  const refs = files.flatMap((name) => usesRefs(sources.get(name) ?? "", name));

  it("finds the workflows and their `uses:` lines, so a silent miss cannot pass", () => {
    // A scanner that matched nothing would report a clean repository forever.
    expect(files).toContain("release.yml");
    expect(files).toContain("ci.yml");
    expect(refs.filter((r) => r.file === "release.yml").length).toBeGreaterThan(0);
    expect(refs.length).toBeGreaterThanOrEqual(files.length);
  });

  it("names a 40-character SHA everywhere but a reference into this repository", () => {
    const floating = refs
      // `./.github/...` is this repository's own tree at the commit already
      // checked out, so there is nothing mutable to pin.
      .filter((r) => !r.ref.startsWith("./"))
      .filter((r) => !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(r.ref));

    expect(
      floating.map(
        (r) =>
          `${r.file}:${String(r.line)}: \`uses: ${r.ref}\` names a mutable ref. Pin it to a full commit SHA with the tag in a trailing comment, as \`owner/repo@<40 hex> # v1.2.3\`. Resolve the SHA with \`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha\`.`,
      ),
    ).toEqual([]);
  });

  it("keeps the human-readable version beside each SHA", () => {
    // A bare SHA is unreadable, and a reviewer who cannot see which release it
    // names cannot tell an update from a downgrade. The comment is what makes a
    // Dependabot diff legible, and ci.yml's node24 note depends on it.
    const uncommented = refs
      .filter((r) => /@[0-9a-f]{40}$/.test(r.ref))
      .filter((r) => {
        const line = (sources.get(r.file) ?? "").split("\n")[r.line - 1] ?? "";
        return !/@[0-9a-f]{40}\s+#\s*v\d\S*\s*$/.test(line);
      });

    expect(
      uncommented.map(
        (r) =>
          `${r.file}:${String(r.line)}: \`${r.ref}\` has no \`# v<version>\` comment beside it.`,
      ),
    ).toEqual([]);
  });

  it("has Dependabot keeping the pins current, since a pin does not update itself", () => {
    // Pinning trades the patch releases a floating tag delivered on its own for
    // immutability. Without this the pins rot silently, which is worse than the
    // tags were.
    const dependabot = readFileSync(DEPENDABOT, "utf8");
    expect(dependabot).toContain("package-ecosystem: github-actions");
    expect(dependabot).toMatch(/^\s*interval:\s*\w+/m);
  });
});

/** The non-blocking float lane. Its own header records why it must stay that way. */
const DRIFT = "provider-drift.yml";

/**
 * Every workflow a release run actually executes: release.yml, plus whatever it
 * calls, transitively.
 *
 * Reachability rather than a text search, for the same reason
 * "keeps the live sandbox job out of the reusable gate set" above reads `uses:`
 * rather than a bare mention: a comment that names a workflow does not run it,
 * and a test that cannot tell the two apart forces every future comment to
 * dance around the name. `./.github/actions/...` refs are step actions rather
 * than workflows and do not match.
 */
function releasePathWorkflows(): Set<string> {
  const seen = new Set<string>(["release.yml"]);
  const queue = ["release.yml"];
  while (queue.length > 0) {
    const name = queue.pop() ?? "";
    for (const { ref } of usesRefs(readFileSync(join(WORKFLOWS, name), "utf8"), name)) {
      const called = /^\.\/\.github\/workflows\/(?<file>[\w.-]+\.ya?ml)$/.exec(ref)?.groups?.file;
      if (called === undefined || seen.has(called)) continue;
      seen.add(called);
      queue.push(called);
    }
  }
  return seen;
}

/** The top-level keys of a workflow's block-form `on:`. */
function triggers(yaml: string, file: string): string[] {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (start === -1) {
    throw new Error(`${file}: expected a block-form \`on:\` whose triggers can be read.`);
  }
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!line.startsWith("  ")) break;
    const key = /^ {2}(?<key>[a-z_]+):/.exec(line)?.groups?.key;
    if (key !== undefined) out.push(key);
  }
  return out;
}

// .github/workflows/provider-drift.yml resolves the newest aws and awscc
// providers on a schedule and validates the emitter's output against them. It
// is deliberately allowed to be red: what it reports is a third party's release
// decision, and the answer is a considered pin bump rather than a blocked
// merge. A job like that on the release path would let an upstream publish hold
// a release hostage, which is the dependency
// conformance/emit-tf/*/validate/providers.tf was pinned to remove.
describe("the provider drift canary cannot gate a release", () => {
  const reachable = releasePathWorkflows();

  it("finds the gate set from release.yml, so an empty scan cannot pass", () => {
    // A scanner that followed nothing would report every workflow absent from
    // the release path forever, this one included.
    expect([...reachable].sort()).toEqual(["ci.yml", "release.yml"]);
  });

  it("is not reachable from release.yml", () => {
    expect([...reachable]).not.toContain(DRIFT);
  });

  it("is not in the pull request gate set either", () => {
    // ci.yml is what a required check is pointed at, so a canary called from
    // there would block merges as surely as one called from release.yml.
    expect(readFileSync(CI, "utf8")).not.toContain(`./.github/workflows/${DRIFT}`);
  });

  it("has no trigger that could make it a gate", () => {
    // Reachability is a fact about today's files. This is a fact about shape,
    // and it is the stronger half: with no `workflow_call` the canary cannot be
    // called as a gate at all, and with no `push` or `pull_request` it never
    // produces a check run on a pull request for a branch protection rule to be
    // pointed at. Branch protection lives on the server and cannot be asserted
    // from a checkout, so this is the part that can be.
    expect(triggers(readFileSync(join(WORKFLOWS, DRIFT), "utf8"), DRIFT).sort()).toEqual([
      "schedule",
      "workflow_dispatch",
    ]);
  });

  it("reads triggers rather than finding none, so the check above means something", () => {
    // The same scanner against a workflow whose triggers are known.
    expect(triggers(readFileSync(CI, "utf8"), "ci.yml").sort()).toEqual([
      "pull_request",
      "push",
      "workflow_call",
      "workflow_dispatch",
    ]);
  });
});
