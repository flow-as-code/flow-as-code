/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The three key forms a reference map may use, and the promise that every
// command resolving references takes all three.
//
// The forms were @flow-as-code/tf's alone: `emit --target tf --address-map` has
// always accepted the token, `type:name`, and the generated variable name,
// while `render --resources` and `simulate --resource-map` accepted only the
// token. So a map keyed the way the emitter's own TODO comment teaches was
// rejected by render with an error that read like a tool bug. These hold all
// three sites to one answer.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { FlowDoc, RefEntry, Scenario } from "./index.js";
import {
  MaterializeError,
  Refs,
  collectRefs,
  compileScenario,
  describeMissingRefKey,
  lookupRefValue,
  materializeWithMap,
  parseToken,
  refKey,
  refMapKeys,
  refVariableName,
  resolveScenario,
  serializeContent,
  slugIdentifier,
  token,
} from "./index.js";

const root = new URL("../../../", import.meta.url);
const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), "utf8")) as T;

const demo = (): FlowDoc =>
  readJson<FlowDoc>("conformance/materialize/demo-with-map/doc.flowdoc.json");
const demoMap = (): Record<string, string> =>
  readJson<Record<string, string>>("conformance/materialize/demo-with-map/map.json");

const entry = (value: string): RefEntry => parseToken(value)!;

/** The same map, rekeyed by `keyOf`, so completeness is the only difference. */
function rekeyed(
  map: Record<string, string>,
  keyOf: (e: RefEntry) => string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(map).map(([tokenValue, value]) => [keyOf(entry(tokenValue)), value]),
  );
}

describe("token", () => {
  it("builds the same string the fixed-type builders do", () => {
    expect(token("queue", "front-desk")).toBe(Refs.queue("front-desk"));
    expect(token("module", "survey", "prod")).toBe(Refs.module("survey", "prod"));
  });

  it("round-trips through parseToken", () => {
    const built = token("module", "survey", "prod");
    const parsed = parseToken(built)!;
    expect(token(parsed.type, parsed.name, parsed.alias)).toBe(built);
  });

  it("refuses a name that is not a slug", () => {
    expect(() => token("queue", "Front Desk")).toThrow(/Invalid queue name/);
    expect(() => token("module", "survey", "PROD")).toThrow(/Invalid module alias/);
  });
});

describe("the three key forms", () => {
  it("spells a plain reference three ways", () => {
    expect(refMapKeys(entry("${cdref:queue:front-desk}"))).toEqual([
      "${cdref:queue:front-desk}",
      "queue:front-desk",
      "queue_front_desk_arn",
    ]);
  });

  it("folds a module alias into all three", () => {
    expect(refMapKeys(entry("${cdref:module:survey@prod}"))).toEqual([
      "${cdref:module:survey@prod}",
      "module:survey@prod",
      "module_survey_prod_arn",
    ]);
  });

  it("prefixes a variable name that would start with a digit", () => {
    // Terraform identifiers may not begin with a digit, and a slug may.
    expect(slugIdentifier("2fa-line")).toBe("_2fa_line");
    expect(refVariableName(entry("${cdref:flow:2fa-line}"))).toBe("flow__2fa_line_arn");
  });

  it("cannot collide across forms", () => {
    // A token is the only form with `${`, and no slug holds `:` or `@`, so
    // nothing but a refKey has one. Nothing else has to be checked at lookup.
    const forms = refMapKeys(entry("${cdref:module:survey@prod}"));
    expect(new Set(forms).size).toBe(3);
    expect(forms.filter((f) => f.includes("${"))).toHaveLength(1);
    expect(forms.filter((f) => f.includes(":"))).toHaveLength(2);
  });
});

describe("lookupRefValue", () => {
  const ref = entry("${cdref:queue:front-desk}");

  it("finds the value under any of the three forms", () => {
    for (const key of refMapKeys(ref)) {
      expect(lookupRefValue({ [key]: "arn:example" }, ref)).toBe("arn:example");
    }
  });

  it("prefers the token when more than one form is present", () => {
    expect(
      lookupRefValue(
        { [refKey(ref)]: "body", [refVariableName(ref)]: "variable", [ref.token]: "token" },
        ref,
      ),
    ).toBe("token");
  });

  it("treats a deliberate empty value as mapped", () => {
    // The same call decides what a reference resolves to and whether the map is
    // complete. Under a truthiness test the two disagree: the completeness
    // check would call an empty entry missing while substitution used it.
    expect(lookupRefValue({ [refKey(ref)]: "" }, ref)).toBe("");

    const map = { ...demoMap(), "${cdref:queue:appointments}": "" };
    const content = materializeWithMap(demo(), map);
    const setQueue = content.Actions.find((a) => a.Identifier === "set-working-queue")!;
    expect(setQueue.Parameters.QueueId).toBe("");
  });

  it("is undefined when no form is present", () => {
    expect(lookupRefValue({ "queue:other-desk": "arn:example" }, ref)).toBeUndefined();
  });
});

describe("materializeWithMap takes all three forms", () => {
  it("resolves a map keyed by type and name", () => {
    // What the emitter's own TODO comment teaches, and what
    // examples/promote-across-environments/refs.dev.tfmap.json uses.
    const out = serializeContent(materializeWithMap(demo(), rekeyed(demoMap(), refKey)));
    expect(out).not.toContain("${cdref:");
    expect(out).toBe(serializeContent(materializeWithMap(demo(), demoMap())));
  });

  it("resolves a map keyed by the variable the terraform emitter writes", () => {
    const out = serializeContent(materializeWithMap(demo(), rekeyed(demoMap(), refVariableName)));
    expect(out).toBe(serializeContent(materializeWithMap(demo(), demoMap())));
  });

  it("names all three forms when a key is genuinely missing", () => {
    const map = rekeyed(demoMap(), refKey);
    delete map["queue:appointments"];

    const thrown = (() => {
      try {
        materializeWithMap(demo(), map);
        return undefined;
      } catch (e) {
        return e as MaterializeError;
      }
    })();

    expect(thrown).toBeInstanceOf(MaterializeError);
    expect(thrown?.missingTokens).toEqual(["${cdref:queue:appointments}"]);
    expect(thrown?.message).toContain("${cdref:queue:appointments}");
    expect(thrown?.message).toContain("queue:appointments");
    expect(thrown?.message).toContain("queue_appointments_arn");
  });
});

describe("resolveScenario takes all three forms", () => {
  const scenario = (): Scenario =>
    readJson<Scenario>("conformance/simulate/appointment-lookup-transfer/scenario.json");

  /** Every reference the compiled scenario carries, mapped to a stand-in value. */
  function mapOf(keyOf: (e: RefEntry) => string): Record<string, string> {
    const compiled = compileScenario(scenario());
    return Object.fromEntries(collectRefs(compiled).map((e) => [keyOf(e), `resolved:${e.name}`]));
  }

  it("resolves a map keyed by type and name", () => {
    // Without this, one map file cannot serve both render and simulate, and a
    // fix applied only to materializeWithMap leaves simulate behind.
    const byToken = resolveScenario(
      compileScenario(scenario()),
      mapOf((e) => e.token),
    );
    const byKey = resolveScenario(compileScenario(scenario()), mapOf(refKey));
    expect(byKey).toEqual(byToken);
  });

  it("resolves a map keyed by the variable the terraform emitter writes", () => {
    const byToken = resolveScenario(
      compileScenario(scenario()),
      mapOf((e) => e.token),
    );
    const byVariable = resolveScenario(compileScenario(scenario()), mapOf(refVariableName));
    expect(byVariable).toEqual(byToken);
  });

  it("names all three forms when a key is genuinely missing", () => {
    const map = mapOf(refKey);
    const dropped = Object.keys(map)[0]!;
    delete map[dropped];

    const thrown = (() => {
      try {
        resolveScenario(compileScenario(scenario()), map);
        return undefined;
      } catch (e) {
        return e as MaterializeError;
      }
    })();

    expect(thrown).toBeInstanceOf(MaterializeError);
    expect(thrown!.missingRefs.map(refKey)).toEqual([dropped]);
    expect(thrown!.message).toContain(dropped);
    expect(thrown!.message).toContain(refVariableName(thrown!.missingRefs[0]!));
  });
});

describe("describeMissingRefKey", () => {
  it("names the reference and every form the map would have taken", () => {
    const described = describeMissingRefKey(entry("${cdref:module:survey@prod}"));
    expect(described).toContain("${cdref:module:survey@prod}");
    expect(described).toContain("module:survey@prod");
    expect(described).toContain("module_survey_prod_arn");
  });
});
