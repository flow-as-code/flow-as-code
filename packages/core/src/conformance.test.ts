/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync, readdirSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { migrateFlowDoc, serialize } from "./index.js";

// The conformance directory is the cross-language contract (conformance/README.md).
// These assertions are what a future Go provider must also satisfy.
const root = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

const schema = JSON.parse(read("conformance/schema/flowdoc-0.2.schema.json"));
const schema01 = JSON.parse(read("conformance/schema/flowdoc-0.1.schema.json"));
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

// The contact-routing round-trip fixture is the subject for the bounds the
// schema holds on the callback and routing actions.
describe("FlowDoc schema rejections: contact routing", () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const raw = read("conformance/roundtrip/contact-routing/doc.flowdoc.json");
  const at = (d: FlowDoc, id: string): Action =>
    d.content.Actions.find((a) => a.Identifier === id) as unknown as Action;
  const mutate = (id: string, f: (a: Action) => void): FlowDoc => {
    const d = JSON.parse(raw) as FlowDoc;
    f(at(d, id));
    return d;
  };

  it("accepts the fixture as committed", () => {
    expect(validate(JSON.parse(raw))).toBe(true);
  });

  it.each([
    [
      "a callback delay written as a JSON number, which the console never writes",
      mutate("offer-callback", (a) => {
        a.Parameters.InitialCallDelaySeconds = 60;
      }),
    ],
    [
      "zero connection attempts",
      mutate("offer-callback", (a) => {
        a.Parameters.MaximumConnectionAttempts = "0";
      }),
    ],
    [
      "a retry delay with a leading zero",
      mutate("offer-callback", (a) => {
        a.Parameters.RetryDelaySeconds = "0600";
      }),
    ],
    [
      "a callback with both a queue and an agent queue",
      mutate("offer-callback", (a) => {
        a.Parameters.AgentId = "${cdref:queue:agents}";
      }),
    ],
    [
      "a literal ARN as the callback flow",
      mutate("offer-callback", (a) => {
        a.Parameters.ContactFlowId =
          "arn:aws:connect:us-east-1:111122223333:instance/a/contact-flow/b";
      }),
    ],
    [
      "a queue priority of zero",
      mutate("bump-priority", (a) => {
        a.Parameters.QueuePriority = "0";
      }),
    ],
    [
      "a queue priority written as a JSON number",
      mutate("bump-priority", (a) => {
        a.Parameters.QueuePriority = 1;
      }),
    ],
    [
      "a static callback number",
      mutate("set-callback-number", (a) => {
        a.Parameters.CallbackNumber = "+15555550100";
      }),
    ],
    [
      "a priority and a time adjustment together",
      mutate("bump-priority", (a) => {
        a.Parameters.QueueTimeAdjustmentSeconds = "30";
      }),
    ],
    [
      "a queue-to-queue transfer naming both a queue and an agent queue",
      mutate("move-to-priority-queue", (a) => {
        a.Parameters.AgentId = "${cdref:queue:agents}";
      }),
    ],
  ])("rejects %s", (_label, doc) => {
    expect(validate(doc)).toBe(false);
  });
});

describe("FlowDoc schema rejections: flow control", () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const raw = read("conformance/roundtrip/flow-control/doc.flowdoc.json");
  const at = (d: FlowDoc, id: string): Action =>
    d.content.Actions.find((a) => a.Identifier === id) as unknown as Action;
  const mutate = (id: string, f: (a: Action) => void): FlowDoc => {
    const d = JSON.parse(raw) as FlowDoc;
    f(at(d, id));
    return d;
  };

  it("accepts the fixture as committed", () => {
    expect(validate(JSON.parse(raw))).toBe(true);
  });

  it.each([
    [
      "a loop count above 100",
      mutate("again", (a) => {
        a.Parameters.LoopCount = 101;
      }),
    ],
    [
      "a loop count spelled as a string",
      mutate("again", (a) => {
        a.Parameters.LoopCount = "2";
      }),
    ],
    [
      "a wait of zero seconds",
      mutate("wait-for-customer", (a) => {
        a.Parameters.TimeLimitSeconds = "0";
      }),
    ],
    [
      "a wait written as a JSON number, which the console never writes",
      mutate("wait-for-customer", (a) => {
        a.Parameters.TimeLimitSeconds = 300;
      }),
    ],
    [
      "a wait event the page does not list",
      mutate("wait-for-customer", (a) => {
        a.Parameters.Events = ["CustomerReturned", "LambdaReturned"];
      }),
    ],
    [
      "a wait event listed twice",
      mutate("wait-for-customer", (a) => {
        a.Parameters.Events = ["CustomerReturned", "CustomerReturned"];
      }),
    ],
    [
      "a metric the page does not list",
      mutate("staffed", (a) => {
        a.Parameters.MetricType = "NumberOfAgentsHappy";
      }),
    ],
    [
      "a metric check naming both a queue and an agent queue",
      mutate("queue-depth", (a) => {
        a.Parameters.AgentId = "${cdref:queue:agents}";
      }),
    ],
    [
      "a metric load for a channel the page does not list",
      mutate("load-metrics", (a) => {
        a.Parameters.QueueChannel = "Email";
      }),
    ],
    [
      "a metric load naming both a queue and an agent queue",
      mutate("load-metrics", (a) => {
        a.Parameters.AgentId = "${cdref:queue:agents}";
      }),
    ],
  ])("rejects %s", (_label, doc) => {
    expect(validate(doc)).toBe(false);
  });

  it("still accepts a JSONPath loop count and wait timeout", () => {
    const doc = mutate("wait-for-customer", (a) => {
      a.Parameters.TimeLimitSeconds = "$.Attributes.holdSeconds";
    });
    expect(validate(doc)).toBe(true);
  });
});

describe("FlowDoc schema rejections: contact data", () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const raw = read("conformance/roundtrip/contact-data/doc.flowdoc.json");
  const at = (d: FlowDoc, id: string): Action =>
    d.content.Actions.find((a) => a.Identifier === id) as unknown as Action;
  const mutate = (id: string, f: (a: Action) => void): FlowDoc => {
    const d = JSON.parse(raw) as FlowDoc;
    f(at(d, id));
    return d;
  };

  it("accepts the fixture as committed", () => {
    expect(validate(JSON.parse(raw))).toBe(true);
  });

  it.each([
    [
      "seven tags",
      mutate("tag", (a) => {
        a.Parameters.Tags = Object.fromEntries("abcdefg".split("").map((k) => [k, k]));
      }),
    ],
    [
      "a system tag key",
      mutate("tag", (a) => {
        a.Parameters.Tags = { "aws:connect:instanceId": "x" };
      }),
    ],
    [
      "a non-string tag value",
      mutate("tag", (a) => {
        a.Parameters.Tags = { count: 1 };
      }),
    ],
    [
      "removing a system tag",
      mutate("untag", (a) => {
        a.Parameters.TagKeys = ["aws:connect:instanceId"];
      }),
    ],
    [
      "a text-to-speech engine the pages do not list",
      mutate("set-voice", (a) => {
        a.Parameters.TextToSpeechEngine = "premium";
      }),
    ],
    [
      "an empty voice name",
      mutate("set-voice", (a) => {
        a.Parameters.TextToSpeechVoice = "";
      }),
    ],
    [
      "a voice authentication threshold above 100",
      mutate("set-data", (a) => {
        a.Parameters.VoiceAuthenticationThreshold = "101";
      }),
    ],
    [
      "a response time below 5 seconds",
      mutate("set-data", (a) => {
        a.Parameters.VoiceAuthenticationResponseTime = "4";
      }),
    ],
    [
      "a lowercase Voice ID flag",
      mutate("set-data", (a) => {
        a.Parameters.IsVoiceAuthenticationEnabled = "true";
      }),
    ],
    [
      "a target the page does not list",
      mutate("set-data", (a) => {
        a.Parameters.TargetContact = "Flow";
      }),
    ],
    [
      "two event hooks in one action",
      mutate("set-queue-flow", (a) => {
        a.Parameters.EventHooks = {
          CustomerQueue: "${cdref:flow:a}",
          CustomerHold: "${cdref:flow:b}",
        };
      }),
    ],
    [
      "an event hook the page does not list",
      mutate("set-queue-flow", (a) => {
        a.Parameters.EventHooks = { AgentQueue: "${cdref:flow:a}" };
      }),
    ],
    [
      "a literal ARN as an event hook's flow",
      mutate("set-queue-flow", (a) => {
        a.Parameters.EventHooks = {
          CustomerQueue: "arn:aws:connect:us-east-1:111122223333:instance/a/contact-flow/b",
        };
      }),
    ],
  ])("rejects %s", (_label, doc) => {
    expect(validate(doc)).toBe(false);
  });
});

describe("FlowDoc schema rejections: participant", () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const raw = read("conformance/roundtrip/participant/doc.flowdoc.json");
  const at = (d: FlowDoc, id: string): Action =>
    d.content.Actions.find((a) => a.Identifier === id) as unknown as Action;
  const mutate = (id: string, f: (a: Action) => void): FlowDoc => {
    const d = JSON.parse(raw) as FlowDoc;
    f(at(d, id));
    return d;
  };

  it("accepts the fixture as committed", () => {
    expect(validate(JSON.parse(raw))).toBe(true);
  });

  it.each([
    [
      "a loop message with two bodies",
      mutate("hold-music", (a) => {
        a.Parameters.Messages = [{ Text: "hi", SSML: "<speak>hi</speak>" }];
      }),
    ],
    [
      "a loop with no messages",
      mutate("hold-music", (a) => {
        a.Parameters.Messages = [];
      }),
    ],
    [
      "an interrupt frequency written as a JSON number",
      mutate("hold-music", (a) => {
        a.Parameters.InterruptFrequencySeconds = 30;
      }),
    ],
    [
      "a media message from somewhere other than S3",
      mutate("hold-music", (a) => {
        a.Parameters.Messages = [
          { Media: { Uri: "s3://b/x", SourceType: "HTTP", MediaType: "Audio" } },
        ];
      }),
    ],
    [
      "a Lex bot with both a text and an SSML body",
      mutate("ask-intent", (a) => {
        a.Parameters.SSML = "<speak>hi</speak>";
      }),
    ],
    [
      "a Lex bot alias as a literal ARN",
      mutate("ask-intent", (a) => {
        a.Parameters.LexV2Bot = {
          AliasArn: "arn:aws:lex:us-east-1:111122223333:bot-alias/BOT/ALIAS",
        };
      }),
    ],
    [
      "a Lex timeout written as a JSON number",
      mutate("ask-intent", (a) => {
        a.Parameters.LexTimeoutSeconds = { Text: 300 };
      }),
    ],
    [
      "a view resource with no id",
      mutate("show-form", (a) => {
        a.Parameters.ViewResource = { Version: "1" };
      }),
    ],
    [
      "a view id as a literal ARN",
      mutate("show-form", (a) => {
        a.Parameters.ViewResource = { Id: "arn:aws:connect:us-west-2:aws:view/form:1" };
      }),
    ],
    [
      "a view time limit written as a JSON number",
      mutate("show-form", (a) => {
        a.Parameters.InvocationTimeLimitSeconds = 300;
      }),
    ],
  ])("rejects %s", (_label, doc) => {
    expect(validate(doc)).toBe(false);
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
  // conformance/migrate inputs are older versions by design; their own suite
  // below validates them against the schema they name.
  const files = collect("conformance/").filter(
    (f) => !f.includes("/schema/") && !f.includes("/migrate/"),
  );

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

// A version bump ships a migration plus fixtures (docs/01-flowdoc-spec.md,
// Versioning). conformance/migrate holds an input at each older version and
// the exact bytes it becomes; a second implementation runs the same files.
describe("FlowDoc migration", () => {
  const validate02 = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const validate01 = new Ajv2020({ allErrors: true, strict: false }).compile(schema01);
  const cases = readdirSync(new URL("conformance/migrate/", root), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  it("has a case per older version", () => {
    expect(cases).toEqual(["minimal-0.1", "with-meta-0.1"]);
  });

  it.each(cases)("%s: the input is valid at its own version and migrates byte for byte", (c) => {
    const input = JSON.parse(read(`conformance/migrate/${c}/input.flowdoc.json`));
    expect(validate01(input), JSON.stringify(validate01.errors)).toBe(true);
    expect(validate02(input)).toBe(false);
    const migrated = migrateFlowDoc(input);
    expect(serialize(migrated)).toBe(read(`conformance/migrate/${c}/expected.flowdoc.json`));
    expect(validate02(migrated), JSON.stringify(validate02.errors)).toBe(true);
    expect(validate01(migrated)).toBe(false);
  });

  it("returns a current document unchanged", () => {
    expect(migrateFlowDoc(demo)).toBe(demo);
  });

  it("refuses every version it does not read", () => {
    const { versions } = JSON.parse(read("conformance/migrate/invalid.json")) as {
      versions: unknown[];
    };
    expect(versions.length).toBeGreaterThan(3);
    for (const version of versions) {
      expect(() => migrateFlowDoc({ ...demo, flowdoc: version })).toThrow(/is not supported/);
    }
  });

  it("0.2 accepts what 0.1 could not say: a view token, a version pin on it, sourceKind, description", () => {
    const doc = JSON.parse(demoRaw);
    doc.description = "The demo appointment line.";
    doc.meta = { ...doc.meta, sourceKind: "tf" };
    doc.content.Actions.push({
      Identifier: "show-acw",
      Type: "ShowView",
      Parameters: { ViewResource: { Id: "${cdref:view:after-contact-work@1}" } },
      Transitions: {},
    });
    doc.refs.push({
      token: "${cdref:view:after-contact-work@1}",
      type: "view",
      name: "after-contact-work",
      alias: "1",
    });
    expect(validate02(doc), JSON.stringify(validate02.errors)).toBe(true);
    doc.flowdoc = "0.1";
    expect(validate01(doc)).toBe(false);
  });

  it("0.2 still refuses a sourceKind it does not know", () => {
    const doc = JSON.parse(demoRaw);
    doc.meta = { ...doc.meta, sourceKind: "yaml" };
    expect(validate02(doc)).toBe(false);
  });
});
