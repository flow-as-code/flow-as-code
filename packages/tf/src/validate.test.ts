/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The emitted configuration, checked by the real tool.
//
// These tests run a `tofu` binary through the shared harness in
// ./__fixtures__/tofu.ts, which also carries the RUN_TOFU_VALIDATE gate and the
// provider cache; packages/studio/tests/exportTofu.test.ts runs the
// studio's Terraform export through the same harness.

import { describe, expect, it } from "vitest";
import { type EmitCase, loadCases } from "./__fixtures__/cases.js";
import { renderHclTemplate } from "./__fixtures__/hcl-template.js";
import {
  PROVIDER_MODE,
  TOFU_ENABLED,
  coveredProviderSets,
  distinctResolutions,
  driftCanaryWorkflow,
  emitTfCiJob,
  emitTfCiTofuVersions,
  materializeFiles as materialize,
  pinnedProviders,
  providerRequirements,
  providerSetKey,
  providerSites,
  providersForMode,
  supportFor,
  tofu,
  tofuEvaluateString,
} from "./__fixtures__/tofu.js";
import { CORE_VERSION_FLOOR, EMITTED_PROVIDER_CONSTRAINTS, emitTf } from "./emit.js";

const enabled = TOFU_ENABLED;
const cases = loadCases();

/** Emitted output plus the case's test-only providers and stub resources. */
function workspaceFor(testCase: EmitCase): string {
  return materialize({ ...emitTf(testCase.docs, testCase.options).files, ...supportFor(testCase) });
}

describe("the tofu gate", () => {
  // Gating is a deliberate tradeoff, not a way to stop running these; if the CI
  // job loses the variable, this fails in the default suite.
  it("is set in the emit-tf job in CI", () => {
    const job = emitTfCiJob();
    expect(job).toContain('RUN_TOFU_VALIDATE: "1"');
    // Was `toContain("opentofu/setup-opentofu@v2")` until the workflows moved
    // to commit pins, which is a spelling this assertion had baked in rather
    // than a fact about the gate. What it is really for is that the job still
    // installs a real OpenTofu, so it asks for that and, since the ref is now
    // an opaque SHA, that the ref is pinned at all. Strictly more than the
    // literal it replaces; the version it resolves to is the trailing comment
    // Dependabot maintains, and tests/releaseGates.test.ts holds the rule
    // repository-wide.
    expect(job).toMatch(/uses:\s+opentofu\/setup-opentofu@[0-9a-f]{40}\s+#\s*v\d/);
    expect(job).toContain("--project @flow-as-code/tf");
  });

  // The action's `tofu_wrapper` still defaults to true at v2, which is the
  // major the pin above resolves to, so this is not a setting that can be
  // dropped as obsolete. With it on, `tofu` on PATH is a node script that
  // reports exit code 1 for every non-zero exit, and the assertions in this
  // file read `status` to tell a validation failure from a crash. The harness
  // in ./__fixtures__/tofu.ts records the rest.
  it("runs the real tofu binary rather than the action's wrapper", () => {
    expect(emitTfCiJob()).toContain("tofu_wrapper: false");
  });

  // The floor went untested for as long as it existed: the job pinned 1.7.0 but
  // the gated tests had never run on a real runner, so nothing would have
  // noticed either end of the supported range breaking. Bind the two together.
  it("runs the gate against the emitter's declared floor and a newer release", () => {
    const versions = emitTfCiTofuVersions();
    expect(versions).toContain(CORE_VERSION_FLOOR);
    expect(versions.length).toBeGreaterThan(1);
  });

  // A range here makes the lane depend on when a third party published rather
  // than on anything in this repository, which is how it went red on
  // 2026-09-10 with no commit behind it. These fixtures are test detail, not a
  // promise to users; the promise is the range in versions.tf.example, which
  // this deliberately does not touch.
  it("pins each validate fixture's providers to an exact version", () => {
    for (const pin of pinnedProviders()) {
      expect(pin.version, `${pin.case} ${pin.source}`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  // The cache key has to name what the cache can contain. While it said
  // `aws6`, a bumped pin would restore an entry that predated it and force a
  // cold download in the middle of the parallel suite, which is the shape of
  // the original failure.
  it("keys the CI provider cache on the versions the fixtures pin", () => {
    const job = emitTfCiJob();
    // `.+` rather than `\S+`: the key interpolates `${{ ... }}` expressions,
    // which contain spaces.
    const key = /^\s*key:\s*(?<key>.+?)\s*$/m.exec(job)?.groups?.key;
    expect(key, "the emit-tf job has no cache `key:`").toBeDefined();
    for (const pin of pinnedProviders()) {
      // e.g. `hashicorp/aws` at 6.64.0 has to appear as `aws6.64.0`.
      const short = pin.source.split("/").at(-1) ?? "";
      expect(key).toContain(`${short}${pin.version}`);
    }
  });
});

// The pins above bought a lane that does not depend on a third party's release
// day. What they cost is the day a newer provider stops accepting the HCL this
// emitter writes: the gated lane only ever asks for 6.64.0 now.
// .github/workflows/provider-drift.yml buys that back on a schedule, and these
// hold the two properties that make it worth having rather than worth muting.
describe("the provider drift canary", () => {
  const sites = providerSites();
  const fixtureSites = sites.filter((site) => site.surface === "fixture");
  const exampleSites = sites.filter((site) => site.surface === "example");
  const major = (version: string): number => Number.parseInt(version.split(".")[0] ?? "", 10);

  // A filter that matched nothing would make the assertions below vacuous, and
  // both halves of the design need a surface of each kind to say anything.
  it("knows about both kinds of surface", () => {
    expect(fixtureSites.map((s) => s.path)).toEqual(
      cases
        .filter((c) => c.support["providers.tf"] !== undefined)
        .map((c) => `conformance/emit-tf/${c.name}/validate/providers.tf`),
    );
    expect(exampleSites.length).toBeGreaterThan(0);
    for (const site of exampleSites) {
      expect(site.path).toMatch(/^examples\/[^/]+\/terraform\/[^/]+\/providers\.tf$/);
    }
  });

  // The distinction the whole design rests on. "What a user actually gets" is
  // not one constraint: it differs by surface, so float mode asks each surface
  // the question its own user-facing artifact asks.
  it("floats a test fixture under the range the emitter publishes", () => {
    for (const testCase of cases.filter((c) => c.support["providers.tf"] !== undefined)) {
      const site = { path: testCase.name, committed: testCase.support["providers.tf"] ?? "" };
      const floated = providersForMode(site.committed, "fixture", "float");

      expect(floated, site.path).not.toBe(site.committed);
      // Not merely "not the pin": no exact version at all, and specifically the
      // emitter's own range for each source. Widening the pin to its own major
      // (`6.64.0` to `~> 6.0`) also passes the first of these and is exactly
      // the blindness being fixed, so the second is the one that matters.
      expect(floated, site.path).not.toMatch(/\bversion\s*=\s*"\d+\.\d+\.\d+"/);
      for (const requirement of providerRequirements(floated)) {
        expect(requirement.version, `${site.path} ${requirement.source}`).toBe(
          EMITTED_PROVIDER_CONSTRAINTS[requirement.source],
        );
      }
      // Pinned leaves a fixture exactly as committed: it is already the exact
      // version this repository adopted, and the pin guard above reads the same
      // bytes whichever mode this process was started in.
      expect(providersForMode(site.committed, "fixture", "pinned"), site.path).toBe(site.committed);
      // The only route a test takes to these files, so nothing can be reading
      // the committed text by accident.
      expect(supportFor(testCase)["providers.tf"], site.path).toBe(
        providersForMode(site.committed, "fixture", PROVIDER_MODE),
      );
    }
  });

  it("floats a published example under its own committed range and leaves the file alone", () => {
    for (const site of exampleSites) {
      // An example IS the user-facing file. Pinning it on disk would be bad
      // advice to copy and would rot the first time nobody bumps it, so the
      // committed text has to stay a range.
      const committed = providerRequirements(site.committed);
      expect(committed.length, site.path).toBeGreaterThan(0);
      for (const requirement of committed) {
        expect(requirement.version, `${site.path} ${requirement.source}`).not.toMatch(
          /^\d+\.\d+\.\d+$/,
        );
      }

      // Float asks what that published range resolves to, which is the question
      // a reader who copies it asks.
      expect(providersForMode(site.committed, "example", "float"), site.path).toBe(site.committed);

      // Pinned narrows it to the exact version this repository adopted, in the
      // temp directory only, so a blocking lane resolves one known version at
      // every site rather than three quarters of them.
      const pinned = providersForMode(site.committed, "example", "pinned");
      expect(pinned, site.path).not.toBe(site.committed);
      for (const requirement of providerRequirements(pinned)) {
        expect(requirement.version, `${site.path} ${requirement.source}`).toMatch(
          /^\d+\.\d+\.\d+$/,
        );
        expect(
          pinnedProviders().map((pin) => `${pin.source} ${pin.version}`),
          `${site.path} ${requirement.source}`,
        ).toContain(`${requirement.source} ${requirement.version}`);
      }
    }
  });

  // Derived from the emitter rather than restated beside the seam. A second
  // copy of `>= 5.0` could drift from what emit.ts writes, and the canary would
  // then be watching a range nobody is actually given.
  it("watches the range the emitter actually writes into versions.tf.example", () => {
    const seen = new Set<string>();
    for (const testCase of cases) {
      const example = emitTf(testCase.docs, testCase.options).files["versions.tf.example"] ?? "";
      const requirements = providerRequirements(example);
      expect(requirements.length, testCase.name).toBeGreaterThan(0);
      for (const requirement of requirements) {
        expect(requirement.version, `${testCase.name} ${requirement.source}`).toBe(
          EMITTED_PROVIDER_CONSTRAINTS[requirement.source],
        );
        seen.add(requirement.source);
      }
    }
    // No entry in the constant that no emitted file ever writes.
    expect([...seen].sort()).toEqual(Object.keys(EMITTED_PROVIDER_CONSTRAINTS).sort());
  });

  // The release most likely to stop accepting the emitted HCL is a new major,
  // and it is the one a user with no lock file gets first. A canary capped at
  // the pin's own major would report nothing that day, so this asserts the
  // constraint float resolves under genuinely spans more than one major: today
  // `>= 5.0` resolves 6.x, which is already a crossing rather than a claim
  // about a version that does not exist yet.
  it("resolves fixtures under a constraint that crosses a major", () => {
    const crossings = pinnedProviders().filter((pin) => {
      const constraint = EMITTED_PROVIDER_CONSTRAINTS[pin.source] ?? "";
      expect(constraint, pin.source).toMatch(/^>=/);
      return major(constraint.replace(">=", "").trim()) < major(pin.version);
    });
    expect(crossings.length).toBeGreaterThan(0);
  });

  // The trap. Both pin guards above read the committed fixtures, so they are
  // exactly as strict during a canary run as during any other, whatever
  // TOFU_PROVIDER_MODE this process was started with. A seam that rewrote the
  // fixtures in place would fail them before ever reaching tofu; a seam bought
  // by relaxing them would throw away the protection they exist for.
  it("leaves the committed pins exactly as strict in either mode", () => {
    expect(PROVIDER_MODE === "pinned" || PROVIDER_MODE === "float").toBe(true);
    for (const pin of pinnedProviders()) {
      expect(pin.version, `${pin.case} ${pin.source}`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("runs float mode cold, on a version without the init race", () => {
    const workflow = driftCanaryWorkflow();
    expect(workflow).toContain('RUN_TOFU_VALIDATE: "1"');
    expect(workflow).toContain("TOFU_PROVIDER_MODE: float");

    // No provider cache, on purpose: a job that resolves yesterday's provider
    // out of a restored cache is not resolving anything, and that is the whole
    // signal. `cache: npm` on setup-node is a different cache and is fine, so
    // this asks about the step that would restore the plugin directory.
    expect(workflow).not.toContain("uses: actions/cache");
    expect(workflow).not.toContain(".tofu-cache");

    // Cold plus 1.7.0 is the plugin-cache race the header of
    // ./__fixtures__/tofu.ts records, which fails 3 to 4 of 6 concurrent cold
    // inits every time. A floating job is cold by definition, so running it on
    // 1.7.0 would produce failures about OpenTofu rather than about the
    // provider, and a canary that cries wolf gets muted. The floor stays
    // covered by the pinned, prewarmed, cached lane in ci.yml.
    const versions = [...workflow.matchAll(/tofu_version:\s*"(?<v>[^"]+)"/g)].map(
      (m) => m.groups?.v ?? "",
    );
    expect(versions).toHaveLength(1);
    expect(versions).not.toContain(CORE_VERSION_FLOOR);
    // The same version a blocking lane runs, so a difference between the two is
    // about the provider and never about OpenTofu.
    expect(emitTfCiTofuVersions()).toContain(versions[0]);

    // A failure that does not name the resolved version costs a re-run to
    // diagnose, and the registry may have moved by then.
    expect(workflow).toContain("TOFU_RESOLVED_REPORT");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
  });

  // The step summary is the whole diagnostic, so a constraint written into it
  // by hand is a second place to remember exactly like the one this design
  // removed from the seam. It said `aws ~> 6.0, awscc ~> 1.0` and no test held
  // it; float mode now resolves under the emitter's ranges, so that line was
  // about to describe a run that never happened. Build it from the report the
  // run itself wrote.
  it("names the constraints it resolved under from the run's own report", () => {
    const workflow = driftCanaryWorkflow();
    // The reporting step alone. The header above is prose for a maintainer and
    // is free to name a constraint; what must not name one is the text the run
    // writes as its own account of what it did.
    const start = workflow.indexOf("- name: Report the resolved versions");
    expect(start, "the canary has no reporting step to check").toBeGreaterThan(-1);
    const report = workflow.slice(start);

    for (const constraint of [...Object.values(EMITTED_PROVIDER_CONSTRAINTS), "~> 6.0", "~> 1.0"]) {
      expect(report, constraint).not.toContain(constraint);
    }
    // `.constraints` is the lock file's own record of what init resolved under,
    // which is the only answer that cannot disagree with the run.
    expect(report).toMatch(/jq[^\n]*\.constraints/);
  });
});

// fc369c5 pinned the four conformance fixtures and left the example's two
// environments floating, because nothing tied "a gated test runs `tofu init`"
// to "the prewarm fetched what it resolves". These two hold that tie, so the
// next test to be added cannot repeat it quietly.
describe("provider coverage", () => {
  it("covers every committed provider set in both modes", () => {
    for (const mode of ["pinned", "float"] as const) {
      const covered = coveredProviderSets(mode);
      expect(covered.size, mode).toBeGreaterThan(0);
      for (const site of providerSites()) {
        const key = providerSetKey(
          providerRequirements(providersForMode(site.committed, site.surface, mode)),
        );
        expect(covered, `${mode} ${site.path}`).toContain(key);
      }
    }
    // The two modes ask different questions, so they cover different sets. If
    // these ever matched, the seam would be doing nothing and every agreement
    // between the lanes would be meaningless.
    expect([...coveredProviderSets("float")].sort()).not.toEqual(
      [...coveredProviderSets("pinned")].sort(),
    );
  });

  it("refuses a gated init against a provider set the prewarm never fetched", () => {
    const uncovered = materialize({
      "providers.tf": [
        "terraform {",
        "  required_providers {",
        "    aws = {",
        '      source  = "hashicorp/aws"',
        '      version = "0.0.1"',
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    // Throws rather than spawning, so this runs in the default suite: the guard
    // is worth nothing if it only exists on a machine with a tofu binary.
    expect(() => tofu(["init", "-backend=false", "-input=false", "-no-color"], uncovered)).toThrow(
      /does not cover[\s\S]*hashicorp\/aws 0\.0\.1/,
    );

    // And it is not simply always throwing. A workspace built the way the
    // gated tests build one is covered, and a directory with no
    // `required_providers` at all (what the template-rendering tests init) has
    // nothing to download and nothing to race over.
    for (const testCase of cases.filter((c) => c.support["providers.tf"] !== undefined)) {
      const key = providerSetKey(providerRequirements(supportFor(testCase)["providers.tf"] ?? ""));
      expect(key, testCase.name).not.toBe("");
      expect(coveredProviderSets(), testCase.name).toContain(key);
    }
    expect(providerRequirements('output "x" {\n  value = "y"\n}\n')).toEqual([]);
  });

  // A `required_providers` entry the regex cannot read is the dangerous case:
  // it would be a provider the prewarm never fetched AND a provider the
  // coverage guard never noticed, so the workspace would look covered and go
  // cold anyway. Loud instead. The fixtures are `tofu fmt` clean so the regex
  // is enough for what is committed, but "enough for what is committed" has to
  // fail rather than shrug when that stops being true.
  it("refuses to read a required_providers entry it cannot parse", () => {
    const reordered = [
      "terraform {",
      "  required_providers {",
      "    aws = {",
      '      version = "6.64.0"',
      '      source  = "hashicorp/aws"',
      "    }",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(() => providerRequirements(reordered)).toThrow(/1 source arguments but 0 parse as/);
  });

  // The step summary is the whole diagnostic, so a row that vanishes from it
  // costs the re-run the report exists to avoid. Two rows can now share a
  // source and a version and differ only in the constraint they were resolved
  // under, and in float mode that is the ordinary case rather than an edge:
  // the fixtures ask the emitter's open-ended range, the examples ask their
  // own, and today both land on the same version. The open-ended one is the
  // row worth reading, because it is the one whose answer can move to a new
  // major.
  it("reports a resolution under two constraints as two rows", () => {
    const rows = distinctResolutions([
      { source: "hashicorp/aws", version: "6.64.0", constraints: "~> 6.0" },
      { source: "hashicorp/aws", version: "6.64.0", constraints: ">= 5.0.0" },
      { source: "hashicorp/aws", version: "6.64.0", constraints: ">= 5.0.0" },
      { source: "hashicorp/aws", version: "6.63.0", constraints: "6.63.0" },
    ]);
    expect(rows).toEqual([
      { source: "hashicorp/aws", version: "6.63.0", constraints: "6.63.0" },
      { source: "hashicorp/aws", version: "6.64.0", constraints: ">= 5.0.0" },
      { source: "hashicorp/aws", version: "6.64.0", constraints: "~> 6.0" },
    ]);
  });
});

describe.skipIf(!enabled)("tofu (RUN_TOFU_VALIDATE=1)", () => {
  describe.each(cases.filter((c) => c.validate !== "skip"))("$name", (testCase) => {
    it(
      testCase.validate === "pass" ? "validates clean" : "fails validation on the placeholders",
      () => {
        const dir = workspaceFor(testCase);
        const init = tofu(["init", "-backend=false", "-input=false", "-no-color"], dir);
        expect(init.output).toContain("initialized");
        expect(init.status).toBe(0);

        const validate = tofu(["validate", "-no-color"], dir);
        if (testCase.validate === "pass") {
          expect(validate.output).toContain("The configuration is valid");
          expect(validate.status).toBe(0);
        } else {
          expect(validate.status).not.toBe(0);
          // Loud and specific: the failure has to name the unmapped reference.
          expect(validate.output).toContain("TODO_MISSING_ADDRESS_queue_appointments");
          expect(validate.output).toContain("TODO_MISSING_ADDRESS_lambda_appointment_lookup");
        }
      },
      600_000,
    );

    it("emits fmt-clean HCL", () => {
      // fmt only looks at *.tf, and versions.tf.example is deliberately not
      // one, so it is renamed for this check in a directory of its own.
      const { "versions.tf.example": example, ...files } = emitTf(
        testCase.docs,
        testCase.options,
      ).files;
      const dir = materialize({ ...files, "versions.tf": example ?? "" });
      const fmt = tofu(["fmt", "-check", "-diff", "-recursive", "-no-color"], dir);
      expect(fmt.output).toBe("\n");
      expect(fmt.status).toBe(0);
    });

    it("renders every template the way the reference implementation does", () => {
      const files = emitTf(testCase.docs, testCase.options).files;
      for (const [path, template] of Object.entries(files)) {
        if (!path.endsWith(".tftpl")) continue;

        // Literal values, so the render is fully known: the apply resolves the
        // output to an evaluated string rather than deferring on an unknown.
        const names = [
          ...new Set([...template.matchAll(/\$\{([a-z0-9_]+)\}/g)].map((m) => m[1] ?? "")),
        ].sort();
        const vars = Object.fromEntries(names.map((n) => [n, `ADDRESS-FOR-${n}`]));
        const entries = names.map((n) => `    ${n} = "ADDRESS-FOR-${n}"`);

        const dir = materialize({
          [path]: template,
          "main.tf": `locals {\n  vars = {\n${entries.join("\n")}\n  }\n}\n`,
        });
        // No providers are required here, so the harness's init and apply are
        // offline and immediate.
        const rendered = tofuEvaluateString(
          dir,
          `templatefile("\${path.module}/${path}", local.vars)`,
        );

        expect(rendered, path).toBe(renderHclTemplate(template, vars));
        expect(rendered, path).not.toContain("cdref:");
      }
    }, 300_000);
  });
});
