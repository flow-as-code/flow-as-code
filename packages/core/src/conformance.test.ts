/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync, readdirSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

// The conformance directory is the cross-language contract (conformance/README.md).
// These assertions are what a future Go provider must also satisfy.
const root = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

const schema = JSON.parse(read("conformance/schema/flowdoc-0.1.schema.json"));
const demoRaw = read("conformance/demo/appointment-line.flowdoc.json");
const demo = JSON.parse(demoRaw);

interface Action {
  Identifier: string;
  Type: string;
  Parameters: Record<string, unknown>;
  Transitions: {
    NextAction?: string;
    Errors?: { ErrorType: string; NextAction: string }[];
    Conditions?: { NextAction: string }[];
  };
}

const actions: Action[] = demo.content.Actions;
const ids = new Set(actions.map((a) => a.Identifier));

// Every Identifier referenced by any transition, from anywhere in the document.
function targets(a: Action): string[] {
  const t = a.Transitions;
  return [
    ...(t.NextAction ? [t.NextAction] : []),
    ...(t.Errors ?? []).map((e) => e.NextAction),
    ...(t.Conditions ?? []).map((c) => c.NextAction),
  ];
}

describe("FlowDoc schema", () => {
  it("validates the demo flow", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(demo);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe("demo flow invariants", () => {
  it("contains no literal ARN", () => {
    expect(demoRaw).not.toContain("arn:aws:");
  });

  it("resolves StartAction and every transition target", () => {
    expect(ids).toContain(demo.content.StartAction);
    for (const a of actions) {
      for (const t of targets(a)) {
        expect(ids, `${a.Identifier} points at unknown action ${t}`).toContain(t);
      }
    }
  });

  it("has a refs index matching every token in content", () => {
    const found = [...new Set(demoRaw.match(/\$\{cdref:[^}]+\}/g) ?? [])].sort();
    const indexed = demo.refs.map((r: { token: string }) => r.token).sort();
    expect(indexed).toEqual(found);
  });

  it("keeps layout out of content and covers every action", () => {
    expect(demo.content).not.toHaveProperty("Metadata");
    expect(Object.keys(demo.layout).sort()).toEqual([...ids].sort());
  });

  // conformance/flow-language/actions.md, CheckHoursOfOperation.
  it("gives CheckHoursOfOperation exactly the True and False conditions", () => {
    const check = actions.find((a) => a.Type === "CheckHoursOfOperation");
    expect(check).toBeDefined();
    const operands = (check!.Transitions.Conditions ?? []).map(
      (c) => (c as unknown as { Condition: { Operands: string[] } }).Condition.Operands[0],
    );
    expect(operands.sort()).toEqual(["False", "True"]);
  });

  // Terminal actions use an empty Transitions object.
  it("terminates only on documented terminal types", () => {
    const terminal = actions.filter((a) => Object.keys(a.Transitions).length === 0);
    expect(terminal.map((a) => a.Type)).toEqual(["DisconnectParticipant"]);
  });

  // GenericBlock passthrough is what makes a small modeled set survivable,
  // so the canonical fixture must always exercise it.
  it("includes an unmodeled action for GenericBlock passthrough", () => {
    expect(actions.map((a) => a.Type)).toContain("UpdateFlowLoggingBehavior");
  });
});

// A schema that only ever accepts is worth nothing. These are the rules from
// conformance/flow-language/actions.md that the schema is expected to enforce
// structurally; the rest are lint's job.
describe("FlowDoc schema rejections", () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const clone = (): typeof demo => JSON.parse(demoRaw);
  const at = (d: typeof demo, id: string): Action =>
    d.content.Actions.find((a: Action) => a.Identifier === id);

  const mutate = (id: string, f: (a: Action) => void) => {
    const d = clone();
    f(at(d, id));
    return d;
  };

  it.each([
    [
      "a literal ARN in a queue reference",
      mutate("set-working-queue", (a) => {
        a.Parameters.QueueId = "arn:aws:connect:us-east-1:111122223333:instance/a/queue/b";
      }),
    ],
    [
      "a literal ARN in a lambda reference",
      mutate("look-up-appointment", (a) => {
        a.Parameters.LambdaFunctionARN = "arn:aws:lambda:us-east-1:111122223333:function:f";
      }),
    ],
    [
      "a token interpolated into a longer string",
      mutate("set-working-queue", (a) => {
        a.Parameters.QueueId = "prefix-${cdref:queue:appointments}";
      }),
    ],
    [
      "QueueId and AgentId set together",
      mutate("set-working-queue", (a) => {
        a.Parameters.AgentId = "${cdref:queue:overflow}";
      }),
    ],
    [
      "MessageParticipant with both Text and SSML",
      mutate("welcome", (a) => {
        a.Parameters.SSML = "<speak>hi</speak>";
      }),
    ],
    [
      "a Lambda timeout above the documented maximum of 8",
      mutate("look-up-appointment", (a) => {
        a.Parameters.InvocationTimeLimitSeconds = 30;
      }),
    ],
    [
      "an Identifier containing a character Connect reserves",
      mutate("welcome", (a) => {
        a.Identifier = "bad/id";
      }),
    ],
  ])("rejects %s", (_label, doc) => {
    expect(validate(doc)).toBe(false);
  });

  it("still accepts a single JSONPath identifier in a reference field", () => {
    const doc = mutate("set-working-queue", (a) => {
      a.Parameters.QueueId = "$.Attributes.queueId";
    });
    expect(validate(doc)).toBe(true);
  });
});

// GetParticipantInput's structural rules, from the same reference. The demo
// flow has no menu, so the dtmf-menu round-trip fixture is the subject.
describe("FlowDoc schema rejections: GetParticipantInput", () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const menuRaw = read("conformance/roundtrip/dtmf-menu/doc.flowdoc.json");
  const mutate = (f: (a: Action) => void) => {
    const d = JSON.parse(menuRaw);
    f(d.content.Actions.find((a: Action) => a.Identifier === "menu"));
    return d;
  };

  it.each([
    [
      "StoreInput that is neither True nor False",
      mutate((a) => {
        a.Parameters.StoreInput = "Maybe";
      }),
    ],
    [
      "a timeout of zero, as a string",
      mutate((a) => {
        a.Parameters.InputTimeLimitSeconds = "0";
      }),
    ],
    [
      "a timeout of zero, as an integer",
      mutate((a) => {
        a.Parameters.InputTimeLimitSeconds = 0;
      }),
    ],
    [
      "a timeout with a leading zero",
      mutate((a) => {
        a.Parameters.InputTimeLimitSeconds = "05";
      }),
    ],
    [
      "a fractional timeout",
      mutate((a) => {
        a.Parameters.InputTimeLimitSeconds = 2.5;
      }),
    ],
    [
      "Text and SSML together",
      mutate((a) => {
        a.Parameters.SSML = "<speak>hi</speak>";
      }),
    ],
    [
      "Text and PromptId together",
      mutate((a) => {
        a.Parameters.PromptId = "${cdref:prompt:p}";
      }),
    ],
    [
      "a literal ARN in PromptId",
      mutate((a) => {
        delete a.Parameters.Text;
        a.Parameters.PromptId = "arn:aws:connect:us-east-1:111122223333:instance/a/prompt/b";
      }),
    ],
  ])("rejects %s", (_label, doc) => {
    expect(validate(doc)).toBe(false);
  });

  it.each([
    [
      "an integer timeout, which Connect's own exports may carry",
      mutate((a) => {
        a.Parameters.InputTimeLimitSeconds = 5;
      }),
    ],
    [
      "no StoreInput, which the action page makes optional",
      mutate((a) => {
        delete a.Parameters.StoreInput;
      }),
    ],
    [
      "a JSONPath identifier in PromptId",
      mutate((a) => {
        delete a.Parameters.Text;
        a.Parameters.PromptId = "$.Attributes.menuPrompt";
      }),
    ],
    [
      "no prompt at all",
      mutate((a) => {
        delete a.Parameters.Text;
      }),
    ],
  ])("still accepts %s", (_label, doc) => {
    expect(validate(doc)).toBe(true);
  });
});

// Every FlowDoc fixture under conformance/ must validate against the schema,
// so a suite cannot pass on a document that is malformed in a way the schema
// would have caught. Scope: *.flowdoc.json anywhere, plus lint pass-*.json.
// Lint fail-*.json fixtures are deliberately defective documents (that is
// what they test) and auxiliary files (maps, binders, goldens) are not
// FlowDocs, so neither is swept.
describe("all conformance fixtures are schema-valid", () => {
  const collect = (dir: string): string[] =>
    readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? collect(`${dir}${e.name}/`)
        : e.name.endsWith(".flowdoc.json") || e.name.startsWith("pass-")
          ? [`${dir}${e.name}`]
          : [],
    );
  const files = collect("conformance/").filter((f) => !f.includes("/schema/"));

  it("finds a non-trivial number of fixtures", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files)("%s", (file) => {
    const parsed = JSON.parse(read(file)) as {
      doc?: unknown;
      docs?: unknown[];
      flowdoc?: string;
    };
    const docs =
      parsed.docs ??
      (parsed.doc !== undefined ? [parsed.doc] : parsed.flowdoc !== undefined ? [parsed] : []);
    expect(docs.length).toBeGreaterThan(0);
    const validator = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    for (const doc of docs) {
      expect(validator(doc), JSON.stringify(validator.errors)).toBe(true);
    }
  });
});

// kind and connectType are not independent. A document with kind "module" and
// connectType "CONTACT_FLOW" is not something Connect can represent, but the
// schema accepted it, and it reached the studio as a loadable document that its
// demotion oracle could not analyse.
describe("kind and connectType agree", () => {
  const validator = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const base = JSON.parse(read("conformance/demo/appointment-line.flowdoc.json"));
  const moduleDoc = JSON.parse(read("conformance/roundtrip/after-call-survey/doc.flowdoc.json"));

  it("accepts a flow with a non-module connectType", () => {
    expect(validator({ ...base, kind: "flow", connectType: "CONTACT_FLOW" })).toBe(true);
  });

  it("accepts a module with connectType MODULE", () => {
    expect(validator(moduleDoc)).toBe(true);
  });

  it("rejects a module whose connectType is not MODULE", () => {
    expect(validator({ ...base, kind: "module", connectType: "CONTACT_FLOW" })).toBe(false);
  });

  it("rejects a flow whose connectType is MODULE", () => {
    expect(validator({ ...base, kind: "flow", connectType: "MODULE" })).toBe(false);
  });
});
