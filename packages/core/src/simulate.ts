/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Simulate: authored scenarios in, executed test runs and reports out.
//
// READ THIS BEFORE CHANGING THE SHAPES HERE. There is no Amazon Connect API
// called Simulate, StartFlowSimulation, or anything containing "Simulate".
// SPEC.md described one and was wrong; it is corrected. The real family is
// eleven TestCase operations in connect-2017-08-08, present in
// @aws-sdk/client-connect 3.1122.0 (verified locally: CreateTestCaseCommand,
// StartTestCaseExecutionCommand, GetTestCaseExecutionSummaryCommand,
// ListTestCaseExecutionRecordsCommand, StopTestCaseExecutionCommand,
// DeleteTestCaseCommand and the rest all resolve).
// https://docs.aws.amazon.com/connect/latest/APIReference/API_Operations.html
//
// Two consequences the old SPEC missed and this file is built around:
//
//  1. A test case is a SERVER-SIDE RESOURCE. StartTestCaseExecution "Starts
//     executing a published test case" and takes only a TestCaseId, so there is
//     no submit-and-run call. A scenario file must be materialized into the
//     instance with CreateTestCase(Status=PUBLISHED) first, executed, then
//     deleted. The runner owns that whole lifecycle, cleanup included.
//     https://docs.aws.amazon.com/connect/latest/APIReference/API_StartTestCaseExecution.html
//
//  2. Inputs and expectations are NOT API fields. They live inside the opaque
//     `Content` string as the Connect Testing language: a GRAPH of Observations,
//     each pairing one expected Event with the Actions to take in response.
//     https://docs.aws.amazon.com/connect/latest/devguide/testing-language.html
//     https://docs.aws.amazon.com/connect/latest/devguide/testing-language-example.html
//
// So a Scenario here is an authoring format of ours, deliberately the ordered
// list SPEC.md describes, and `compileScenario` lowers it to the Observation
// graph. Compilation is byte-stable and covered by goldens in
// conformance/simulate/, which is what makes the whole path testable with no
// instance. Content is validated SERVER-SIDE at CreateTestCase time, so the
// compiler's output shape is the one part of this file no offline test can
// confirm. It was verified against a live sandbox instance on 2026-09-01, and
// the Testing language pages are wrong in three places the compiler and the
// validator now encode (each is marked "verified 2026-09-01" where it applies):
//
//  - `Utterance` carries its text as `Properties.Value`, not `Text` or `SSML`.
//  - `Assert` has no working `Exists` operator; `Equals` needs an Operand, and
//    the compiler emits one for every operator.
//  - `VoiceCallEntryPointParameters` rejects `FlowId` alongside
//    `DestinationPhoneNumber` ("Must specify either FlowId or phone numbers").
//
// The JS SDK surfaces the server's findings as `problemDetails: [{ message }]`
// on the InvalidTestCaseException (the API reference calls the field
// `Problems`); the adapter below folds them into the error message.

import {
  createRateLimiter,
  defaultSleep,
  type AwsCommandSender,
  type RateLimiterOptions,
} from "./aws.js";
import { MaterializeError } from "./materialize.js";
import { SLUG_PATTERN } from "./flowdoc.js";
import { collectRefs, isToken, lookupRefValue, parseToken } from "./refs.js";
import { ordered, sortKeys } from "./serialize.js";

/** The scenario authoring format version. Bumped with a migration and fixtures. */
export const SCENARIO_VERSION = "0.1";

/**
 * Documented harness limits. None of these is a Service Quota: the Connect
 * service quotas page has no row for test cases, executions, concurrency, or
 * duration, so there is no quota code and no increase to request. They are
 * feature behaviors documented in the admin guide.
 * https://docs.aws.amazon.com/connect/latest/adminguide/testing-simulation-execute-test-cases.html
 */
export const SIMULATE_LIMITS = {
  /** "You can run up to 5 concurrent tests." */
  concurrentTests: 5,
  /**
   * "The system accepts up to 100 test executions in the queue including the
   * five running tests." The 100 is the total in flight, not 100 queued behind
   * 5 running, and exceeding it is rejected with ServiceQuotaExceededException
   * (HTTP 402) from StartTestCaseExecution.
   */
  queueCapacityIncludingRunning: 100,
  /**
   * "Each test simulation has a maximum duration of 5 minutes." The cap is a
   * hard timeout that reports the execution as FAILED, not as a neutral stop,
   * which is why every compiled scenario ends with a TestControl EndTest.
   */
  maxDurationMs: 300_000,
} as const;

// --- Scenario authoring format ----------------------------------------------

/**
 * The channel is an ENTRY POINT property, not an input kind: the API enum is
 * TestCaseEntryPointType = CHAT | VOICE_CALL. DTMF, speech, and typed text are
 * all SendInstruction instructions within whichever channel the entry point
 * selected. SPEC.md conflated the two axes and is corrected.
 */
export type ScenarioChannel = "voice" | "chat";

export interface ScenarioEntryPoint {
  channel: ScenarioChannel;
  /**
   * `${cdref:flow:...}`; resolved to the entry point's FlowId before
   * CreateTestCase. The resource map may hold either the bare flow id or the
   * contact-flow ARN: the API reference types FlowId as a string of up to 500
   * characters, and CreateTestCase accepted both forms for VOICE_CALL and CHAT
   * (verified 2026-09-01).
   * https://docs.aws.amazon.com/connect/latest/APIReference/API_VoiceCallEntryPointParameters.html
   * https://docs.aws.amazon.com/connect/latest/APIReference/API_ChatEntryPointParameters.html
   */
  flow: string;
  /**
   * Voice only. The simulated caller's number, E.164 (`\+[1-9]\d{1,14}`).
   * Defaults to the fictional VOICE_SOURCE_DEFAULT. There is no destination
   * number: the API's VoiceCallEntryPointParameters treats FlowId and
   * DestinationPhoneNumber as alternatives ("Must specify either FlowId or
   * phone numbers", verified 2026-09-01), and a scenario always names its flow.
   */
  sourcePhoneNumber?: string;
}

/**
 * Assert operators, from the assertion action page minus `Exists`. The page
 * lists `Exists` with "operand not required", and CreateTestCase rejects it
 * with "Invalid operator parameter for AssertAction" whether or not an Operand
 * is given, as it rejects every other spelling tried (verified 2026-09-01).
 * `Equals` without an Operand is rejected and `TextContains` and
 * `TextStartsWith` accept an empty one; the other operators were only sent
 * with an Operand, so the compiler always emits one.
 * https://docs.aws.amazon.com/connect/latest/devguide/testing-language-actions-assertion.html
 */
export type AssertOperator =
  | "Equals"
  | "TextStartsWith"
  | "TextEndsWith"
  | "TextContains"
  | "NumberGreaterThan"
  | "NumberGreaterOrEqualTo"
  | "NumberLessThan"
  | "NumberLessOrEqualTo";

/**
 * One ordered step. Every `expect-*` step opens a new Observation; every other
 * step becomes an Action on the Observation opened most recently.
 */
export type ScenarioStep =
  /** MessageReceived with MatchingCriteria Inclusion (contains) or Similarity. */
  | { kind: "expect-prompt"; contains?: string; similarTo?: string }
  /** FlowActionStarted / InvokeLambdaFunction. SPEC called this an expectation; it is an event. */
  | { kind: "expect-lambda"; lambda: string }
  /** FlowActionStarted / TransferContactToQueue. */
  | { kind: "expect-transfer"; queue: string }
  /** FlowActionStarted / CheckHoursOfOperation. */
  | { kind: "expect-hours-check"; hours: string }
  /** FlowActionStarted / ConnectParticipantWithLexBot. */
  | { kind: "expect-lex"; lex: string }
  /** Assert on $.Queue.Name, the documented namespace example. */
  | { kind: "expect-queue"; name: string }
  /** Assert on any namespace. "attribute set" from SPEC.md lands here. */
  | { kind: "assert"; path: string; operator: AssertOperator; value: string }
  /** Voice only: CreateTestCase rejects DtmfInput under a CHAT entry point. */
  | { kind: "send-dtmf"; value: string }
  | { kind: "send-speech"; text: string; languageCode?: string }
  | { kind: "send-text"; text: string }
  | { kind: "disconnect" };

export type SubstitutionActionType =
  "TransferContactToQueue" | "CheckHoursOfOperation" | "InvokeLambdaFunction";

/**
 * The ActionParameters key that names the resource being overridden, per
 * action type, and the ref type that resource has. CreateTestCase rejects an
 * override whose ActionParameters is empty ("InvalidFlowActionParametersProblem",
 * verified 2026-09-01), so the parameter is required rather than defaulted.
 * QueueId and HoursOfOperationId are verified 2026-09-01 (both substitutions
 * were accepted and executed). LambdaFunctionARN comes from the documented
 * shape only and has not been sent to a live instance:
 * https://docs.aws.amazon.com/connect/latest/devguide/testing-language-actions-override-system-behavior.html
 */
export const SUBSTITUTION_PARAMETER: Readonly<
  Record<SubstitutionActionType, { key: string; refType: "queue" | "hours" | "lambda" }>
> = {
  TransferContactToQueue: { key: "QueueId", refType: "queue" },
  CheckHoursOfOperation: { key: "HoursOfOperationId", refType: "hours" },
  InvokeLambdaFunction: { key: "LambdaFunctionARN", refType: "lambda" },
};

/**
 * Swaps a production resource for a test one at run time. AWS documents this
 * as one of the two ways to keep a simulated contact away from a live agent.
 * https://docs.aws.amazon.com/connect/latest/devguide/testing-language-actions-override-system-behavior.html
 */
export interface ScenarioSubstitution {
  actionType: SubstitutionActionType;
  /**
   * Names the resource the flow uses, as the `${cdref:...}` token under the key
   * SUBSTITUTION_PARAMETER gives for the action type (QueueId,
   * HoursOfOperationId, or LambdaFunctionARN). Every value in the map is a
   * token: the compiler copies the map verbatim into Content, so anything else
   * would put a literal into the test case. A token may resolve to a bare id or
   * an ARN; both are accepted (verified 2026-09-01).
   */
  actionParameters: Record<string, string>;
  /** `${cdref:...}` of the same ref type, for the resource to substitute in. */
  substitute: string;
}

export interface Scenario {
  scenario: typeof SCENARIO_VERSION;
  /** Slug. Used as the Connect test case Name and as the JUnit testcase name. */
  name: string;
  description?: string;
  entryPoint: ScenarioEntryPoint;
  /** Initial contact attributes. Becomes the InitializationData JSON string. */
  attributes?: Record<string, string>;
  steps: ScenarioStep[];
  substitutions?: ScenarioSubstitution[];
  /**
   * Append a TestControl EndTest action. Default true, and turning it off is a
   * validation error for any scenario that expects a queue transfer: without an
   * explicit end "the simulated contact might reach the agent queue and connect
   * with a live agent as a contact", and the run costs a full 5 minutes and
   * reports FAILED besides.
   * https://docs.aws.amazon.com/connect/latest/adminguide/testing-simulation-execute-test-cases.html
   */
  endTest?: boolean;
}

// --- Validation --------------------------------------------------------------

export interface ScenarioFinding {
  /** JSON-ish path into the scenario, e.g. `steps[2].value`. */
  path: string;
  message: string;
}

/** Validation failed. Every finding is reported at once, as lint and materialize do. */
export class ScenarioValidationError extends Error {
  readonly findings: readonly ScenarioFinding[];

  constructor(findings: readonly ScenarioFinding[]) {
    super(
      `Invalid scenario: ${String(findings.length)} problem(s): ` +
        findings.map((f) => `${f.path}: ${f.message}`).join("; "),
    );
    this.name = "ScenarioValidationError";
    this.findings = findings;
  }
}

const ASSERT_OPERATORS: ReadonlySet<string> = new Set<AssertOperator>([
  "Equals",
  "TextStartsWith",
  "TextEndsWith",
  "TextContains",
  "NumberGreaterThan",
  "NumberGreaterOrEqualTo",
  "NumberLessThan",
  "NumberLessOrEqualTo",
]);

const STEP_KINDS: ReadonlySet<string> = new Set([
  "expect-prompt",
  "expect-lambda",
  "expect-transfer",
  "expect-hours-check",
  "expect-lex",
  "expect-queue",
  "assert",
  "send-dtmf",
  "send-speech",
  "send-text",
  "disconnect",
]);

/** DTMF is a digit, star, or pound. */
const DTMF_PATTERN = /^[0-9*#]+$/;
const JSONPATH_PATTERN = /^\$\.[A-Za-z0-9_$.[\]'-]+$/;
/**
 * SourcePhoneNumber's documented pattern, `\+[1-9]\d{1,14}$`: E.164 with no
 * spaces and a country code that cannot start with 0. The leading digit is
 * pinned by conformance/simulate/invalid (source-phone-number-with-a-leading-zero).
 * https://docs.aws.amazon.com/connect/latest/APIReference/API_VoiceCallEntryPointParameters.html
 */
const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tokenOfType(value: unknown, type: string): boolean {
  if (typeof value !== "string") return false;
  const entry = parseToken(value);
  return entry !== undefined && entry.type === type;
}

/**
 * Every problem in one pass. Cross-field safety rules live here rather than in
 * the JSON Schema, which cannot express them readably; the schema is the
 * structural half of the same contract
 * (conformance/schema/scenario-0.1.schema.json).
 */
export function validateScenario(value: unknown): ScenarioFinding[] {
  const findings: ScenarioFinding[] = [];
  const bad = (path: string, message: string) => findings.push({ path, message });

  if (!isRecord(value)) return [{ path: "", message: "scenario must be a JSON object" }];

  if (value.scenario !== SCENARIO_VERSION) {
    bad("scenario", `must be "${SCENARIO_VERSION}"`);
  }
  if (typeof value.name !== "string" || !SLUG_PATTERN.test(value.name)) {
    bad("name", "must be a slug: lowercase words separated by single hyphens");
  }
  if (value.description !== undefined && typeof value.description !== "string") {
    bad("description", "must be a string");
  }

  const entryPoint = value.entryPoint;
  if (!isRecord(entryPoint)) {
    bad("entryPoint", "is required");
  } else {
    if (entryPoint.channel !== "voice" && entryPoint.channel !== "chat") {
      bad("entryPoint.channel", 'must be "voice" or "chat"');
    }
    if (!tokenOfType(entryPoint.flow, "flow")) {
      bad("entryPoint.flow", "must be a ${cdref:flow:...} token");
    }
    const phone = entryPoint.sourcePhoneNumber;
    if (entryPoint.channel === "chat" && phone !== undefined) {
      // One finding per field: a number that is also malformed is still just
      // a number that does not belong here.
      bad("entryPoint.sourcePhoneNumber", "is voice only");
    } else if (phone !== undefined && (typeof phone !== "string" || !E164_PATTERN.test(phone))) {
      bad("entryPoint.sourcePhoneNumber", "must be an E.164 number such as +15550100");
    }
    if (entryPoint.destinationPhoneNumber !== undefined) {
      // Verified 2026-09-01: CreateTestCase answers "Must specify either FlowId
      // or phone numbers" when VoiceCallEntryPointParameters carries both, and
      // a scenario always carries its flow.
      bad(
        "entryPoint.destinationPhoneNumber",
        "is not a scenario field: the entry point names its flow, and CreateTestCase rejects a FlowId combined with a DestinationPhoneNumber",
      );
    }
  }

  if (value.attributes !== undefined) {
    if (!isRecord(value.attributes)) {
      bad("attributes", "must be an object of string values");
    } else {
      for (const [key, attribute] of Object.entries(value.attributes)) {
        if (typeof attribute !== "string") bad(`attributes.${key}`, "must be a string");
      }
    }
  }

  const steps = value.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    bad("steps", "must be a non-empty array");
  } else {
    steps.forEach((step: unknown, i) => {
      const at = `steps[${String(i)}]`;
      if (!isRecord(step)) {
        bad(at, "must be an object");
        return;
      }
      const kind = step.kind;
      if (typeof kind !== "string" || !STEP_KINDS.has(kind)) {
        bad(`${at}.kind`, `must be one of ${[...STEP_KINDS].join(", ")}`);
        return;
      }
      switch (kind) {
        case "expect-prompt": {
          const hasContains = typeof step.contains === "string" && step.contains !== "";
          const hasSimilar = typeof step.similarTo === "string" && step.similarTo !== "";
          if (hasContains === hasSimilar) {
            bad(at, "needs exactly one of contains or similarTo");
          }
          break;
        }
        case "expect-lambda":
          if (!tokenOfType(step.lambda, "lambda")) {
            bad(`${at}.lambda`, "must be a ${cdref:lambda:...} token");
          }
          break;
        case "expect-transfer":
          if (!tokenOfType(step.queue, "queue")) {
            bad(`${at}.queue`, "must be a ${cdref:queue:...} token");
          }
          break;
        case "expect-hours-check":
          if (!tokenOfType(step.hours, "hours")) {
            bad(`${at}.hours`, "must be a ${cdref:hours:...} token");
          }
          break;
        case "expect-lex":
          if (!tokenOfType(step.lex, "lex")) {
            bad(`${at}.lex`, "must be a ${cdref:lex:...} token");
          }
          break;
        case "expect-queue":
          if (typeof step.name !== "string" || step.name === "") {
            bad(`${at}.name`, "must be the queue name the flow reports in $.Queue.Name");
          }
          break;
        case "assert": {
          if (typeof step.path !== "string" || !JSONPATH_PATTERN.test(step.path)) {
            bad(`${at}.path`, "must be a single JSONPath identifier such as $.Attributes.locale");
          }
          if (typeof step.operator !== "string" || !ASSERT_OPERATORS.has(step.operator)) {
            bad(
              `${at}.operator`,
              `must be one of ${[...ASSERT_OPERATORS].join(", ")} (the documented Exists operator is rejected by CreateTestCase)`,
            );
          }
          if (typeof step.value !== "string") {
            bad(`${at}.value`, "is required: every Assert operator takes an Operand");
          }
          break;
        }
        case "send-dtmf":
          if (typeof step.value !== "string" || !DTMF_PATTERN.test(step.value)) {
            bad(`${at}.value`, "must be digits, * or #");
          }
          if (isRecord(entryPoint) && entryPoint.channel === "chat") {
            // Verified 2026-09-01: "DTMF input is not supported for Chat entry point".
            bad(
              at,
              "send-dtmf is voice only: CreateTestCase rejects DtmfInput under a CHAT entry point",
            );
          }
          break;
        case "send-speech":
        case "send-text":
          if (typeof step.text !== "string" || step.text === "") {
            bad(`${at}.text`, "must be a non-empty string");
          }
          if (
            kind === "send-speech" &&
            step.languageCode !== undefined &&
            typeof step.languageCode !== "string"
          ) {
            bad(`${at}.languageCode`, "must be a string such as en-US");
          }
          break;
        default:
          break;
      }
    });
  }

  if (value.substitutions !== undefined) {
    if (!Array.isArray(value.substitutions)) {
      bad("substitutions", "must be an array");
    } else {
      value.substitutions.forEach((substitution: unknown, i) => {
        const at = `substitutions[${String(i)}]`;
        if (!isRecord(substitution)) {
          bad(at, "must be an object");
          return;
        }
        const spec =
          typeof substitution.actionType === "string" &&
          Object.hasOwn(SUBSTITUTION_PARAMETER, substitution.actionType)
            ? SUBSTITUTION_PARAMETER[substitution.actionType as SubstitutionActionType]
            : undefined;
        if (spec === undefined) {
          bad(
            `${at}.actionType`,
            "must be TransferContactToQueue, CheckHoursOfOperation, or InvokeLambdaFunction",
          );
          return;
        }
        const token = `\${cdref:${spec.refType}:...}`;
        // An override names the resource it replaces; an empty ActionParameters
        // is rejected server-side (verified 2026-09-01).
        const parameters = substitution.actionParameters;
        if (!isRecord(parameters) || !tokenOfType(parameters[spec.key], spec.refType)) {
          bad(`${at}.actionParameters`, `must carry ${spec.key} as a ${token} token`);
        }
        // Every value in the map is a resource reference by definition, and the
        // compiler copies the map verbatim into Content, so a literal here would
        // be a literal ARN in the test case. Same rule as the schema's
        // additionalProperties.
        if (isRecord(parameters)) {
          for (const [key, parameter] of Object.entries(parameters)) {
            if (!isToken(parameter)) {
              bad(`${at}.actionParameters.${key}`, "must be a ${cdref:...} token, never a literal");
            }
          }
        }
        if (!tokenOfType(substitution.substitute, spec.refType)) {
          bad(`${at}.substitute`, `must be a ${token} token`);
        }
      });
    }
  }

  if (value.endTest !== undefined && typeof value.endTest !== "boolean") {
    bad("endTest", "must be a boolean");
  }

  // Safety, and it is a hard rule rather than an option: a simulated contact
  // that reaches a queue can connect to a live agent. AWS documents two
  // mitigations, ending the test before the transfer and substituting a test
  // queue, so a scenario that transfers must do one of them.
  const transfers =
    Array.isArray(steps) && steps.some((s: unknown) => isRecord(s) && s.kind === "expect-transfer");
  const substitutesQueue =
    Array.isArray(value.substitutions) &&
    value.substitutions.some(
      (s: unknown) => isRecord(s) && s.actionType === "TransferContactToQueue",
    );
  if (transfers && value.endTest === false && !substitutesQueue) {
    bad(
      "endTest",
      "a scenario that expects a queue transfer must end the test or substitute the queue, or the simulated contact can reach a live agent",
    );
  }

  return findings;
}

/** Validates and narrows. Throws a ScenarioValidationError listing every problem. */
export function parseScenario(value: unknown): Scenario {
  const findings = validateScenario(value);
  if (findings.length > 0) throw new ScenarioValidationError(findings);
  return value as Scenario;
}

// --- Compilation to the Connect Testing language -----------------------------

export interface TestEvent {
  Identifier: string;
  Type: "TestInitiated" | "TestCompleted" | "MessageReceived" | "FlowActionStarted";
  Actor: "System";
  Properties: Record<string, unknown>;
}

/**
 * A Connect Testing language Action.
 *
 * The discriminator is `Type` and the payload lives in `Parameters`; an
 * earlier version of this file emitted `ActionType` at the top level with the
 * payload flattened beside it, which no AWS example shows. Verified against the
 * worked example, which is the only place the full envelope appears:
 * https://docs.aws.amazon.com/connect/latest/devguide/testing-language-example.html
 *
 * Note that SendInstruction and OverrideSystemBehavior repeat `ActionType`
 * INSIDE Parameters while Assert does not. That asymmetry is what the example
 * shows, so it is reproduced faithfully rather than normalized.
 */
export type TestActionType =
  "SendInstruction" | "Assert" | "OverrideSystemBehavior" | "TestControl";

export interface TestAction {
  Identifier: string;
  Type: TestActionType;
  Parameters: Record<string, unknown>;
  Transitions: Record<string, unknown>;
}

export interface TestObservation {
  Identifier: string;
  Event: TestEvent;
  Actions: TestAction[];
  Transitions: { NextObservations: string[] };
}

export interface TestingLanguageDocument {
  Version: "2019-10-30";
  Metadata: Record<string, unknown>;
  Observations: TestObservation[];
}

/**
 * The CreateTestCase EntryPoint. The compiler never emits
 * DestinationPhoneNumber (see ScenarioEntryPoint), so the type does not carry
 * it.
 * https://docs.aws.amazon.com/connect/latest/APIReference/API_TestCaseEntryPoint.html
 */
export interface TestCaseEntryPoint {
  Type: "VOICE_CALL" | "CHAT";
  VoiceCallEntryPointParameters?: { SourcePhoneNumber?: string; FlowId: string };
  ChatEntryPointParameters?: { FlowId: string };
}

/** Everything CreateTestCase needs, with `${cdref:...}` tokens still in place. */
export interface CompiledScenario {
  name: string;
  description?: string;
  entryPoint: TestCaseEntryPoint;
  /**
   * The InitializationData JSON string. Documented only as "Defines the initial
   * custom attributes for your test" and "must be a valid JSON string"; no
   * example or key list is published, so the shape was found by executing
   * variants against a sandbox (verified 2026-09-01):
   *
   *  - `{"Attributes": {...}, "SegmentAttributes": {}}` is the only shape that
   *    read the value back: an Assert on `$.Attributes.<key>` PASSED with it.
   *  - A flat `{"key": "value"}` map, and the wrappers `ContactData`,
   *    `ContactAttributes`, `CustomAttributes` and JSONPath keys, are accepted
   *    by CreateTestCase but the Assert read `$.Attributes.<key>` back empty.
   *  - The lowercase `attributes` wrapper is accepted; its one execution failed
   *    on an observation before the Assert ran, so nothing is known about the
   *    value it produces.
   *  - `{"Attributes": {...}}` WITHOUT `SegmentAttributes` is accepted. Of three
   *    executions, one stayed INITIATED for the whole 240 s wait, and two
   *    started the contact but failed on an observation before the Assert ran,
   *    so it is not known to read back either. Both keys are always emitted
   *    because the two-key shape is the one shown to work.
   * https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateTestCase.html
   */
  initializationData?: string;
  content: TestingLanguageDocument;
}

/** Fictional, and it matches the API's E.164 pattern (verified 2026-09-01). */
const VOICE_SOURCE_DEFAULT = "+15550100";

function eventFor(step: ScenarioStep, identifier: string): TestEvent | undefined {
  switch (step.kind) {
    case "expect-prompt":
      return {
        Identifier: identifier,
        Type: "MessageReceived",
        Actor: "System",
        Properties:
          step.contains === undefined
            ? { Text: step.similarTo, MatchingCriteria: { Type: "Similarity" } }
            : { Text: step.contains, MatchingCriteria: { Type: "Inclusion" } },
      };
    case "expect-lambda":
      return {
        Identifier: identifier,
        Type: "FlowActionStarted",
        Actor: "System",
        Properties: {
          ActionType: "InvokeLambdaFunction",
          ActionParameters: { LambdaFunctionARN: step.lambda },
        },
      };
    case "expect-transfer":
      return {
        Identifier: identifier,
        Type: "FlowActionStarted",
        Actor: "System",
        Properties: {
          ActionType: "TransferContactToQueue",
          ActionParameters: { QueueId: step.queue },
        },
      };
    case "expect-hours-check":
      return {
        Identifier: identifier,
        Type: "FlowActionStarted",
        Actor: "System",
        Properties: {
          ActionType: "CheckHoursOfOperation",
          ActionParameters: { HoursOfOperationId: step.hours },
        },
      };
    case "expect-lex":
      return {
        Identifier: identifier,
        Type: "FlowActionStarted",
        Actor: "System",
        Properties: {
          ActionType: "ConnectParticipantWithLexBot",
          ActionParameters: { LexV2Bot: { AliasArn: step.lex } },
        },
      };
    default:
      return undefined;
  }
}

function actionFor(step: ScenarioStep, identifier: string): TestAction | undefined {
  const sendInstruction = (instruction: Record<string, unknown>): TestAction => ({
    Identifier: identifier,
    Type: "SendInstruction",
    Parameters: { ActionType: "SendInstruction", Actor: "Customer", Instruction: instruction },
    Transitions: {},
  });
  const assert = (parameters: Record<string, unknown>): TestAction => ({
    Identifier: identifier,
    Type: "Assert",
    Parameters: parameters,
    Transitions: {},
  });

  // Utterance carries its text as `Value`. The SendInstruction page documents
  // `Text` and `SSML`; CreateTestCase rejects both with "Invalid test case
  // content" and accepts a non-empty `Value`, with LanguageCode optional
  // (verified 2026-09-01 against a sandbox instance, chat and voice).
  // https://docs.aws.amazon.com/connect/latest/devguide/testing-language-actions-send-instruction.html
  switch (step.kind) {
    case "send-dtmf":
      return sendInstruction({ Type: "DtmfInput", Properties: { Value: step.value } });
    case "send-speech":
      return sendInstruction({
        Type: "Utterance",
        Properties: { Value: step.text, LanguageCode: step.languageCode ?? "en-US" },
      });
    case "send-text":
      return sendInstruction({ Type: "Utterance", Properties: { Value: step.text } });
    case "disconnect":
      // The documented Disconnect example carries no Properties member at all.
      return sendInstruction({ Type: "Disconnect" });
    case "expect-queue":
      return assert({ Namespace: "$.Queue.Name", Operator: "Equals", Operand: step.name });
    case "assert":
      return assert({ Namespace: step.path, Operator: step.operator, Operand: step.value });
    default:
      return undefined;
  }
}

function substitutionAction(substitution: ScenarioSubstitution, identifier: string): TestAction {
  return {
    Identifier: identifier,
    Type: "OverrideSystemBehavior",
    Parameters: {
      ActionType: "OverrideSystemBehavior",
      Behavior: {
        Type: "FlowAction",
        Properties: {
          ActionType: substitution.actionType,
          ActionParameters: substitution.actionParameters,
          Strategy: { Type: "SubstituteResource", SubstituteArn: substitution.substitute },
        },
      },
    },
    Transitions: {},
  };
}

/**
 * Scenario in, Connect Testing language out. Deterministic: identifiers are
 * positional, so the same scenario compiles to the same bytes every time.
 */
export function compileScenario(scenario: Scenario): CompiledScenario {
  const findings = validateScenario(scenario);
  if (findings.length > 0) throw new ScenarioValidationError(findings);

  const observations: TestObservation[] = [];
  const open = (event: (identifier: string) => TestEvent): TestObservation => {
    const index = observations.length + 1;
    const identifier = `observation-${String(index)}`;
    const observation: TestObservation = {
      Identifier: identifier,
      Event: event(`${identifier}-event`),
      Actions: [],
      Transitions: { NextObservations: [] },
    };
    observations.push(observation);
    return observation;
  };

  // The graph always starts at TestInitiated: anything the customer does before
  // the flow says something is a response to the test starting.
  let current = open((identifier) => ({
    Identifier: identifier,
    Type: "TestInitiated",
    Actor: "System",
    Properties: {},
  }));

  // Resource substitutions apply from the first observation, before the flow
  // has had a chance to transfer anywhere.
  for (const substitution of scenario.substitutions ?? []) {
    current.Actions.push(
      substitutionAction(
        substitution,
        `${current.Identifier}-action-${String(current.Actions.length + 1)}`,
      ),
    );
  }

  for (const step of scenario.steps) {
    // An expectation is an Event, so it opens a new Observation. Everything
    // else is an Action responding to the Observation opened most recently.
    const probe = eventFor(step, "probe");
    if (probe !== undefined) {
      current = open((identifier) => eventFor(step, identifier) as TestEvent);
      continue;
    }
    const action = actionFor(
      step,
      `${current.Identifier}-action-${String(current.Actions.length + 1)}`,
    );
    if (action !== undefined) current.Actions.push(action);
  }

  if (scenario.endTest !== false) {
    // EndTest is the safety default: AWS documents that a simulated contact
    // which reaches a queue transfer "might reach the agent queue and connect
    // with a live agent as a contact".
    // https://docs.aws.amazon.com/connect/latest/adminguide/testing-simulation-execute-test-cases.html
    current.Actions.push({
      Identifier: `${current.Identifier}-action-${String(current.Actions.length + 1)}`,
      Type: "TestControl",
      Parameters: { ActionType: "TestControl", Command: { Type: "EndTest" } },
      Transitions: {},
    });
  }

  // Observations chain forward; actions chain within an observation.
  observations.forEach((observation, i) => {
    const next = observations[i + 1];
    observation.Transitions = { NextObservations: next === undefined ? [] : [next.Identifier] };
    observation.Actions.forEach((action, j) => {
      const nextAction = observation.Actions[j + 1];
      action.Transitions = nextAction === undefined ? {} : { NextAction: nextAction.Identifier };
    });
  });

  // A voice entry point is FlowId plus SourcePhoneNumber and nothing else.
  // CreateTestCase rejects FlowId combined with DestinationPhoneNumber ("Must
  // specify either FlowId or phone numbers") and accepts FlowId alone or with
  // SourcePhoneNumber (verified 2026-09-01); the fictional default keeps the
  // simulated caller's number deterministic. Every field is optional in the
  // API reference, which is why the rule had to be found empirically.
  // https://docs.aws.amazon.com/connect/latest/APIReference/API_VoiceCallEntryPointParameters.html
  const entryPoint: TestCaseEntryPoint =
    scenario.entryPoint.channel === "chat"
      ? { Type: "CHAT", ChatEntryPointParameters: { FlowId: scenario.entryPoint.flow } }
      : {
          Type: "VOICE_CALL",
          VoiceCallEntryPointParameters: {
            SourcePhoneNumber: scenario.entryPoint.sourcePhoneNumber ?? VOICE_SOURCE_DEFAULT,
            FlowId: scenario.entryPoint.flow,
          },
        };

  const compiled: CompiledScenario = {
    name: scenario.name,
    ...(scenario.description === undefined ? {} : { description: scenario.description }),
    entryPoint,
    content: { Version: "2019-10-30", Metadata: {}, Observations: observations },
  };
  if (scenario.attributes !== undefined && Object.keys(scenario.attributes).length > 0) {
    compiled.initializationData = JSON.stringify({
      Attributes: sortKeys(scenario.attributes),
      SegmentAttributes: {},
    });
  }
  return compiled;
}

/** Canonical JSON for the CreateTestCase Content string. Byte-stable. */
export function serializeTestContent(content: TestingLanguageDocument): string {
  const canonical = ordered(
    {
      Version: content.Version,
      Metadata: sortKeys(content.Metadata),
      Observations: content.Observations.map((observation) =>
        ordered(
          {
            Identifier: observation.Identifier,
            Event: sortKeys(observation.Event),
            Actions: observation.Actions.map((action) => sortKeys(action)),
            Transitions: sortKeys(observation.Transitions),
          } as Record<string, unknown>,
          ["Identifier", "Event", "Actions", "Transitions"],
        ),
      ),
    } as Record<string, unknown>,
    ["Version", "Metadata", "Observations"],
  );
  return JSON.stringify(canonical, null, 2) + "\n";
}

function resolveDeep(value: unknown, resourceMap: Record<string, string>): unknown {
  if (typeof value === "string") {
    const entry = parseToken(value);
    // Not a token: left exactly as written. A token the map has no entry for
    // under any of its three key forms is also left as written, because
    // resolveScenario has already refused the whole scenario by then and this
    // branch is only reached by a caller resolving a map it knows is partial.
    if (entry === undefined) return value;
    return lookupRefValue(resourceMap, entry) ?? value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, resourceMap));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        resolveDeep(v, resourceMap),
      ]),
    );
  }
  return value;
}

/**
 * Replaces every token in a compiled scenario with its resolved value. Strict,
 * and it reports every missing reference at once, exactly as materializeWithMap
 * does; it throws the same MaterializeError so callers handle one type, and it
 * accepts the same three key forms so one map file works for `render`,
 * `simulate` and `emit --target tf` alike (packages/core/src/refs.ts).
 */
export function resolveScenario(
  compiled: CompiledScenario,
  resourceMap: Record<string, string>,
): CompiledScenario {
  const missing = collectRefs(compiled).filter(
    (entry) => lookupRefValue(resourceMap, entry) === undefined,
  );
  if (missing.length > 0) throw MaterializeError.missingKeys(missing);
  return resolveDeep(compiled, resourceMap) as CompiledScenario;
}

// --- Client seam -------------------------------------------------------------

/** TestCaseExecutionStatus, verbatim from the API. */
export type TestExecutionStatus = "INITIATED" | "IN_PROGRESS" | "PASSED" | "FAILED" | "STOPPED";

export interface CreateTestCaseInput {
  name: string;
  description?: string;
  /** The Content string: the compiled and resolved Testing language document. */
  content: string;
  entryPoint: TestCaseEntryPoint;
  initializationData?: string;
  /** PUBLISHED, because only a published test case can be executed. */
  status: "PUBLISHED" | "SAVED";
}

export interface ExecutionSummary {
  status: TestExecutionStatus;
  startTime?: string;
  endTime?: string;
  observations?: { total?: number; passed?: number; failed?: number };
}

export interface ExecutionRecordSummary {
  observationId?: string;
  status?: "PASSED" | "FAILED" | "IN_PROGRESS" | "STOPPED";
  timestamp?: string;
  /**
   * "The details of the executed record", documented only as a string. Treated
   * as an opaque message payload; its schema is not published.
   * https://docs.aws.amazon.com/connect/latest/APIReference/API_ListTestCaseExecutionRecords.html
   */
  record?: string;
}

/**
 * The narrow seam the runner talks to. Every method maps one-to-one onto a
 * TestCase operation, so a fake in a test and the SDK adapter are the same
 * shape.
 */
export interface FlowTestClient {
  createTestCase(input: CreateTestCaseInput): Promise<{ testCaseId: string; testCaseArn?: string }>;
  startExecution(
    testCaseId: string,
    clientToken?: string,
  ): Promise<{ testCaseExecutionId: string; status: TestExecutionStatus }>;
  getExecutionSummary(testCaseId: string, executionId: string): Promise<ExecutionSummary>;
  listExecutionRecords(testCaseId: string, executionId: string): Promise<ExecutionRecordSummary[]>;
  stopExecution(testCaseId: string, executionId: string): Promise<void>;
  deleteTestCase(testCaseId: string): Promise<void>;
}

// --- Runner ------------------------------------------------------------------

export type ScenarioStatus = "PASSED" | "FAILED" | "TIMED_OUT" | "ERRORED" | "STOPPED";

export interface ScenarioResult {
  name: string;
  status: ScenarioStatus;
  durationMs: number;
  testCaseId?: string;
  executionId?: string;
  observations?: { total: number; passed: number; failed: number };
  message?: string;
  details?: string[];
}

export interface SimulationRun {
  startedAt: string;
  finishedAt: string;
  totals: {
    total: number;
    passed: number;
    failed: number;
    timedOut: number;
    errored: number;
    stopped: number;
  };
  results: ScenarioResult[];
}

export interface RunOptions {
  /** Token to value, exactly as materializeWithMap takes. */
  resourceMap: Record<string, string>;
  /** At most SIMULATE_LIMITS.concurrentTests. */
  concurrency?: number;
  /**
   * Admission ceiling on executions this runner keeps in flight. Defaults to
   * the documented queue capacity, which INCLUDES the running tests.
   */
  maxInFlight?: number;
  /** Per scenario. Capped at the documented 5 minutes. */
  timeoutMs?: number;
  /**
   * Poll interval for GetTestCaseExecutionSummary. Connect's default quota is
   * 2 rps per account per Region across all operations, so polling faster than
   * this buys nothing but ThrottlingExceptions.
   * https://docs.aws.amazon.com/connect/latest/adminguide/amazon-connect-service-limits.html#connect-api-quotas
   */
  pollIntervalMs?: number;
  /** Delete each test case after its execution finishes. Default true. */
  cleanup?: boolean;
  /**
   * Extra starts per scenario when the first does not take: a
   * ServiceQuotaExceededException (HTTP 402) from StartTestCaseExecution, or an
   * execution that Connect reports FAILED with INITIALIZATION_FAILURE before it
   * observed anything. Default 3. Backoff is pollIntervalMs times the attempt.
   */
  startRetries?: number;
  /** Injected for tests. */
  now?: () => number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Idempotency token per scenario. Default: the scenario name. */
  clientToken?: (scenario: Scenario, attempt: number) => string;
}

function isQuotaExceeded(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "ServiceQuotaExceededException"
  );
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * The COMPLETION record of an execution that Connect failed before it observed
 * anything: `CompletionReason.FailureReasons` carries `INITIALIZATION_FAILURE`
 * and the message says why ("Failed to start execution of test case due to
 * limit reached" is the one seen live). The record's schema is not published,
 * so anything that does not parse into that shape is not an admission failure.
 * Returns the reason text, or undefined when the execution did start.
 */
function initializationFailure(records: readonly ExecutionRecordSummary[]): string | undefined {
  for (const { record } of records) {
    if (record === undefined) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(record);
    } catch {
      continue;
    }
    if (!isRecord(parsed) || parsed.Type !== "COMPLETION" || !isRecord(parsed.CompletionReason)) {
      continue;
    }
    const reasons = parsed.CompletionReason.FailureReasons;
    if (!Array.isArray(reasons) || !reasons.includes("INITIALIZATION_FAILURE")) continue;
    const message = parsed.CompletionReason.Message;
    return typeof message === "string" && message !== ""
      ? `INITIALIZATION_FAILURE: ${message}`
      : "INITIALIZATION_FAILURE";
  }
  return undefined;
}

/**
 * Creates, publishes, executes, polls, collects, and deletes one test case per
 * scenario, within the documented limits. The whole lifecycle exists because
 * StartTestCaseExecution runs a stored, published test case and there is no
 * submit-and-run call.
 */
export async function runScenarios(
  scenarios: readonly Scenario[],
  client: FlowTestClient,
  options: RunOptions,
): Promise<SimulationRun> {
  const concurrency = options.concurrency ?? SIMULATE_LIMITS.concurrentTests;
  if (concurrency < 1 || concurrency > SIMULATE_LIMITS.concurrentTests) {
    throw new Error(
      `concurrency must be between 1 and ${String(SIMULATE_LIMITS.concurrentTests)}: Amazon Connect runs at most that many tests at once and queues the rest.`,
    );
  }
  const maxInFlight = options.maxInFlight ?? SIMULATE_LIMITS.queueCapacityIncludingRunning;
  if (maxInFlight < 1 || maxInFlight > SIMULATE_LIMITS.queueCapacityIncludingRunning) {
    throw new Error(
      `maxInFlight must be between 1 and ${String(SIMULATE_LIMITS.queueCapacityIncludingRunning)}: that is the total queue depth, running tests included.`,
    );
  }
  const timeoutMs = Math.min(
    options.timeoutMs ?? SIMULATE_LIMITS.maxDurationMs,
    SIMULATE_LIMITS.maxDurationMs,
  );
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const cleanup = options.cleanup !== false;
  const startRetries = options.startRetries ?? 3;
  // ClientToken makes StartTestCaseExecution idempotent, so a second start must
  // not repeat the first attempt's token or it would name the execution that
  // already failed instead of starting another. The first attempt keeps the
  // scenario name so a retried run of the same suite stays idempotent.
  // https://docs.aws.amazon.com/connect/latest/APIReference/API_StartTestCaseExecution.html
  const clientTokenFor = (scenario: Scenario, attempt: number): string =>
    options.clientToken?.(scenario, attempt) ??
    (attempt === 0 ? scenario.name : `${scenario.name}-retry-${String(attempt)}`);

  const startedAtMs = now();
  const results = new Array<ScenarioResult>(scenarios.length);
  let cursor = 0;
  let inFlight = 0;

  const runOne = async (scenario: Scenario): Promise<ScenarioResult> => {
    const scenarioStart = now();
    const result: ScenarioResult = { name: scenario.name, status: "ERRORED", durationMs: 0 };
    let testCaseId: string | undefined;
    let executionId: string | undefined;

    try {
      const resolved = resolveScenario(compileScenario(scenario), options.resourceMap);
      const created = await client.createTestCase({
        name: scenario.name,
        ...(resolved.description === undefined ? {} : { description: resolved.description }),
        content: serializeTestContent(resolved.content),
        entryPoint: resolved.entryPoint,
        ...(resolved.initializationData === undefined
          ? {}
          : { initializationData: resolved.initializationData }),
        // PUBLISHED also triggers server-side validation of Content, which is
        // where a malformed Testing language document is caught.
        status: "PUBLISHED",
      });
      testCaseId = created.testCaseId;
      result.testCaseId = testCaseId;

      // One retry budget covers both ways a start can fail: synchronously with
      // a 402, and asynchronously with an execution that Connect reports
      // FAILED before it observed anything (INITIALIZATION_FAILURE, "Failed to
      // start execution of test case due to limit reached", seen live when
      // several voice simulations ran back to back). Neither is a verdict on
      // the scenario, so the same test case is started again.
      let attempt = 0;
      for (;;) {
        let started: { testCaseExecutionId: string; status: TestExecutionStatus } | undefined;
        while (started === undefined) {
          try {
            started = await client.startExecution(testCaseId, clientTokenFor(scenario, attempt));
          } catch (error) {
            // 402 means the 100-deep execution queue is full. Back off; it is
            // the one start error that clears on its own.
            if (!isQuotaExceeded(error) || attempt >= startRetries) throw error;
            attempt += 1;
            await sleep(pollIntervalMs * attempt);
          }
        }

        executionId = started.testCaseExecutionId;
        result.executionId = executionId;
        // Each attempt is its own execution. The counts of one that did not
        // start ({0, 0, 0}) must not stand in for the next one when Connect
        // reaches a terminal status without reporting a summary, or the result
        // would read "0 of 0 observations failed" for an execution that ran.
        delete result.observations;
        let status: TestExecutionStatus = started.status;
        let summary: ExecutionSummary | undefined;
        let timedOut = false;

        while (status === "INITIATED" || status === "IN_PROGRESS") {
          if (now() - scenarioStart >= timeoutMs) {
            timedOut = true;
            try {
              await client.stopExecution(testCaseId, executionId);
            } catch {
              // Best effort: Connect fails the execution at 5 minutes anyway.
            }
            break;
          }
          await sleep(pollIntervalMs);
          summary = await client.getExecutionSummary(testCaseId, executionId);
          status = summary.status;
        }

        if (summary?.observations !== undefined) {
          result.observations = {
            total: summary.observations.total ?? 0,
            passed: summary.observations.passed ?? 0,
            failed: summary.observations.failed ?? 0,
          };
        }

        if (timedOut) {
          result.status = "TIMED_OUT";
          result.message = `No terminal status within ${String(timeoutMs)} ms. Amazon Connect also times a simulation out at 5 minutes and reports it FAILED, so the scenario probably never reached a TestControl EndTest.`;
        } else if (status === "PASSED") {
          result.status = "PASSED";
        } else if (status === "STOPPED") {
          result.status = "STOPPED";
          result.message = "Execution was stopped.";
        } else {
          const records = await client.listExecutionRecords(testCaseId, executionId);
          const notStarted = initializationFailure(records);
          if (notStarted !== undefined && attempt < startRetries) {
            attempt += 1;
            result.details = [
              ...(result.details ?? []),
              `Execution ${executionId} did not start (${notStarted}); started again.`,
            ];
            await sleep(pollIntervalMs * attempt);
            continue;
          }
          result.status = "FAILED";
          const failed = records.filter((record) => record.status === "FAILED");
          result.details = [
            ...(result.details ?? []),
            ...failed
              .map((record) => record.record ?? record.observationId ?? "")
              .filter((detail) => detail !== ""),
          ];
          result.message =
            notStarted !== undefined
              ? `Amazon Connect did not start the execution (${notStarted}); ${String(attempt + 1)} attempt(s). The scenario was not evaluated.`
              : result.observations === undefined
                ? "Execution failed."
                : `${String(result.observations.failed)} of ${String(result.observations.total)} observations failed.`;
        }
        break;
      }
    } catch (error) {
      result.status = "ERRORED";
      result.message = error instanceof Error ? error.message : String(error);
    } finally {
      if (cleanup && testCaseId !== undefined) {
        try {
          await client.deleteTestCase(testCaseId);
        } catch (error) {
          // A leaked test case is a nuisance, not a failed scenario, but it is
          // instance state so it must be visible.
          result.details = [
            ...(result.details ?? []),
            `Cleanup failed for test case ${testCaseId}: ${error instanceof Error ? error.message : String(error)}`,
          ];
        }
      }
      result.durationMs = now() - scenarioStart;
    }
    return result;
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= scenarios.length) return;
      const scenario = scenarios[index];
      if (scenario === undefined) return;
      // Admission control. The runner never has more executions in flight than
      // the instance-wide queue accepts, even when a caller shares the account
      // with other runners and lowers the ceiling.
      while (inFlight >= maxInFlight) await sleep(pollIntervalMs);
      inFlight += 1;
      try {
        results[index] = await runOne(scenario);
      } finally {
        inFlight -= 1;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, scenarios.length) }, () => worker()),
  );

  const finishedAtMs = now();
  const finished = [...results].filter((result): result is ScenarioResult => result !== undefined);
  const count = (status: ScenarioStatus) => finished.filter((r) => r.status === status).length;

  return {
    startedAt: toIso(startedAtMs),
    finishedAt: toIso(finishedAtMs),
    totals: {
      total: finished.length,
      passed: count("PASSED"),
      failed: count("FAILED"),
      timedOut: count("TIMED_OUT"),
      errored: count("ERRORED"),
      stopped: count("STOPPED"),
    },
    results: finished,
  };
}

// --- Reporters ---------------------------------------------------------------

/** Deterministic JSON report. Fixed key order, two-space indent, trailing newline. */
export function jsonReport(run: SimulationRun): string {
  const report = ordered(
    {
      schema: "flow-simulate-report/0.1",
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      totals: ordered({ ...run.totals } as unknown as Record<string, unknown>, [
        "total",
        "passed",
        "failed",
        "timedOut",
        "errored",
        "stopped",
      ]),
      results: run.results.map((result) =>
        ordered({ ...result } as unknown as Record<string, unknown>, [
          "name",
          "status",
          "durationMs",
          "testCaseId",
          "executionId",
          "observations",
          "message",
          "details",
        ]),
      ),
    } as Record<string, unknown>,
    ["schema", "startedAt", "finishedAt", "totals", "results"],
  );
  return JSON.stringify(report, null, 2) + "\n";
}

/**
 * XML 1.0 permits only tab, LF, CR and >= U+0020 as characters. `details` is
 * filled verbatim from ExecutionRecord.Record, an opaque server-supplied
 * string, so any other C0 control byte would produce a document no parser will
 * read. Those are replaced with U+FFFD rather than escaped, because numeric
 * character references to forbidden code points are themselves invalid XML.
 *
 * Tab, LF and CR are legal as content but are normalized away inside attribute
 * values, so they are emitted as character references to survive a round trip.
 */
// eslint-disable-next-line no-control-regex
const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function escapeXml(value: string): string {
  return value
    .replace(XML_FORBIDDEN, "\uFFFD")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\t/g, "&#9;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;");
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

export interface JUnitOptions {
  /** Suite name and testcase classname. Default "flow-simulate". */
  suiteName?: string;
}

/**
 * JUnit XML, deterministic for the same run: fixed attribute order, three
 * decimal places, results in the order the suite declared them.
 */
export function junitReport(run: SimulationRun, options: JUnitOptions = {}): string {
  const suiteName = options.suiteName ?? "flow-simulate";
  const failures = run.totals.failed + run.totals.timedOut;
  const time = seconds(run.results.reduce((sum, result) => sum + result.durationMs, 0));
  const attributes =
    `name="${escapeXml(suiteName)}" tests="${String(run.totals.total)}" ` +
    `failures="${String(failures)}" errors="${String(run.totals.errored)}" ` +
    `skipped="${String(run.totals.stopped)}" time="${time}"`;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites ${attributes}>`,
    `  <testsuite ${attributes} timestamp="${run.startedAt}">`,
  ];

  for (const result of run.results) {
    const head = `    <testcase name="${escapeXml(result.name)}" classname="${escapeXml(suiteName)}" time="${seconds(result.durationMs)}"`;
    if (result.status === "PASSED") {
      lines.push(`${head} />`);
      continue;
    }
    const body = [result.message ?? "", ...(result.details ?? [])]
      .filter((s) => s !== "")
      .join("\n");
    const message = escapeXml(result.message ?? result.status);
    lines.push(`${head}>`);
    if (result.status === "ERRORED") {
      lines.push(
        `      <error message="${message}" type="${result.status}">${escapeXml(body)}</error>`,
      );
    } else if (result.status === "STOPPED") {
      lines.push(`      <skipped message="${message}" />`);
    } else {
      lines.push(
        `      <failure message="${message}" type="${result.status}">${escapeXml(body)}</failure>`,
      );
    }
    lines.push("    </testcase>");
  }

  lines.push("  </testsuite>", "</testsuites>");
  return lines.join("\n") + "\n";
}

// --- AWS SDK adapter ---------------------------------------------------------
// Verified 2026-09-01 against a sandbox instance in us-west-2 with
// @aws-sdk/client-connect 3.1122.0: the env-gated integration test ran the
// three-scenario suite through create, start, poll, list records, and delete.
// StopTestCaseExecution was not reached live (no scenario hit the harness
// timeout); the offline timeout test drives it through a fake client only.
// There is no local evaluator for the Testing language, so the integration
// test is still the only thing that exercises this adapter against Connect.
// See tasks/A06-export-and-simulate.md.

/**
 * Folds the server's per-problem findings into the error message. The JS SDK
 * exposes them as `problemDetails: [{ message }]` on InvalidTestCaseException;
 * the API reference names the field `Problems`. Without this the runner reports
 * the bare "Invalid test case content " and nothing to act on.
 * https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateTestCase.html
 */
export function describeTestCaseError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(String(error));
  const details = (error as { problemDetails?: unknown }).problemDetails;
  if (!Array.isArray(details) || details.length === 0) return error;
  const messages = details
    .map((d: unknown) => (isRecord(d) && typeof d.message === "string" ? d.message : ""))
    .filter((m) => m !== "");
  if (messages.length === 0) return error;
  const described = new Error(`${error.message.trim()}: ${messages.join("; ")}`, { cause: error });
  described.name = error.name;
  return described;
}

interface TestCaseCommands {
  CreateTestCaseCommand: new (input: any) => any;
  StartTestCaseExecutionCommand: new (input: any) => any;
  GetTestCaseExecutionSummaryCommand: new (input: any) => any;
  ListTestCaseExecutionRecordsCommand: new (input: any) => any;
  StopTestCaseExecutionCommand: new (input: any) => any;
  DeleteTestCaseCommand: new (input: any) => any;
}

const REQUIRED_COMMANDS = [
  "CreateTestCaseCommand",
  "StartTestCaseExecutionCommand",
  "GetTestCaseExecutionSummaryCommand",
  "ListTestCaseExecutionRecordsCommand",
  "StopTestCaseExecutionCommand",
  "DeleteTestCaseCommand",
] as const;

async function loadTestCaseCommands(): Promise<TestCaseCommands> {
  let module: Record<string, unknown>;
  try {
    module = (await import("@aws-sdk/client-connect")) as unknown as Record<string, unknown>;
  } catch (cause) {
    throw new Error(
      "Running scenarios against an instance needs the optional peer dependency @aws-sdk/client-connect. Install it, or use the offline paths (compileScenario, serializeTestContent, the reporters).",
      { cause },
    );
  }
  const missing = REQUIRED_COMMANDS.filter((name) => typeof module[name] !== "function");
  if (missing.length > 0) {
    throw new Error(
      `The installed @aws-sdk/client-connect does not expose ${missing.join(", ")}. The Amazon Connect TestCase operations are recent; upgrade the SDK (3.1122.0 has them all).`,
    );
  }
  return module as unknown as TestCaseCommands;
}

export interface ConnectTestClientOptions extends RateLimiterOptions {
  /** An @aws-sdk/client-connect ConnectClient, or anything with `send`. */
  connect: AwsCommandSender;
  /** Instance id or instance ARN. */
  instanceId: string;
}

/**
 * FlowTestClient over the AWS SDK. Rate limiting and the response-field naming
 * differences live here; the runner sees neither.
 */
export function createConnectTestClient(options: ConnectTestClientOptions): FlowTestClient {
  const { connect, instanceId } = options;
  let commands: TestCaseCommands | undefined;
  const throttle = createRateLimiter(options);

  const send = async (make: (c: TestCaseCommands) => any): Promise<any> => {
    commands ??= await loadTestCaseCommands();
    await throttle();
    return connect.send(make(commands));
  };

  const iso = (value: unknown): string | undefined =>
    value instanceof Date ? value.toISOString() : typeof value === "string" ? value : undefined;

  return {
    createTestCase: async (input) => {
      let response: any;
      try {
        response = await send(
          (c) =>
            new c.CreateTestCaseCommand({
              InstanceId: instanceId,
              Name: input.name,
              Description: input.description,
              Content: input.content,
              EntryPoint: input.entryPoint,
              InitializationData: input.initializationData,
              Status: input.status,
            }),
        );
      } catch (error) {
        throw describeTestCaseError(error);
      }
      return { testCaseId: response.TestCaseId ?? "", testCaseArn: response.TestCaseArn };
    },

    startExecution: async (testCaseId, clientToken) => {
      const response = await send(
        (c) =>
          new c.StartTestCaseExecutionCommand({
            InstanceId: instanceId,
            TestCaseId: testCaseId,
            ClientToken: clientToken,
          }),
      );
      return {
        testCaseExecutionId: response.TestCaseExecutionId ?? "",
        status: (response.Status ?? "INITIATED") as TestExecutionStatus,
      };
    },

    getExecutionSummary: async (testCaseId, executionId) => {
      const response = await send(
        (c) =>
          new c.GetTestCaseExecutionSummaryCommand({
            InstanceId: instanceId,
            TestCaseId: testCaseId,
            TestCaseExecutionId: executionId,
          }),
      );
      const summary: ExecutionSummary = {
        status: (response.Status ?? "IN_PROGRESS") as TestExecutionStatus,
      };
      const startTime = iso(response.StartTime);
      const endTime = iso(response.EndTime);
      if (startTime !== undefined) summary.startTime = startTime;
      if (endTime !== undefined) summary.endTime = endTime;
      if (response.ObservationSummary !== undefined) {
        summary.observations = {
          total: response.ObservationSummary.TotalObservations,
          passed: response.ObservationSummary.ObservationsPassed,
          failed: response.ObservationSummary.ObservationsFailed,
        };
      }
      return summary;
    },

    listExecutionRecords: async (testCaseId, executionId) => {
      const out: ExecutionRecordSummary[] = [];
      let nextToken: string | undefined;
      do {
        const response = await send(
          (c) =>
            new c.ListTestCaseExecutionRecordsCommand({
              InstanceId: instanceId,
              TestCaseId: testCaseId,
              TestCaseExecutionId: executionId,
              MaxResults: 100,
              NextToken: nextToken,
            }),
        );
        for (const record of response.ExecutionRecords ?? []) {
          out.push({
            observationId: record.ObservationId,
            status: record.Status,
            timestamp: iso(record.Timestamp),
            record: record.Record,
          });
        }
        nextToken =
          response.NextToken === "" ? undefined : (response.NextToken as string | undefined);
      } while (nextToken !== undefined);
      return out;
    },

    stopExecution: async (testCaseId, executionId) => {
      await send(
        (c) =>
          new c.StopTestCaseExecutionCommand({
            InstanceId: instanceId,
            TestCaseId: testCaseId,
            TestCaseExecutionId: executionId,
          }),
      );
    },

    deleteTestCase: async (testCaseId) => {
      await send(
        (c) => new c.DeleteTestCaseCommand({ InstanceId: instanceId, TestCaseId: testCaseId }),
      );
    },
  };
}
