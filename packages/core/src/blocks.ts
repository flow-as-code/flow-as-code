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
  AGENT_METRIC_TYPES,
  ActionType,
  CALLBACK_ATTEMPTS_MIN,
  CALLBACK_DELAY_MAX,
  CALLBACK_DELAY_MIN,
  CALLBACK_NUMBER_NOT_DIALABLE,
  CHANNEL_MISMATCH,
  DTMF_DIGITS,
  EVENT_HOOKS,
  INVALID_CALLBACK_NUMBER,
  EXTRA_ERRORS,
  INPUT_TIME_LIMIT_EXCEEDED,
  INPUT_TIMEOUT_MAX,
  INPUT_TIMEOUT_MIN,
  LAMBDA_TIMEOUT_MAX,
  LEX_TIMEOUT_MAX,
  LEX_TIMEOUT_MIN,
  LOOP_CONTINUE,
  LOOP_COUNT_MAX,
  LOOP_COUNT_MIN,
  LOOP_DONE,
  LAMBDA_TIMEOUT_MIN,
  MESSAGES_INTERRUPTED,
  METRIC_OPERATORS,
  METRIC_TYPES,
  NO_MATCHING_CONDITION,
  NO_MATCHING_ERROR,
  PARTICIPANT_NOT_FOUND,
  PERCENTAGE_FLOOR,
  PERCENTAGE_THRESHOLD_MAX,
  QUEUE_PRIORITY_MIN,
  SYSTEM_TAG_PREFIX,
  VOICE_ID_RESPONSE_TIME_MAX,
  VOICE_ID_RESPONSE_TIME_MIN,
  VOICE_ID_THRESHOLD_MAX,
  VOICE_ID_THRESHOLD_MIN,
  TAG_LIMIT,
  TIME_LIMIT_EXCEEDED,
  WAIT_COMPLETED,
  WAIT_EVENTS,
  WAIT_TIMEOUT_MAX,
  WAIT_TIMEOUT_MIN,
} from "./actions.js";
import type {
  DtmfDigit,
  EventHook,
  MetricOperator,
  MetricType,
  QueueChannel,
  TargetContact,
  TtsEngine,
  TtsStyle,
  WaitEvent,
} from "./actions.js";
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

/**
 * One entry of a message loop: text, SSML, a prompt, or an audio file in S3.
 * The action page shows each as its own one-key object and the console
 * writes one kind per entry.
 */
export type LoopMessage =
  | { text: string; ssml?: never; prompt?: never; media?: never }
  | { ssml: string; text?: never; prompt?: never; media?: never }
  | { prompt: Ref<"prompt"> | JsonPath; text?: never; ssml?: never; media?: never }
  | { media: { uri: string }; text?: never; ssml?: never; prompt?: never };

/**
 * Loop prompts: "Loops a sequence of prompts while a customer or agent is on
 * hold or in queue." The loop never completes on its own, so the block has no
 * success path; the console writes no NextAction and, in its default hold and
 * queue flows, no error branch either. With `interruptFrequencySeconds` the
 * loop completes with the MessagesInterrupted result every so many seconds
 * and `onInterrupt` takes it (the console's Sample interruptible queue flow
 * writes the seconds as a decimal string); the two go together. `onError` is
 * the optional catch-all. Legal in customer queue and hold flows.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-messageparticipantiteratively.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/loop-prompts.html
 */
export interface MessageParticipantIterativelyConfig {
  id: string;
  messages: LoopMessage[];
  interruptFrequencySeconds?: number;
  onInterrupt?: Target;
  onError?: Target;
}

export class MessageParticipantIteratively extends Block {
  readonly type = ActionType.MessageParticipantIteratively;

  constructor(private readonly config: MessageParticipantIterativelyConfig) {
    super(config.id);
    if (config.messages.length === 0) {
      throw new Error(`MessageParticipantIteratively "${config.id}" needs at least one message.`);
    }
    const seconds = config.interruptFrequencySeconds;
    if (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 1)) {
      throw new Error(
        `MessageParticipantIteratively "${config.id}" interruptFrequencySeconds must be a positive integer, got ${seconds}.`,
      );
    }
    if ((seconds !== undefined) !== (config.onInterrupt !== undefined)) {
      throw new Error(
        `MessageParticipantIteratively "${config.id}" takes onInterrupt exactly when it has interruptFrequencySeconds.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    const p: Record<string, unknown> = {
      Messages: this.config.messages.map((m) => {
        if (m.text !== undefined) return { Text: m.text };
        if (m.ssml !== undefined) return { SSML: m.ssml };
        if (m.prompt !== undefined) return { PromptId: m.prompt };
        return { Media: { Uri: m.media.uri, SourceType: "S3", MediaType: "Audio" } };
      }),
    };
    if (this.config.interruptFrequencySeconds !== undefined) {
      p.InterruptFrequencySeconds = String(this.config.interruptFrequencySeconds);
    }
    return p;
  }

  protected transitions(): Transitions {
    const errors: [string, Target][] =
      this.config.onError === undefined ? [] : [[NO_MATCHING_ERROR, this.config.onError]];
    const conditions: ConditionTransitionInput[] =
      this.config.onInterrupt === undefined
        ? []
        : [
            {
              target: this.config.onInterrupt,
              operator: "Equals",
              operands: [MESSAGES_INTERRUPTED],
            },
          ];
    return wire(undefined, errors, conditions);
  }
}

/** An Amazon Lex intent and where the flow goes when the bot returns it. */
export interface IntentBranch {
  name: string;
  target: Target;
}

/**
 * Connects the participant with an Amazon Lex V2 bot: "When the interaction
 * is over, the Intent and Slots of the bot are available to the flow during
 * its run." An optional body (text, SSML or a prompt) plays first; `bot` is
 * the V2 alias ARN (LexV2Bot.AliasArn, "May be specified statically or
 * dynamically"); `intents` branch on the Intent the bot returns ("only the
 * Equals operator is supported"); `timeoutSeconds` is LexTimeoutSeconds
 * (60 to 604800, written as the page's string); `sessionAttributes` and
 * `initialMessage` are passed to the bot. The three errors are wired in the
 * page's Action syntax order and NextAction mirrors the no-match branch, as
 * the same console block does in its DTMF form; a console export should
 * confirm the mirror. The V1 LexBot form and Media round-trip as a
 * GenericBlock.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-connectparticipantwithlexbot.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
 */
export type ConnectParticipantWithLexBotConfig = {
  id: string;
  bot: Ref<"lex"> | JsonPath;
  sessionAttributes?: Record<string, string>;
  initialMessage?: string;
  timeoutSeconds?: number;
  intents: IntentBranch[];
  onNoMatch: Target;
  onError: Target;
  onTimeout: Target;
} & (MessageBody | { text?: never; ssml?: never; prompt?: never });

export class ConnectParticipantWithLexBot extends Block {
  readonly type = ActionType.ConnectParticipantWithLexBot;

  constructor(private readonly config: ConnectParticipantWithLexBotConfig) {
    super(config.id);
    const t = config.timeoutSeconds;
    if (t !== undefined && (!Number.isInteger(t) || t < LEX_TIMEOUT_MIN || t > LEX_TIMEOUT_MAX)) {
      throw new Error(
        `ConnectParticipantWithLexBot "${config.id}" timeoutSeconds must be an integer between ${LEX_TIMEOUT_MIN} and ${LEX_TIMEOUT_MAX}, got ${t}.`,
      );
    }
    for (const i of config.intents) {
      if (typeof i.name !== "string") {
        throw new Error(
          `ConnectParticipantWithLexBot "${config.id}" intent names must be strings.`,
        );
      }
    }
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config;
    const p: Record<string, unknown> = {};
    if (c.text !== undefined) p.Text = c.text;
    else if (c.ssml !== undefined) p.SSML = c.ssml;
    else if (c.prompt !== undefined) p.PromptId = c.prompt;
    p.LexV2Bot = { AliasArn: c.bot };
    if (c.sessionAttributes !== undefined) p.LexSessionAttributes = c.sessionAttributes;
    if (c.initialMessage !== undefined) {
      p.LexInitializationData = { InitialMessage: c.initialMessage };
    }
    if (c.timeoutSeconds !== undefined) p.LexTimeoutSeconds = { Text: String(c.timeoutSeconds) };
    return p;
  }

  protected transitions(): Transitions {
    const c = this.config;
    return wire(
      c.onNoMatch,
      [
        [INPUT_TIME_LIMIT_EXCEEDED, c.onTimeout],
        [NO_MATCHING_ERROR, c.onError],
        [NO_MATCHING_CONDITION, c.onNoMatch],
      ],
      c.intents.map((i) => ({ target: i.target, operator: "Equals", operands: [i.name] })),
    );
  }
}

/** One action a view can return (Next, Back, a custom value) and where it leads. */
export interface ViewActionBranch {
  action: string;
  target: Target;
}

/**
 * Shows a view (a step-by-step guide) to the agent: "Initiates a UI-based
 * workflow that can be surfaced to users of front end applications." `view`
 * is ViewResource.Id, a view reference (an AWS-managed view's version rides
 * in the token, `Refs.view("form", "1")`) or a JSONPath; `version` is the
 * separate ViewResource.Version string; `data` is passed to the view
 * verbatim; `hideResponseOn` lists where the response is hidden (the page
 * shows TRANSCRIPT). `actions` branch on "The result that the user selects
 * when interacting with the View", one Equals each. `timeoutSeconds`
 * (InvocationTimeLimitSeconds, a decimal string on the wire) and its
 * `onTimeout` branch are required, as are `onNoMatch` and `onError`: the
 * page marks none of them, but CreateContactFlow refuses the block without
 * any of the four ("Action is missing required property" and "Action is
 * missing required error", checked 2026-09-15). The errors are written in
 * the order of the admin guide's flow-language JSON (NoMatchingCondition,
 * NoMatchingError, TimeLimitExceeded; the service accepts either order), and
 * NextAction is a copy of the catch-all's target, as that JSON writes it and
 * as the block's branch list, which has no success path, implies. Chat only;
 * inbound and customer queue flows.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-showview.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/show-view-block.html
 */
export interface ShowViewConfig {
  id: string;
  view: Ref<"view"> | JsonPath;
  version?: string;
  timeoutSeconds: number;
  data?: Record<string, unknown>;
  hideResponseOn?: string[];
  actions: ViewActionBranch[];
  onNoMatch: Target;
  onTimeout: Target;
  onError: Target;
}

export class ShowView extends Block {
  readonly type = ActionType.ShowView;

  constructor(private readonly config: ShowViewConfig) {
    super(config.id);
    const t = config.timeoutSeconds;
    if (!Number.isInteger(t) || t < 1) {
      throw new Error(
        `ShowView "${config.id}" timeoutSeconds must be a positive integer, got ${String(t)}.`,
      );
    }
    for (const h of config.hideResponseOn ?? []) {
      if (typeof h !== "string" || h === "") {
        throw new Error(
          `ShowView "${config.id}" hideResponseOn entries must be non-empty strings.`,
        );
      }
    }
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config;
    const resource: Record<string, unknown> = { Id: c.view };
    if (c.version !== undefined) resource.Version = c.version;
    const p: Record<string, unknown> = { ViewResource: resource };
    p.InvocationTimeLimitSeconds = String(c.timeoutSeconds);
    if (c.data !== undefined) p.ViewData = c.data;
    if (c.hideResponseOn !== undefined) {
      p.SensitiveDataConfiguration = { HideResponseOn: c.hideResponseOn };
    }
    return p;
  }

  protected transitions(): Transitions {
    const c = this.config;
    // The admin guide's order, catch-all in the middle, with NextAction a
    // copy of the catch-all's target.
    return wire(
      c.onError,
      [
        [NO_MATCHING_CONDITION, c.onNoMatch],
        [NO_MATCHING_ERROR, c.onError],
        [TIME_LIMIT_EXCEEDED, c.onTimeout],
      ],
      c.actions.map((a) => ({ target: a.target, operator: "Equals", operands: [a.action] })),
    );
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

/**
 * Loop: run `count` times through `onContinue`, then once through `onDone`,
 * then reset. The count is 0 to 100, static (written as a decimal string, the
 * console's spelling) or a single JSONPath; with 0 the done path is taken the
 * first time. Its two results are the two conditions, and NextAction mirrors
 * the done path, as every published console export of a Loop does. The page
 * lists no errors, but the console's block has an Error branch and some
 * exports carry NoMatchingError, so `onError` is optional.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-loop.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/loop.html
 */
export interface LoopConfig {
  id: string;
  count: number | JsonPath;
  onContinue: Target;
  onDone: Target;
  onError?: Target;
}

export class Loop extends Block {
  readonly type = ActionType.Loop;

  constructor(private readonly config: LoopConfig) {
    super(config.id);
    const c = config.count;
    if (
      typeof c === "number" &&
      (!Number.isInteger(c) || c < LOOP_COUNT_MIN || c > LOOP_COUNT_MAX)
    ) {
      throw new Error(
        `Loop "${config.id}" count must be an integer between ${LOOP_COUNT_MIN} and ${LOOP_COUNT_MAX}, got ${c}.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config.count;
    return { LoopCount: typeof c === "number" ? String(c) : c };
  }

  protected transitions(): Transitions {
    return wire(
      this.config.onDone,
      this.config.onError === undefined ? [] : [[NO_MATCHING_ERROR, this.config.onError]],
      [
        { target: this.config.onContinue, operator: "Equals", operands: [LOOP_CONTINUE] },
        { target: this.config.onDone, operator: "Equals", operands: [LOOP_DONE] },
      ],
    );
  }
}

/**
 * Wait: pause for `timeoutSeconds` (1 to 604800, static or a single JSONPath;
 * written as the console's `TimeLimitSeconds` decimal string) or until one of
 * the events in `onEvent` interrupts, whichever comes first.
 * Each event named in `onEvent` is written to Events and gets its Equals
 * condition; `onTimeout` is the WaitCompleted condition the page always
 * requires. `onParticipantNotFound` is required exactly when
 * BotParticipantDisconnected is waited for ("The supported event currently is
 * \"BotParticipantDisconnected\"."). Chat only; legal in every flow type. The
 * page says nothing about NextAction; the class mirrors it onto the
 * catch-all, as the console's export of the Sample disconnect flow does.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/wait.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/sample-disconnect.html
 */
export interface WaitConfig {
  id: string;
  timeoutSeconds: number | JsonPath;
  /** The WaitCompleted path. */
  onTimeout: Target;
  /** One path per event waited for, in the order the class writes them. */
  onEvent?: Partial<Record<WaitEvent, Target>>;
  onError: Target;
  onParticipantNotFound?: Target;
}

export class Wait extends Block {
  readonly type = ActionType.Wait;

  constructor(private readonly config: WaitConfig) {
    super(config.id);
    const t = config.timeoutSeconds;
    if (
      typeof t === "number" &&
      (!Number.isInteger(t) || t < WAIT_TIMEOUT_MIN || t > WAIT_TIMEOUT_MAX)
    ) {
      throw new Error(
        `Wait "${config.id}" timeoutSeconds must be an integer between ${WAIT_TIMEOUT_MIN} and ${WAIT_TIMEOUT_MAX}, got ${t}.`,
      );
    }
    const bot = config.onEvent?.BotParticipantDisconnected !== undefined;
    if (bot !== (config.onParticipantNotFound !== undefined)) {
      throw new Error(
        `Wait "${config.id}" takes onParticipantNotFound exactly when it waits for BotParticipantDisconnected.`,
      );
    }
  }

  private events(): WaitEvent[] {
    return WAIT_EVENTS.filter((e) => this.config.onEvent?.[e] !== undefined);
  }

  protected parameters(): Record<string, unknown> {
    // The console's key and spelling (TimeLimitSeconds, a decimal string); the
    // page's TimeoutSeconds is not what an export carries.
    const t = this.config.timeoutSeconds;
    const p: Record<string, unknown> = { TimeLimitSeconds: typeof t === "number" ? String(t) : t };
    const events = this.events();
    if (events.length > 0) p.Events = events;
    return p;
  }

  protected transitions(): Transitions {
    const errors: [string, Target][] = [[NO_MATCHING_ERROR, this.config.onError]];
    if (this.config.onParticipantNotFound !== undefined) {
      errors.push([PARTICIPANT_NOT_FOUND, this.config.onParticipantNotFound]);
    }
    const conditions: ConditionTransitionInput[] = [
      { target: this.config.onTimeout, operator: "Equals", operands: [WAIT_COMPLETED] },
    ];
    for (const e of this.events()) {
      conditions.push({ target: this.config.onEvent![e]!, operator: "Equals", operands: [e] });
    }
    return wire(this.config.onError, errors, conditions);
  }
}

/**
 * One branch of a percentage split: `percent` of contacts (a whole number,
 * at least 1) take `target`.
 */
export interface PercentageBranch {
  percent: number;
  target: Target;
}

/**
 * DistributeByPercentage: a random number from 1 to 100 routed by a chain of
 * NumberLessThan thresholds. Each branch claims its percentage after the ones
 * before it; the thresholds may not exceed 100, so the branches claim at most
 * 99% and `onRemainder` (the NoMatchingCondition branch, which NextAction
 * mirrors as the console writes it) takes what is left.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-distributebypercentage.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/distribute-by-percentage.html
 */
export interface DistributeByPercentageConfig {
  id: string;
  branches: PercentageBranch[];
  onRemainder: Target;
}

export class DistributeByPercentage extends Block {
  readonly type = ActionType.DistributeByPercentage;

  constructor(private readonly config: DistributeByPercentageConfig) {
    super(config.id);
    if (config.branches.length === 0) {
      throw new Error(`DistributeByPercentage "${config.id}" needs at least one branch.`);
    }
    let threshold = 1;
    for (const b of config.branches) {
      if (!Number.isInteger(b.percent) || b.percent < PERCENTAGE_FLOOR) {
        throw new Error(
          `DistributeByPercentage "${config.id}" percent must be an integer of at least ${PERCENTAGE_FLOOR}, got ${b.percent}.`,
        );
      }
      threshold += b.percent;
    }
    if (threshold > PERCENTAGE_THRESHOLD_MAX) {
      throw new Error(
        `DistributeByPercentage "${config.id}" branches claim ${threshold - 1}%; at most ${PERCENTAGE_THRESHOLD_MAX - 1}% may be claimed, the remainder is onRemainder.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    return {};
  }

  protected transitions(): Transitions {
    let threshold = 1;
    const conditions: ConditionTransitionInput[] = this.config.branches.map((b) => {
      threshold += b.percent;
      return { target: b.target, operator: "NumberLessThan", operands: [String(threshold)] };
    });
    return wire(
      this.config.onRemainder,
      [[NO_MATCHING_CONDITION, this.config.onRemainder]],
      conditions,
    );
  }
}

/**
 * Sets attributes on the current flow: "These attributes are not carried
 * over to the subsequent flows. With this type of operation, either all
 * attributes are set or none are set." The action page's parameter block is
 * malformed and never defines the value; the console's exports of the block
 * (the Set contact attributes block with its Flow namespace, published in
 * AWS sample repositories) write each value as `{ "Value": "<string>" }`,
 * static or a JSONPath, and every one carries a NoMatchingError branch the
 * page's Errors "None" does not list. The class writes that shape from a
 * flat string map and wires the catch-all as UpdateContactAttributes does.
 * Legal in every flow type and channel.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateflowattributes.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-contact-attributes.html
 */
export interface UpdateFlowAttributesConfig extends Wired {
  attributes: Record<string, string>;
}

export class UpdateFlowAttributes extends Block {
  readonly type = ActionType.UpdateFlowAttributes;

  constructor(private readonly config: UpdateFlowAttributesConfig) {
    super(config.id);
    const a = config.attributes;
    if (a === null || typeof a !== "object" || Array.isArray(a)) {
      throw new Error(`UpdateFlowAttributes "${config.id}" attributes must be an object.`);
    }
    for (const [k, v] of Object.entries(a)) {
      if (typeof v !== "string") {
        throw new Error(`UpdateFlowAttributes "${config.id}" attribute "${k}" must be a string.`);
      }
    }
  }

  protected parameters(): Record<string, unknown> {
    return {
      FlowAttributes: Object.fromEntries(
        Object.entries(this.config.attributes).map(([k, v]) => [k, { Value: v }]),
      ),
    };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/**
 * One comparison against the loaded metric. Operands are numbers, written as
 * strings, in the metric's wire unit: OldestContactInQueueAgeSeconds is
 * compared in milliseconds (the console writes its seconds entry times 1000),
 * the others are counts.
 */
export interface MetricBranch {
  operator: MetricOperator;
  operand: number | string;
  target: Target;
}

/**
 * CheckMetricData: the console's Check staffing and Check queue status
 * blocks. Loads one metric for the named queue, agent queue, or the contact's
 * target queue, and branches on it. For the NumberOfAgents* metrics "the only
 * supported condition is NumberGreaterThan 0"; the queue metrics take Equals
 * and the Number* operators. The console mirrors NextAction onto the
 * catch-all and writes the two errors in either order (NoMatchingError first
 * in its default queue transfer export, NoMatchingCondition first in its
 * Sample queue configurations export); the class writes NoMatchingError
 * first and the inverter reads them by type.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkmetricdata.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/check-staffing.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/check-queue-status.html
 */
export type CheckMetricDataConfig = OptionalQueueTarget & {
  id: string;
  metric: MetricType;
  branches: MetricBranch[];
  onNoMatch: Target;
  onError: Target;
};

export class CheckMetricData extends Block {
  readonly type = ActionType.CheckMetricData;

  constructor(private readonly config: CheckMetricDataConfig) {
    super(config.id);
    if (!METRIC_TYPES.includes(config.metric)) {
      throw new Error(
        `CheckMetricData "${config.id}" metric ${config.metric} is not a metric type.`,
      );
    }
    if (config.branches.length === 0) {
      throw new Error(`CheckMetricData "${config.id}" needs at least one branch.`);
    }
    for (const b of config.branches) {
      if (!METRIC_OPERATORS.includes(b.operator)) {
        throw new Error(
          `CheckMetricData "${config.id}" operator ${b.operator} is not a metric comparison.`,
        );
      }
      if (!/^-?[0-9]+(\.[0-9]+)?$/.test(String(b.operand))) {
        throw new Error(
          `CheckMetricData "${config.id}" operand ${String(b.operand)} is not a number.`,
        );
      }
    }
    if (AGENT_METRIC_TYPES.includes(config.metric)) {
      const [only] = config.branches;
      if (
        config.branches.length !== 1 ||
        only!.operator !== "NumberGreaterThan" ||
        String(only!.operand) !== "0"
      ) {
        throw new Error(
          `CheckMetricData "${config.id}" with ${config.metric} takes exactly one branch, NumberGreaterThan 0.`,
        );
      }
    }
  }

  protected parameters(): Record<string, unknown> {
    const p: Record<string, unknown> = { MetricType: this.config.metric };
    if (this.config.queue !== undefined) p.QueueId = this.config.queue;
    if (this.config.agent !== undefined) p.AgentId = this.config.agent;
    return p;
  }

  protected transitions(): Transitions {
    return wire(
      this.config.onError,
      [
        [NO_MATCHING_ERROR, this.config.onError],
        [NO_MATCHING_CONDITION, this.config.onNoMatch],
      ],
      this.config.branches.map((b) => ({
        target: b.target,
        operator: b.operator,
        operands: [String(b.operand)],
      })),
    );
  }
}

/**
 * GetMetricData: loads the real-time metrics of the named queue, an agent
 * queue, or the contact's target queue "and makes them available on the flow
 * run data" (the admin guide's attribute list spells them $.Metrics.Queue.*
 * and $.Metrics.Agents.*, plus $.Metrics.Contact.* when Get contact metrics
 * is on).
 * `channel` narrows them to "Voice" or "Chat", statically or by a single
 * JSONPath ("Can be set dynamically"); without it "metrics are returned for
 * all channels". Legal in every flow type.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-getmetricdata.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-queue-metrics.html
 */
export type GetMetricDataConfig = Wired &
  OptionalQueueTarget & {
    channel?: QueueChannel | JsonPath;
  };

// https://docs.aws.amazon.com/connect/latest/adminguide/connect-attrib-list.html
export class GetMetricData extends Block {
  readonly type = ActionType.GetMetricData;

  constructor(private readonly config: GetMetricDataConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    if (this.config.queue !== undefined) p.QueueId = this.config.queue;
    if (this.config.agent !== undefined) p.AgentId = this.config.agent;
    if (this.config.channel !== undefined) p.QueueChannel = this.config.channel;
    return p;
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

/** A queue, an agent queue, or neither. */
export type OptionalQueueTarget = QueueTarget | { queue?: never; agent?: never };

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

/**
 * Queue-to-queue transfer: dequeues the contact and places it in the queue
 * named. `queue` and `agent` are both optional and at most one may be given;
 * the action page does not say where the contact goes when neither is set,
 * so `{}` is accepted but its destination is undocumented. Only legal in a
 * customer queue flow. The action page lists QueueAtCapacity beside the
 * catch-all, as TransferContactToQueue does.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-dequeuecontactandtransfertoqueue.html
 */
export type DequeueContactAndTransferToQueueConfig = Wired & {
  onQueueAtCapacity: Target;
} & OptionalQueueTarget;

export class DequeueContactAndTransferToQueue extends Block {
  readonly type = ActionType.DequeueContactAndTransferToQueue;

  constructor(private readonly config: DequeueContactAndTransferToQueueConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    if (this.config.queue !== undefined) return { QueueId: this.config.queue };
    if (this.config.agent !== undefined) return { AgentId: this.config.agent };
    return {};
  }

  protected transitions(): Transitions {
    const extra = EXTRA_ERRORS[ActionType.DequeueContactAndTransferToQueue] ?? [];
    const errors: [string, Target][] = extra.map((e) => [e, this.config.onQueueAtCapacity]);
    errors.push([NO_MATCHING_ERROR, this.config.onError]);
    return wire(this.config.next, errors);
  }
}

/**
 * Terminal. "Ends the current flow and transfers the customer to an agent. If
 * the agent is already with someone else, the contact is disconnected." Voice
 * only (the admin guide's channel table routes chat, task and email to an
 * "Error branch" the same page says the block does not have; the action
 * page's Errors "None" governs, so where a non-voice contact goes is
 * undocumented), legal in transfer flows only, and the console marks the
 * block beta and recommends UpdateContactTargetQueue plus
 * TransferContactToQueue for agent-to-agent transfers on every channel.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-transfercontacttoagent.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-agent-block.html
 */
export class TransferContactToAgent extends Block {
  readonly type = ActionType.TransferContactToAgent;

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

/** A queue priority or a queue time adjustment, never both. */
export type RoutingAdjustment =
  | { queuePriority: number; queueTimeAdjustmentSeconds?: never }
  | { queueTimeAdjustmentSeconds: number; queuePriority?: never };

/**
 * Moves the contact in queue: `queuePriority` (1 is highest; new contacts
 * start at 5) or `queueTimeAdjustmentSeconds` (added to the contact's time in
 * queue; longer is routed first; may be negative), each written as a decimal
 * string, the console's spelling. The page lists no errors and no results,
 * so the block has a success path only. Inbound flows only.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactroutingbehavior.html
 */
export type UpdateContactRoutingBehaviorConfig = { id: string; next: Target } & RoutingAdjustment;

export class UpdateContactRoutingBehavior extends Block {
  readonly type = ActionType.UpdateContactRoutingBehavior;

  constructor(private readonly config: UpdateContactRoutingBehaviorConfig) {
    super(config.id);
    const id = config.id;
    const { queuePriority: priority, queueTimeAdjustmentSeconds: seconds } = config;
    if (priority !== undefined && seconds !== undefined) {
      throw new Error(
        `UpdateContactRoutingBehavior "${id}" takes queuePriority or queueTimeAdjustmentSeconds, not both.`,
      );
    }
    if (priority !== undefined) {
      if (!Number.isSafeInteger(priority) || priority < QUEUE_PRIORITY_MIN) {
        throw new Error(
          `UpdateContactRoutingBehavior "${id}" queuePriority must be an integer of at least ${QUEUE_PRIORITY_MIN}, got ${priority}.`,
        );
      }
    } else if (seconds !== undefined) {
      if (!Number.isSafeInteger(seconds)) {
        throw new Error(
          `UpdateContactRoutingBehavior "${id}" queueTimeAdjustmentSeconds must be an integer, got ${seconds}.`,
        );
      }
    } else {
      throw new Error(
        `UpdateContactRoutingBehavior "${id}" needs queuePriority or queueTimeAdjustmentSeconds.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    // The console's spelling: decimal strings, as its Sample queue
    // configurations flow exports them.
    return this.config.queuePriority !== undefined
      ? { QueuePriority: String(this.config.queuePriority) }
      : { QueueTimeAdjustmentSeconds: String(this.config.queueTimeAdjustmentSeconds) };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, []);
  }
}

/**
 * Tags the contact: "Sets a collection of tag to the current contact. With
 * this type of operation, either all tags are set or none are set." Keys and
 * values are strings, "defined statically or dynamically"; a key may not use
 * the `aws:` prefix reserved for system tags, and a contact carries at most
 * six user-defined tags (CreateContactFlow refuses a seventh: "More than 6
 * tags in Parameters.Tags"; it accepts an `aws:` key at create time, so that
 * rule is the page's, kept here). The page lists no errors, but the service
 * requires the catch-all ("Action is missing required error. Error:
 * NoMatchingError", checked 2026-09-15), and the admin guide's block has an
 * Error branch. The builder requires at least one tag, which is the
 * builder's choice. Legal everywhere.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-tagcontact.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/contact-tags-block.html
 */
export interface TagContactConfig extends Wired {
  tags: Record<string, string>;
}

export class TagContact extends Block {
  readonly type = ActionType.TagContact;

  constructor(private readonly config: TagContactConfig) {
    super(config.id);
    const keys = Object.keys(config.tags);
    if (keys.length === 0 || keys.length > TAG_LIMIT) {
      throw new Error(
        `TagContact "${config.id}" takes between 1 and ${TAG_LIMIT} tags, got ${keys.length}.`,
      );
    }
    for (const k of keys) {
      if (k.startsWith(SYSTEM_TAG_PREFIX)) {
        throw new Error(
          `TagContact "${config.id}" tag "${k}" uses the ${SYSTEM_TAG_PREFIX} prefix, which is reserved for system tags.`,
        );
      }
      if (typeof config.tags[k] !== "string") {
        throw new Error(`TagContact "${config.id}" tag "${k}" must be a string.`);
      }
    }
  }

  protected parameters(): Record<string, unknown> {
    return { Tags: this.config.tags };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/**
 * Removes tags from the contact: "You cannot remove system-defined tags. You
 * can only remove already existing user-defined tags from a contact." Keys
 * "can only be set statically". The page lists NoMatchingError. The action
 * type is spelled `UntagContact` on the wire: the page's title and body spell
 * it `UnTagContact`, which CreateContactFlow refuses ("Invalid Action type.
 * Type: UnTagContact", checked 2026-09-15) while accepting `UntagContact`,
 * the spelling of the API operation the admin guide names. The builder
 * requires at least one key (the service refuses an empty list). Legal
 * everywhere.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-untagcontact.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/granular-billing.html
 */
export interface UntagContactConfig extends Wired {
  tagKeys: string[];
}

export class UntagContact extends Block {
  readonly type = ActionType.UntagContact;

  constructor(private readonly config: UntagContactConfig) {
    super(config.id);
    if (config.tagKeys.length === 0) {
      throw new Error(`UntagContact "${config.id}" needs at least one tag key.`);
    }
    for (const k of config.tagKeys) {
      if (typeof k !== "string" || k === "") {
        throw new Error(`UntagContact "${config.id}" tag keys must be non-empty strings.`);
      }
      if (k.startsWith(SYSTEM_TAG_PREFIX)) {
        throw new Error(
          `UntagContact "${config.id}" cannot remove "${k}": the ${SYSTEM_TAG_PREFIX} prefix marks a system tag.`,
        );
      }
    }
  }

  protected parameters(): Record<string, unknown> {
    return { TagKeys: this.config.tagKeys };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/**
 * Sets the Amazon Polly voice for text-to-speech on the contact: "This
 * defaults to Joanna if this action is never run." `voice` is "the name of an
 * Amazon Polly voice"; `engine` and `style` are optional, each static or a
 * single JSONPath ("May be defined statically or dynamically"); the engine is
 * spelled as the console writes it ("Neural"). "Results in error if voice or
 * engine are invalid, or if the selected voice does not support the selected
 * engine." The page marks the catch-all "Must always be defined", but the
 * service accepts the block without it and published console exports often
 * omit it, so `onError` is optional. Legal everywhere; on chat the admin
 * guide says the block takes the Success branch with no effect.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacttexttospeechvoice.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-voice.html
 */
export interface UpdateContactTextToSpeechVoiceConfig {
  id: string;
  voice: string;
  engine?: TtsEngine | JsonPath;
  style?: TtsStyle | JsonPath;
  next: Target;
  onError?: Target;
}

export class UpdateContactTextToSpeechVoice extends Block {
  readonly type = ActionType.UpdateContactTextToSpeechVoice;

  constructor(private readonly config: UpdateContactTextToSpeechVoiceConfig) {
    super(config.id);
    if (typeof config.voice !== "string" || config.voice === "") {
      throw new Error(`UpdateContactTextToSpeechVoice "${config.id}" needs a voice name.`);
    }
  }

  protected parameters(): Record<string, unknown> {
    const p: Record<string, unknown> = { TextToSpeechVoice: this.config.voice };
    if (this.config.engine !== undefined) p.TextToSpeechEngine = this.config.engine;
    if (this.config.style !== undefined) p.TextToSpeechStyle = this.config.style;
    return p;
  }

  protected transitions(): Transitions {
    return wire(
      this.config.next,
      this.config.onError === undefined ? [] : [[NO_MATCHING_ERROR, this.config.onError]],
    );
  }
}

/**
 * Sets Connect-defined fields on the contact: "Sets a collection of connect
 * defined attributes on specified contact. With this type of operation,
 * either all attributes are set or none are set." Every field is optional,
 * the target included: the page marks TargetContact "[Required]", but the
 * service accepts the block without it (checked 2026-09-15) and a published
 * console export writes the block with WisdomSessionArn alone, so it is
 * written only when configured ("Current" or "Related"). `references` is the
 * References map, keys and
 * values static or dynamic. The Voice ID settings are written as the page
 * spells them: the three flags as "TRUE" or "FALSE", the thresholds and the
 * response time as decimal strings within the page's bounds. Legal
 * everywhere.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactdata.html
 */
export interface UpdateContactDataConfig extends Wired {
  targetContact?: TargetContact;
  name?: string;
  description?: string;
  languageCode?: string;
  customerId?: string;
  references?: Record<string, string>;
  voiceIdStreaming?: boolean;
  voiceAuthentication?: boolean;
  fraudDetection?: boolean;
  /** 0 to 100. */
  voiceAuthenticationThreshold?: number;
  /** 5 to 10 seconds. */
  voiceAuthenticationResponseTime?: number;
  /** 0 to 100. */
  fraudDetectionThreshold?: number;
  watchlistId?: string;
  wisdomSessionArn?: string;
}

export class UpdateContactData extends Block {
  readonly type = ActionType.UpdateContactData;

  constructor(private readonly config: UpdateContactDataConfig) {
    super(config.id);
    const bounded = (name: string, value: number | undefined, min: number, max: number) => {
      if (value === undefined) return;
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(
          `UpdateContactData "${config.id}" ${name} must be an integer between ${min} and ${max}, got ${value}.`,
        );
      }
    };
    bounded(
      "voiceAuthenticationThreshold",
      config.voiceAuthenticationThreshold,
      VOICE_ID_THRESHOLD_MIN,
      VOICE_ID_THRESHOLD_MAX,
    );
    bounded(
      "voiceAuthenticationResponseTime",
      config.voiceAuthenticationResponseTime,
      VOICE_ID_RESPONSE_TIME_MIN,
      VOICE_ID_RESPONSE_TIME_MAX,
    );
    bounded(
      "fraudDetectionThreshold",
      config.fraudDetectionThreshold,
      VOICE_ID_THRESHOLD_MIN,
      VOICE_ID_THRESHOLD_MAX,
    );
    for (const [k, v] of Object.entries(config.references ?? {})) {
      if (typeof v !== "string") {
        throw new Error(`UpdateContactData "${config.id}" reference "${k}" must be a string.`);
      }
    }
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config;
    const p: Record<string, unknown> = {};
    if (c.name !== undefined) p.Name = c.name;
    if (c.description !== undefined) p.Description = c.description;
    if (c.languageCode !== undefined) p.LanguageCode = c.languageCode;
    if (c.customerId !== undefined) p.CustomerId = c.customerId;
    if (c.references !== undefined) p.References = c.references;
    const flag = (v: boolean) => (v ? "TRUE" : "FALSE");
    if (c.voiceIdStreaming !== undefined) p.IsVoiceIdStreamingEnabled = flag(c.voiceIdStreaming);
    if (c.voiceAuthentication !== undefined) {
      p.IsVoiceAuthenticationEnabled = flag(c.voiceAuthentication);
    }
    if (c.fraudDetection !== undefined) p.IsFraudDetectionEnabled = flag(c.fraudDetection);
    if (c.voiceAuthenticationThreshold !== undefined) {
      p.VoiceAuthenticationThreshold = String(c.voiceAuthenticationThreshold);
    }
    if (c.voiceAuthenticationResponseTime !== undefined) {
      p.VoiceAuthenticationResponseTime = String(c.voiceAuthenticationResponseTime);
    }
    if (c.fraudDetectionThreshold !== undefined) {
      p.FraudDetectionThreshold = String(c.fraudDetectionThreshold);
    }
    if (c.watchlistId !== undefined) p.WatchlistId = c.watchlistId;
    if (c.wisdomSessionArn !== undefined) p.WisdomSessionArn = c.wisdomSessionArn;
    if (c.targetContact !== undefined) p.TargetContact = c.targetContact;
    return p;
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/**
 * Sets one contact event hook: the flow to run at an event such as customer
 * queue, hold, whisper or the agent UI. "Only one entry may be present in
 * this map", so the block takes one `hook` and its `flow`, a flow reference
 * or a single JSONPath (the admin guide's Set hold flow block shows "the
 * dropdown list of namespaces that you can use to set the hold flow
 * dynamically"). The console writes `EventHooks: { <hook>: <flow ARN> }` with
 * NoMatchingError, as its Sample inbound flow and Sample queue configurations
 * flow export. Legal in every flow type.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacteventhooks.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-hold-flow.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-customer-queue-flow.html
 */
export interface UpdateContactEventHooksConfig extends Wired {
  hook: EventHook;
  flow: Ref<"flow"> | JsonPath;
}

export class UpdateContactEventHooks extends Block {
  readonly type = ActionType.UpdateContactEventHooks;

  constructor(private readonly config: UpdateContactEventHooksConfig) {
    super(config.id);
    if (!EVENT_HOOKS.includes(config.hook)) {
      throw new Error(
        `UpdateContactEventHooks "${config.id}" hook ${String(config.hook)} is not an event hook.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    return { EventHooks: { [this.config.hook]: this.config.flow } };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
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

/**
 * Sets which participants a voice call records. Takes no error branch: the
 * service refused `NoMatchingError` on this action ("Invalid Action error.
 * Error: NoMatchingError") and accepted it with `Errors` empty (sandbox,
 * 2026-09-29; conformance/flow-language/actions.md, rule 37), so the class
 * writes a next target and nothing else.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactrecordingbehavior.html
 */
export interface UpdateContactRecordingBehaviorConfig {
  id: string;
  next: Target;
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
    return wire(this.config.next, []);
  }
}

/**
 * "Enables or disables flow logging. If this is a flow, this same behavior
 * remains unless it is overridden for the rest of the contact segment. It is
 * also automatically inherited by new segments in the chain." One parameter,
 * `FlowLoggingBehavior`: "One of [Enabled,Disabled]. *Dynamic values are not
 * supported*". Errors "None.", results "None. No conditions are supported.",
 * "This action is available in every type of flow." The page says nothing
 * about NextAction and no recorded console export carries the type (the
 * demo-instance export fixture holds the builder's own output, tasks/A06).
 * The class writes NextAction with empty Errors and Conditions, the shape the
 * console writes for its other error-less blocks in the sample exports and
 * byte for byte what a GenericBlock with a next target writes, so modeling
 * the action changed no document's bytes; the service accepted the block
 * with no errors (tasks/B01, live checks). To be confirmed against a console
 * export.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateflowloggingbehavior.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-logging-behavior.html
 */
export interface UpdateFlowLoggingBehaviorConfig {
  id: string;
  behavior: "Enabled" | "Disabled";
  next: Target;
}

export class UpdateFlowLoggingBehavior extends Block {
  readonly type = ActionType.UpdateFlowLoggingBehavior;

  constructor(private readonly config: UpdateFlowLoggingBehaviorConfig) {
    super(config.id);
    if (config.behavior !== "Enabled" && config.behavior !== "Disabled") {
      throw new Error(
        `UpdateFlowLoggingBehavior "${config.id}" behavior must be Enabled or Disabled, got ${String(config.behavior)}.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    return { FlowLoggingBehavior: this.config.behavior };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, []);
  }
}

/**
 * The voice recording half of UpdateContactRecordingAndAnalyticsBehavior:
 * `recordedParticipants` is "a list of participants to record, chosen from
 * "Agent" and "Customer". An empty list disables recording. Must be set
 * statically", and `ivrRecordingBehavior` "Can be either "Enabled" or
 * "Disabled". Must be set statically".
 */
export interface VoiceRecording {
  recordedParticipants: ("Agent" | "Customer")[];
  ivrRecordingBehavior?: "Enabled" | "Disabled";
}

/**
 * "Sets contact recording behavior, including analysis behavior and which
 * participants of the contact to record." The action's parameter block holds
 * one channel object ("Only ONE of the following channel behavior objects can
 * be defined per configuration": ChatBehavior or VoiceBehavior) and an
 * optional ScreenRecordingBehavior that "Can be defined independently or
 * alongside any channel behavior". The class writes the voice recording form
 * (`voice`) or the screen recording form (`screenRecordedParticipants`, "can
 * only include "Agent"", static), never both: whatever the page says,
 * CreateContactFlow refuses a block carrying two of the three objects, or
 * none ("Invalid Action property value. Path: Actions[0].Parameters", checked
 * 2026-09-15), which is also what the admin guide's "two separate ... blocks
 * in sequence" means. The voice analytics settings and the whole chat form
 * parse as a GenericBlock, as the older action's AnalyticsBehavior does. Two
 * errors, both "Must always be defined": the catch-all and ChannelMismatch
 * (the service refuses the block without ChannelMismatch and accepts the two
 * in either order). The page has no
 * Restrictions section (the admin guide: "supported for all flow types except
 * journey flows") and says nothing about NextAction; the admin guide's block
 * has a Success branch, written here as the block's own path.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactrecordingandanalyticsbehavior.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-recording-analytics-processing-behavior.html
 */
export interface UpdateContactRecordingAndAnalyticsBehaviorConfig extends Wired {
  voice?: VoiceRecording;
  screenRecordedParticipants?: "Agent"[];
  onChannelMismatch: Target;
}

export class UpdateContactRecordingAndAnalyticsBehavior extends Block {
  readonly type = ActionType.UpdateContactRecordingAndAnalyticsBehavior;

  constructor(private readonly config: UpdateContactRecordingAndAnalyticsBehaviorConfig) {
    super(config.id);
    if ((config.voice === undefined) === (config.screenRecordedParticipants === undefined)) {
      throw new Error(
        `UpdateContactRecordingAndAnalyticsBehavior "${config.id}" takes exactly one of voice recording and screen recording.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    const voice = this.config.voice;
    if (voice !== undefined) {
      const recording: Record<string, unknown> = {
        RecordedParticipants: voice.recordedParticipants,
      };
      if (voice.ivrRecordingBehavior !== undefined) {
        recording.IVRRecordingBehavior = voice.ivrRecordingBehavior;
      }
      p.VoiceBehavior = { VoiceRecordingBehavior: recording };
    }
    if (this.config.screenRecordedParticipants !== undefined) {
      p.ScreenRecordingBehavior = {
        ScreenRecordedParticipants: this.config.screenRecordedParticipants,
      };
    }
    return p;
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [
      [NO_MATCHING_ERROR, this.config.onError],
      [CHANNEL_MISMATCH, this.config.onChannelMismatch],
    ]);
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

/**
 * Sets the number CreateCallbackContact will dial. "Must be a single, valid
 * JSONPath reference, and cannot be set statically", so the value is a
 * JsonPath, typically `$.StoredCustomerInput` after a GetParticipantInput
 * that stores digits. The page lists two errors and no catch-all: an invalid
 * E.164 number, and a valid number the instance may not dial. Non-voice
 * channels take the invalid-number branch.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactcallbacknumber.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-callback-number.html
 */
export interface UpdateContactCallbackNumberConfig {
  id: string;
  callbackNumber: JsonPath;
  next: Target;
  onInvalidNumber: Target;
  onNotDialable: Target;
}

export class UpdateContactCallbackNumber extends Block {
  readonly type = ActionType.UpdateContactCallbackNumber;

  constructor(private readonly config: UpdateContactCallbackNumberConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return { CallbackNumber: this.config.callbackNumber };
  }

  protected transitions(): Transitions {
    const targets: Record<string, Target> = {
      [INVALID_CALLBACK_NUMBER]: this.config.onInvalidNumber,
      [CALLBACK_NUMBER_NOT_DIALABLE]: this.config.onNotDialable,
    };
    // The page's order, which is also what the studio wires from.
    const order = EXTRA_ERRORS[ActionType.UpdateContactCallbackNumber] ?? [];
    return wire(
      this.config.next,
      order.map((e) => [e, targets[e]!] as [string, Target]),
    );
  }
}

/**
 * Creates a callback contact. The number called is the contact's callback
 * number: the one UpdateContactCallbackNumber set, else "the customer
 * participant caller ID" (the customer's own number, not `callerId`). The
 * queue is the one named, an agent queue, or the contact's current target
 * queue when neither is given. `initialCallDelaySeconds` is ignored by
 * Connect when `flow` is set: the callback then runs that flow on creation
 * instead of waiting. `callerId` is the number the customer sees when called
 * back, "a valid phone number claimed in your Connect Customer instance",
 * static or a single JSONPath; it is never the number dialed. The three
 * counts are written as decimal strings, the console's spelling.
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-createcallbackcontact.html
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactcallbacknumber.html
 */
export type CreateCallbackContactConfig = Wired &
  OptionalQueueTarget & {
    /** Seconds before the first attempt, 1 to 259200 (three days). */
    initialCallDelaySeconds: number;
    /** Attempts at most, at least 1. */
    maximumConnectionAttempts: number;
    /** Seconds between an unanswered attempt and the next, 1 to 259200. */
    retryDelaySeconds: number;
    flow?: Ref<"flow"> | JsonPath;
    callerId?: string;
  };

export class CreateCallbackContact extends Block {
  readonly type = ActionType.CreateCallbackContact;

  constructor(private readonly config: CreateCallbackContactConfig) {
    super(config.id);
    const bounded = (name: string, value: number, min: number, max?: number) => {
      if (!Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
        const range = max === undefined ? `of at least ${min}` : `between ${min} and ${max}`;
        throw new Error(
          `CreateCallbackContact "${config.id}" ${name} must be an integer ${range}, got ${value}.`,
        );
      }
    };
    bounded(
      "initialCallDelaySeconds",
      config.initialCallDelaySeconds,
      CALLBACK_DELAY_MIN,
      CALLBACK_DELAY_MAX,
    );
    bounded("maximumConnectionAttempts", config.maximumConnectionAttempts, CALLBACK_ATTEMPTS_MIN);
    bounded("retryDelaySeconds", config.retryDelaySeconds, CALLBACK_DELAY_MIN, CALLBACK_DELAY_MAX);
  }

  protected parameters(): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    if (this.config.queue !== undefined) p.QueueId = this.config.queue;
    if (this.config.agent !== undefined) p.AgentId = this.config.agent;
    p.InitialCallDelaySeconds = String(this.config.initialCallDelaySeconds);
    p.MaximumConnectionAttempts = String(this.config.maximumConnectionAttempts);
    p.RetryDelaySeconds = String(this.config.retryDelaySeconds);
    if (this.config.flow !== undefined) p.ContactFlowId = this.config.flow;
    if (this.config.callerId !== undefined) p.CallerId = this.config.callerId;
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
 * set survivable: 56 action types are documented and the builder models 35.
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
