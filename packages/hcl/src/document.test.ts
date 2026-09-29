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
import type { FlowDoc } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { bytes, viewed } from "./__fixtures__/view.js";
import { ERROR_CODES } from "./contract.js";
import { HclError } from "./errors.js";
import { format } from "./format.js";
import { toFlowDoc } from "./read.js";
import { byteOrder, fromFlowDoc } from "./write.js";

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

describe("a number or bool where the provider takes a string", () => {
  const flow = (param: string) =>
    [
      'resource "flowascode_contact_flow" "f" {',
      "  instance_id = var.connect_instance_id",
      '  name        = "f"',
      '  type        = "CONTACT_FLOW"',
      "  action {",
      '    id = "say"',
      '    next = "bye"',
      `    message_participant { ${param} }`,
      "    error {",
      '      type = "NoMatchingError"',
      '      next = "bye"',
      "    }",
      "  }",
      "  action {",
      '    id = "bye"',
      "    disconnect_participant {}",
      "  }",
      "}",
      "",
    ].join("\n");
  const refusal = (param: string): unknown => {
    try {
      toFlowDoc(flow(param), { fileName: "f.flow.tf" });
    } catch (error) {
      return (error as { code?: string }).code;
    }
    return undefined;
  };

  it("refuses a number whose string Terraform would write differently", () => {
    expect(refusal("text = 12345678901234567890")).toBe("NON_LITERAL_VALUE");
    expect(refusal("text = 1e21")).toBe("NON_LITERAL_VALUE");
  });

  it("refuses an object or a tuple, as Terraform does", () => {
    expect(refusal("text = { a = 1 }")).toBe("NON_LITERAL_VALUE");
    expect(refusal('text = ["a"]')).toBe("NON_LITERAL_VALUE");
  });
});

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

describe("writer edge cases the review found", () => {
  /** A one-action flow ending in a disconnect, for one action under test. */
  const flowWith = (type: string, parameters: Record<string, unknown>): FlowDoc =>
    ({
      flowdoc: "0.2",
      kind: "flow",
      name: "edge",
      connectType: "CONTACT_FLOW",
      content: {
        Version: "2019-10-30",
        StartAction: "act",
        Actions: [
          {
            Identifier: "act",
            Type: type,
            Parameters: parameters,
            Transitions: {
              NextAction: "end",
              Errors: [{ ErrorType: "NoMatchingError", NextAction: "end" }],
              Conditions: [],
            },
          },
          { Identifier: "end", Type: "DisconnectParticipant", Parameters: {}, Transitions: {} },
        ],
      },
    }) as FlowDoc;
  const roundTrips = (doc: FlowDoc): string => {
    const tf = fromFlowDoc(doc);
    expect(format(tf)).toBe(tf);
    expect(bytes(toFlowDoc(tf).doc)).toBe(bytes(viewed(doc)));
    return tf;
  };

  it("writes a json-kind value that is not an object through generic, faithfully", () => {
    const tf = roundTrips(
      flowWith("ShowView", {
        ViewResource: { Id: "${cdref:view:form@1}" },
        InvocationTimeLimitSeconds: "30",
        ViewData: "not an object",
      }),
    );
    expect(tf).toContain("generic {");
  });

  it("quotes a key HCL would read as a keyword", () => {
    const tf = roundTrips(
      flowWith("UpdateContactAttributes", {
        Attributes: { for: "x", in: "y", plain: "z" },
        TargetContact: "Current",
      }),
    );
    expect(tf).toContain('"for" = "x"');
    expect(tf).toContain('"in"  = "y"');
  });

  it("keeps an integerString a number cannot hold exactly as a string", () => {
    const tf = roundTrips(
      flowWith("UpdateContactRoutingBehavior", {
        QueuePriority: "9007199254740993",
        QueueTimeAdjustmentSeconds: "-0",
      }),
    );
    expect(tf).toContain('queue_priority                = "9007199254740993"');
    expect(tf).toContain('queue_time_adjustment_seconds = "-0"');
  });

  it("writes an integer parameter holding a JSONPath through generic, and refuses one typed", () => {
    const doc = flowWith("InvokeLambdaFunction", {
      LambdaFunctionARN: "${cdref:lambda:lookup}",
      InvocationTimeLimitSeconds: "$.Attributes.timeout",
      InvocationType: "SYNCHRONOUS",
    });
    const tf = roundTrips(doc);
    expect(tf).toContain('type = "InvokeLambdaFunction"');
    const typed = fromFlowDoc(
      flowWith("InvokeLambdaFunction", {
        LambdaFunctionARN: "${cdref:lambda:lookup}",
        InvocationTimeLimitSeconds: 8,
        InvocationType: "SYNCHRONOUS",
      }),
    );
    expect(typed).toContain("invocation_time_limit_seconds = 8");
    const wrong = typed.replace(
      "invocation_time_limit_seconds = 8",
      'invocation_time_limit_seconds = "$.Attributes.timeout"',
    );
    expect(() => toFlowDoc(wrong)).toThrow(/NON_LITERAL_VALUE: .*must be a number/);
  });

  it("writes a reference field holding neither a token of its type nor a JSONPath through generic", () => {
    const tf = roundTrips(flowWith("UpdateContactTargetQueue", { QueueId: "front-desk" }));
    expect(tf).toContain('type = "UpdateContactTargetQueue"');
    roundTrips(flowWith("UpdateContactTargetQueue", { QueueId: "${cdref:lambda:front-desk}" }));
  });

  it("orders keys by code point, which is UTF-8 byte order", () => {
    expect(["｡", "\u{1F600}", "a"].sort(byteOrder)).toEqual(["a", "｡", "\u{1F600}"]);
    const tf = roundTrips(
      flowWith("UpdateContactAttributes", {
        Attributes: { "\u{1F600}": "astral", "｡": "bmp" },
        TargetContact: "Current",
      }),
    );
    expect(tf.indexOf("｡")).toBeLessThan(tf.indexOf("\u{1F600}"));
  });
});

describe("reader shapes the review found", () => {
  const golden = read(HCL, "roundtrip", "recording-analytics", "expected.flow.tf");

  it("reads a parenthesized object as the object", () => {
    const wrapped = golden.replace(/(voice_behavior\s*=\s*)\{([\s\S]*?\n {6}\})/, "$1({$2)");
    expect(wrapped).not.toBe(golden);
    expect(bytes(toFlowDoc(wrapped).doc)).toBe(bytes(toFlowDoc(golden).doc));
  });

  it("refuses an object parameter written as a literal of another type", () => {
    const wrong = golden.replace(/(voice_behavior\s*=\s*)\{[\s\S]*?\n {6}\}/, '$1"S3"');
    expect(wrong).not.toBe(golden);
    expect(() => toFlowDoc(wrong)).toThrow(
      /NON_LITERAL_VALUE: .*voice_behavior must be an object literal/,
    );
  });
});
