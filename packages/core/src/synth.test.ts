/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appointmentLine } from "./__fixtures__/appointment-line.js";
import type {
  GetParticipantInputConfig,
  InvokeLambdaFunctionConfig,
  MessageParticipantConfig,
  UpdateContactTargetQueueConfig,
} from "./index.js";
import {
  ActionType,
  DisconnectParticipant,
  EndFlowModuleExecution,
  EXTRA_ERRORS,
  Flow,
  FlowModule,
  GenericBlock,
  GetParticipantInput,
  INPUT_TIMEOUT_MAX,
  INPUT_TIMEOUT_MIN,
  InvokeLambdaFunction,
  NO_MATCHING_ERROR,
  Refs,
  canonicalOrder,
  collectRefs,
  jsonPath,
  materializeWithMap,
  parseToken,
  serialize,
  serializeContent,
  synth,
} from "./index.js";

const fixture = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

describe("A01 acceptance: synth of the demo flow", () => {
  it("matches the committed conformance fixture byte for byte", () => {
    const out = serialize(synth(appointmentLine(), { includeMeta: false }));
    expect(out).toBe(fixture("conformance/demo/appointment-line.flowdoc.json"));
  });

  it("is deterministic across runs", () => {
    const a = serialize(synth(appointmentLine(), { includeMeta: false }));
    const b = serialize(synth(appointmentLine(), { includeMeta: false }));
    expect(a).toBe(b);
  });

  it("emits declaration order, so the happy path stays contiguous", () => {
    const doc = synth(appointmentLine());
    expect(doc.content.Actions.map((a) => a.Identifier)).toEqual([
      "enable-logging",
      "welcome",
      "check-hours",
      "set-working-queue",
      "look-up-appointment",
      "record-lookup-result",
      "transfer",
      "announce-closed",
      "announce-busy",
      "apologize",
      "hang-up",
    ]);
  });

  it("derives the refs index from the content", () => {
    const doc = synth(appointmentLine());
    expect(doc.refs).toEqual([
      { token: "${cdref:hours:main-line}", type: "hours", name: "main-line" },
      { token: "${cdref:lambda:appointment-lookup}", type: "lambda", name: "appointment-lookup" },
      { token: "${cdref:queue:appointments}", type: "queue", name: "appointments" },
    ]);
  });
});

describe("GenericBlock passthrough", () => {
  const unknown = {
    Foo: "bar",
    Nested: { deep: [1, 2, { three: true }] },
  };

  const flow = () =>
    new Flow({ name: "passthrough" }).add(
      new GenericBlock({
        id: "mystery",
        type: "SomeActionWeDoNotModel",
        parameters: unknown,
        next: "hang-up",
      }),
      new DisconnectParticipant({ id: "hang-up" }),
    );

  it("preserves an unmodeled action's type and parameters verbatim", () => {
    const doc = synth(flow());
    const action = doc.content.Actions[0]!;
    expect(action.Type).toBe("SomeActionWeDoNotModel");
    expect(action.Parameters).toEqual(unknown);
  });

  it("treats an unwired generic block as terminal", () => {
    const doc = synth(
      new Flow({ name: "t" }).add(new GenericBlock({ id: "only", type: "Whatever" })),
    );
    expect(doc.content.Actions[0]!.Transitions).toEqual({});
  });
});

describe("error branch wiring", () => {
  it("emits the catch-all error for every non-terminal modeled action", () => {
    const doc = synth(appointmentLine());
    const modeled = new Set<string>(Object.values(ActionType));
    // GenericBlock is the escape hatch: we cannot know an unmodeled action's
    // error set, so the author wires it and the `error-branches` lint rule is
    // the backstop. UpdateFlowLoggingBehavior genuinely documents no errors.
    const subject = doc.content.Actions.filter(
      (a) => modeled.has(a.Type) && Object.keys(a.Transitions).length > 0,
    );
    expect(subject.length).toBeGreaterThan(0);
    for (const a of subject) {
      expect(
        a.Transitions.Errors?.length ?? 0,
        `${a.Identifier} has no error branch`,
      ).toBeGreaterThan(0);
    }
  });

  it("gives TransferContactToQueue both QueueAtCapacity and the catch-all", () => {
    const doc = synth(appointmentLine());
    const transfer = doc.content.Actions.find((a) => a.Identifier === "transfer")!;
    expect(transfer.Transitions.Errors).toEqual([
      { ErrorType: "QueueAtCapacity", NextAction: "announce-busy" },
      { ErrorType: "NoMatchingError", NextAction: "apologize" },
    ]);
  });

  it("gives CheckHoursOfOperation exactly the two conditions Connect requires", () => {
    const doc = synth(appointmentLine());
    const check = doc.content.Actions.find((a) => a.Identifier === "check-hours")!;
    expect(check.Transitions.Conditions).toEqual([
      { NextAction: "set-working-queue", Condition: { Operator: "Equals", Operands: ["True"] } },
      { NextAction: "announce-closed", Condition: { Operator: "Equals", Operands: ["False"] } },
    ]);
  });

  it("makes terminal actions carry an empty Transitions object", () => {
    const doc = synth(appointmentLine());
    const hangUp = doc.content.Actions.find((a) => a.Identifier === "hang-up")!;
    expect(hangUp.Transitions).toEqual({});
  });

  it("gives GetParticipantInput every menu-form error, NextAction on the no-match path", () => {
    const menu = new GetParticipantInput({
      id: "menu",
      text: "Press 1 or 2.",
      timeoutSeconds: 5,
      branches: [
        { digit: "1", target: "one" },
        { digit: "2", target: "two" },
      ],
      onTimeout: "timeout",
      onNoMatch: "again",
      onError: "fail",
    });
    const action = menu.toAction();
    // The admin page's example order; EXTRA_ERRORS is what the studio wires
    // from, so the two must agree or a canvas-wired block would not invert.
    expect(action.Transitions.Errors!.map((e) => e.ErrorType)).toEqual([
      ...EXTRA_ERRORS[ActionType.GetParticipantInput]!,
      NO_MATCHING_ERROR,
    ]);
    expect(action.Transitions).toEqual({
      NextAction: "again",
      Errors: [
        { ErrorType: "InputTimeLimitExceeded", NextAction: "timeout" },
        { ErrorType: "NoMatchingCondition", NextAction: "again" },
        { ErrorType: "NoMatchingError", NextAction: "fail" },
      ],
      Conditions: [
        { NextAction: "one", Condition: { Operator: "Equals", Operands: ["1"] } },
        { NextAction: "two", Condition: { Operator: "Equals", Operands: ["2"] } },
      ],
    });
  });

  it("writes GetParticipantInput's timeout and StoreInput as the console's strings", () => {
    const menu = new GetParticipantInput({
      id: "menu",
      prompt: Refs.prompt("p"),
      timeoutSeconds: 12,
      branches: [],
      onTimeout: "x",
      onNoMatch: "x",
      onError: "x",
    });
    expect(menu.toAction().Parameters).toEqual({
      PromptId: "${cdref:prompt:p}",
      InputTimeLimitSeconds: "12",
      StoreInput: "False",
    });
    // No body at all is a documented shape: PromptId, Text, and SSML are each
    // optional on the action page.
    const silent = new GetParticipantInput({
      id: "menu",
      timeoutSeconds: 1,
      branches: [],
      onTimeout: "x",
      onNoMatch: "x",
      onError: "x",
    });
    expect(silent.toAction().Parameters).toEqual({
      InputTimeLimitSeconds: "1",
      StoreInput: "False",
    });
  });
});

describe("layout", () => {
  it("auto-lays out every action", () => {
    const doc = synth(appointmentLine());
    const ids = doc.content.Actions.map((a) => a.Identifier);
    expect(Object.keys(doc.layout!).sort()).toEqual([...ids].sort());
  });

  it("lets hand-placed positions win over auto-layout", () => {
    const flow = new Flow({
      name: "placed",
      layout: { only: { x: 1234, y: 5678 } },
    }).add(new DisconnectParticipant({ id: "only" }));
    expect(synth(flow).layout!.only).toEqual({ x: 1234, y: 5678 });
  });

  it("never writes Metadata into content", () => {
    expect(synth(appointmentLine()).content).not.toHaveProperty("Metadata");
  });
});

describe("Refs", () => {
  it("formats tokens", () => {
    expect(Refs.queue("front-desk")).toBe("${cdref:queue:front-desk}");
    expect(Refs.module("recording-consent", "prod")).toBe("${cdref:module:recording-consent@prod}");
  });

  it("rejects a name that is not a slug", () => {
    expect(() => Refs.queue("Front Desk")).toThrow(/lowercase words/);
  });

  it("round-trips a module token through the parser", () => {
    expect(parseToken(Refs.module("recording-consent", "prod"))).toEqual({
      token: "${cdref:module:recording-consent@prod}",
      type: "module",
      name: "recording-consent",
      alias: "prod",
    });
  });

  it("collects and sorts tokens, de-duplicated", () => {
    const found = collectRefs({ a: Refs.queue("b"), b: Refs.queue("a"), c: Refs.queue("b") });
    expect(found.map((r) => r.name)).toEqual(["a", "b"]);
  });

  it("accepts a single JSONPath but rejects an interpolated string", () => {
    expect(jsonPath("$.Attributes.queueId")).toBe("$.Attributes.queueId");
    expect(() => jsonPath("prefix-$.Attributes.q")).toThrow(/single identifier/);
  });
});

describe("guardrails", () => {
  it("rejects an Identifier containing a character Connect reserves", () => {
    expect(() => new DisconnectParticipant({ id: "bad/id" })).toThrow(/Invalid Identifier/);
  });

  it("rejects a duplicate Identifier within a flow", () => {
    expect(() =>
      new Flow({ name: "dup" }).add(
        new DisconnectParticipant({ id: "same" }),
        new DisconnectParticipant({ id: "same" }),
      ),
    ).toThrow(/Duplicate Identifier/);
  });

  it("rejects a Lambda timeout outside the documented 1 to 8 seconds", () => {
    const config = {
      id: "fn",
      lambda: Refs.lambda("f"),
      next: "x",
      onError: "x",
    };
    expect(() => new InvokeLambdaFunction({ ...config, timeoutSeconds: 30 })).toThrow(
      /between 1 and 8/,
    );
    expect(() => new InvokeLambdaFunction({ ...config, timeoutSeconds: 0 })).toThrow(
      /between 1 and 8/,
    );
    expect(() => new InvokeLambdaFunction({ ...config, timeoutSeconds: 8 })).not.toThrow();
  });

  it("rejects a GetParticipantInput timeout outside the documented 1 to 180 seconds", () => {
    const config = {
      id: "menu",
      text: "Press 1.",
      branches: [],
      onTimeout: "x",
      onNoMatch: "x",
      onError: "x",
    };
    for (const bad of [0, -1, 181, 2.5, Number.NaN]) {
      expect(() => new GetParticipantInput({ ...config, timeoutSeconds: bad })).toThrow(
        /between 1 and 180/,
      );
    }
    expect(() => new GetParticipantInput({ ...config, timeoutSeconds: 1 })).not.toThrow();
    expect(() => new GetParticipantInput({ ...config, timeoutSeconds: 180 })).not.toThrow();
    expect([INPUT_TIMEOUT_MIN, INPUT_TIMEOUT_MAX]).toEqual([1, 180]);
  });

  it("rejects a GetParticipantInput branch on anything but a single DTMF key", () => {
    const config = {
      id: "menu",
      timeoutSeconds: 5,
      onTimeout: "x",
      onNoMatch: "x",
      onError: "x",
    };
    // The type forbids these; the runtime check is for JavaScript callers and
    // hand-built configs.
    for (const bad of ["10", "a", "", "**"]) {
      expect(
        () =>
          new GetParticipantInput({ ...config, branches: [{ digit: bad as "1", target: "y" }] }),
      ).toThrow(/branch digit must be one of/);
    }
    for (const good of ["0", "9", "*", "#"] as const) {
      expect(
        () => new GetParticipantInput({ ...config, branches: [{ digit: good, target: "y" }] }),
      ).not.toThrow();
    }
  });

  it("rejects a GetParticipantInput key that branches twice", () => {
    const config = {
      id: "menu",
      timeoutSeconds: 5,
      onTimeout: "x",
      onNoMatch: "x",
      onError: "x",
    };
    // Two answers to one press, whether the targets differ or not: only one
    // condition can be taken, so the config is refused instead of emitted.
    const twice = [
      [
        { digit: "1", target: "y" },
        { digit: "1", target: "z" },
      ],
      [
        { digit: "*", target: "y" },
        { digit: "2", target: "z" },
        { digit: "*", target: "y" },
      ],
    ] as const;
    for (const branches of twice) {
      expect(() => new GetParticipantInput({ ...config, branches: [...branches] })).toThrow(
        /branches on key "[*1]" twice/,
      );
    }
    // Different keys may share a target; that is one press each.
    expect(
      () =>
        new GetParticipantInput({
          ...config,
          branches: [
            { digit: "1", target: "y" },
            { digit: "2", target: "y" },
          ],
        }),
    ).not.toThrow();
  });

  it("rejects a StartAction that is not one of the blocks", () => {
    const flow = new Flow({ name: "bad-start", start: "nowhere" }).add(
      new DisconnectParticipant({ id: "only" }),
    );
    expect(() => synth(flow)).toThrow(/not one of the flow's blocks/);
  });
});

describe("canonicalOrder", () => {
  it("puts unreachable blocks last, sorted, without dropping them", () => {
    const flow = new Flow({ name: "orphans", start: "start" }).add(
      new GenericBlock({ id: "start", type: "X", next: "end" }),
      new DisconnectParticipant({ id: "end" }),
      new DisconnectParticipant({ id: "zzz-orphan" }),
      new DisconnectParticipant({ id: "aaa-orphan" }),
    );
    expect(canonicalOrder(flow.all(), "start").map((b) => b.id)).toEqual([
      "start",
      "end",
      "aaa-orphan",
      "zzz-orphan",
    ]);
  });
});

describe("serialization", () => {
  it("sorts parameter keys so output does not depend on construction order", () => {
    const build = (params: Record<string, unknown>) =>
      serialize(
        synth(
          new Flow({ name: "n" }).add(new GenericBlock({ id: "a", type: "T", parameters: params })),
          {
            includeMeta: false,
          },
        ),
      );
    expect(build({ b: 1, a: 2 })).toBe(build({ a: 2, b: 1 }));
  });

  it("ends with a trailing newline", () => {
    expect(serialize(synth(appointmentLine()))).toMatch(/\n$/);
  });
});

// ---------------------------------------------------------------------------
// A01 acceptance criterion 2: an unwired error branch is a compile-time error.
// These assertions are checked by `tsc`, not at runtime: tsconfig.test.json
// typechecks this file, and @ts-expect-error fails the build if the line below
// it actually compiles.
// ---------------------------------------------------------------------------
describe("A01 acceptance: unwired error branches do not compile", () => {
  it("is enforced by the type checker", () => {
    // Each directive sits directly above the expression it guards. Config
    // objects are type-annotated so a missing property is reported on the
    // annotated declaration rather than somewhere inside a reflowed literal.

    // @ts-expect-error onError is required on MessageParticipant
    const missingMessageError: MessageParticipantConfig = { id: "a", text: "hi", next: "b" };

    // @ts-expect-error onError is required on UpdateContactTargetQueue
    const missingQueueError: UpdateContactTargetQueueConfig = {
      id: "a",
      queue: Refs.queue("q"),
      next: "b",
    };

    const wrongRefKind: InvokeLambdaFunctionConfig = {
      id: "a",
      // @ts-expect-error a queue reference is not a Lambda reference
      lambda: Refs.queue("q"),
      timeoutSeconds: 1,
      next: "b",
      onError: "c",
    };

    // @ts-expect-error MessageParticipant takes exactly one of text, ssml, prompt
    const bothBodies: MessageParticipantConfig = {
      id: "a",
      text: "hi",
      ssml: "<speak/>",
      next: "b",
      onError: "c",
    };

    // @ts-expect-error UpdateContactTargetQueue takes a queue or an agent, not both
    const bothQueueTargets: UpdateContactTargetQueueConfig = {
      id: "a",
      queue: Refs.queue("q"),
      agent: Refs.queue("r"),
      next: "b",
      onError: "c",
    };

    // @ts-expect-error onTimeout is required on GetParticipantInput
    const missingInputTimeout: GetParticipantInputConfig = {
      id: "a",
      text: "hi",
      timeoutSeconds: 5,
      branches: [],
      onNoMatch: "b",
      onError: "c",
    };

    // @ts-expect-error onNoMatch is required on GetParticipantInput
    const missingInputNoMatch: GetParticipantInputConfig = {
      id: "a",
      text: "hi",
      timeoutSeconds: 5,
      branches: [],
      onTimeout: "b",
      onError: "c",
    };

    // @ts-expect-error onError is required on GetParticipantInput
    const missingInputError: GetParticipantInputConfig = {
      id: "a",
      text: "hi",
      timeoutSeconds: 5,
      branches: [],
      onTimeout: "b",
      onNoMatch: "c",
    };

    // @ts-expect-error GetParticipantInput takes at most one of text, ssml, prompt
    const bothInputBodies: GetParticipantInputConfig = {
      id: "a",
      text: "hi",
      prompt: Refs.prompt("p"),
      timeoutSeconds: 5,
      branches: [],
      onTimeout: "b",
      onNoMatch: "c",
      onError: "d",
    };

    const wrongInputRefKind: GetParticipantInputConfig = {
      id: "a",
      // @ts-expect-error a queue reference is not a prompt reference
      prompt: Refs.queue("q"),
      timeoutSeconds: 5,
      branches: [],
      onTimeout: "b",
      onNoMatch: "c",
      onError: "d",
    };

    const badDigit: GetParticipantInputConfig = {
      id: "a",
      timeoutSeconds: 5,
      // @ts-expect-error a branch key is a single DTMF character
      branches: [{ digit: "10", target: "b" }],
      onTimeout: "b",
      onNoMatch: "c",
      onError: "d",
    };

    // Referenced so the declarations are not dead code.
    expect([
      missingMessageError,
      missingQueueError,
      wrongRefKind,
      bothBodies,
      bothQueueTargets,
      missingInputTimeout,
      missingInputNoMatch,
      missingInputError,
      bothInputBodies,
      wrongInputRefKind,
      badDigit,
    ]).toHaveLength(11);
  });
});

describe("regression: serialization is insertion-order independent", () => {
  // canonicalTransitions ordered only the top level, copying the Errors and
  // Conditions arrays by reference, so key order inside their elements changed
  // the bytes. Two authorings of one flow differed, and downstream so did a
  // CloudFormation logical id.
  const reorderKeys = <T extends object>(o: T): T =>
    Object.fromEntries(Object.entries(o).reverse()) as T;

  it("ignores key order inside Errors entries", () => {
    const a = synth(appointmentLine(), { includeMeta: false });
    const b = synth(appointmentLine(), { includeMeta: false });
    for (const action of b.content.Actions) {
      if (action.Transitions.Errors !== undefined) {
        action.Transitions.Errors = action.Transitions.Errors.map(reorderKeys);
      }
    }
    expect(serialize(b)).toBe(serialize(a));
  });

  it("ignores key order inside Conditions and their Condition objects", () => {
    const a = synth(appointmentLine(), { includeMeta: false });
    const b = synth(appointmentLine(), { includeMeta: false });
    for (const action of b.content.Actions) {
      if (action.Transitions.Conditions !== undefined) {
        action.Transitions.Conditions = action.Transitions.Conditions.map((c) =>
          reorderKeys({ ...c, Condition: reorderKeys({ ...c.Condition }) }),
        );
      }
    }
    expect(serialize(b)).toBe(serialize(a));
  });
});

describe("module Settings", () => {
  // Connect requires a top-level Settings object in a MODULE's content and
  // rejects CreateContactFlowModule without it. A flow must not carry one.
  // Verified against a live instance 2026-09-01.
  const mod = (settings?: Record<string, unknown>) =>
    new FlowModule({ name: "m", ...(settings ? { settings } : {}) }).add(
      new EndFlowModuleExecution({ id: "done" }),
    );

  it("gives a synthesized module an empty Settings by default", () => {
    expect(synth(mod()).content.Settings).toEqual({});
  });

  it("carries a non-empty Settings through synth", () => {
    expect(synth(mod({ Foo: "bar" })).content.Settings).toEqual({ Foo: "bar" });
  });

  it("never gives a flow a Settings", () => {
    expect(synth(appointmentLine()).content).not.toHaveProperty("Settings");
  });

  it("materializes a module's Settings into deployable content", () => {
    const content = materializeWithMap(synth(mod({ A: 1 })), {});
    expect(content.Settings).toEqual({ A: 1 });
    // Ordered after StartAction, before Actions.
    const keys = Object.keys(JSON.parse(serializeContent(content)));
    expect(keys).toEqual(["Version", "StartAction", "Settings", "Metadata", "Actions"]);
  });

  it("defaults a module's Settings to {} at materialize even if the doc omits it", () => {
    const doc = synth(mod());
    delete doc.content.Settings;
    expect(materializeWithMap(doc, {}).Settings).toEqual({});
  });
});
