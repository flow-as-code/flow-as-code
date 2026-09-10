/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A03 acceptance: for every conformance/roundtrip fixture, codegen emits
// TypeScript that synthesizes back to the same FlowDoc, twice-generated output
// is byte-identical, and the output passes the repo ESLint and Prettier
// untouched. The generated sources are imported and executed for real, not
// string-matched.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { Flow, FlowDoc } from "./index.js";
import { canonicalize, codegen, factoryName, synth } from "./index.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CASES_DIR = join(ROOT, "conformance", "roundtrip");
// Inside src so Vitest transforms the generated TS on import; removed after
// the run. The emitted moduleSpecifier resolves to this package's own index,
// so no prior build is needed.
const GEN_DIR = fileURLToPath(new URL("./__generated__/", import.meta.url));

const cases = readdirSync(CASES_DIR).sort();

function readDoc(name: string): FlowDoc {
  return JSON.parse(readFileSync(join(CASES_DIR, name, "doc.flowdoc.json"), "utf8")) as FlowDoc;
}

describe("A03 acceptance: roundtrip conformance", () => {
  afterAll(() => {
    rmSync(GEN_DIR, { recursive: true, force: true });
  });

  it("has fixtures to run against", () => {
    expect(cases.length).toBeGreaterThanOrEqual(4);
  });

  for (const name of cases) {
    it(`${name}: synth(codegen(doc)) deep-equals the doc`, async () => {
      const doc = readDoc(name);
      const source = codegen(doc, { moduleSpecifier: "../index.js" });
      mkdirSync(GEN_DIR, { recursive: true });
      writeFileSync(join(GEN_DIR, `${name}.ts`), source);

      const mod = (await import(/* @vite-ignore */ `./__generated__/${name}.ts`)) as Record<
        string,
        () => Flow
      >;
      const factory = mod[factoryName(doc.name)];
      expect(factory, `expected export ${factoryName(doc.name)}`).toBeTypeOf("function");

      const result = synth(factory!(), { includeMeta: false });
      const expected = { ...doc };
      delete expected.meta;
      expect(canonicalize(result)).toEqual(canonicalize(expected));
    });

    it(`${name}: codegen twice is byte-identical`, () => {
      const doc = readDoc(name);
      expect(codegen(doc)).toBe(codegen(doc));
    });

    it(`${name}: output is a Prettier fixed point`, async () => {
      const prettier = await import("prettier");
      const config = JSON.parse(readFileSync(join(ROOT, ".prettierrc"), "utf8")) as Record<
        string,
        unknown
      >;
      const source = codegen(readDoc(name));
      const formatted = await prettier.format(source, { ...config, parser: "typescript" });
      expect(formatted).toBe(source);
    });
  }

  it("roundtrip output passes the repo ESLint untouched", async () => {
    const { loadESLint } = await import("eslint");
    const ESLint = await loadESLint();
    const eslint = new ESLint({ cwd: ROOT });
    for (const name of cases) {
      const source = codegen(readDoc(name));
      const results = await eslint.lintText(source, {
        // A plausible on-disk location; not ignored by eslint.config.js.
        filePath: join(ROOT, "packages", "core", "src", "__generated__", `${name}.ts`),
      });
      const messages = results.flatMap((r) => r.messages);
      expect(messages, `${name}: ${JSON.stringify(messages, null, 2)}`).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Hardening added after adversarial review of the first implementation.
// ---------------------------------------------------------------------------

describe("generated code actually compiles", () => {
  // The ESLint gate proved weaker than it looks: with no-undef off (normal for
  // typescript-eslint configs), code missing an import lints clean. The first
  // implementation shipped exactly that bug in the Compare inverter, so the
  // acceptance test now includes the type checker itself.
  it("passes tsc --noEmit for every fixture's generated module", async () => {
    const ts = await import("typescript");
    // Self-contained: the acceptance suite cleans __generated__ when it ends,
    // so this test generates its own copies in a sibling dir.
    const tscDir = join(GEN_DIR, "..", "__generated__tsc__");
    rmSync(tscDir, { recursive: true, force: true });
    mkdirSync(tscDir, { recursive: true });
    const files = cases.map((name) => {
      const doc = JSON.parse(
        readFileSync(join(CASES_DIR, name, "doc.flowdoc.json"), "utf8"),
      ) as FlowDoc;
      const file = join(tscDir, `${name}.ts`);
      writeFileSync(file, codegen(doc, { moduleSpecifier: "../index.js" }), "utf8");
      return file;
    });
    expect(files.length).toBeGreaterThan(0);
    const program = ts.createProgram(files, {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      allowImportingTsExtensions: false,
      skipLibCheck: true,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => ({
      file: d.file?.fileName,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    }));
    rmSync(tscDir, { recursive: true, force: true });
    expect(diagnostics).toEqual([]);
    // Building one TypeScript program over every fixture takes about five
    // seconds on its own, which is the default per-test timeout, so under a
    // full parallel `npm test` this failed on the clock rather than on a
    // diagnostic. The budget is the timeout, not the assertion.
  }, 60_000);
});

describe("regression: adversarial review findings", () => {
  it("emits the jsonPath import when Compare is the only user (compare-only fixture)", () => {
    const doc = JSON.parse(
      readFileSync(join(CASES_DIR, "compare-only", "doc.flowdoc.json"), "utf8"),
    ) as FlowDoc;
    const source = codegen(doc);
    expect(source).toContain("jsonPath(");
    // The import may print multiline; check the whole preamble before the export.
    const preamble = source.slice(0, source.indexOf("export function"));
    expect(preamble).toContain("jsonPath");
  });

  it("renames a factory that would collide with an import", () => {
    expect(factoryName("json-path", new Set(["jsonPath", "Flow"]))).toBe("flowJsonPath");
    // And end to end: a flow literally named json-path using a JSONPath value.
    const doc = JSON.parse(
      readFileSync(join(CASES_DIR, "compare-only", "doc.flowdoc.json"), "utf8"),
    ) as FlowDoc;
    const renamed = { ...doc, name: "json-path" };
    const source = codegen(renamed);
    expect(source).toContain("export function flowJsonPath(): Flow {");
    expect(source).not.toContain("export function jsonPath");
  });

  it("escapes lone surrogates so file round-trips survive utf8", () => {
    const doc = JSON.parse(
      readFileSync(join(CASES_DIR, "appointment-line", "doc.flowdoc.json"), "utf8"),
    ) as FlowDoc;
    const action = doc.content.Actions.find((a) => a.Type === "MessageParticipant")!;
    action.Parameters.Text = "a\ud800b";
    const source = codegen(doc);
    expect(source).toContain("\\ud800");
    expect(source).not.toContain("\ud800");
  });
});

describe("byte stability across the full loop", () => {
  it("codegen(synth(appointmentLine())) equals codegen(demo doc) byte for byte", async () => {
    const { appointmentLine } = await import("./__fixtures__/appointment-line.js");
    const demo = JSON.parse(
      readFileSync(join(CASES_DIR, "appointment-line", "doc.flowdoc.json"), "utf8"),
    ) as FlowDoc;
    expect(codegen(synth(appointmentLine(), { includeMeta: false }))).toBe(codegen(demo));
  });
});
