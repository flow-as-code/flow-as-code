/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync, readdirSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { appointmentLine } from "./__fixtures__/appointment-line.js";
import type { FlowDoc } from "./index.js";
import { allRules, hasBlockingFindings, lint, synth, toJson, toText } from "./index.js";

const root = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const dirs = (p: string) => readdirSync(new URL(p, root), { withFileTypes: true });

interface FailFixture {
  expect: { rule: string; blockId?: string; messageIncludes: string }[];
  doc?: FlowDoc;
  docs?: FlowDoc[];
}

const docsOf = (parsed: { doc?: FlowDoc; docs?: FlowDoc[] }): FlowDoc[] =>
  parsed.docs ?? (parsed.doc === undefined ? [parsed as unknown as FlowDoc] : [parsed.doc]);

const schema = JSON.parse(read("conformance/schema/flowdoc-0.1.schema.json"));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

const ruleDirs = dirs("conformance/lint")
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

describe("A02 acceptance: every rule has fixtures", () => {
  it("covers every registered rule", () => {
    expect(ruleDirs.sort()).toEqual([...allRules.map((r) => r.id)].sort());
  });

  // The check above compares the registry against the fixture directories, so
  // deleting a rule AND its fixtures keeps it green. The registered set is
  // therefore spelled out: ids are a stable contract (the CLI, the studio, and
  // the future Go provider key off them), and losing one is a silent loss of
  // enforcement.
  it("registers exactly the rules this repo ships", () => {
    expect([...allRules.map((r) => r.id)].sort()).toEqual([
      "action-allowed-in-flow-type",
      "action-count",
      "error-branches",
      "module-depth-5",
      "no-literal-arn",
      "no-unresolved-token",
      "prompt-length-3000",
      "reachable-blocks",
      "recording-consent-before-record",
      "terminal-blocks",
      "unique-names",
    ]);
  });

  it("registers unique, stable rule ids", () => {
    const ids = allRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The two hard rules the studio may never save through.
    expect(
      allRules
        .filter((r) => r.hard)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["no-literal-arn", "no-unresolved-token"]);
  });
});

describe.each(ruleDirs)("rule %s", (ruleId) => {
  const files = dirs(`conformance/lint/${ruleId}`)
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name)
    .sort();

  const passes = files.filter((f) => f.startsWith("pass-"));
  const fails = files.filter((f) => f.startsWith("fail-"));

  it("has at least one pass and one fail fixture", () => {
    expect(passes.length, `${ruleId} has no pass fixture`).toBeGreaterThan(0);
    expect(fails.length, `${ruleId} has no fail fixture`).toBeGreaterThan(0);
  });

  it.each(passes)("%s produces no finding for this rule", (file) => {
    const parsed = JSON.parse(read(`conformance/lint/${ruleId}/${file}`));
    const docs = docsOf(parsed);
    for (const doc of docs) {
      expect(
        validate(doc),
        `${file} is not a valid FlowDoc: ${JSON.stringify(validate.errors)}`,
      ).toBe(true);
    }
    expect(lint(docs).filter((f) => f.rule === ruleId)).toEqual([]);
  });

  it.each(fails)("%s produces exactly the expected findings", (file) => {
    const fixture = JSON.parse(read(`conformance/lint/${ruleId}/${file}`)) as FailFixture;
    const found = lint(docsOf(fixture)).filter((f) => f.rule === ruleId);

    expect(
      found.length,
      `expected ${fixture.expect.length} finding(s), got ${JSON.stringify(found, null, 2)}`,
    ).toBe(fixture.expect.length);
    for (const [i, want] of fixture.expect.entries()) {
      const got = found[i]!;
      expect(got.rule).toBe(want.rule);
      if (want.blockId !== undefined) expect(got.blockId).toBe(want.blockId);
      expect(got.message).toContain(want.messageIncludes);
    }
  });
});

describe("the demo flow", () => {
  it("is clean under every rule", () => {
    expect(lint(synth(appointmentLine()))).toEqual([]);
  });
});

describe("engine", () => {
  const dirty = (): FlowDoc => {
    const doc = synth(appointmentLine());
    doc.content.Actions[1]!.Parameters.Text = "arn:aws:connect:us-east-1:111122223333:instance/a";
    return doc;
  };

  it("sorts findings deterministically", () => {
    const a = lint(dirty());
    const b = lint(dirty());
    expect(a).toEqual(b);
  });

  it("honours disabled rules", () => {
    expect(
      lint(dirty(), { disable: ["no-literal-arn"] }).filter((f) => f.rule === "no-literal-arn"),
    ).toEqual([]);
  });

  it("flags a hard rule as blocking a studio save", () => {
    expect(hasBlockingFindings(lint(dirty()))).toBe(true);
    expect(hasBlockingFindings(lint(synth(appointmentLine())))).toBe(false);
  });
});

describe("reporters", () => {
  const findings = lint(
    (() => {
      const doc = synth(appointmentLine());
      doc.content.Actions[1]!.Parameters.Text = "arn:aws:iam::111122223333:role/r";
      return doc;
    })(),
  );

  it("emits parseable JSON with a summary", () => {
    const parsed = JSON.parse(toJson(findings));
    expect(parsed.summary.total).toBe(findings.length);
    expect(parsed.summary.errors).toBeGreaterThan(0);
    expect(parsed.findings).toHaveLength(findings.length);
  });

  it("emits text naming the document, block, and rule", () => {
    const text = toText(findings);
    expect(text).toContain("appointment-line");
    expect(text).toContain("[no-literal-arn]");
    expect(text).toMatch(/finding\(s\)/);
  });

  it("says so when there is nothing to report", () => {
    expect(toText([])).toBe("No findings.\n");
    expect(JSON.parse(toJson([])).summary).toEqual({ total: 0, errors: 0, warnings: 0 });
  });
});
