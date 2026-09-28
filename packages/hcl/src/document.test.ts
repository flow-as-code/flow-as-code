/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The document layer against conformance/hcl (README.md rules 24 to 26):
// every roundtrip golden is what fromFlowDoc writes and reads back to its
// document and bindings; every parse input reads to its document and
// sidecar; every refuse input raises its code at its path; and every
// regenerate case writes its expected file from the previous one.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { autoLayout, collectRefs, serialize, type FlowDoc } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "./contract.js";
import { HclError } from "./errors.js";
import { format } from "./format.js";
import { toFlowDoc } from "./read.js";
import { fromFlowDoc } from "./write.js";

const HCL = join(import.meta.dirname, "..", "..", "..", "conformance", "hcl");
const read = (...p: string[]): string => readFileSync(join(...p), "utf8");
const json = <T>(...p: string[]): T => JSON.parse(read(...p)) as T;
const cases = (family: string): string[] =>
  readdirSync(join(HCL, family), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

interface RoundtripCase {
  doc: string;
  options?: { instanceId?: string; tags?: Record<string, string>; lintDisable?: string[] };
}

/** A document without meta, in canonical bytes: what the invariant compares. */
function bytes(doc: FlowDoc): string {
  const { meta: _meta, ...rest } = doc;
  return serialize(rest as FlowDoc);
}

describe("conformance/hcl/roundtrip", () => {
  for (const name of cases("roundtrip")) {
    const dir = join(HCL, "roundtrip", name);
    const spec = json<RoundtripCase>(dir, "case.json");
    const doc = json<FlowDoc>(dir, spec.doc);
    const bindings = json<Record<string, string>>(dir, "bindings.json");
    const expected = read(dir, "expected.flow.tf");
    const options = {
      bindings,
      fileName: basename(spec.doc),
      ...(spec.options?.instanceId === undefined ? {} : { instanceId: spec.options.instanceId }),
      ...(spec.options?.tags === undefined ? {} : { tags: spec.options.tags }),
      ...(spec.options?.lintDisable === undefined ? {} : { lintDisable: spec.options.lintDisable }),
    };

    it(`${name}: fromFlowDoc writes the golden byte for byte, twice`, () => {
      expect(fromFlowDoc(doc, options)).toBe(expected);
      expect(fromFlowDoc(doc, { ...options, previous: expected })).toBe(expected);
    });

    it(`${name}: toFlowDoc reads the golden to the document and its bindings`, () => {
      const { doc: got, sidecar, warnings } = toFlowDoc(expected, { fileName: `${name}.flow.tf` });
      expect(bytes(got)).toBe(bytes(doc));
      const refs = Object.fromEntries(
        (doc.refs ?? []).map((r) => {
          const key = `${r.type}:${r.name}${r.alias === undefined ? "" : `@${r.alias}`}`;
          return [key, bindings[key] ?? null];
        }),
      );
      expect(sidecar.refs).toEqual(refs);
      expect(sidecar.instanceId).toBe(spec.options?.instanceId ?? "var.connect_instance_id");
      expect(sidecar.tags).toEqual(spec.options?.tags ?? {});
      expect(sidecar.lint).toEqual(spec.options?.lintDisable ?? []);
      expect(sidecar.normalized).toEqual([]);
      expect(warnings).toEqual([]);
    });
  }
});

describe("conformance/hcl/parse", () => {
  for (const name of cases("parse")) {
    const dir = join(HCL, "parse", name);
    it(`${name}: reads to the expected document and sidecar`, () => {
      const { doc, sidecar } = toFlowDoc(read(dir, "input.flow.tf"), { fileName: "input.flow.tf" });
      expect(bytes(doc)).toBe(bytes(json<FlowDoc>(dir, "expected.flowdoc.json")));
      expect(sidecar).toEqual(json(dir, "expected.sidecar.json"));
    });
  }
});

describe("conformance/hcl/refuse", () => {
  const names = cases("refuse");

  it("has a case for every error code", () => {
    const codes = new Set(
      names.map((n) => json<{ code: string }>(HCL, "refuse", n, "expected-error.json").code),
    );
    expect([...codes].sort()).toEqual([...ERROR_CODES].sort());
  });

  for (const name of names) {
    const dir = join(HCL, "refuse", name);
    it(`${name}: refused with its code at its path`, () => {
      const want = json<{ code: string; path?: string; messageIncludes?: string }>(
        dir,
        "expected-error.json",
      );
      let error: unknown;
      try {
        toFlowDoc(read(dir, "input.flow.tf"), { fileName: "input.flow.tf" });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(HclError);
      const e = error as HclError;
      expect({ code: e.code, path: e.path }).toEqual({ code: want.code, path: want.path });
      expect(e.message.startsWith("input.flow.tf:")).toBe(true);
      if (want.messageIncludes !== undefined) expect(e.message).toContain(want.messageIncludes);
    });
  }
});

describe("conformance/hcl/regenerate", () => {
  for (const name of cases("regenerate")) {
    const dir = join(HCL, "regenerate", name);
    it(`${name}: writes the expected companion from the previous one, idempotently`, () => {
      const doc = json<FlowDoc>(dir, "doc.flowdoc.json");
      const expected = read(dir, "expected.flow.tf");
      const fileName = "doc.flowdoc.json";
      expect(fromFlowDoc(doc, { previous: read(dir, "previous.flow.tf"), fileName })).toBe(
        expected,
      );
      expect(fromFlowDoc(doc, { previous: expected, fileName })).toBe(expected);
      expect(existsSync(join(dir, "case.json"))).toBe(true);
    });
  }
});

/** Every FlowDoc 0.2 under conformance/ and examples/, whatever family holds it. */
function allDocs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name === "dist") return [];
    const p = join(dir, e.name);
    if (e.isDirectory()) return allDocs(p);
    if (!e.name.endsWith(".json")) return [];
    try {
      const v = JSON.parse(readFileSync(p, "utf8")) as { flowdoc?: unknown; content?: unknown };
      return v.flowdoc === "0.2" && typeof v.content === "object" ? [p] : [];
    } catch {
      return [];
    }
  });
}

describe("the round-trip rule over every committed document", () => {
  const ROOT = join(HCL, "..", "..");
  const docs = [...allDocs(join(ROOT, "conformance")), ...allDocs(join(ROOT, "examples"))];

  it("finds them", () => {
    expect(docs.length).toBeGreaterThan(40);
  });

  it.each(docs.map((p) => [p.slice(ROOT.length + 1)]))("%s", (path) => {
    const doc = JSON.parse(read(ROOT, path)) as FlowDoc;
    const tf = fromFlowDoc(doc);
    expect(format(tf)).toBe(tf);
    expect(bytes(toFlowDoc(tf).doc)).toBe(bytes(viewed(doc)));
    expect(fromFlowDoc(doc, { previous: tf })).toBe(tf);
  });
});

/**
 * What any view of a document holds (conformance/hcl/README.md rule 26): the
 * synth normal form, which derives refs, gives a module its Settings and
 * lays out every action, less content.Metadata, which no view authors, with
 * positions rounded to the integers the canvas and the provider use.
 */
function viewed(doc: FlowDoc): FlowDoc {
  const { Metadata: _metadata, ...content } = doc.content;
  if (doc.kind === "module") content.Settings ??= {};
  const auto = autoLayout(content.Actions, content.StartAction);
  const layout = Object.fromEntries(
    content.Actions.map((a) => {
      const p = doc.layout?.[a.Identifier] ?? auto[a.Identifier]!;
      return [a.Identifier, { x: Math.round(p.x), y: Math.round(p.y) }];
    }),
  );
  return { ...doc, content, layout, refs: collectRefs(content) };
}

describe("the writer's rounding", () => {
  it("writes a fractional position as the nearest integer", () => {
    const doc = json<FlowDoc>(HCL, "..", "layout", "single", "doc.flowdoc.json");
    const id = doc.content.Actions[0]!.Identifier;
    const tf = fromFlowDoc({ ...doc, layout: { [id]: { x: 466.82, y: 26.45 } } });
    expect(tf).toContain("      x = 467\n      y = 26\n");
  });
});

describe("the reader", () => {
  const resource = (action: string, refs = ""): string =>
    `resource "flowascode_contact_flow" "r" {
  instance_id = var.connect_instance_id
  name        = "r"
  type        = "CONTACT_FLOW"
${refs}
  action {
    id   = "check"
    next = "end"
${action}
  }

  action {
    id = "end"
    disconnect_participant {}
  }
}
`;

  it("reads a modeled type written as generic to the action the typed block gives (rule 10)", () => {
    const typed = toFlowDoc(
      resource(`    check_hours_of_operation {
      hours_of_operation_id = "hours:main-line"
    }`),
    ).doc;
    const generic = toFlowDoc(
      resource(`    generic {
      type = "CheckHoursOfOperation"
      parameters = jsonencode({
        HoursOfOperationId = "$\${cdref:hours:main-line}"
      })
    }`),
    ).doc;
    expect(typed.content.Actions[0]!.Parameters).toEqual({
      HoursOfOperationId: "${cdref:hours:main-line}",
    });
    expect(bytes(generic)).toBe(bytes(typed));
  });

  it("warns on a refs key no action references, and keeps its binding (rule 22)", () => {
    const { sidecar, warnings } = toFlowDoc(
      resource(
        `    check_hours_of_operation {
      hours_of_operation_id = "hours:main-line"
    }`,
        `
  refs = {
    "hours:main-line" = aws_connect_hours_of_operation.main_line.arn
    "queue:gone"      = aws_connect_queue.gone.arn
  }
`,
      ),
    );
    expect(warnings).toEqual([
      'refs["queue:gone"] is referenced by no action; the next regeneration drops it.',
    ]);
    expect(sidecar.refs["queue:gone"]).toBe("aws_connect_queue.gone.arn");
  });
});
