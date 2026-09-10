/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type {
  CompiledScenario,
  CreateTestCaseInput,
  ExecutionRecordSummary,
  ExecutionSummary,
  FlowTestClient,
  Scenario,
  SimulationRun,
  TestExecutionStatus,
} from "./index.js";
import {
  compileScenario,
  createConnectTestClient,
  describeTestCaseError,
  jsonReport,
  junitReport,
  MaterializeError,
  parseScenario,
  resolveScenario,
  runScenarios,
  ScenarioValidationError,
  serializeTestContent,
  SIMULATE_LIMITS,
  validateScenario,
} from "./index.js";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

const CASES = ["after-hours-message", "appointment-lookup-transfer", "chat-greeting"] as const;
const scenarioOf = (name: string) =>
  readJson<Scenario>(`conformance/simulate/${name}/scenario.json`);

const INSTANCE =
  "arn:aws:connect:us-east-1:111122223333:instance/11111111-2222-3333-4444-555555555555";

const RESOURCE_MAP: Record<string, string> = {
  "${cdref:flow:appointment-line}": `${INSTANCE}/contact-flow/cccc3333-0000-4000-8000-000000000001`,
  "${cdref:hours:main-line}": `${INSTANCE}/operating-hours/bbbb2222-0000-4000-8000-000000000001`,
  "${cdref:hours:closed}": `${INSTANCE}/operating-hours/bbbb2222-0000-4000-8000-000000000002`,
  "${cdref:lambda:appointment-lookup}":
    "arn:aws:lambda:us-east-1:111122223333:function:appointment-lookup",
  "${cdref:queue:appointments}": `${INSTANCE}/queue/aaaa1111-0000-4000-8000-000000000001`,
  "${cdref:queue:overflow}": `${INSTANCE}/queue/aaaa1111-0000-4000-8000-000000000002`,
};

describe("scenario validation", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateAgainstSchema = ajv.compile(
    JSON.parse(read("conformance/schema/scenario-0.1.schema.json")),
  );

  it.each(CASES)("accepts %s under both the schema and the validator", (name) => {
    const scenario = scenarioOf(name);
    expect(validateScenario(scenario)).toEqual([]);
    expect(validateAgainstSchema(scenario), JSON.stringify(validateAgainstSchema.errors)).toBe(
      true,
    );
  });

  const invalid = readJson<{
    cases: {
      name: string;
      schemaRejects: boolean;
      expectedPaths: string[];
      scenario: unknown;
    }[];
  }>("conformance/simulate/invalid/scenarios.json");

  it.each(invalid.cases.map((c) => [c.name, c] as const))("rejects %s", (_name, testCase) => {
    const findings = validateScenario(testCase.scenario);
    expect(findings.map((f) => f.path)).toEqual(expect.arrayContaining(testCase.expectedPaths));
    // The JSON Schema is the structural half of the same contract, so it must
    // agree everywhere it can express the rule.
    expect(validateAgainstSchema(testCase.scenario)).toBe(!testCase.schemaRejects);
  });

  it("throws with every finding at once", () => {
    let thrown: unknown;
    try {
      parseScenario({ scenario: "0.1", name: "Bad Name", steps: [] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ScenarioValidationError);
    const paths = (thrown as ScenarioValidationError).findings.map((f) => f.path);
    expect(paths).toContain("name");
    expect(paths).toContain("entryPoint");
    expect(paths).toContain("steps");
  });

  it("reports a malformed number on a chat entry point once, as voice only", () => {
    const findings = validateScenario({
      scenario: "0.1",
      name: "chat-with-bad-phone",
      entryPoint: {
        channel: "chat",
        flow: "${cdref:flow:appointment-line}",
        sourcePhoneNumber: "x",
      },
      steps: [{ kind: "send-text", text: "hi" }],
    });
    expect(findings).toEqual([{ path: "entryPoint.sourcePhoneNumber", message: "is voice only" }]);
  });

  // SourcePhoneNumber's documented pattern is \+[1-9]\d{1,14}$, so the digit
  // after the plus cannot be 0. The other malformed numbers in
  // conformance/simulate/invalid are still rejected by a looser check (any
  // digits after the plus), so the leading digit gets its own fixture case and
  // this unit test.
  // https://docs.aws.amazon.com/connect/latest/APIReference/API_VoiceCallEntryPointParameters.html
  it("rejects a source phone number whose country code starts with 0", () => {
    const withNumber = (sourcePhoneNumber: string) =>
      validateScenario({
        scenario: "0.1",
        name: "leading-digit",
        entryPoint: { channel: "voice", flow: "${cdref:flow:appointment-line}", sourcePhoneNumber },
        steps: [{ kind: "disconnect" }],
      }).map((f) => f.path);
    expect(withNumber("+05550100")).toEqual(["entryPoint.sourcePhoneNumber"]);
    expect(withNumber("+15550100")).toEqual([]);
  });

  // actionParameters is copied verbatim into Content, so the validator holds
  // every value to the token rule the schema's additionalProperties expresses,
  // whichever key it sits under and whatever the literal looks like.
  it("rejects a literal anywhere in a substitution's action parameters", () => {
    const withExtra = (Extra: string) =>
      validateScenario({
        scenario: "0.1",
        name: "literal-parameter",
        entryPoint: { channel: "voice", flow: "${cdref:flow:appointment-line}" },
        substitutions: [
          {
            actionType: "TransferContactToQueue",
            actionParameters: { QueueId: "${cdref:queue:appointments}", Extra },
            substitute: "${cdref:queue:overflow}",
          },
        ],
        steps: [{ kind: "expect-transfer", queue: "${cdref:queue:appointments}" }],
      }).map((f) => f.path);
    expect(withExtra("literal")).toEqual(["substitutions[0].actionParameters.Extra"]);
    expect(withExtra("arn:aws:connect:us-east-1:111122223333:instance/i/queue/q")).toEqual([
      "substitutions[0].actionParameters.Extra",
    ]);
    expect(withExtra("${cdref:hours:closed}")).toEqual([]);
  });

  // The key an action type reads takes one ref type, and the schema can only
  // say "a token". These two are the validator's own findings, so each one is
  // pinned exactly: a wrong-type token under the right key is the only fault
  // of the first, and an action type outside the substitution table is the
  // only fault of the second (the validator must not fall through to accept).
  it("holds the substitution's named parameter to the action type's ref type", () => {
    const substitution = (actionType: string, QueueId: string) =>
      validateScenario({
        scenario: "0.1",
        name: "typed-parameter",
        entryPoint: { channel: "voice", flow: "${cdref:flow:appointment-line}" },
        substitutions: [
          { actionType, actionParameters: { QueueId }, substitute: "${cdref:queue:overflow}" },
        ],
        steps: [{ kind: "expect-transfer", queue: "${cdref:queue:appointments}" }],
      });
    expect(substitution("TransferContactToQueue", "${cdref:hours:main-line}")).toEqual([
      {
        path: "substitutions[0].actionParameters",
        message: "must carry QueueId as a ${cdref:queue:...} token",
      },
    ]);
    expect(substitution("Nope", "${cdref:queue:appointments}")).toEqual([
      {
        path: "substitutions[0].actionType",
        message: "must be TransferContactToQueue, CheckHoursOfOperation, or InvokeLambdaFunction",
      },
    ]);
    expect(substitution("TransferContactToQueue", "${cdref:queue:appointments}")).toEqual([]);
  });
});

describe("compileScenario", () => {
  it.each(CASES)("%s matches its golden", (name) => {
    const compiled = compileScenario(scenarioOf(name));
    const golden = `conformance/simulate/${name}/expected.testcase.json`;
    expect(JSON.stringify(compiled, null, 2) + "\n", golden).toBe(read(golden));
  });

  it("is byte-stable", () => {
    const scenario = scenarioOf("appointment-lookup-transfer");
    expect(serializeTestContent(compileScenario(scenario).content)).toBe(
      serializeTestContent(compileScenario(scenario).content),
    );
  });

  // Every expectation is an Event that opens an Observation; every input and
  // assertion is an Action on the Observation opened most recently.
  it("compiles to a graph of observations, not a list of inputs", () => {
    const { content } = compileScenario(scenarioOf("appointment-lookup-transfer"));
    expect(content.Observations[0]?.Event.Type).toBe("TestInitiated");
    expect(content.Observations.map((o) => o.Event.Type)).toEqual([
      "TestInitiated",
      "FlowActionStarted",
      "MessageReceived",
      "FlowActionStarted",
      "FlowActionStarted",
    ]);
    const ids = content.Observations.map((o) => o.Identifier);
    content.Observations.forEach((observation, i) => {
      expect(observation.Transitions.NextObservations).toEqual(
        i === ids.length - 1 ? [] : [ids[i + 1]],
      );
    });
  });

  // The 5-minute cap reports FAILED rather than timing out neutrally, and an
  // unterminated test can put a simulated contact in front of a live agent.
  it("always ends the test", () => {
    for (const name of CASES) {
      const { content } = compileScenario(scenarioOf(name));
      const last = content.Observations.at(-1)!;
      expect(last.Actions.at(-1)).toMatchObject({
        Type: "TestControl",
        Parameters: { ActionType: "TestControl", Command: { Type: "EndTest" } },
      });
    }
  });

  it("puts a resource substitution before anything can transfer", () => {
    const { content } = compileScenario(scenarioOf("appointment-lookup-transfer"));
    expect(content.Observations[0]?.Actions[0]).toMatchObject({
      Type: "OverrideSystemBehavior",
      Parameters: {
        ActionType: "OverrideSystemBehavior",
        Behavior: { Properties: { Strategy: { Type: "SubstituteResource" } } },
      },
    });
  });

  // The envelope AWS documents is Type + Parameters. An earlier version emitted
  // ActionType at the top level with the payload flattened beside it, which no
  // AWS example shows and which a live CreateTestCase would reject.
  // https://docs.aws.amazon.com/connect/latest/devguide/testing-language-example.html
  it("emits every action as Identifier, Type, Parameters, Transitions", () => {
    for (const name of CASES) {
      const { content } = compileScenario(scenarioOf(name));
      for (const observation of content.Observations) {
        for (const action of observation.Actions) {
          expect(Object.keys(action).sort()).toEqual([
            "Identifier",
            "Parameters",
            "Transitions",
            "Type",
          ]);
          expect(typeof action.Type).toBe("string");
          expect(action.Parameters).toBeTypeOf("object");
          // The payload must not leak back to the top level.
          expect(action).not.toHaveProperty("ActionType");
          expect(action).not.toHaveProperty("Actor");
          expect(action).not.toHaveProperty("Namespace");
        }
      }
    }
  });

  it("matches the documented SendInstruction and Assert shapes exactly", () => {
    const { content } = compileScenario(scenarioOf("appointment-lookup-transfer"));
    const actions = content.Observations.flatMap((o) => o.Actions);

    const send = actions.find((a) => a.Type === "SendInstruction");
    expect(send?.Parameters).toMatchObject({
      ActionType: "SendInstruction",
      Actor: "Customer",
      Instruction: { Type: expect.any(String) },
    });

    // Assert, unlike SendInstruction, does NOT repeat ActionType in Parameters,
    // and every Assert carries an Operand: CreateTestCase rejects an Equals
    // without one, and no operator was accepted without one (verified
    // 2026-09-01).
    const assertions = actions.filter((a) => a.Type === "Assert");
    expect(assertions.length).toBeGreaterThan(0);
    for (const assertion of assertions) {
      expect(assertion.Parameters).not.toHaveProperty("ActionType");
      expect(Object.keys(assertion.Parameters).sort()).toEqual([
        "Namespace",
        "Operand",
        "Operator",
      ]);
    }
  });

  // CreateTestCase accepted TextContains and TextStartsWith with an empty
  // Operand and rejected Equals with none (verified 2026-09-01), so an empty
  // value must still be emitted as an Operand key rather than dropped.
  it("keeps an empty assert value as an Operand", () => {
    const { content } = compileScenario({
      scenario: "0.1",
      name: "empty-operand",
      entryPoint: { channel: "voice", flow: "${cdref:flow:appointment-line}" },
      steps: [
        { kind: "assert", path: "$.Attributes.appointmentFound", operator: "Equals", value: "" },
      ],
    });
    const assertion = content.Observations[0]?.Actions.find((a) => a.Type === "Assert");
    expect(assertion?.Parameters).toEqual({
      Namespace: "$.Attributes.appointmentFound",
      Operator: "Equals",
      Operand: "",
    });
    expect(Object.hasOwn(assertion!.Parameters, "Operand")).toBe(true);
  });

  // https://docs.aws.amazon.com/connect/latest/devguide/testing-language-actions-send-instruction.html
  // documents Utterance with a Value; the earlier `Text` key was rejected by
  // CreateTestCase with "Invalid Content" (verified 2026-09-01).
  it("emits customer speech and text as an Utterance with a Value", () => {
    const { content } = compileScenario({
      scenario: "0.1",
      name: "utterances",
      entryPoint: { channel: "voice", flow: "${cdref:flow:appointment-line}" },
      steps: [
        { kind: "send-speech", text: "yes please", languageCode: "en-GB" },
        { kind: "send-speech", text: "no thanks" },
        { kind: "send-text", text: "I need to reschedule" },
      ],
    });
    const instructions = content.Observations[0]?.Actions.filter(
      (a) => a.Type === "SendInstruction",
    ).map((a) => (a.Parameters as { Instruction: unknown }).Instruction);
    expect(instructions).toEqual([
      { Type: "Utterance", Properties: { Value: "yes please", LanguageCode: "en-GB" } },
      { Type: "Utterance", Properties: { Value: "no thanks", LanguageCode: "en-US" } },
      { Type: "Utterance", Properties: { Value: "I need to reschedule" } },
    ]);
    expect(serializeTestContent(content)).not.toContain('"Text"');
  });

  // VoiceCallEntryPointParameters names the flow by FlowId; CreateTestCase
  // rejects a FlowId combined with a DestinationPhoneNumber (verified
  // 2026-09-01), so the compiler never emits one.
  // https://docs.aws.amazon.com/connect/latest/APIReference/API_VoiceCallEntryPointParameters.html
  it("names the voice entry point by FlowId and SourcePhoneNumber only", () => {
    const entry = (sourcePhoneNumber?: string) =>
      compileScenario({
        scenario: "0.1",
        name: "voice-entry",
        entryPoint: { channel: "voice", flow: "${cdref:flow:appointment-line}", sourcePhoneNumber },
        steps: [{ kind: "disconnect" }],
      }).entryPoint;
    expect(entry("+15550123")).toEqual({
      Type: "VOICE_CALL",
      VoiceCallEntryPointParameters: {
        SourcePhoneNumber: "+15550123",
        FlowId: "${cdref:flow:appointment-line}",
      },
    });
    expect(entry()).toEqual({
      Type: "VOICE_CALL",
      VoiceCallEntryPointParameters: {
        SourcePhoneNumber: "+15550100",
        FlowId: "${cdref:flow:appointment-line}",
      },
    });
    expect(JSON.stringify(entry())).not.toContain("DestinationPhoneNumber");
  });

  it("carries the substitution's own action parameters", () => {
    const { content } = compileScenario(scenarioOf("after-hours-message"));
    expect(content.Observations[0]?.Actions[0]?.Parameters).toEqual({
      ActionType: "OverrideSystemBehavior",
      Behavior: {
        Type: "FlowAction",
        Properties: {
          ActionType: "CheckHoursOfOperation",
          ActionParameters: { HoursOfOperationId: "${cdref:hours:main-line}" },
          Strategy: { Type: "SubstituteResource", SubstituteArn: "${cdref:hours:closed}" },
        },
      },
    });
  });

  it("selects the entry point channel, not an input kind", () => {
    expect(compileScenario(scenarioOf("chat-greeting")).entryPoint).toEqual({
      Type: "CHAT",
      ChatEntryPointParameters: { FlowId: "${cdref:flow:appointment-line}" },
    });
    expect(compileScenario(scenarioOf("after-hours-message")).entryPoint.Type).toBe("CHAT");
    expect(compileScenario(scenarioOf("appointment-lookup-transfer")).entryPoint.Type).toBe(
      "VOICE_CALL",
    );
  });

  it("wraps contact attributes in the InitializationData shape Connect reads", () => {
    // Both keys are load-bearing: a flat map read $.Attributes.<key> back
    // empty, and this two-key shape is the only one that read it back at all.
    // Attributes without SegmentAttributes was not shown to work either way:
    // one of its three executions never left INITIATED and the other two
    // failed before the assert ran (verified live 2026-09-01, see
    // CompiledScenario.initializationData).
    const data = compileScenario(scenarioOf("after-hours-message")).initializationData;
    expect(data).toBe(
      '{"Attributes":{"locale":"en-US","testRun":"after-hours"},"SegmentAttributes":{}}',
    );
    expect(Object.keys(JSON.parse(data!))).toEqual(["Attributes", "SegmentAttributes"]);
  });

  it("omits InitializationData when the scenario sets no attributes", () => {
    expect(compileScenario(scenarioOf("chat-greeting")).initializationData).toBeUndefined();
  });
});

describe("resolveScenario", () => {
  it("replaces every token", () => {
    const resolved = resolveScenario(
      compileScenario(scenarioOf("appointment-lookup-transfer")),
      RESOURCE_MAP,
    );
    expect(serializeTestContent(resolved.content)).not.toContain("cdref");
    expect(resolved.entryPoint.VoiceCallEntryPointParameters?.FlowId).toBe(
      RESOURCE_MAP["${cdref:flow:appointment-line}"],
    );
  });

  // CreateTestCase accepted both a bare contact flow id and the flow ARN as
  // FlowId (verified 2026-09-01), so the resource map may carry either and the
  // resolver passes it through unchanged.
  it("passes a bare flow id or a flow ARN through to FlowId", () => {
    const flowArn = RESOURCE_MAP["${cdref:flow:appointment-line}"]!;
    const flowId = flowArn.slice(flowArn.lastIndexOf("/") + 1);
    for (const mapped of [flowArn, flowId]) {
      const resolved = resolveScenario(compileScenario(scenarioOf("chat-greeting")), {
        ...RESOURCE_MAP,
        "${cdref:flow:appointment-line}": mapped,
      });
      expect(resolved.entryPoint.ChatEntryPointParameters?.FlowId).toBe(mapped);
    }
  });

  it("reports every missing token at once", () => {
    let thrown: unknown;
    try {
      resolveScenario(compileScenario(scenarioOf("appointment-lookup-transfer")), {});
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MaterializeError);
    expect((thrown as MaterializeError).missingTokens.length).toBeGreaterThan(3);
  });
});

// --- Runner ------------------------------------------------------------------

interface FakeClientOptions {
  /** Statuses returned by successive getExecutionSummary calls, per scenario. */
  statuses?: Record<string, TestExecutionStatus[]>;
  /** Scenario names whose execution never leaves IN_PROGRESS. */
  hang?: string[];
  /** Fail the first N startExecution calls with a 402. */
  quotaFailures?: number;
  /**
   * The first N executions complete FAILED with no observations and a
   * COMPLETION record carrying INITIALIZATION_FAILURE, the shape Connect
   * returned live for "Failed to start execution of test case due to limit
   * reached" (2026-09-01).
   */
  initializationFailures?: number;
  /**
   * Scenario names whose execution summary carries a status and no
   * observation counts. GetTestCaseExecutionSummary's ExecutionSummary is
   * optional in the API, so the runner cannot rely on one being there.
   */
  summaryWithoutCounts?: string[];
}

const INITIALIZATION_FAILURE_RECORD = JSON.stringify({
  Status: "FAILED",
  CompletionReason: {
    Type: "FAILURE",
    Message: "Failed to start execution of test case due to limit reached.",
    Details: {},
    FailureReasons: ["INITIALIZATION_FAILURE"],
  },
  ExecutionSummary: { TotalObservations: 0, PassedObservations: 0, FailedObservations: 0 },
  Type: "COMPLETION",
});

class FakeTestClient implements FlowTestClient {
  readonly created: CreateTestCaseInput[] = [];
  readonly deleted: string[] = [];
  readonly stopped: string[] = [];
  /** Every startExecution call: test case id and client token. */
  readonly starts: { testCaseId: string; clientToken?: string }[] = [];
  inFlight = 0;
  peakInFlight = 0;
  private quotaFailures: number;
  private initializationFailures: number;
  private readonly notStarted = new Set<string>();
  private readonly nameById = new Map<string, string>();
  private readonly polls = new Map<string, number>();
  private counter = 0;
  private executions = 0;

  constructor(
    private readonly clock: { now: number },
    private readonly options: FakeClientOptions = {},
  ) {
    this.quotaFailures = options.quotaFailures ?? 0;
    this.initializationFailures = options.initializationFailures ?? 0;
  }

  createTestCase(input: CreateTestCaseInput): Promise<{ testCaseId: string }> {
    this.created.push(input);
    this.counter += 1;
    const id = `tc-${String(this.counter)}`;
    this.nameById.set(id, input.name);
    return Promise.resolve({ testCaseId: id });
  }

  startExecution(
    testCaseId: string,
    clientToken?: string,
  ): Promise<{ testCaseExecutionId: string; status: TestExecutionStatus }> {
    this.starts.push(clientToken === undefined ? { testCaseId } : { testCaseId, clientToken });
    if (this.quotaFailures > 0) {
      this.quotaFailures -= 1;
      const error = new Error("Too many executions queued.");
      error.name = "ServiceQuotaExceededException";
      return Promise.reject(error);
    }
    this.executions += 1;
    const executionId = `ex-${testCaseId}-${String(this.executions)}`;
    if (this.initializationFailures > 0) {
      this.initializationFailures -= 1;
      this.notStarted.add(executionId);
    }
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
    return Promise.resolve({ testCaseExecutionId: executionId, status: "INITIATED" });
  }

  getExecutionSummary(testCaseId: string, executionId: string): Promise<ExecutionSummary> {
    if (this.notStarted.has(executionId)) {
      this.inFlight -= 1;
      return Promise.resolve({
        status: "FAILED",
        observations: { total: 0, passed: 0, failed: 0 },
      });
    }
    const name = this.nameById.get(testCaseId) ?? "";
    if (this.options.hang?.includes(name) === true) {
      // Never terminal: the harness must notice the deadline itself.
      this.clock.now += 60_000;
      return Promise.resolve({ status: "IN_PROGRESS" });
    }
    const seq = this.options.statuses?.[name] ?? ["PASSED"];
    const index = Math.min(this.polls.get(testCaseId) ?? 0, seq.length - 1);
    this.polls.set(testCaseId, index + 1);
    const status = seq[index]!;
    if (status !== "INITIATED" && status !== "IN_PROGRESS") this.inFlight -= 1;
    if (this.options.summaryWithoutCounts?.includes(name) === true) {
      return Promise.resolve({ status });
    }
    return Promise.resolve({
      status,
      observations: {
        total: 3,
        passed: status === "PASSED" ? 3 : 1,
        failed: status === "PASSED" ? 0 : 2,
      },
    });
  }

  listExecutionRecords(
    _testCaseId: string,
    executionId: string,
  ): Promise<ExecutionRecordSummary[]> {
    if (this.notStarted.has(executionId)) {
      return Promise.resolve([{ status: "FAILED", record: INITIALIZATION_FAILURE_RECORD }]);
    }
    return Promise.resolve([
      {
        observationId: "observation-2",
        status: "FAILED",
        record: "expected inclusion of 'closed'",
      },
      { observationId: "observation-1", status: "PASSED", record: "ok" },
    ]);
  }

  stopExecution(testCaseId: string): Promise<void> {
    this.stopped.push(testCaseId);
    this.inFlight -= 1;
    return Promise.resolve();
  }

  deleteTestCase(testCaseId: string): Promise<void> {
    this.deleted.push(testCaseId);
    return Promise.resolve();
  }
}

/** A clock that only moves when the runner sleeps, so no test waits on wall time. */
function fakeTimer() {
  const clock = { now: 0 };
  return {
    clock,
    now: () => clock.now,
    sleep: (ms: number) => {
      clock.now += ms;
      return Promise.resolve();
    },
  };
}

describe("runScenarios", () => {
  const suite = () => CASES.map((name) => scenarioOf(name));

  it("creates, publishes, executes, and deletes one test case per scenario", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock);
    const run = await runScenarios(suite(), client, {
      resourceMap: RESOURCE_MAP,
      now: timer.now,
      sleep: timer.sleep,
    });

    expect(run.totals).toEqual({
      total: 3,
      passed: 3,
      failed: 0,
      timedOut: 0,
      errored: 0,
      stopped: 0,
    });
    // A test case is a server-side resource: it must be published before it can
    // run, and removed afterwards or it is left behind on the instance.
    expect(client.created.map((c) => c.status)).toEqual(["PUBLISHED", "PUBLISHED", "PUBLISHED"]);
    expect(client.deleted).toHaveLength(3);
    expect(client.created[0]?.content).not.toContain("cdref");
  });

  it("reports results in the order the suite declared them", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, {
      statuses: { "after-hours-message": ["IN_PROGRESS", "IN_PROGRESS", "PASSED"] },
    });
    const run = await runScenarios(suite(), client, {
      resourceMap: RESOURCE_MAP,
      now: timer.now,
      sleep: timer.sleep,
    });
    expect(run.results.map((r) => r.name)).toEqual([...CASES]);
  });

  it("never runs more than the concurrency cap at once", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, {
      statuses: Object.fromEntries(
        CASES.map((name) => [name, ["IN_PROGRESS", "IN_PROGRESS", "PASSED"]]),
      ),
    });
    await runScenarios(suite(), client, {
      resourceMap: RESOURCE_MAP,
      concurrency: 2,
      now: timer.now,
      sleep: timer.sleep,
    });
    expect(client.peakInFlight).toBeLessThanOrEqual(2);
  });

  it("never exceeds the in-flight admission ceiling", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, {
      statuses: Object.fromEntries(
        CASES.map((name) => [name, ["IN_PROGRESS", "IN_PROGRESS", "PASSED"]]),
      ),
    });
    await runScenarios(suite(), client, {
      resourceMap: RESOURCE_MAP,
      concurrency: SIMULATE_LIMITS.concurrentTests,
      maxInFlight: 1,
      now: timer.now,
      sleep: timer.sleep,
    });
    expect(client.peakInFlight).toBe(1);
  });

  it("refuses a concurrency above the documented limit", async () => {
    const timer = fakeTimer();
    await expect(
      runScenarios(suite(), new FakeTestClient(timer.clock), {
        resourceMap: RESOURCE_MAP,
        concurrency: SIMULATE_LIMITS.concurrentTests + 1,
      }),
    ).rejects.toThrow(/at most that many tests at once/);
  });

  it("refuses an in-flight ceiling above the documented queue depth", async () => {
    const timer = fakeTimer();
    await expect(
      runScenarios(suite(), new FakeTestClient(timer.clock), {
        resourceMap: RESOURCE_MAP,
        maxInFlight: SIMULATE_LIMITS.queueCapacityIncludingRunning + 1,
      }),
    ).rejects.toThrow(/total queue depth/);
  });

  it("surfaces a timeout, stops the execution, and still cleans up", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, { hang: ["chat-greeting"] });
    const run = await runScenarios(suite(), client, {
      resourceMap: RESOURCE_MAP,
      now: timer.now,
      sleep: timer.sleep,
    });
    const timedOut = run.results.find((r) => r.name === "chat-greeting");
    expect(timedOut?.status).toBe("TIMED_OUT");
    expect(timedOut?.durationMs).toBeGreaterThanOrEqual(SIMULATE_LIMITS.maxDurationMs);
    expect(client.stopped).toHaveLength(1);
    expect(client.deleted).toHaveLength(3);
  });

  it("caps the timeout at the documented five minutes", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, { hang: ["chat-greeting"] });
    const run = await runScenarios(suite(), client, {
      resourceMap: RESOURCE_MAP,
      timeoutMs: 60 * 60 * 1000,
      now: timer.now,
      sleep: timer.sleep,
    });
    const timedOut = run.results.find((r) => r.name === "chat-greeting")!;
    expect(timedOut.durationMs).toBeLessThan(SIMULATE_LIMITS.maxDurationMs + 120_000);
  });

  it("collects per-observation detail for a failure", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, {
      statuses: { "after-hours-message": ["FAILED"] },
    });
    const run = await runScenarios(suite(), client, {
      resourceMap: RESOURCE_MAP,
      now: timer.now,
      sleep: timer.sleep,
    });
    const failed = run.results.find((r) => r.name === "after-hours-message")!;
    expect(failed.status).toBe("FAILED");
    expect(failed.observations).toEqual({ total: 3, passed: 1, failed: 2 });
    expect(failed.details).toEqual(["expected inclusion of 'closed'"]);
  });

  // ServiceQuotaExceededException (HTTP 402) is what a full execution queue
  // looks like, and it is the one start error that clears on its own.
  it("backs off and retries when the execution queue is full", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, { quotaFailures: 2 });
    const run = await runScenarios([scenarioOf("after-hours-message")], client, {
      resourceMap: RESOURCE_MAP,
      now: timer.now,
      sleep: timer.sleep,
    });
    expect(run.results[0]?.status).toBe("PASSED");
  });

  // Seen live 2026-09-01 in 3 of 6 back-to-back suite runs: the execution is
  // accepted, then reported FAILED with INITIALIZATION_FAILURE ("Failed to
  // start execution of test case due to limit reached") and zero observations.
  // Nothing was evaluated, so the runner starts the same test case again under
  // a fresh idempotency token rather than reporting a verdict it never got.
  it("starts again when Connect fails the execution before observing anything", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, { initializationFailures: 2 });
    const run = await runScenarios([scenarioOf("after-hours-message")], client, {
      resourceMap: RESOURCE_MAP,
      now: timer.now,
      sleep: timer.sleep,
    });
    const result = run.results[0]!;
    expect(result.status).toBe("PASSED");
    expect(result.observations).toEqual({ total: 3, passed: 3, failed: 0 });
    expect(client.starts.map((s) => s.clientToken)).toEqual([
      "after-hours-message",
      "after-hours-message-retry-1",
      "after-hours-message-retry-2",
    ]);
    // One test case, started three times, deleted once.
    expect(client.created).toHaveLength(1);
    expect(client.deleted).toEqual(["tc-1"]);
    expect(result.executionId).toBe("ex-tc-1-3");
    expect(result.details).toEqual([
      "Execution ex-tc-1-1 did not start (INITIALIZATION_FAILURE: Failed to start execution of test case due to limit reached.); started again.",
      "Execution ex-tc-1-2 did not start (INITIALIZATION_FAILURE: Failed to start execution of test case due to limit reached.); started again.",
    ]);
  });

  it("reports an execution that never started as FAILED once the retries are spent", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, { initializationFailures: 5 });
    const run = await runScenarios([scenarioOf("after-hours-message")], client, {
      resourceMap: RESOURCE_MAP,
      now: timer.now,
      sleep: timer.sleep,
      startRetries: 1,
    });
    const result = run.results[0]!;
    expect(result.status).toBe("FAILED");
    expect(result.observations).toEqual({ total: 0, passed: 0, failed: 0 });
    expect(result.message).toBe(
      "Amazon Connect did not start the execution (INITIALIZATION_FAILURE: Failed to start execution of test case due to limit reached.); 2 attempt(s). The scenario was not evaluated.",
    );
    expect(client.starts).toHaveLength(2);
    // The COMPLETION record itself is kept so the report shows Connect's words.
    expect(result.details?.at(-1)).toContain('"FailureReasons":["INITIALIZATION_FAILURE"]');
  });

  // The failed attempt's summary reads {0, 0, 0}. The next attempt is a
  // different execution, so those counts must not be reported for it when
  // its own terminal summary carries none.
  it("does not carry a failed start's zero counts into the next attempt", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, {
      initializationFailures: 1,
      summaryWithoutCounts: ["after-hours-message"],
      statuses: { "after-hours-message": ["FAILED"] },
    });
    const run = await runScenarios([scenarioOf("after-hours-message")], client, {
      resourceMap: RESOURCE_MAP,
      now: timer.now,
      sleep: timer.sleep,
    });
    const result = run.results[0]!;
    expect(result.status).toBe("FAILED");
    expect(result.executionId).toBe("ex-tc-1-2");
    expect(result.observations).toBeUndefined();
    expect(result.message).toBe("Execution failed.");
    expect(result.details?.[0]).toBe(
      "Execution ex-tc-1-1 did not start (INITIALIZATION_FAILURE: Failed to start execution of test case due to limit reached.); started again.",
    );
  });

  // The 402 retry and the not-started retry draw on the same budget, and the
  // first start keeps the bare scenario name as its token.
  it("shares one retry budget between a full queue and a failed start", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock, {
      quotaFailures: 1,
      initializationFailures: 1,
    });
    const run = await runScenarios([scenarioOf("chat-greeting")], client, {
      resourceMap: RESOURCE_MAP,
      now: timer.now,
      sleep: timer.sleep,
      startRetries: 2,
    });
    expect(run.results[0]?.status).toBe("PASSED");
    expect(client.starts.map((s) => s.clientToken)).toEqual([
      "chat-greeting",
      "chat-greeting-retry-1",
      "chat-greeting-retry-2",
    ]);
  });

  it("records an unresolvable scenario as errored rather than throwing", async () => {
    const timer = fakeTimer();
    const client = new FakeTestClient(timer.clock);
    const run = await runScenarios([scenarioOf("after-hours-message")], client, {
      resourceMap: {},
      now: timer.now,
      sleep: timer.sleep,
    });
    expect(run.results[0]?.status).toBe("ERRORED");
    expect(run.results[0]?.message).toContain("unmapped token");
    expect(client.created).toEqual([]);
  });
});

describe("reporters", () => {
  const run = readJson<SimulationRun>("conformance/simulate/report/run.json");

  it("emits the JUnit golden byte for byte", () => {
    expect(junitReport(run)).toBe(read("conformance/simulate/report/expected.junit.xml"));
  });

  it("emits the JSON golden byte for byte", () => {
    expect(jsonReport(run)).toBe(read("conformance/simulate/report/expected.report.json"));
  });

  it("is deterministic for the same run", () => {
    expect(junitReport(run)).toBe(junitReport(run));
    expect(jsonReport(run)).toBe(jsonReport(run));
  });

  it("escapes XML in messages and details", () => {
    const xml = junitReport(run);
    expect(xml).toContain("&lt;Appointments&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).not.toMatch(/<Appointments>/);
  });

  it("counts a timeout as a failure and a stop as skipped", () => {
    const xml = junitReport(run);
    expect(xml).toContain('failures="2"');
    expect(xml).toContain('errors="1"');
    expect(xml).toContain('skipped="1"');
    expect(xml).toContain('type="TIMED_OUT"');
  });
});

describe("compiled content shape", () => {
  const compiled = (name: string): CompiledScenario => compileScenario(scenarioOf(name));

  it("uses the documented instruction type names", () => {
    const json = serializeTestContent(compiled("chat-greeting").content);
    // The instruction is `Utterance`, not `TextUtterance`.
    expect(json).toContain('"Type": "Utterance"');
    expect(json).toContain('"Type": "Disconnect"');
    expect(json).not.toContain("TextUtterance");
  });

  it("uses Inclusion for contains and Similarity for similarTo", () => {
    const afterHours = serializeTestContent(compiled("after-hours-message").content);
    expect(afterHours).toContain('"Type": "Inclusion"');
    expect(afterHours).not.toContain('"Type": "Similarity"');
    const chat = serializeTestContent(compiled("chat-greeting").content);
    expect(chat).toContain('"Type": "Similarity"');
    expect(chat).not.toContain('"Type": "Inclusion"');
  });

  it("expresses queue reached as an Assert on $.Queue.Name", () => {
    const json = serializeTestContent(compiled("appointment-lookup-transfer").content);
    expect(json).toContain('"Namespace": "$.Queue.Name"');
  });
});

// The JS SDK exposes the API's Problems list as `problemDetails` on an
// InvalidTestCaseException. Without folding it into the message, a rejected
// Content string surfaces only as "Invalid Content" (observed 2026-09-01).
// https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateTestCase.html
describe("describeTestCaseError", () => {
  it("folds every problem detail into the message and keeps the cause", () => {
    const raw = Object.assign(new Error("Invalid Content"), {
      name: "InvalidTestCaseException",
      problemDetails: [
        { message: "Invalid operator parameter for AssertAction" },
        { message: "Invalid operand parameter for AssertAction" },
      ],
    });
    const described = describeTestCaseError(raw);
    expect(described.message).toBe(
      "Invalid Content: Invalid operator parameter for AssertAction; Invalid operand parameter for AssertAction",
    );
    expect(described.name).toBe("InvalidTestCaseException");
    expect(described.cause).toBe(raw);
  });

  it("returns an error without details unchanged", () => {
    const plain = new Error("AccessDeniedException");
    expect(describeTestCaseError(plain)).toBe(plain);
    const empty = Object.assign(new Error("Invalid Content"), { problemDetails: [] });
    expect(describeTestCaseError(empty)).toBe(empty);
    const junk = Object.assign(new Error("Invalid Content"), { problemDetails: [{ code: 1 }] });
    expect(describeTestCaseError(junk)).toBe(junk);
  });

  it("wraps a thrown non-Error", () => {
    expect(describeTestCaseError("boom")).toBeInstanceOf(Error);
    expect(describeTestCaseError("boom").message).toBe("boom");
  });
});

describe("createConnectTestClient", () => {
  it("reports CreateTestCase problem details through the adapter", async () => {
    const raw = Object.assign(new Error("Invalid Content"), {
      name: "InvalidTestCaseException",
      problemDetails: [{ message: "Invalid operand parameter for AssertAction" }],
    });
    const client = createConnectTestClient({
      connect: { send: () => Promise.reject(raw) },
      instanceId: INSTANCE,
    });
    const compiled = compileScenario(scenarioOf("chat-greeting"));
    await expect(
      client.createTestCase({
        name: compiled.name,
        content: serializeTestContent(compiled.content),
        entryPoint: compiled.entryPoint,
        status: "PUBLISHED",
      }),
    ).rejects.toMatchObject({
      name: "InvalidTestCaseException",
      message: "Invalid Content: Invalid operand parameter for AssertAction",
      cause: raw,
    });
  });
});
