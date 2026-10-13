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
//
// A case whose golden carries a typed sub-block or a reference key type the
// pinned provider lacks (the five FlowDoc 0.3 types, the Phase D sub-blocks)
// is `"validate": "awaits-provider"` and has no validate/ directory: it is
// byte-checked by the round-trip tests from the day it lands, and tofu
// validate is run for it once the provider release that reads 0.3 is pinned
// (tasks/README.md, "HCL goldens before the provider release"; tasks/D10
// flips every such case to pass and leaves none).
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const validateOf = (family: string, name: string): string | undefined =>
  json<{ validate?: string }>(HCL, family, name, "case.json").validate;
const hasValidateDir = (family: string, name: string): boolean =>
  existsSync(join(HCL, family, name, "validate"));
/** The cases the pinned provider validates: every one not awaiting a release. */
const validated = (family: string): string[] =>
  cases(family).filter((name) => validateOf(family, name) !== "awaits-provider");

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

  it("pins the provider in every validated case's fixture and names it in the CI cache key", () => {
    const pins = pinnedProviders().filter((p) => p.source === FLOWASCODE_PROVIDER_SOURCE);
    expect(pins.length).toBe(validated("roundtrip").length + validated("emit").length);
    for (const pin of pins) expect(emitTfCiJob()).toContain(`flowascode${pin.version}`);
  });

  it("marks every case pass or awaits-provider, with a validate directory exactly when pass", () => {
    for (const family of ["roundtrip", "emit"]) {
      for (const name of cases(family)) {
        const validate = validateOf(family, name);
        expect(["pass", "awaits-provider"], `${family}/${name}`).toContain(validate);
        expect(hasValidateDir(family, name), `${family}/${name} validate/`).toBe(
          validate === "pass",
        );
      }
    }
  });

  it("has at least one awaits-provider case until D10 flips them", () => {
    // The first is roundtrip/casefield-key (tasks/D01). D10 removes this
    // assertion in the commit that raises the pins.
    expect(
      cases("roundtrip").some((name) => validateOf("roundtrip", name) === "awaits-provider"),
    ).toBe(true);
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
  it.each(validated("roundtrip"))(
    "the %s round-trip golden validates with its stubs",
    (name) => {
      validates({
        "flow.tf": read(HCL, "roundtrip", name, "expected.flow.tf"),
        ...hclValidateSupport("roundtrip", name),
      });
    },
    600_000,
  );

  it.each(validated("emit"))(
    "the %s emitter output validates with its stubs",
    (name) => {
      const dir = join(HCL, "emit", name);
      const spec = json<{
        docs: string[];
        options?: { instanceIdExpression?: string; moduleAliases?: Record<string, string[]> };
      }>(dir, "case.json");
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
