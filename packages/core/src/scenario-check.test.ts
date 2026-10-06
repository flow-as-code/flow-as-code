/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The simulate dry run over conformance/simulate/dry-run: one flow set, one
// resource map, and a case per thing the check can say. Every case is a valid
// scenario (the dry run is what comes after validation), every document in the
// set satisfies the FlowDoc schema, and the findings must equal the case's
// expected.problems.json exactly, path and message.

import { readdirSync, readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import type { FlowDoc, Scenario, ScenarioFinding } from "./index.js";
import { dryRunScenario, spokenText, validateScenario } from "./index.js";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

const FAMILY = "conformance/simulate/dry-run/";
const FLOWS = `${FAMILY}flows/`;
const CASES = readdirSync(new URL(`${FAMILY}cases/`, root)).sort();

const docs = readdirSync(new URL(FLOWS, root))
  .filter((f) => f.endsWith(".flowdoc.json"))
  .sort()
  .map((f) => readJson<FlowDoc>(`${FLOWS}${f}`));
const resourceMap = readJson<Record<string, string>>(`${FAMILY}resource-map.json`);
const scenarioOf = (name: string) => readJson<Scenario>(`${FAMILY}cases/${name}/scenario.json`);
const expectedOf = (name: string) =>
  readJson<ScenarioFinding[]>(`${FAMILY}cases/${name}/expected.problems.json`);

describe("conformance/simulate/dry-run", () => {
  it("holds a flow and a module, both valid FlowDocs", () => {
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      JSON.parse(read("conformance/schema/flowdoc-0.3.schema.json")),
    );
    for (const doc of docs) expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
    expect(docs.map((d) => `${d.kind}:${d.name}`)).toEqual([
      "module:billing-menu",
      "flow:keypad-line",
    ]);
  });

  it("has at least one clean case and one of every other kind", () => {
    expect(CASES).toContain("keypad-clean");
    expect(CASES.length).toBeGreaterThan(5);
  });

  it.each(CASES)("%s is a valid scenario", (name) => {
    expect(validateScenario(scenarioOf(name))).toEqual([]);
  });

  it.each(CASES)("%s reports exactly its expected problems", (name) => {
    expect(dryRunScenario(scenarioOf(name), docs, { resourceMap })).toEqual(expectedOf(name));
  });
});

describe("dryRunScenario", () => {
  const clean = scenarioOf("keypad-clean");

  it("needs no map for a scenario whose tokens the set references", () => {
    const steps = clean.steps.filter((s) => s.kind !== "expect-queue");
    const scenario: Scenario = { ...clean, steps, substitutions: undefined };
    expect(dryRunScenario(scenario, docs)).toEqual([]);
  });

  it("says when no map was given and a token needed one", () => {
    const findings = dryRunScenario(clean, docs);
    expect(findings.map((f) => f.path)).toEqual([
      "substitutions[0].substitute",
      "substitutions[1].substitute",
    ]);
    for (const finding of findings) expect(finding.message).toContain("(no resource map given)");
  });

  it("accepts any of the three key forms in the map", () => {
    const forms: Record<string, string>[] = [
      { "${cdref:queue:overflow}": "x", "hours:always-open": "x" },
      { "queue:overflow": "x", hours_always_open_arn: "x" },
    ];
    for (const map of forms) expect(dryRunScenario(clean, docs, { resourceMap: map })).toEqual([]);
  });

  it("matches a prompt case-insensitively and across JSON whitespace", () => {
    const scenario: Scenario = {
      ...clean,
      steps: [{ kind: "expect-prompt", contains: "THANKS FOR CALLING   the keypad" }],
    };
    expect(dryRunScenario(scenario, docs, { resourceMap })).toEqual([]);
  });

  it("holds an attribute-reading prompt to its literal parts when the value is unknown", () => {
    const steps = clean.steps.filter((s) => s.kind !== "assert");
    const scenario: Scenario = { ...clean, steps };
    const findings = dryRunScenario(scenario, docs, { resourceMap });
    expect(findings).toEqual([
      { path: "steps[2]", message: 'no prompt in the set contains "Welcome back, Mrs. Alder"' },
    ]);
    // The literal part before the read is still something the flow says.
    const literal: Scenario = {
      ...scenario,
      steps: steps.map((s) =>
        s.kind === "expect-prompt" && s.contains === "Welcome back, Mrs. Alder"
          ? { kind: "expect-prompt", contains: "Welcome back" }
          : s,
      ),
    };
    expect(dryRunScenario(literal, docs, { resourceMap })).toEqual([]);
  });

  it("lets any key answer a prompt that stores input rather than branching on it", () => {
    const storing = docs.map((doc) =>
      doc.name !== "keypad-line"
        ? doc
        : {
            ...doc,
            content: {
              ...doc.content,
              Actions: doc.content.Actions.map((a) =>
                a.Identifier === "menu"
                  ? { ...a, Parameters: { ...a.Parameters, StoreInput: "True" } }
                  : a,
              ),
            },
          },
    );
    const wrong = scenarioOf("keypad-wrong-key");
    expect(dryRunScenario(wrong, docs, { resourceMap })).toHaveLength(1);
    expect(dryRunScenario(wrong, storing, { resourceMap })).toEqual([]);
  });

  it("counts recorded prompts in a miss, since their words are not in the document", () => {
    const withRecording = docs.map((doc) =>
      doc.name !== "keypad-line"
        ? doc
        : {
            ...doc,
            content: {
              ...doc.content,
              Actions: doc.content.Actions.map((a) =>
                a.Identifier === "no-match"
                  ? { ...a, Parameters: { PromptId: "${cdref:prompt:invalid-option}" } }
                  : a,
              ),
            },
          },
    );
    const scenario: Scenario = {
      ...clean,
      steps: [{ kind: "expect-prompt", contains: "not a valid option" }],
    };
    expect(dryRunScenario(scenario, withRecording, { resourceMap })).toEqual([
      {
        path: "steps[0]",
        message:
          'no prompt in the set contains "not a valid option"; 1 prompt(s) play recorded audio the dry run cannot read',
      },
    ]);
  });

  it("reports an empty set as holding no flow documents", () => {
    expect(dryRunScenario(clean, [], { resourceMap })[0]).toEqual({
      path: "entryPoint.flow",
      message:
        "${cdref:flow:keypad-line} names no flow in the set (the set holds no flow documents)",
    });
  });
});

describe("spokenText", () => {
  it("reads the words outside SSML tags", () => {
    expect(spokenText('<speak>We are closed. <break time="500ms"/>Call back.</speak>')).toBe(
      "We are closed. Call back.",
    );
    expect(spokenText("no tags")).toBe("no tags");
    expect(spokenText("")).toBe("");
  });

  it("is linear on pathological input and keeps an unterminated tag as written", () => {
    const many = "<".repeat(10_000);
    const started = performance.now();
    expect(spokenText(many)).toBe(many);
    expect(spokenText(`${many}>tail`)).toBe("tail");
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("does not sanitize: a nested tag reads as the text after its first close", () => {
    // Compared and quoted, never rendered, so this is the reading of a
    // malformed body rather than a security property.
    expect(spokenText("<scr<script>ipt>alert(1)")).toBe("ipt>alert(1)");
  });
});
