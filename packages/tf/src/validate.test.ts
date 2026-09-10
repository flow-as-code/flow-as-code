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
  driftCanaryWorkflow,
  emitTfCiJob,
  emitTfCiTofuVersions,
  materializeFiles as materialize,
  pinnedProviders,
  providersForMode,
  supportFor,
  tofu,
  tofuEvaluateString,
} from "./__fixtures__/tofu.js";
import { CORE_VERSION_FLOOR, emitTf } from "./emit.js";

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
  it("floats the fixture pins without touching what the pin guard reads", () => {
    const withProviders = cases.filter((c) => c.support["providers.tf"] !== undefined);
    // A filter that matched nothing would make every assertion below vacuous.
    expect(withProviders.length).toBeGreaterThan(0);

    for (const testCase of withProviders) {
      const committed = testCase.support["providers.tf"] ?? "";
      const floated = providersForMode(committed, "float");

      expect(floated, testCase.name).not.toBe(committed);
      expect(floated, testCase.name).not.toMatch(/\bversion\s*=\s*"\d+\.\d+\.\d+"/);
      expect(providersForMode(committed, "pinned"), testCase.name).toBe(committed);
      // Derived from the pin's own major, so a pin bump carries the canary with
      // it instead of leaving a second place to remember.
      for (const pin of pinnedProviders().filter((p) => p.case === testCase.name)) {
        expect(floated, `${testCase.name} ${pin.source}`).toContain(
          `~> ${pin.version.split(".")[0] ?? ""}.0`,
        );
      }
      // The seam runs on the text on its way to a temp directory. This is the
      // only route a test takes to those files, so nothing else can be reading
      // the committed pins by accident.
      expect(supportFor(testCase)["providers.tf"], testCase.name).toBe(
        providersForMode(committed, PROVIDER_MODE),
      );
    }

    // The trap. Both guards above read the committed fixtures through
    // loadCases(), so they are exactly as strict during a canary run as during
    // any other, whatever TOFU_PROVIDER_MODE this process was started with.
    // A seam that rewrote the fixtures in place would fail them before ever
    // reaching tofu; a seam bought by relaxing them would throw away the
    // protection they exist for.
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
