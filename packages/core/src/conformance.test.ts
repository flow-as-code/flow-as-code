/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { ActionType } from "./actions.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  FLOWDOC_VERSION,
  actionCatalog,
  collectRefs,
  migrateFlowDoc,
  serialize,
  type FlowDoc,
} from "./index.js";

/** The reference types 0.3 added; a token of one cannot appear in a 0.2 document. */
const NEW_IN_03 = new Set([
  "tasktemplate",
  "casetemplate",
  "casefield",
  "assistant",
  "phonenumber",
]);

// The conformance directory is the cross-language contract (conformance/README.md).
// These assertions are what a future Go provider must also satisfy.
const root = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

const schema = JSON.parse(read("conformance/schema/flowdoc-0.3.schema.json"));
const schema02 = JSON.parse(read("conformance/schema/flowdoc-0.2.schema.json"));
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
    Conditions?: { NextAction: string; Condition: { Operator: string; Operands: unknown[] } }[];
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
  it("takes a displayName Connect would take, and refuses one it would not", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const named = (displayName: string) => ({ ...demo, displayName });
    expect(validate(named("Appointment Line"))).toBe(true);
    expect(validate(named("x".repeat(127)))).toBe(true);
    for (const bad of ["", "   ", "x".repeat(128)]) {
      expect(validate(named(bad)), JSON.stringify(bad)).toBe(false);
    }
  });

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

  // GenericBlock passthrough is what makes a small modeled set survivable.
  // The demo carried it (UpdateFlowLoggingBehavior) until the builder gained
  // that type on 2026-09-11; the unknown-actions fixture holds it now, with
  // only types the builder does not model, so a newly modeled type is caught
  // there rather than quietly ending the guarantee.
  it("is modeled end to end, with passthrough exercised by the unknown-actions fixture", () => {
    const modeled = new Set<string>(Object.values(ActionType));
    expect(actions.filter((a) => !modeled.has(a.Type)).map((a) => a.Type)).toEqual([]);
    const unknown = JSON.parse(read("conformance/roundtrip/unknown-actions/doc.flowdoc.json")) as {
      content: { Actions: { Type: string }[] };
    };
    const types = unknown.content.Actions.map((a) => a.Type);
    expect(types.length).toBeGreaterThan(0);
    expect(types.filter((t) => modeled.has(t))).toEqual([]);
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
        a.Parameters.LoopCount = "101";
      }),
    ],
    [
      "a loop count written as a JSON number, which the console never writes",
      mutate("again", (a) => {
        a.Parameters.LoopCount = 2;
      }),
    ],
    [
      "a loop count with a leading zero",
      mutate("again", (a) => {
        a.Parameters.LoopCount = "02";
      }),
    ],
    [
      "a percentage threshold above 100",
      mutate("split", (a) => {
        a.Transitions.Conditions![0]!.Condition.Operands = ["101"];
      }),
    ],
    [
      "a percentage branch with an operator other than NumberLessThan",
      mutate("split", (a) => {
        a.Transitions.Conditions![0]!.Condition.Operator = "NumberGreaterThan";
      }),
    ],
    [
      "a percentage threshold written as a JSON number",
      mutate("split", (a) => {
        a.Transitions.Conditions![0]!.Condition.Operands = [20];
      }),
    ],
    [
      "a percentage branch with two operands",
      mutate("split", (a) => {
        a.Transitions.Conditions![0]!.Condition.Operands = ["20", "30"];
      }),
    ],
    [
      "a flow attribute as a flat string, which the console never writes",
      mutate("remember", (a) => {
        a.Parameters.FlowAttributes = { lastPrompt: "greet" };
      }),
    ],
    [
      "a flow attribute wrapper with a key other than Value",
      mutate("remember", (a) => {
        a.Parameters.FlowAttributes = { lastPrompt: { Value: "greet", Type: "string" } };
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
      "an empty key list, which the service refuses",
      mutate("untag", (a) => {
        a.Parameters.TagKeys = [];
      }),
    ],
    [
      "a text-to-speech engine the pages do not list",
      mutate("set-voice", (a) => {
        a.Parameters.TextToSpeechEngine = "premium";
      }),
    ],
    [
      "a text-to-speech engine in the admin guide's lower case, which the console never writes",
      mutate("set-voice", (a) => {
        a.Parameters.TextToSpeechEngine = "neural";
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
      "a Lex timeout below the console's one minute",
      mutate("ask-intent", (a) => {
        a.Parameters.LexTimeoutSeconds = { Text: "59" };
      }),
    ],
    [
      "a Lex timeout above the console's seven days",
      mutate("ask-intent", (a) => {
        a.Parameters.LexTimeoutSeconds = { Text: "604801" };
      }),
    ],
    [
      "a Lex action with no bot at all",
      mutate("ask-intent", (a) => {
        delete a.Parameters.LexV2Bot;
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
    [
      "a view without a time limit, which the service refuses",
      mutate("show-form", (a) => {
        delete a.Parameters.InvocationTimeLimitSeconds;
      }),
    ],
  ])("rejects %s", (_label, doc) => {
    expect(validate(doc)).toBe(false);
  });
});

describe("FlowDoc schema rejections: recording and analytics", () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const raw = read("conformance/roundtrip/recording-analytics/doc.flowdoc.json");
  const at = (d: FlowDoc, id: string): Action =>
    d.content.Actions.find((a) => a.Identifier === id) as unknown as Action;
  const mutate = (id: string, f: (a: Action) => void): FlowDoc => {
    const d = JSON.parse(raw) as FlowDoc;
    f(at(d, id));
    return d;
  };
  const voice = (a: Action): Record<string, unknown> =>
    (a.Parameters.VoiceBehavior as { VoiceRecordingBehavior: Record<string, unknown> })
      .VoiceRecordingBehavior;

  it("accepts the fixture as committed, chat form included", () => {
    expect(validate(JSON.parse(raw))).toBe(true);
  });

  it.each([
    [
      "a recorded participant other than Agent or Customer",
      mutate("record-voice-ivr", (a) => {
        voice(a).RecordedParticipants = ["Supervisor"];
      }),
    ],
    [
      "a participant recorded twice",
      mutate("record-voice-ivr", (a) => {
        voice(a).RecordedParticipants = ["Agent", "Agent"];
      }),
    ],
    [
      "an IVR recording value other than Enabled or Disabled",
      mutate("record-voice-ivr", (a) => {
        voice(a).IVRRecordingBehavior = "On";
      }),
    ],
    [
      "a screen recorded participant other than Agent",
      mutate("record-screen", (a) => {
        a.Parameters.ScreenRecordingBehavior = { ScreenRecordedParticipants: ["Customer"] };
      }),
    ],
    [
      "a chat and a voice behavior on one block",
      mutate("record-voice-ivr", (a) => {
        a.Parameters.ChatBehavior = { ChatAnalyticsBehavior: { Enabled: "True" } };
      }),
    ],
    [
      "a voice and a screen behavior on one block, which the service refuses",
      mutate("record-voice-ivr", (a) => {
        a.Parameters.ScreenRecordingBehavior = { ScreenRecordedParticipants: ["Agent"] };
      }),
    ],
    [
      "a voice behavior with no recording object",
      mutate("record-voice-ivr", (a) => {
        a.Parameters.VoiceBehavior = {};
      }),
    ],
    [
      "a screen behavior with no participant list",
      mutate("record-screen", (a) => {
        a.Parameters.ScreenRecordingBehavior = {};
      }),
    ],
    [
      "no behavior at all, which the service refuses",
      mutate("record-screen", (a) => {
        a.Parameters = {};
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
/** Every FlowDoc fixture under `dir`, by the naming the suites use. */
const collect = (dir: string): string[] =>
  readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? collect(`${dir}${e.name}/`)
      : e.name.endsWith(".flowdoc.json") || e.name.startsWith("pass-")
        ? [`${dir}${e.name}`]
        : [],
  );

describe("all conformance fixtures are schema-valid", () => {
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
  const validate03 = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const validate02 = new Ajv2020({ allErrors: true, strict: false }).compile(schema02);
  const validate01 = new Ajv2020({ allErrors: true, strict: false }).compile(schema01);
  const validators: Record<string, typeof validate01> = { "0.1": validate01, "0.2": validate02 };
  const cases = readdirSync(new URL("conformance/migrate/", root), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  it("has a case per older version", () => {
    expect(cases).toEqual(["minimal-0.1", "minimal-0.2", "with-meta-0.1", "with-meta-0.2"]);
  });

  it.each(cases)("%s: the input is valid at its own version and migrates byte for byte", (c) => {
    const input = JSON.parse(read(`conformance/migrate/${c}/input.flowdoc.json`));
    const own = validators[input.flowdoc]!;
    expect(c.endsWith(`-${input.flowdoc}`)).toBe(true);
    expect(own(input), JSON.stringify(own.errors)).toBe(true);
    expect(validate03(input)).toBe(false);
    const migrated = migrateFlowDoc(input);
    expect(migrated.flowdoc).toBe(FLOWDOC_VERSION);
    expect(serialize(migrated)).toBe(read(`conformance/migrate/${c}/expected.flowdoc.json`));
    expect(validate03(migrated), JSON.stringify(validate03.errors)).toBe(true);
    expect(own(migrated)).toBe(false);
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

  // The frozen schemas stay byte for byte what they were when their version
  // shipped (docs/01-flowdoc-spec.md, "Versioning"): a 0.2 file is still
  // validated against the rules it was written to, and a per-type clause for
  // a newly modeled type goes into 0.3 only.
  it("keeps the 0.1 and 0.2 schemas frozen", () => {
    const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
    expect(sha256(read("conformance/schema/flowdoc-0.1.schema.json"))).toBe(
      "47e06f2beb4d717d8c78c579324f1161767126379359979f625996b67f8c2942",
    );
    expect(sha256(read("conformance/schema/flowdoc-0.2.schema.json"))).toBe(
      "66edb9d45c51a44712d04deb472cbd5e1879810297229e15e0afcbcfe9db6437",
    );
  });

  it("0.3 accepts what 0.2 could not say: the five Phase D reference types", () => {
    const tokens = [
      "${cdref:tasktemplate:follow-up}",
      "${cdref:casetemplate:billing-dispute}",
      "${cdref:casefield:priority}",
      "${cdref:assistant:agent-help}",
      "${cdref:phonenumber:main-did}",
    ];
    const doc = JSON.parse(demoRaw);
    doc.content.Actions.push({
      Identifier: "create-task",
      Type: "CreateTask",
      Parameters: { Name: "Follow up", TaskTemplateId: tokens[0] },
      Transitions: {},
    });
    for (const token of tokens) {
      const [, type, name] = /^\$\{cdref:([a-z]+):([a-z0-9-]+)\}$/.exec(token)!;
      doc.refs.push({ token, type, name });
    }
    expect(validate03(doc), JSON.stringify(validate03.errors)).toBe(true);
    doc.flowdoc = "0.2";
    expect(validate02(doc)).toBe(false);
  });

  // Owner decision 3 (tasks/README.md, Phase D): a 0.3 per-type clause encodes
  // only what the service enforces at create, so any 0.2 document the service
  // accepted still validates after migration. Every fixture holding an
  // unmodeled type as a generic block is taken back to 0.2 (the version it was
  // written at before the bump), validated there, migrated, and validated at
  // 0.3. The group tasks' clauses are held to this as they land.
  it("migrates every 0.2 document holding an unmodeled type and validates it at 0.3", () => {
    const unmodeled = new Set(
      Object.entries(actionCatalog.actions)
        .filter(([, a]) => !a.modeled)
        .map(([t]) => t),
    );
    const docs = collect("conformance/")
      .filter((f) => !f.includes("/schema/") && !f.includes("/migrate/"))
      .map((f) => JSON.parse(read(f)) as { doc?: FlowDoc; flowdoc?: string })
      .map((parsed) => parsed.doc ?? (parsed.flowdoc !== undefined ? (parsed as FlowDoc) : null))
      .filter(
        (d): d is FlowDoc => d !== null && d.content.Actions.some((a) => unmodeled.has(a.Type)),
      )
      // A fixture written for 0.3 (conformance/export/phase-d-refs) holds a
      // token no 0.2 document could, so it is outside this claim.
      .filter((d) => !collectRefs(d.content).some((r) => NEW_IN_03.has(r.type)));
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      const older = { ...doc, flowdoc: "0.2" };
      expect(validate02(older), JSON.stringify(validate02.errors)).toBe(true);
      const migrated = migrateFlowDoc(older);
      expect(migrated.flowdoc).toBe(FLOWDOC_VERSION);
      expect(validate03(migrated), JSON.stringify(validate03.errors)).toBe(true);
    }
  });

  it("0.2 accepts what 0.1 could not say: a view token, a version pin on it, sourceKind, description", () => {
    const doc = JSON.parse(demoRaw);
    doc.description = "The demo appointment line.";
    doc.meta = { ...doc.meta, sourceKind: "tf" };
    doc.content.Actions.push({
      Identifier: "show-acw",
      Type: "ShowView",
      Parameters: {
        ViewResource: { Id: "${cdref:view:after-contact-work@1}" },
        InvocationTimeLimitSeconds: "300",
      },
      Transitions: {},
    });
    doc.refs.push({
      token: "${cdref:view:after-contact-work@1}",
      type: "view",
      name: "after-contact-work",
      alias: "1",
    });
    doc.flowdoc = "0.2";
    expect(validate02(doc), JSON.stringify(validate02.errors)).toBe(true);
    doc.flowdoc = "0.1";
    expect(validate01(doc)).toBe(false);
  });

  it("0.3 still refuses a sourceKind it does not know", () => {
    const doc = JSON.parse(demoRaw);
    doc.meta = { ...doc.meta, sourceKind: "yaml" };
    expect(validate03(doc)).toBe(false);
  });
});
