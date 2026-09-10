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
  materializeFiles,
  tofu,
} from "../../tf/src/__fixtures__/tofu.js";
import { exportTf } from "../src/export/targets.js";

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
    const dir = materializeFiles({ ...bundle.files, ...testCase.support });

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
    const dir = materializeFiles({ ...bundle.files, ...testCase.support });

    expect(tofu(["init", "-backend=false", "-input=false", "-no-color"], dir).status).toBe(0);
    const validate = tofu(["validate", "-no-color"], dir);
    expect(validate.status).not.toBe(0);
    // Loud and specific: the failure names the unmapped references.
    expect(validate.output).toContain("TODO_MISSING_ADDRESS_queue_appointments");
    expect(validate.output).toContain("TODO_MISSING_ADDRESS_lambda_appointment_lookup");
  }, 600_000);
});
