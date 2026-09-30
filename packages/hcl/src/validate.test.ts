/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The HCL contract's cases, validated by OpenTofu against the published
// flow-as-code/flowascode provider (task B03e). Until the provider was on both
// registries every case carried `validate: "skip"`; now each round-trip golden
// and each flowascode emitter output is initialized and validated with the
// stubs beside it (conformance/hcl/<family>/<case>/validate/), which is what a
// reader pasting the output into a configuration would run first.
//
// What this adds to the provider repository's own conformance runner, which
// plans every golden: that runner replaces the refs values with literals, so
// it never checks that the addresses a golden binds are addresses a real
// configuration can hold. This does, and on the first run it found two that
// could not: `aws_connect_prompt` is a data source only, and hashicorp/aws has
// no `aws_lexv2models_bot_alias` at all.
//
// Gated on RUN_TOFU_VALIDATE=1 like every test that runs the real tool, and on
// an OpenTofu at or above the provider's floor: the emit-tf job's 1.7.0 lane
// skips it, the 1.10 and current lanes run it.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOWASCODE_EMITTED_CONSTRAINT,
  FLOWASCODE_TOFU_FLOOR,
  emitTfCiJob,
  emitTfCiTofuVersions,
  flowascodeSupported,
  hclValidateSupport,
  materializeFiles,
  pinnedProviders,
  tofu,
} from "../../tf/src/__fixtures__/tofu.js";
import { FLOWASCODE_PROVIDER_CONSTRAINT, FLOWASCODE_PROVIDER_SOURCE } from "./contract.js";
import { emitFlowascode } from "./emit.js";

const HCL = join(import.meta.dirname, "..", "..", "..", "conformance", "hcl");
const read = (...p: string[]): string => readFileSync(join(...p), "utf8");
const json = <T>(...p: string[]): T => JSON.parse(read(...p)) as T;
const cases = (family: string): string[] =>
  readdirSync(join(HCL, family), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

describe("the gate on the flowascode provider", () => {
  it("floats the provider under the range the emitter writes", () => {
    expect(FLOWASCODE_EMITTED_CONSTRAINT[FLOWASCODE_PROVIDER_SOURCE]).toBe(
      FLOWASCODE_PROVIDER_CONSTRAINT,
    );
  });

  it("runs a lane at the provider's OpenTofu floor", () => {
    const floor = FLOWASCODE_TOFU_FLOOR.split(".").slice(0, 2).join(".");
    expect(emitTfCiTofuVersions().some((v) => v.startsWith(`${floor}.`))).toBe(true);
  });

  it("pins the provider in every case's fixture and names it in the CI cache key", () => {
    const pins = pinnedProviders().filter((p) => p.source === FLOWASCODE_PROVIDER_SOURCE);
    expect(pins.length).toBe(cases("roundtrip").length + cases("emit").length);
    for (const pin of pins) expect(emitTfCiJob()).toContain(`flowascode${pin.version}`);
  });

  it("marks every case pass", () => {
    for (const family of ["roundtrip", "emit"]) {
      for (const name of cases(family)) {
        expect(json<{ validate?: string }>(HCL, family, name, "case.json").validate, name).toBe(
          "pass",
        );
      }
    }
  });
});

function validates(files: Record<string, string>): void {
  const dir = materializeFiles(files);
  const init = tofu(["init", "-backend=false", "-input=false", "-no-color"], dir);
  expect(init.output).toContain("initialized");
  expect(init.status).toBe(0);
  const validate = tofu(["validate", "-no-color"], dir);
  expect(validate.output).toContain("The configuration is valid");
  expect(validate.status).toBe(0);
}

describe.skipIf(!flowascodeSupported())("tofu validate (RUN_TOFU_VALIDATE=1)", () => {
  it.each(cases("roundtrip"))(
    "the %s round-trip golden validates with its stubs",
    (name) => {
      validates({
        "flow.tf": read(HCL, "roundtrip", name, "expected.flow.tf"),
        ...hclValidateSupport("roundtrip", name),
      });
    },
    600_000,
  );

  it.each(cases("emit"))(
    "the %s emitter output validates with its stubs",
    (name) => {
      const dir = join(HCL, "emit", name);
      const spec = json<{ docs: string[]; options?: { instanceIdExpression?: string } }>(
        dir,
        "case.json",
      );
      const docs = spec.docs.map((p) => json(dir, p));
      const addressMap = json<Record<string, string>>(dir, "address-map.json");
      const { files } = emitFlowascode(docs as never, { addressMap, ...spec.options });
      const tf = Object.fromEntries(Object.entries(files).filter(([p]) => p.endsWith(".tf")));
      expect(Object.keys(tf).map((p) => basename(p))).toContain("flows.tf");
      validates({ ...tf, ...hclValidateSupport("emit", name) });
    },
    600_000,
  );
});
