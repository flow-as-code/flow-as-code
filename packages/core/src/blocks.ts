/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Builder blocks.
//
// Blocks map one-to-one onto Connect Actions. That is deliberate: the
// round-trip invariant (synth(codegen(doc)) equals doc) is a non-negotiable,
// and a block that expanded into several Actions could not be recognised again
// on the way back. So "transfer to queue", which needs both an
// UpdateContactTargetQueue and a TransferContactToQueue, is two blocks.
//
// Error branches are required properties on a config object rather than
// something enforced by a fluent builder's type state. Omitting one is a real
// compile-time error, and a plain object literal is something codegen can emit
// as idiomatic, diffable TypeScript. See docs/adr/0002-error-branch-enforcement.md.

import {
  ActionType,
  DTMF_DIGITS,
  EXTRA_ERRORS,
  INPUT_TIME_LIMIT_EXCEEDED,
  INPUT_TIMEOUT_MAX,
  INPUT_TIMEOUT_MIN,
  LAMBDA_TIMEOUT_MAX,
  LAMBDA_TIMEOUT_MIN,
  NO_MATCHING_CONDITION,
  NO_MATCHING_ERROR,
} from "./actions.js";
import type { DtmfDigit } from "./actions.js";
import type { Condition, ConditionOperator, FlowAction, Transitions } from "./flowdoc.js";
import { isValidIdentifier } from "./flowdoc.js";
import type { JsonPath, Ref } from "./refs.js";

/** A transition target: another block, or its Identifier. */
export type Target = string | Block;

export function targetId(t: Target): string {
  return typeof t === "string" ? t : t.id;
}

export abstract class Block {
  readonly id: string;

  constructor(id: string) {
    if (!isValidIdentifier(id)) {
      throw new Error(
        `Invalid Identifier "${id}". Must be 1 to 50 characters and must not contain % : ( \\ / ) = $ , ; [ ] { }.`,
      );
    }
    this.id = id;
  }

  abstract readonly type: string;
  protected abstract parameters(): Record<string, unknown>;
  protected abstract transitions(): Transitions;

  toAction(): FlowAction {
    return {
      Identifier: this.id,
      Type: this.type,
      Parameters: this.parameters(),
      Transitions: this.transitions(),
    };
  }
}

/** Shared shape for a block with a success path and a catch-all error path. */
interface Wired {
  id: string;
  next: Target;
  onError: Target;
}

function wire(
  next: Target | undefined,
  errors: [string, Target][],
  conditions: ConditionTransitionInput[] = [],
): Transitions {
  const t: Transitions = {};
  if (next !== undefined) t.NextAction = targetId(next);
  t.Errors = errors.map(([ErrorType, target]) => ({ ErrorType, NextAction: targetId(target) }));
  t.Conditions = conditions.map((c) => ({
    NextAction: targetId(c.target),
    Condition: { Operator: c.operator, Operands: c.operands },
  }));
  return t;
}

interface ConditionTransitionInput {
  target: Target;
  operator: ConditionOperator;
  operands: string[];
}

// ---------------------------------------------------------------------------
// Participant actions
// ---------------------------------------------------------------------------

/**
 * MessageParticipant accepts exactly one of Text, SSML, or PromptId. The union
 * makes supplying two a compile-time error.
 * PromptId and SSML are voice only; other channels support only Text.
 */
export type MessageBody =
  | { text: string; ssml?: never; prompt?: never }
  | { ssml: string; text?: never; prompt?: never }
  | { prompt: Ref<"prompt"> | JsonPath; text?: never; ssml?: never };

export type MessageParticipantConfig = Wired & MessageBody;

export class MessageParticipant extends Block {
  readonly type = ActionType.MessageParticipant;

  constructor(private readonly config: MessageParticipantConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    const { text, ssml, prompt } = this.config;
    if (text !== undefined) return { Text: text };
    if (ssml !== undefined) return { SSML: ssml };
    return { PromptId: prompt };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/** One key of a DTMF menu and where it leads. */
export interface DtmfBranch {
  digit: DtmfDigit;
  target: Target;
}

/**
 * A DTMF menu: play something, wait for one key, branch on it.
 *
 * GetParticipantInput has two forms. With StoreInput "False" the key pressed
 * is the run result and Conditions branch on it; conditions "may use only the
 * Equals operator" and each operand "must be static and be a single character
 * - 0-9 numeric, *, or #". With StoreInput "True" the digits are stored,
 * InputValidation is required, and there are no conditions. The builder models
 * the menu form only; the stored-input form, and anything carrying Media,
 * InputEncryption, or DTMFConfiguration, parses to a GenericBlock and
 * round-trips verbatim.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 *
 * The prompt is optional: PromptId, Text, and SSML are each "[Optional]" on
 * the action page, and a menu may follow a prompt played by an earlier block.
 *
 * Every error the menu form documents is a required property: onTimeout
 * (InputTimeLimitExceeded), onNoMatch (NoMatchingCondition), and onError
 * (NoMatchingError). NextAction mirrors onNoMatch, the way
 * CheckHoursOfOperation mirrors its out-of-hours path.
 *
 * InputTimeLimitSeconds and StoreInput are emitted as JSON strings because
 * that is how the console writes them; the admin page's Flow language example
 * has "InputTimeLimitSeconds": "5" and "StoreInput": "False". (InvokeLambda's
 * timeout is a number for the same reason: its page shows a number.)
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
 */
export type GetParticipantInputConfig = {
  id: string;
  /**
   * Seconds to wait for the first key. Static integer, 1 to 180 inclusive
   * (INPUT_TIMEOUT_MIN and INPUT_TIMEOUT_MAX).
   */
  timeoutSeconds: number;
  /**
   * Keys that branch, in the order Connect evaluates them. May be empty. Each
   * key may branch once; a repeated key is refused by the constructor.
   */
  branches: DtmfBranch[];
  onTimeout: Target;
  onNoMatch: Target;
  onError: Target;
} & (MessageBody | { text?: never; ssml?: never; prompt?: never });

export class GetParticipantInput extends Block {
  readonly type = ActionType.GetParticipantInput;

  constructor(private readonly config: GetParticipantInputConfig) {
    super(config.id);
    const t = config.timeoutSeconds;
    if (!Number.isInteger(t) || t < INPUT_TIMEOUT_MIN || t > INPUT_TIMEOUT_MAX) {
      throw new Error(
        `GetParticipantInput "${config.id}" timeoutSeconds must be an integer between ${INPUT_TIMEOUT_MIN} and ${INPUT_TIMEOUT_MAX}, got ${t}.`,
      );
    }
    // A key that branches twice is two answers to one press. Only one of
    // them can be taken, so the class refuses the config rather than emit
    // both conditions and leave the caller believing each branch is live.
    // codegen constructs the real block to verify an inversion, so a document
    // carrying a repeated key stays a GenericBlock instead of generating a
    // call that throws.
    const seen = new Set<string>();
    for (const b of config.branches) {
      if (!(DTMF_DIGITS as readonly string[]).includes(b.digit)) {
        throw new Error(
          `GetParticipantInput "${config.id}" branch digit must be one of ${DTMF_DIGITS.join(" ")}, got "${String(b.digit)}".`,
        );
      }
      if (seen.has(b.digit)) {
        throw new Error(
          `GetParticipantInput "${config.id}" branches on key "${b.digit}" twice; each key may branch once.`,
        );
      }
      seen.add(b.digit);
    }
  }

  protected parameters(): Record<string, unknown> {
    const { text, ssml, prompt } = this.config;
    const p: Record<string, unknown> = {};
    if (text !== undefined) p.Text = text;
    else if (ssml !== undefined) p.SSML = ssml;
    else if (prompt !== undefined) p.PromptId = prompt;
    p.InputTimeLimitSeconds = String(this.config.timeoutSeconds);
    p.StoreInput = "False";
    return p;
  }

  protected transitions(): Transitions {
    const { onTimeout, onNoMatch, onError } = this.config;
    return wire(
      onNoMatch,
      [
        [INPUT_TIME_LIMIT_EXCEEDED, onTimeout],
        [NO_MATCHING_CONDITION, onNoMatch],
        [NO_MATCHING_ERROR, onError],
      ],
      this.config.branches.map((b) => ({
        target: b.target,
        operator: "Equals",
        operands: [b.digit],
      })),
    );
  }
}

/** Terminal. Takes no parameters and supports no errors. */
export class DisconnectParticipant extends Block {
  readonly type = ActionType.DisconnectParticipant;

  constructor(config: { id: string }) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return {};
  }

  protected transitions(): Transitions {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Flow control actions
// ---------------------------------------------------------------------------

/**
 * Connect requires exactly two conditions on this action, Equals True and
 * Equals False, and no others. Both are therefore required config, not
 * something the caller wires by hand.
 */
export interface CheckHoursOfOperationConfig {
  id: string;
  /** Optional. When absent, the contact's TargetQueue hours are used. */
  hours?: Ref<"hours"> | JsonPath;
  onInHours: Target;
  onOutOfHours: Target;
  onError: Target;
}

export class CheckHoursOfOperation extends Block {
  readonly type = ActionType.CheckHoursOfOperation;

  constructor(private readonly config: CheckHoursOfOperationConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return this.config.hours === undefined ? {} : { HoursOfOperationId: this.config.hours };
  }

  protected transitions(): Transitions {
    // NextAction is the fallback when no condition matches. The conditions are
    // exhaustive, so it mirrors the out-of-hours path.
    return wire(
      this.config.onOutOfHours,
      [[NO_MATCHING_ERROR, this.config.onError]],
      [
        { target: this.config.onInHours, operator: "Equals", operands: ["True"] },
        { target: this.config.onOutOfHours, operator: "Equals", operands: ["False"] },
      ],
    );
  }
}

export interface CompareBranch {
  operator: ConditionOperator;
  operands: string[];
  target: Target;
}

/** Compare fails with NoMatchingCondition, the only modeled action that does. */
export interface CompareConfig {
  id: string;
  value: JsonPath;
  branches: CompareBranch[];
  onNoMatch: Target;
}

export class Compare extends Block {
  readonly type = ActionType.Compare;

  constructor(private readonly config: CompareConfig) {
    super(config.id);
    if (config.branches.length === 0) {
      throw new Error(`Compare "${config.id}" needs at least one branch.`);
    }
  }

  protected parameters(): Record<string, unknown> {
    return { ComparisonValue: this.config.value };
  }

  protected transitions(): Transitions {
    return wire(
      undefined,
      [[NO_MATCHING_CONDITION, this.config.onNoMatch]],
      this.config.branches.map((b) => ({
        target: b.target,
        operator: b.operator,
        operands: b.operands,
      })),
    );
  }
}

export interface TransferToFlowConfig extends Wired {
  flow: Ref<"flow"> | JsonPath;
}

export class TransferToFlow extends Block {
  readonly type = ActionType.TransferToFlow;

  constructor(private readonly config: TransferToFlowConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return { ContactFlowId: this.config.flow };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/** Terminal. Only legal in whisper and customer queue flows. */
export class EndFlowExecution extends Block {
  readonly type = ActionType.EndFlowExecution;

  constructor(config: { id: string }) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return {};
  }

  protected transitions(): Transitions {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Contact actions
// ---------------------------------------------------------------------------

/** Accepts a queue or an agent queue, never both. */
export type QueueTarget =
  | { queue: Ref<"queue"> | JsonPath; agent?: never }
  | { agent: Ref<"queue"> | JsonPath; queue?: never };

export type UpdateContactTargetQueueConfig = Wired & QueueTarget;

export class UpdateContactTargetQueue extends Block {
  readonly type = ActionType.UpdateContactTargetQueue;

  constructor(private readonly config: UpdateContactTargetQueueConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return this.config.queue !== undefined
      ? { QueueId: this.config.queue }
      : { AgentId: this.config.agent };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/** Takes no parameters. The queue comes from a preceding UpdateContactTargetQueue. */
export interface TransferContactToQueueConfig extends Wired {
  onQueueAtCapacity: Target;
}

export class TransferContactToQueue extends Block {
  readonly type = ActionType.TransferContactToQueue;

  constructor(private readonly config: TransferContactToQueueConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return {};
  }

  protected transitions(): Transitions {
    const extra = EXTRA_ERRORS[ActionType.TransferContactToQueue] ?? [];
    const errors: [string, Target][] = extra.map((e) => [e, this.config.onQueueAtCapacity]);
    errors.push([NO_MATCHING_ERROR, this.config.onError]);
    return wire(this.config.next, errors);
  }
}

export interface UpdateContactAttributesConfig extends Wired {
  attributes: Record<string, string>;
  /** Defaults to Current. */
  targetContact?: "Current" | "Related";
}

export class UpdateContactAttributes extends Block {
  readonly type = ActionType.UpdateContactAttributes;

  constructor(private readonly config: UpdateContactAttributesConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return {
      Attributes: this.config.attributes,
      TargetContact: this.config.targetContact ?? "Current",
    };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

export interface UpdateContactRecordingBehaviorConfig extends Wired {
  recordedParticipants: ("Agent" | "Customer")[];
  screenRecordedParticipants?: "Agent"[];
  ivrRecordingBehavior?: "Enabled" | "Disabled";
}

export class UpdateContactRecordingBehavior extends Block {
  readonly type = ActionType.UpdateContactRecordingBehavior;

  constructor(private readonly config: UpdateContactRecordingBehaviorConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    const behavior: Record<string, unknown> = {
      RecordedParticipants: this.config.recordedParticipants,
    };
    if (this.config.screenRecordedParticipants !== undefined) {
      behavior.ScreenRecordedParticipants = this.config.screenRecordedParticipants;
    }
    if (this.config.ivrRecordingBehavior !== undefined) {
      behavior.IVRRecordingBehavior = this.config.ivrRecordingBehavior;
    }
    return { RecordingBehavior: behavior };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

export interface InvokeFlowModuleConfig extends Wired {
  module: Ref<"module"> | JsonPath;
}

export class InvokeFlowModule extends Block {
  readonly type = ActionType.InvokeFlowModule;

  constructor(private readonly config: InvokeFlowModuleConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return { FlowModuleId: this.config.module };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/** Terminal. Only legal inside a module. */
export class EndFlowModuleExecution extends Block {
  readonly type = ActionType.EndFlowModuleExecution;

  constructor(config: { id: string }) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return {};
  }

  protected transitions(): Transitions {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

export interface InvokeLambdaFunctionConfig extends Wired {
  lambda: Ref<"lambda"> | JsonPath;
  /** Static integer, 1 to 8 inclusive. Connect rejects anything else. */
  timeoutSeconds: number;
  invocationType?: "SYNCHRONOUS" | "ASYNCHRONOUS";
  attributes?: Record<string, string>;
  responseType?: "STRING_MAP" | "JSON";
}

export class InvokeLambdaFunction extends Block {
  readonly type = ActionType.InvokeLambdaFunction;

  constructor(private readonly config: InvokeLambdaFunctionConfig) {
    super(config.id);
    const t = config.timeoutSeconds;
    if (!Number.isInteger(t) || t < LAMBDA_TIMEOUT_MIN || t > LAMBDA_TIMEOUT_MAX) {
      throw new Error(
        `InvokeLambdaFunction "${config.id}" timeoutSeconds must be an integer between ${LAMBDA_TIMEOUT_MIN} and ${LAMBDA_TIMEOUT_MAX}, got ${t}.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    const p: Record<string, unknown> = {
      LambdaFunctionARN: this.config.lambda,
      InvocationTimeLimitSeconds: this.config.timeoutSeconds,
      InvocationType: this.config.invocationType ?? "SYNCHRONOUS",
    };
    if (this.config.attributes !== undefined) p.LambdaInvocationAttributes = this.config.attributes;
    if (this.config.responseType !== undefined) {
      p.ResponseValidation = { ResponseType: this.config.responseType };
    }
    return p;
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

// ---------------------------------------------------------------------------
// Passthrough
// ---------------------------------------------------------------------------

/**
 * Any Action the builder does not model. Preserved verbatim through synth,
 * codegen, the studio, and both emitters. This is what keeps a small modeled
 * set survivable: 49 action types are documented and the builder models 14.
 */
export interface GenericBlockConfig {
  id: string;
  type: string;
  parameters?: Record<string, unknown>;
  next?: Target;
  errors?: { errorType: string; target: Target }[];
  conditions?: ConditionTransitionInput[];
}

export class GenericBlock extends Block {
  readonly type: string;

  constructor(private readonly config: GenericBlockConfig) {
    super(config.id);
    this.type = config.type;
  }

  protected parameters(): Record<string, unknown> {
    return this.config.parameters ?? {};
  }

  protected transitions(): Transitions {
    // A generic block with nothing wired is terminal, matching Connect's
    // representation of terminal actions as an empty Transitions object.
    if (
      this.config.next === undefined &&
      (this.config.errors ?? []).length === 0 &&
      (this.config.conditions ?? []).length === 0
    ) {
      return {};
    }
    return wire(
      this.config.next,
      (this.config.errors ?? []).map((e) => [e.errorType, e.target] as [string, Target]),
      this.config.conditions ?? [],
    );
  }
}

export type { Condition };
