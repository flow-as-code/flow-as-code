/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A12 acceptance: the Terraform export of the demo with a complete address map
// passes `tofu validate`, and with an incomplete one fails loudly on the
// placeholders.
//
// This reuses @flow-as-code/tf's harness rather than building a second one: the same
// conformance cases (conformance/emit-tf/*), the same provider cache, the same
// RUN_TOFU_VALIDATE=1 gate, the same test-only provider and stub files. What
// differs is the input: these run what the studio's export button produces.

import { describe, expect, it } from "vitest";
import { loadCases } from "../../tf/src/__fixtures__/cases.js";
import {
  TOFU_ENABLED,
  emitTfCiJob,
  flowascodeSupported,
  hclValidateSupport,
  materializeFiles,
  supportFor,
  tofu,
} from "../../tf/src/__fixtures__/tofu.js";
import { exportFlowascode, exportTf } from "../src/export/targets.js";

const cases = loadCases();
const demoCase = (name: string) => {
  const found = cases.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no conformance/emit-tf case "${name}"`);
  return found;
};

describe("the tofu gate", () => {
  // The same guard @flow-as-code/tf keeps: gating is a tradeoff, not a way to stop
  // running these, so the CI job that turns them on is asserted here too. If
  // the job stops running this project, this fails in the default suite.
  it("runs the studio project in the emit-tf job in CI", () => {
    const job = emitTfCiJob();
    expect(job).toContain('RUN_TOFU_VALIDATE: "1"');
    expect(job).toContain("--project @flow-as-code/studio");
  });
});

describe.skipIf(!TOFU_ENABLED)("the studio's terraform export (RUN_TOFU_VALIDATE=1)", () => {
  it("validates clean with a complete address map", () => {
    const testCase = demoCase("demo-complete-map");
    const bundle = exportTf({
      target: "tf",
      docs: testCase.docs,
      addressMap: testCase.options.addressMap ?? {},
    });
    const dir = materializeFiles({ ...bundle.files, ...supportFor(testCase) });

    const init = tofu(["init", "-backend=false", "-input=false", "-no-color"], dir);
    expect(init.output).toContain("initialized");
    expect(init.status).toBe(0);

    const validate = tofu(["validate", "-no-color"], dir);
    expect(validate.output).toContain("The configuration is valid");
    expect(validate.status).toBe(0);
  }, 600_000);

  it("fails validation on the placeholders when the map is incomplete", () => {
    const testCase = demoCase("demo-incomplete-map");
    const bundle = exportTf({
      target: "tf",
      docs: testCase.docs,
      addressMap: testCase.options.addressMap ?? {},
    });
    const dir = materializeFiles({ ...bundle.files, ...supportFor(testCase) });

    expect(tofu(["init", "-backend=false", "-input=false", "-no-color"], dir).status).toBe(0);
    const validate = tofu(["validate", "-no-color"], dir);
    expect(validate.status).not.toBe(0);
    // Loud and specific: the failure names the unmapped references.
    expect(validate.output).toContain("TODO_MISSING_ADDRESS_queue_appointments");
    expect(validate.output).toContain("TODO_MISSING_ADDRESS_lambda_appointment_lookup");
  }, 600_000);
});

describe.skipIf(!TOFU_ENABLED)("the studio's flowascode export (RUN_TOFU_VALIDATE=1)", () => {
  // Every file is exactly what `tofu fmt` would write, on every lane.
  it.each(["demo-complete-map", "demo-incomplete-map", "module-set"])(
    "%s is a tofu fmt fixed point",
    (name) => {
      const testCase = demoCase(name);
      const bundle = exportFlowascode({
        target: "flowascode",
        docs: testCase.docs,
        addressMap: testCase.options.addressMap ?? {},
      });
      const dir = materializeFiles({
        "flows.tf": bundle.files["flows.tf"]!,
        ...(bundle.files["variables.tf"] === undefined
          ? {}
          : { "variables.tf": bundle.files["variables.tf"] }),
      });
      const fmt = tofu(["fmt", "-check", "-list=true", "-no-color"], dir);
      expect(fmt.output.trim()).toBe("");
      expect(fmt.status).toBe(0);
    },
    120_000,
  );
});

describe.skipIf(!flowascodeSupported())(
  "the studio's flowascode export, validated (RUN_TOFU_VALIDATE=1)",
  () => {
    // The export the studio hands a user, beside the stubs the HCL contract's
    // demo-complete-map case declares, against the published provider (B03e).
    // From OpenTofu 1.10, the provider's floor.
    it("validates clean with a complete address map", () => {
      const testCase = demoCase("demo-complete-map");
      const bundle = exportFlowascode({
        target: "flowascode",
        docs: testCase.docs,
        addressMap: testCase.options.addressMap ?? {},
      });
      const tf = Object.fromEntries(
        Object.entries(bundle.files).filter(([path]) => path.endsWith(".tf")),
      );
      const dir = materializeFiles({ ...tf, ...hclValidateSupport("emit", "demo-complete-map") });
      const init = tofu(["init", "-backend=false", "-input=false", "-no-color"], dir);
      expect(init.status).toBe(0);
      const validate = tofu(["validate", "-no-color"], dir);
      expect(validate.output).toContain("The configuration is valid");
      expect(validate.status).toBe(0);
    }, 600_000);
  },
);
