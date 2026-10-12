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
  CALL_FAILED,
  CALLBACK_ATTEMPTS_MIN,
  CALLBACK_DELAY_MAX,
  CALLBACK_DELAY_MIN,
  CALLBACK_NUMBER_NOT_DIALABLE,
  CASE_CONTACTS_TO_LINK,
  CASE_MULTIPLE_FOUND,
  CASE_NONE_FOUND,
  CASE_RESPONSE_FIELDS_MAX,
  CASE_SYSTEM_FIELDS,
  CHANNEL_MISMATCH,
  CONTACT_NOT_LINKED,
  CONNECTION_TIME_LIMIT_EXCEEDED,
  DTMF_DIGITS,
  EVENT_HOOKS,
  INVALID_CALLBACK_NUMBER,
  INVALID_PHONE_NUMBER,
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
  MEDIA_DIRECTIONS,
  MEDIA_STREAMING_STATES,
  MESSAGES_INTERRUPTED,
  METRIC_OPERATORS,
  METRIC_TYPES,
  NO_MATCHING_CONDITION,
  NO_MATCHING_ERROR,
  PARTICIPANT_NOT_FOUND,
  PERCENTAGE_FLOOR,
  PERCENTAGE_THRESHOLD_MAX,
  PREVIOUS_PARTICIPANT_STATES,
  PREDEFINED_ATTRIBUTE_TEXT_MAX,
  PREDEFINED_ATTRIBUTE_TEXT_MIN,
  PROFICIENCY_LEVELS,
  ROUTING_AND_MAX,
  ROUTING_COMPARISON_OPERATOR,
  ROUTING_OR_MAX,
  CALCULATED_ATTRIBUTE_FIELDS,
  CALCULATED_ATTRIBUTE_PATTERNS,
  MULTIPLE_FOUND_ERROR,
  NONE_FOUND_ERROR,
  PROFILE_FIELD_PATTERNS,
  PROFILE_FIELDS,
  PROFILE_LOGICAL_OPERATORS,
  PROFILE_OBJECT_FIELD_PATTERNS,
  PROFILE_OBJECT_FIELDS,
  PROFILE_SEARCH_CRITERIA_MAX,
  PROFILE_SEARCH_CRITERIA_MIN,
  QUEUE_PRIORITY_MIN,
  STORED_CONTENT_TYPES,
  SYSTEM_TAG_PREFIX,
  TASK_DELAY_MAX,
  TASK_DELAY_MIN,
  VOICE_ID_RESPONSE_TIME_MAX,
  VOICE_ID_RESPONSE_TIME_MIN,
  VOICE_ID_THRESHOLD_MAX,
  VOICE_ID_THRESHOLD_MIN,
  TAG_LIMIT,
  TIME_LIMIT_EXCEEDED,
  OUTBOUND_CALL_STATUSES,
  OUTBOUND_CHAT_DESTINATION_TYPE,
  OUTBOUND_CHAT_RELATED_CONTACT,
  OUTBOUND_CHAT_SOURCE_TYPE,
  OUTBOUND_CHAT_SUBTYPE,
  OUTBOUND_CONNECTION_TIME_LIMIT_MAX,
  OUTBOUND_CONNECTION_TIME_LIMIT_MIN,
  WAIT_COMPLETED,
  WAIT_EVENTS,
  WAIT_TIMEOUT_MAX,
  WAIT_TIMEOUT_MIN,
} from "./actions.js";
import type {
  CaseContactToLink,
  CaseSystemField,
  DtmfDigit,
  EventHook,
  MediaDirection,
  MediaStreamingState,
  MetricOperator,
  MetricType,
  OutboundCallStatus,
  PreviousParticipantState,
  ProficiencyLevel,
  ProfileLogicalOperator,
  QueueChannel,
  TargetContact,
  TtsEngine,
  TtsStyle,
  WaitEvent,
} from "./actions.js";
import type { Condition, ConditionOperator, FlowAction, Transitions } from "./flowdoc.js";
import { isValidIdentifier } from "./flowdoc.js";
import type { JsonPath, Ref } from "./refs.js";
import { parseToken } from "./refs.js";
import { jsonPath } from "./refs.js";

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

/**
 * `onError` is optional: the service accepts the action without the
 * catch-all, and Connect's own sample and default flows omit it on most of
 * their messages (CreateContactFlow and a full instance export, 2026-09-29;
 * conformance/flow-language/actions.md, rule 37). The builder wires it when
 * given, as the page describes.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-messageparticipant.html
 */
export type MessageParticipantConfig = { id: string; next: Target; onError?: Target } & MessageBody;

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
    return wire(
      this.config.next,
      this.config.onError === undefined ? [] : [[NO_MATCHING_ERROR, this.config.onError]],
    );
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
 * How a stored-input GetParticipantInput checks the digits before storing
 * them (the action page's InputValidation, "required if and only if
 * StoreInput is True"): a maximum length, or a phone number in a given
 * format.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 */
export type StoredInputValidation =
  | {
      /**
       * CustomValidation.MaximumLength: the most digits accepted. A static
       * positive integer, written as the console's decimal string
       * (conformance/flow-language/actions.md, rule 39).
       */
      maxLength: number;
      phoneNumber?: never;
    }
  | { phoneNumber: PhoneNumberValidation; maxLength?: never };

/**
 * PhoneNumberValidation. "Local" validates "a local number (without the + and
 * the country code)" and needs the two-letter country code; "E164" validates
 * "a fully defined e.164 phone number".
 */
export interface PhoneNumberValidation {
  format: PhoneNumberFormat;
  /** ISO 3166 alpha-2, upper case ("US"). Required with "Local". */
  countryCode?: string;
}

export const PHONE_NUMBER_FORMATS = ["Local", "E164"] as const;
export type PhoneNumberFormat = (typeof PHONE_NUMBER_FORMATS)[number];

/**
 * Shared by both forms of GetParticipantInput: the block id, an optional
 * prompt (PromptId, Text and SSML are each "[Optional]" on the action page,
 * and a menu may follow a prompt played by an earlier block) and the time
 * allowed for the first key.
 */
type GetParticipantInputBase = {
  id: string;
  /**
   * Seconds to wait for the first key. Static integer, 1 to 180 inclusive
   * (INPUT_TIMEOUT_MIN and INPUT_TIMEOUT_MAX).
   */
  timeoutSeconds: number;
} & (MessageBody | { text?: never; ssml?: never; prompt?: never });

/**
 * The DTMF menu form: wait for one key and branch on it. `StoreInput` is
 * written "False".
 */
export type GetParticipantInputMenuConfig = GetParticipantInputBase & {
  /**
   * Keys that branch, in the order Connect evaluates them. May be empty. Each
   * key may branch once; a repeated key is refused by the constructor.
   */
  branches: DtmfBranch[];
  onTimeout: Target;
  onNoMatch: Target;
  onError: Target;
  store?: never;
  next?: never;
  onInvalidNumber?: never;
};

/**
 * The stored-input form: collect digits, validate them, and keep them on the
 * contact as `$.StoredCustomerInput` for a later block to read. `StoreInput`
 * is written "True", `store` becomes InputValidation, and the block has no
 * conditions: `next` is the success path. A phone number validation adds an
 * `onInvalidNumber` branch (InvalidPhoneNumber); a length validation takes
 * none.
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
 */
export type GetParticipantInputStoredConfig = GetParticipantInputBase & {
  next: Target;
  onError: Target;
  branches?: never;
  onTimeout?: never;
  onNoMatch?: never;
} & (
    | { store: { maxLength: number; phoneNumber?: never }; onInvalidNumber?: never }
    | { store: { phoneNumber: PhoneNumberValidation; maxLength?: never }; onInvalidNumber: Target }
  );

/**
 * Both forms of the action, told apart by `store`: present, the digits are
 * stored; absent, `branches` make a menu. One class for both, because a block
 * maps one-to-one onto an Action and the console, the catalog and the HCL
 * view each have one GetParticipantInput as well; the config object is where
 * the two shapes differ, as it is for the forms of UpdateContactTargetQueue.
 */
export type GetParticipantInputConfig =
  GetParticipantInputMenuConfig | GetParticipantInputStoredConfig;

/**
 * Collect DTMF input: a menu that branches on one key, or digits stored on the
 * contact.
 *
 * GetParticipantInput has two forms. With StoreInput "False" the key pressed
 * is the run result and Conditions branch on it; conditions "may use only the
 * Equals operator" and each operand "must be static and be a single character
 * - 0-9 numeric, *, or #". With StoreInput "True" the digits are stored,
 * InputValidation is required, and there are no conditions. The builder
 * models both; anything carrying Media, InputEncryption or DTMFConfiguration
 * parses to a GenericBlock and round-trips verbatim.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 *
 * Every error a form documents is a required property. The menu form:
 * onTimeout (InputTimeLimitExceeded), onNoMatch (NoMatchingCondition), and
 * onError (NoMatchingError), with NextAction mirroring onNoMatch, the way
 * CheckHoursOfOperation mirrors its out-of-hours path. The stored form:
 * onError, and onInvalidNumber (InvalidPhoneNumber) with a phone number
 * validation; NextAction is `next`. The service refuses a stored-input
 * action carrying InputTimeLimitExceeded or NoMatchingCondition and a menu
 * without them (actions.md, rule 37), so neither form offers the other's.
 *
 * InputTimeLimitSeconds, StoreInput and MaximumLength are emitted as JSON
 * strings because that is how the console writes them; the admin page's Flow
 * language example has "InputTimeLimitSeconds": "5" and "StoreInput":
 * "False", and the service's sample secure input flows carry
 * "MaximumLength": "20" (rule 39). (InvokeLambda's timeout is a number for
 * the same reason: its page shows a number.)
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
 */
export class GetParticipantInput extends Block {
  readonly type = ActionType.GetParticipantInput;

  constructor(private readonly config: GetParticipantInputConfig) {
    super(config.id);
    const id = config.id;
    const t = config.timeoutSeconds;
    if (!Number.isInteger(t) || t < INPUT_TIMEOUT_MIN || t > INPUT_TIMEOUT_MAX) {
      throw new Error(
        `GetParticipantInput "${id}" timeoutSeconds must be an integer between ${INPUT_TIMEOUT_MIN} and ${INPUT_TIMEOUT_MAX}, got ${t}.`,
      );
    }
    if (config.store !== undefined) this.checkStored(config);
    else if (config.branches !== undefined) this.checkMenu(config);
    else {
      throw new Error(
        `GetParticipantInput "${id}" needs either store (digits kept on the contact) or branches (a menu).`,
      );
    }
  }

  private checkMenu(config: GetParticipantInputMenuConfig): void {
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

  private checkStored(config: GetParticipantInputStoredConfig): void {
    const id = config.id;
    const refuse = (what: string): never => {
      throw new Error(`GetParticipantInput "${id}" ${what}.`);
    };
    if (config.branches !== undefined || config.onTimeout !== undefined) {
      refuse(
        "stores its input and so takes no branches or onTimeout; those belong to the menu form",
      );
    }
    if (config.onNoMatch !== undefined) {
      refuse("stores its input and so takes no onNoMatch; that belongs to the menu form");
    }
    const { store } = config;
    const hasLength = store.maxLength !== undefined;
    const hasPhone = store.phoneNumber !== undefined;
    if (hasLength === hasPhone) {
      refuse("store must hold exactly one of maxLength or phoneNumber");
    }
    if (hasLength) {
      const n = store.maxLength;
      if (!Number.isInteger(n) || (n as number) < 1) {
        refuse(`store.maxLength must be a positive integer, got ${String(n)}`);
      }
      if (config.onInvalidNumber !== undefined) {
        refuse("takes onInvalidNumber only with a phoneNumber validation");
      }
      return;
    }
    const phone = store.phoneNumber as PhoneNumberValidation;
    if (!(PHONE_NUMBER_FORMATS as readonly string[]).includes(phone.format)) {
      refuse(
        `store.phoneNumber.format must be one of ${PHONE_NUMBER_FORMATS.join(" or ")}, got "${String(phone.format)}"`,
      );
    }
    if (phone.format === "Local" && phone.countryCode === undefined) {
      refuse('store.phoneNumber.countryCode is required with format "Local"');
    }
    if (phone.countryCode !== undefined && !/^[A-Z]{2}$/.test(phone.countryCode)) {
      refuse(
        `store.phoneNumber.countryCode must be a two-letter upper-case country code, got "${String(phone.countryCode)}"`,
      );
    }
    if (config.onInvalidNumber === undefined) {
      refuse("needs onInvalidNumber (InvalidPhoneNumber) with a phoneNumber validation");
    }
  }

  protected parameters(): Record<string, unknown> {
    const { text, ssml, prompt } = this.config;
    const p: Record<string, unknown> = {};
    if (text !== undefined) p.Text = text;
    else if (ssml !== undefined) p.SSML = ssml;
    else if (prompt !== undefined) p.PromptId = prompt;
    p.InputTimeLimitSeconds = String(this.config.timeoutSeconds);
    const { store } = this.config;
    if (store === undefined) {
      p.StoreInput = "False";
      return p;
    }
    p.StoreInput = "True";
    if (store.maxLength !== undefined) {
      p.InputValidation = { CustomValidation: { MaximumLength: String(store.maxLength) } };
    } else {
      const phone: Record<string, unknown> = { NumberFormat: store.phoneNumber.format };
      if (store.phoneNumber.countryCode !== undefined) {
        phone.CountryCode = store.phoneNumber.countryCode;
      }
      p.InputValidation = { PhoneNumberValidation: phone };
    }
    return p;
  }

  protected transitions(): Transitions {
    const c = this.config;
    if (c.store !== undefined) {
      const errors: [string, Target][] = [];
      if (c.onInvalidNumber !== undefined) errors.push([INVALID_PHONE_NUMBER, c.onInvalidNumber]);
      errors.push([NO_MATCHING_ERROR, c.onError]);
      return wire(c.next, errors);
    }
    const { onTimeout, onNoMatch, onError } = c;
    return wire(
      onNoMatch,
      [
        [INPUT_TIME_LIMIT_EXCEEDED, onTimeout],
        [NO_MATCHING_CONDITION, onNoMatch],
        [NO_MATCHING_ERROR, onError],
      ],
      c.branches.map((b) => ({
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

/**
 * Compare fails with NoMatchingCondition, and NextAction mirrors onNoMatch.
 * The service refuses a Compare without a NextAction ("Action is missing
 * required property. Path: Actions[0].Transitions.NextAction",
 * CreateContactFlow, 2026-09-30), and every Compare in the console's default
 * and sample flows points it at the NoMatchingCondition target
 * (conformance/flow-language/actions.md, rule 38).
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-compare.html
 */
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
      this.config.onNoMatch,
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
 * Check call progress: branch on what an answering machine detector made of
 * a placed outbound call. Each status named in `onStatus` gets its Equals
 * condition, written in the page's order ("CallAnswered", "VoicemailBeep",
 * "VoicemailNoBeep", "NotDetected"; only Equals, only those operands), and
 * at least one is required. One error, "NoMatchingError if no condition
 * matches", which is also the path when no status branch matches, so the
 * class mirrors NextAction onto it as it does for Wait; rule 46's
 * `status-no-next` and `status-next-elsewhere` probes put that to the
 * service. No parameters. The page: "This action works with Connect
 * Customer outbound campaigns only"; the admin guide adds customer-first
 * callbacks, voice only, and every flow type. Deployable without campaigns
 * enabled is what rule 46 asks; a live contact needs the campaigns gate
 * (tasks/D04).
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkoutboundcallstatus.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/check-call-progress.html
 */
export interface CheckOutboundCallStatusConfig {
  id: string;
  /** One path per status branched on, written in the page's order. */
  onStatus: Partial<Record<OutboundCallStatus, Target>>;
  /** NoMatchingError: no status branch matched, or the check failed. */
  onError: Target;
}

export class CheckOutboundCallStatus extends Block {
  readonly type = ActionType.CheckOutboundCallStatus;

  constructor(private readonly config: CheckOutboundCallStatusConfig) {
    super(config.id);
    const unknown = Object.keys(config.onStatus).filter(
      (k) => !(OUTBOUND_CALL_STATUSES as readonly string[]).includes(k),
    );
    if (unknown.length > 0) {
      throw new Error(
        `CheckOutboundCallStatus "${config.id}" branches only on ${OUTBOUND_CALL_STATUSES.join(", ")}, got ${unknown.join(", ")}.`,
      );
    }
    if (this.statuses().length === 0) {
      throw new Error(`CheckOutboundCallStatus "${config.id}" needs at least one status branch.`);
    }
  }

  private statuses(): OutboundCallStatus[] {
    return OUTBOUND_CALL_STATUSES.filter((s) => this.config.onStatus[s] !== undefined);
  }

  protected parameters(): Record<string, unknown> {
    return {};
  }

  protected transitions(): Transitions {
    return wire(
      this.config.onError,
      [[NO_MATCHING_ERROR, this.config.onError]],
      this.statuses().map((s) => ({
        target: this.config.onStatus[s]!,
        operator: "Equals" as const,
        operands: [s],
      })),
    );
  }
}

/**
 * Call phone number: place the outbound call a flow runs ahead of ("When a
 * flow is run before an outbound call is made as part of an outbound
 * contact, this action calls the outbound destination. If this action is
 * not used, the first participant action implicitly completes the outbound
 * call."). `callerId` is `CallerId.Number`, the caller ID to present, an
 * E.164 number or a single JSONPath; `connectionTimeLimitSeconds` is 1 to
 * 600, static or a JSONPath, written as a decimal string, and the page says
 * it is "Only used for Voice Connector use case". The page's
 * `VoiceConnector` form (a Chime voice connector) is not modeled (owner
 * decision 4): a block carrying it stays a GenericBlock. Results and errors
 * "None."; the admin guide's block "has no error branch", so the class
 * wires `next` alone. Outbound whisper flows (the admin guide's block),
 * voice only.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-completeoutboundcall.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/call-phone-number.html
 */
export interface CompleteOutboundCallConfig {
  id: string;
  /** The caller ID number to present: E.164, or a single JSONPath. */
  callerId?: string | JsonPath;
  connectionTimeLimitSeconds?: number | JsonPath;
  next: Target;
}

export class CompleteOutboundCall extends Block {
  readonly type = ActionType.CompleteOutboundCall;

  constructor(private readonly config: CompleteOutboundCallConfig) {
    super(config.id);
    const where = `CompleteOutboundCall "${config.id}"`;
    if (
      config.callerId !== undefined &&
      (typeof config.callerId !== "string" || config.callerId === "")
    ) {
      throw new Error(`${where} callerId must be a non-empty number or JSONPath.`);
    }
    const t = config.connectionTimeLimitSeconds;
    if (
      typeof t === "number" &&
      (!Number.isInteger(t) ||
        t < OUTBOUND_CONNECTION_TIME_LIMIT_MIN ||
        t > OUTBOUND_CONNECTION_TIME_LIMIT_MAX)
    ) {
      throw new Error(
        `${where} connectionTimeLimitSeconds must be an integer between ${OUTBOUND_CONNECTION_TIME_LIMIT_MIN} and ${OUTBOUND_CONNECTION_TIME_LIMIT_MAX}, got ${t}.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    if (this.config.callerId !== undefined) p.CallerId = { Number: this.config.callerId };
    const t = this.config.connectionTimeLimitSeconds;
    if (t !== undefined) p.ConnectionTimeLimitSeconds = typeof t === "number" ? String(t) : t;
    return p;
  }

  protected transitions(): Transitions {
    return wire(this.config.next, []);
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

// ---------------------------------------------------------------------------
// Routing criteria (tasks/D07, docs/adr/0009)
//
// The expression is a tagged union, recursive on the action page, which the
// catalog holds as a `json` value. TypeScript expresses the union directly,
// so the builder offers it typed: `attributeCondition`, `and` and `or` build
// the Flow language objects the action page shows, and the block class
// checks the whole tree. The narrowing below (an AND holds conditions only,
// an OR sits at the top) is the admin guide's, not the action page's: "OR
// expressions must be at the top level. You can place an AND inside an OR,
// but not the other way around."
// https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateroutingcriteria.html
// https://docs.aws.amazon.com/connect/latest/adminguide/set-routing-criteria.html
// ---------------------------------------------------------------------------

/**
 * One requirement: a predefined attribute's name and value, and the
 * proficiency an agent needs in it, at least. `Name` and `Value` are each 1
 * to 64 characters on the action page; the admin guide lets the value be a
 * JSONPath ("you can specify `$.External.language` JSONPath reference
 * instead of hard coding a value"), which the length does not bound here.
 * The predefined attribute is the instance's, named by a string, as the
 * console names it; it is not a reference (tasks/D07).
 */
export interface AttributeConditionExpression {
  AttributeCondition: {
    Name: string;
    Value: string;
    ProficiencyLevel: ProficiencyLevel;
    ComparisonOperator: typeof ROUTING_COMPARISON_OPERATOR;
  };
}

/** Requirements AND-ed together, up to eight. */
export interface AndExpression {
  AndExpression: AttributeConditionExpression[];
}

/** Alternatives OR-ed together, up to three, each a requirement or an AND of them. */
export interface OrExpression {
  OrExpression: (AttributeConditionExpression | AndExpression)[];
}

/** A routing step's `Expression`, one of the three tags. */
export type RoutingExpression = AttributeConditionExpression | AndExpression | OrExpression;

/**
 * A requirement, written as the action page spells it: `ProficiencyLevel`
 * one of the five levels and `ComparisonOperator` its one valid value. The
 * level is written as a JSON number, the integer spelling, since `2.0`
 * cannot survive a JSON parse in any reader (docs/adr/0009); the admin
 * guide's own examples write `"ProficiencyLevel": 4`. Rule 45 (pending) puts
 * the integer and the string spellings to the service.
 */
export function attributeCondition(
  name: string,
  value: string,
  level: ProficiencyLevel,
): AttributeConditionExpression {
  const where = `attributeCondition("${name}", "${value}")`;
  requireAttributeText(where, "name", name, false);
  requireAttributeText(where, "value", value, true);
  if (!(PROFICIENCY_LEVELS as readonly unknown[]).includes(level)) {
    throw new Error(
      `${where} level must be one of ${PROFICIENCY_LEVELS.join(", ")}, got ${String(level)}.`,
    );
  }
  return {
    AttributeCondition: {
      Name: name,
      Value: value,
      ProficiencyLevel: level,
      ComparisonOperator: ROUTING_COMPARISON_OPERATOR,
    },
  };
}

/** Requirements an agent must all meet: one to eight. */
export function and(...conditions: AttributeConditionExpression[]): AndExpression {
  requireCount("and", conditions.length, ROUTING_AND_MAX);
  conditions.forEach((c) => requireCondition("and", c));
  return { AndExpression: conditions };
}

/** Alternatives, any of which an agent may meet: one to three, each a requirement or an AND. */
export function or(
  ...alternatives: (AttributeConditionExpression | AndExpression)[]
): OrExpression {
  requireCount("or", alternatives.length, ROUTING_OR_MAX);
  for (const a of alternatives) {
    if (isTagged(a, "AndExpression")) requireExpression("or", a, false);
    else requireCondition("or", a);
  }
  return { OrExpression: alternatives };
}

function requireAttributeText(where: string, what: string, text: unknown, dynamic: boolean): void {
  if (typeof text !== "string") throw new Error(`${where} ${what} must be a string.`);
  if (dynamic && text.startsWith("$.")) return;
  if (
    [...text].length < PREDEFINED_ATTRIBUTE_TEXT_MIN ||
    [...text].length > PREDEFINED_ATTRIBUTE_TEXT_MAX
  ) {
    throw new Error(
      `${where} ${what} must be ${PREDEFINED_ATTRIBUTE_TEXT_MIN} to ${PREDEFINED_ATTRIBUTE_TEXT_MAX} characters.`,
    );
  }
}

function requireCount(where: string, n: number, max: number): void {
  if (n < 1 || n > max) throw new Error(`${where}(...) takes 1 to ${max} expressions, got ${n}.`);
}

function isTagged(e: unknown, tag: string): boolean {
  return (
    e !== null &&
    typeof e === "object" &&
    !Array.isArray(e) &&
    Object.keys(e).length === 1 &&
    tag in e
  );
}

function requireCondition(where: string, e: unknown): void {
  if (!isTagged(e, "AttributeCondition")) {
    throw new Error(`${where}: an AND holds requirements only (attributeCondition).`);
  }
  const c = (e as AttributeConditionExpression).AttributeCondition as unknown;
  const keys = ["ComparisonOperator", "Name", "ProficiencyLevel", "Value"];
  if (c === null || typeof c !== "object" || Object.keys(c).sort().join() !== keys.join()) {
    throw new Error(
      `${where}: a requirement is written by attributeCondition(name, value, level).`,
    );
  }
  const r = c as AttributeConditionExpression["AttributeCondition"];
  if (r.ComparisonOperator !== ROUTING_COMPARISON_OPERATOR) {
    throw new Error(`${where}: a requirement's operator is ${ROUTING_COMPARISON_OPERATOR}.`);
  }
  attributeCondition(r.Name, r.Value, r.ProficiencyLevel);
}

/** A whole expression, as the builder writes it; `top` is whether an OR may stand here. */
function requireExpression(where: string, e: unknown, top: boolean): void {
  if (isTagged(e, "AttributeCondition")) return requireCondition(where, e);
  if (isTagged(e, "AndExpression")) {
    const items = (e as AndExpression).AndExpression as unknown;
    if (!Array.isArray(items)) throw new Error(`${where}: AndExpression must be a list.`);
    requireCount("and", items.length, ROUTING_AND_MAX);
    for (const item of items) requireCondition(where, item);
    return;
  }
  if (top && isTagged(e, "OrExpression")) {
    const items = (e as OrExpression).OrExpression as unknown;
    if (!Array.isArray(items)) throw new Error(`${where}: OrExpression must be a list.`);
    requireCount("or", items.length, ROUTING_OR_MAX);
    for (const item of items) requireExpression(where, item, false);
    return;
  }
  throw new Error(
    `${where}: an expression is attributeCondition(...), and(...)${top ? " or or(...)" : ""}.`,
  );
}

/**
 * One routing step: the expression an agent must meet, and the seconds the
 * step waits for one before the next step takes over. "If an expiration
 * duration is not specified on the routing step, the routing step never
 * expires", which the admin guide allows on the last step only.
 */
export interface RoutingStep {
  expression: RoutingExpression;
  expiresAfterSeconds?: number;
}

/**
 * "Sets the routing criteria for the contact." `RoutingCriteria.Steps` is a
 * list of steps, "set statically or dynamically", so `steps` is the list or a
 * JSONPath to one (the admin guide's Set dynamically option reads a Lambda's
 * response). Each step's `Expiry.DurationInSeconds` "Can be set only
 * statically", written as a decimal string, the spelling the console gives
 * every other seconds field. One error, the catch-all; no conditions.
 * Inbound, customer queue and transfer flows, every channel.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateroutingcriteria.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-routing-criteria.html
 */
export interface UpdateRoutingCriteriaConfig extends Wired {
  steps: RoutingStep[] | JsonPath;
}

export class UpdateRoutingCriteria extends Block {
  readonly type = ActionType.UpdateRoutingCriteria;

  constructor(private readonly config: UpdateRoutingCriteriaConfig) {
    super(config.id);
    const where = `UpdateRoutingCriteria "${config.id}"`;
    const steps = config.steps;
    if (typeof steps === "string") {
      jsonPath(steps);
      return;
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error(`${where} needs at least one step, or a JSONPath to the steps.`);
    }
    steps.forEach((step, i) => {
      const at = `${where} step ${i + 1}`;
      requireExpression(at, step.expression, true);
      const seconds = step.expiresAfterSeconds;
      if (seconds === undefined) {
        if (i < steps.length - 1) {
          throw new Error(`${at} needs expiresAfterSeconds: only the last step may never expire.`);
        }
      } else if (!Number.isSafeInteger(seconds) || seconds < 1) {
        throw new Error(`${at} expiresAfterSeconds must be a positive integer, got ${seconds}.`);
      }
    });
  }

  protected parameters(): Record<string, unknown> {
    const steps = this.config.steps;
    return {
      RoutingCriteria: {
        Steps:
          typeof steps === "string"
            ? steps
            : steps.map((step) =>
                step.expiresAfterSeconds === undefined
                  ? { Expression: step.expression }
                  : {
                      Expression: step.expression,
                      Expiry: { DurationInSeconds: String(step.expiresAfterSeconds) },
                    },
              ),
      },
    };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
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

/**
 * "Resumes a contact from a paused state." No parameters, results "None.",
 * one error, "NoMatchingError - if no other Error matches", and no
 * restriction on the action page ("None. This action can be used
 * everywhere."). The admin guide's Resume contact block resumes a paused
 * task and routes voice, chat and email down its Error branch, which the
 * catalog records as the channel restriction; its configured block has an
 * Error branch beside the path a resumed task takes, written here as the
 * block's own NextAction. That the service refuses the block without
 * NextAction or without the catch-all is rule 41's to settle (probe pending).
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactresumecontact.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/resume-contact.html
 */
export interface ResumeContactConfig {
  id: string;
  next: Target;
  onError: Target;
}

export class ResumeContact extends Block {
  readonly type = ActionType.ResumeContact;

  constructor(private readonly config: ResumeContactConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return {};
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/**
 * Puts the contact's previous participants on or off hold: "primarily used
 * to prevent previous participants on the contact from observing the
 * contact", such as putting the agent on hold while a quick connect
 * gathers card numbers. One parameter, `PreviousContactParticipantState`:
 * AgentOnHold, CustomerOnHold or OffHold (the console's Conference all),
 * "only supported for voice contacts". Results "None."; one error, the
 * catch-all. Restricted to inbound and transfer flows by the action page;
 * the admin guide's block adds the outbound whisper flow, which rule 41's
 * probe settles. The admin guide's configured block has Success and Error
 * branches, written as NextAction and the catch-all.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatepreviouscontactparticipantstate.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/hold-customer-agent.html
 */
export interface UpdatePreviousContactParticipantStateConfig extends Wired {
  state: PreviousParticipantState;
}

export class UpdatePreviousContactParticipantState extends Block {
  readonly type = ActionType.UpdatePreviousContactParticipantState;

  constructor(private readonly config: UpdatePreviousContactParticipantStateConfig) {
    super(config.id);
    if (!PREVIOUS_PARTICIPANT_STATES.includes(config.state)) {
      throw new Error(
        `UpdatePreviousContactParticipantState "${config.id}" state must be one of ${PREVIOUS_PARTICIPANT_STATES.join(", ")}, got ${String(config.state)}.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    return { PreviousContactParticipantState: this.config.state };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/**
 * "Enables or disables contact media streaming for a set of participants":
 * the console's Start media streaming and Stop media streaming blocks.
 * `state` is MediaStreamingState, Enabled or Disabled; `directions` is the
 * customer's MediaDirections, From (what the customer says) and To (what
 * the customer hears), the console's two checkboxes. The page's one
 * participant type and one stream type ("Currently, only "Customer"",
 * "only "Audio"") are written by the class, not configured. The page shows
 * the same three keys for disabling ("or disable if disabling the stream"),
 * so the Stop form carries them too; whether the service takes the Stop
 * form with MediaStreamingState alone is rule 41's `stream-stop-bare`
 * probe. Results "None."; one error, the catch-all; voice only; contact,
 * customer queue, transfer and whisper flows, not hold flows. The live
 * media streaming feature must be enabled on the instance for audio to be
 * captured.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediastreamingbehavior.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/start-media-streaming.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/stop-media-streaming.html
 */
export interface UpdateContactMediaStreamingBehaviorConfig extends Wired {
  state: MediaStreamingState;
  directions: MediaDirection[];
}

export class UpdateContactMediaStreamingBehavior extends Block {
  readonly type = ActionType.UpdateContactMediaStreamingBehavior;

  constructor(private readonly config: UpdateContactMediaStreamingBehaviorConfig) {
    super(config.id);
    if (!MEDIA_STREAMING_STATES.includes(config.state)) {
      throw new Error(
        `UpdateContactMediaStreamingBehavior "${config.id}" state must be Enabled or Disabled, got ${String(config.state)}.`,
      );
    }
    const d = config.directions;
    if (
      !Array.isArray(d) ||
      d.length === 0 ||
      new Set(d).size !== d.length ||
      !d.every((x) => MEDIA_DIRECTIONS.includes(x))
    ) {
      throw new Error(
        `UpdateContactMediaStreamingBehavior "${config.id}" directions must name From, To or both, once each.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    return {
      MediaStreamingState: this.config.state,
      Participants: [{ ParticipantType: "Customer", MediaDirections: this.config.directions }],
      MediaStreamType: "Audio",
    };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/**
 * The Set message processor action of the console's Set recording,
 * analytics and processing behavior block: "Allows customers to configure
 * their own Lambda processor, which will be applied to in-flight messages."
 * One object, `ChatProcessor`: `ProcessingEnabled` ("True" or "False"),
 * `LambdaProcessorARN` ("The ARN of the Lambda function to process chat
 * messages. Must be set statically.", here a `lambda` reference and never a
 * literal ARN or a JSONPath) and `ChatProcessorSettings.DeliverUnprocessedMessages`
 * ("Determines whether to deliver messages that fail Lambda processing"),
 * each static. The function must be associated with the instance as a
 * MESSAGE_PROCESSOR (CreateIntegrationAssociation); whether the create
 * checks that is rule 41's to learn. The class requires `lambda` when
 * `enabled` is true, as the console's Function ARN field is part of the
 * enabled form; the disabled form writes only ProcessingEnabled unless the
 * others are given. Errors in the page's order, the catch-all ("Must always
 * be defined") and ChannelMismatch (the contact is not chat, "only chat is
 * supported"); the admin guide's configured block has Success, Error and
 * Channel mismatch branches, so the class wires all three. No Restrictions
 * section; chat only.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediaprocessing.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-recording-analytics-processing-behavior.html
 */
export interface UpdateContactMediaProcessingConfig extends Wired {
  enabled: boolean;
  lambda?: Ref<"lambda">;
  deliverUnprocessedMessages?: boolean;
  onChannelMismatch: Target;
}

export class UpdateContactMediaProcessing extends Block {
  readonly type = ActionType.UpdateContactMediaProcessing;

  constructor(private readonly config: UpdateContactMediaProcessingConfig) {
    super(config.id);
    if (typeof config.enabled !== "boolean") {
      throw new Error(`UpdateContactMediaProcessing "${config.id}" enabled must be a boolean.`);
    }
    if (config.enabled && config.lambda === undefined) {
      throw new Error(
        `UpdateContactMediaProcessing "${config.id}" needs a lambda when processing is enabled.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    const processor: Record<string, unknown> = {
      ProcessingEnabled: this.config.enabled ? "True" : "False",
    };
    if (this.config.lambda !== undefined) processor.LambdaProcessorARN = this.config.lambda;
    if (this.config.deliverUnprocessedMessages !== undefined) {
      processor.ChatProcessorSettings = {
        DeliverUnprocessedMessages: this.config.deliverUnprocessedMessages ? "True" : "False",
      };
    }
    return { ChatProcessor: processor };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [
      [NO_MATCHING_ERROR, this.config.onError],
      [CHANNEL_MISMATCH, this.config.onChannelMismatch],
    ]);
  }
}

/**
 * "Creates a new task to run an assigned flow." The Create task block, in
 * the page's parameter order: `ContactFlowId` ("A flow ID or flow ARN. Must
 * be fully static or a single valid JSONPath identifier", a `flow`
 * reference here), `Attributes` (keys and values "may be defined statically
 * or dynamically"), `Name`, `Description`, `DelaySeconds` (1 to 518400, "If
 * ScheduledTime is specified, this parameter may not be specified"),
 * `ScheduledTime` and `TaskTemplateId` ("This must be defined statically",
 * a `tasktemplate` reference and never a JSONPath). Results "None."; one
 * error, the catch-all; "supported on all channels and in all contact flow
 * types".
 *
 * The class takes a flow, a template or both, since the admin guide's Use
 * template option needs a flow only "If the selected template does not
 * include a flow". It writes `DelaySeconds` as a decimal string, the
 * console's spelling of every integer parameter recorded so far, and takes
 * `ScheduledTime` as a JSONPath only: the admin guide's "Set date and time
 * using attribute" form, whose attribute holds Unix epoch seconds. The
 * static spelling of either, and the shape of `References` (the page's
 * `"Type": "Value"` against StartTaskContact's Reference object), are not
 * recorded from a console export yet, so the class writes no References and
 * a document carrying one, a static ScheduledTime or a numeric DelaySeconds
 * stays a GenericBlock (actions.md, rule 42, probe pending).
 * https://docs.aws.amazon.com/connect/latest/devguide/createtask.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/create-task-block.html
 * https://docs.aws.amazon.com/connect/latest/APIReference/API_StartTaskContact.html
 */
export interface CreateTaskConfig extends Wired {
  name: string;
  flow?: Ref<"flow"> | JsonPath;
  template?: Ref<"tasktemplate">;
  description?: string;
  attributes?: Record<string, string>;
  delaySeconds?: number | JsonPath;
  scheduledTime?: JsonPath;
}

export class CreateTask extends Block {
  readonly type = ActionType.CreateTask;

  constructor(private readonly config: CreateTaskConfig) {
    super(config.id);
    if (typeof config.name !== "string") {
      throw new Error(`CreateTask "${config.id}" name must be a string.`);
    }
    if (config.flow === undefined && config.template === undefined) {
      throw new Error(`CreateTask "${config.id}" needs a flow, a template, or both.`);
    }
    if (config.delaySeconds !== undefined && config.scheduledTime !== undefined) {
      throw new Error(`CreateTask "${config.id}" takes delaySeconds or scheduledTime, not both.`);
    }
    const d = config.delaySeconds;
    if (
      typeof d === "number" &&
      (!Number.isInteger(d) || d < TASK_DELAY_MIN || d > TASK_DELAY_MAX)
    ) {
      throw new Error(
        `CreateTask "${config.id}" delaySeconds must be an integer between ${TASK_DELAY_MIN} and ${TASK_DELAY_MAX}, got ${d}.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config;
    const p: Record<string, unknown> = {};
    if (c.flow !== undefined) p.ContactFlowId = c.flow;
    if (c.attributes !== undefined) p.Attributes = c.attributes;
    p.Name = c.name;
    if (c.description !== undefined) p.Description = c.description;
    if (c.delaySeconds !== undefined) {
      p.DelaySeconds = typeof c.delaySeconds === "number" ? String(c.delaySeconds) : c.delaySeconds;
    }
    if (c.scheduledTime !== undefined) p.ScheduledTime = c.scheduledTime;
    if (c.template !== undefined) p.TaskTemplateId = c.template;
    return p;
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/**
 * "Associates a Wisdom domain to a contact that is being executed in a Flow
 * to enable real-time recommendations on the current contact": the
 * console's Connect assistant block (AI agents, formerly Amazon Q in
 * Connect and Wisdom). One parameter, `WisdomAssistantArn`, "ARN for the
 * Wisdom Assistant. May be specified statically or dynamically", here an
 * `assistant` reference or a JSONPath. Results "None."; one error, the
 * catch-all. The action page restricts it to voice and allows every flow
 * type; the admin guide's block allows every channel and five flow types,
 * and rule 42's probes put the disagreement to the service. On voice it
 * needs real-time conversational analytics, set by a recording and
 * analytics block elsewhere in the flow. The admin guide's Config tab also
 * names an Orchestration AI agent, whose key no export has recorded; a
 * block carrying any other key stays a GenericBlock.
 * https://docs.aws.amazon.com/connect/latest/devguide/createwisdomsession.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/connect-assistant-block.html
 */
export interface CreateWisdomSessionConfig extends Wired {
  assistant: Ref<"assistant"> | JsonPath;
}

export class CreateWisdomSession extends Block {
  readonly type = ActionType.CreateWisdomSession;

  constructor(private readonly config: CreateWisdomSessionConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return { WisdomAssistantArn: this.config.assistant };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/** An E.164 number: a plus, then one to fifteen digits, the first not 0. */
const E164 = /^\+[1-9][0-9]{1,14}$/;
const JSON_PATH = /^\$\.[A-Za-z0-9_$.[\]'-]+$/;

/**
 * Send message's SMS form: "Initiate an outbound chat contact to a customer.
 * Only SMS chats are supported." `source` is the number it is sent from,
 * `SourceEndpoint.Address` ("ConnectPhoneNumberArn of the SourceEndpoint"),
 * a `phonenumber` reference or a JSONPath; `destination` the customer's
 * number, `DestinationEndpoint.Address` ("E164 phone number"), static or a
 * JSONPath; `flow` the flow the new chat runs, `ContactFlowArn`, a `flow`
 * reference or a JSONPath. The class writes the page's constants: the
 * endpoint types `CONNECT_PHONENUMBER_ARN` and `TELEPHONE_NUMBER` and the
 * subtype `connect:SMS`. `initialMessage` is the optional
 * `InitialSystemMessage.Content`, and `relatedContact: "CURRENT"` the
 * optional `RelatedContact` ("Only supported value is CURRENT"), the admin
 * guide's Link to contact. Results "None. No conditions are supported.";
 * one error, the catch-all. Every flow type and channel (the admin guide's
 * block); the contact it creates is an SMS chat, which needs SMS messaging
 * set up on the instance. The admin guide's WhatsApp, email and template
 * forms have no recorded key and stay generic.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-startoutboundchatcontact.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/send-message.html
 */
export interface StartOutboundChatContactConfig extends Wired {
  source: Ref<"phonenumber"> | JsonPath;
  /** An E.164 number, or a single JSONPath. */
  destination: string | JsonPath;
  flow: Ref<"flow"> | JsonPath;
  initialMessage?: string | JsonPath;
  relatedContact?: typeof OUTBOUND_CHAT_RELATED_CONTACT;
}

export class StartOutboundChatContact extends Block {
  readonly type = ActionType.StartOutboundChatContact;

  constructor(private readonly config: StartOutboundChatContactConfig) {
    super(config.id);
    const where = `StartOutboundChatContact "${config.id}"`;
    const d = config.destination;
    if (typeof d !== "string" || !(E164.test(d) || JSON_PATH.test(d))) {
      throw new Error(`${where} destination must be an E.164 number or a JSONPath.`);
    }
    const m = config.initialMessage;
    if (m !== undefined && (typeof m !== "string" || m === "")) {
      throw new Error(`${where} initialMessage must be non-empty text or a JSONPath.`);
    }
    if (
      config.relatedContact !== undefined &&
      config.relatedContact !== OUTBOUND_CHAT_RELATED_CONTACT
    ) {
      throw new Error(`${where} relatedContact may only be "${OUTBOUND_CHAT_RELATED_CONTACT}".`);
    }
  }

  protected parameters(): Record<string, unknown> {
    const p: Record<string, unknown> = {
      SourceEndpoint: { Address: this.config.source, Type: OUTBOUND_CHAT_SOURCE_TYPE },
      DestinationEndpoint: {
        Address: this.config.destination,
        Type: OUTBOUND_CHAT_DESTINATION_TYPE,
      },
      ContactFlowArn: this.config.flow,
      ContactSubtype: OUTBOUND_CHAT_SUBTYPE,
    };
    if (this.config.initialMessage !== undefined) {
      p.InitialSystemMessage = { Content: this.config.initialMessage };
    }
    if (this.config.relatedContact !== undefined) p.RelatedContact = this.config.relatedContact;
    return p;
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

// ---------------------------------------------------------------------------
// Customer Profiles (tasks/D03): the six actions of the console's Customer
// profiles block. Each writes ProfileRequestData and ProfileResponseData,
// the latter as a list of names, the shape every console export carries
// (actions.md, rule 43), and needs Customer Profiles enabled on the instance.
// https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
// ---------------------------------------------------------------------------

/** A value a Customer Profiles request field holds: static text or a JSONPath. */
function requireText(where: string, key: string, value: unknown): void {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${where} ${key} must be a non-empty string or JSONPath.`);
  }
}

/**
 * Whether a name is one the page lists or matches one of its patterns
 * (`Attributes.x` and its kin). The catalog carries the same lists as
 * `keys` and `keyPatterns`; a name outside them stays in a GenericBlock,
 * since rule 43's probe of an unknown key has not run.
 */
function isListedName(
  name: string,
  names: readonly string[],
  patterns: readonly string[],
): boolean {
  return names.includes(name) || patterns.some((p) => new RegExp(p).test(name));
}

function requireNames(
  where: string,
  what: string,
  given: readonly string[],
  names: readonly string[],
  patterns: readonly string[],
): void {
  if (!Array.isArray(given)) throw new Error(`${where} ${what} must be a list of names.`);
  for (const name of given) {
    if (typeof name !== "string" || !isListedName(name, names, patterns)) {
      throw new Error(
        `${where} ${what} names "${String(name)}", which is neither a field the page lists nor a name matching ${patterns.join(" or ")}.`,
      );
    }
  }
  if (new Set(given).size !== given.length) throw new Error(`${where} ${what} repeats a name.`);
}

/** ProfileRequestData of a create or update: listed fields and custom attributes. */
function requireProfileFields(where: string, request: Record<string, string>): void {
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new Error(`${where} request must be an object of field names to values.`);
  }
  requireNames(where, "request", Object.keys(request), PROFILE_FIELDS, PROFILE_FIELD_PATTERNS);
  for (const [key, value] of Object.entries(request)) {
    if (typeof value !== "string") {
      throw new Error(`${where} request field "${key}" must be a string or JSONPath.`);
    }
  }
}

/**
 * The shape `CreateCustomerProfile` and `UpdateCustomerProfile` share.
 * `request` is ProfileRequestData: each key a field the page lists
 * (`FirstName`, `PhoneNumber`, `BillingCity`, ...) or a custom attribute
 * `Attributes.<name>`, each value static or a JSONPath. `response` is
 * ProfileResponseData, the names stored under `$.Customer` (`$.Customer.FirstName`,
 * `$.Customer.Attributes.<name>`), from the same list; the console writes
 * an empty list when none is chosen, and so does the class.
 */
export interface CustomerProfileFieldsConfig extends Wired {
  request?: Record<string, string>;
  response?: string[];
}

/**
 * "Create a customer profile." Every field of `ProfileRequestData` is
 * optional ("All of these fields are optional."), and "Newly created
 * profile ID is persisted under the Customer -> ProfileID attribute +
 * $.Customer.ProfileId". Results "None. Conditions are not supported."; one
 * error, the catch-all. The page writes both objects as braces around bare
 * names, which is not JSON; the class writes the published flows' shape
 * (actions.md, rule 43): an object of strings and a list of names.
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-createcustomerprofile.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
 */
export class CreateCustomerProfile extends Block {
  readonly type = ActionType.CreateCustomerProfile;

  constructor(private readonly config: CustomerProfileFieldsConfig) {
    super(config.id);
    const where = `CreateCustomerProfile "${config.id}"`;
    requireProfileFields(where, config.request ?? {});
    requireNames(where, "response", config.response ?? [], PROFILE_FIELDS, PROFILE_FIELD_PATTERNS);
  }

  protected parameters(): Record<string, unknown> {
    return {
      ProfileRequestData: { ...(this.config.request ?? {}) },
      ProfileResponseData: [...(this.config.response ?? [])],
    };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/**
 * "Update a customer profile that was previously created or retrieved in
 * the flow." The same fields as CreateCustomerProfile, each optional, and
 * no profile id: the action updates the profile a preceding Get or Create
 * profile left at `$.Customer.ProfileId` (the admin guide's block: "Before
 * using an Update profile block, use a Get profile block"). Results "None.
 * Conditions are not supported."; one error, the catch-all.
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-updatecustomerprofile.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
 */
export class UpdateCustomerProfile extends Block {
  readonly type = ActionType.UpdateCustomerProfile;

  constructor(private readonly config: CustomerProfileFieldsConfig) {
    super(config.id);
    const where = `UpdateCustomerProfile "${config.id}"`;
    requireProfileFields(where, config.request ?? {});
    requireNames(where, "response", config.response ?? [], PROFILE_FIELDS, PROFILE_FIELD_PATTERNS);
  }

  protected parameters(): Record<string, unknown> {
    return {
      ProfileRequestData: { ...(this.config.request ?? {}) },
      ProfileResponseData: [...(this.config.response ?? [])],
    };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/** One search identifier: a search key's name (`_phone`, `_email`, a custom key) and its value. */
export interface ProfileIdentifier {
  name: string;
  /** Static or a JSONPath. */
  value: string;
}

function requireIdentifier(where: string, what: string, id: ProfileIdentifier): void {
  if (id === null || typeof id !== "object") {
    throw new Error(`${where} ${what} must be { name, value }.`);
  }
  requireText(where, `${what} name`, id.name);
  requireText(where, `${what} value`, id.value);
}

/**
 * GetCustomerProfile searches by one identifier, or by SearchCriteria (one
 * to five identifiers) joined by a logical operator: "Requires either
 * IdentiferName and IdentifierValue, or SearchCriteria", and the operator is
 * "Required when using SearchCriteria". The union makes giving both, or
 * neither, a compile-time error; the constructor checks it too.
 */
export type ProfileSearch =
  | { identifier: ProfileIdentifier; search?: never }
  | {
      search: { criteria: ProfileIdentifier[]; operator: ProfileLogicalOperator };
      identifier?: never;
    };

/**
 * "Retrieve a customer profile based any search identifier, up to five
 * total." The page's two forms of `ProfileRequestData`, an `IdentifierName`
 * and its value or `SearchCriteria` with a `LogicalOperator` of `AND` or
 * `OR`, are D01's group alternatives (`exactlyOne` over the two groups). The
 * page's prose writes "IdentiferName" and its example `"IdentiferValue"`;
 * every published flow writes `IdentifierName` and `IdentifierValue`, which
 * the class writes (actions.md, rule 43, probes `get-identifier` and
 * `get-identifer-spelling`). `response` names the fields stored under
 * `$.Customer`, as CreateCustomerProfile's do. Three errors, in the order
 * every published flow writes them: the catch-all, MultipleFoundError and
 * NoneFoundError; only the catch-all is required until the sweep says
 * otherwise. AWS's step-by-step guide flows also search by a named profile
 * field (`{ "PhoneNumber": ... }`), neither of the page's forms; such a
 * block stays a GenericBlock until `get-named-key` is put to the service.
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofile.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
 */
export type GetCustomerProfileConfig = Wired &
  ProfileSearch & {
    response?: string[];
    onMultipleFound: Target;
    onNoneFound: Target;
  };

export class GetCustomerProfile extends Block {
  readonly type = ActionType.GetCustomerProfile;

  constructor(private readonly config: GetCustomerProfileConfig) {
    super(config.id);
    const where = `GetCustomerProfile "${config.id}"`;
    if ((config.identifier === undefined) === (config.search === undefined)) {
      throw new Error(`${where} takes an identifier or a search, exactly one.`);
    }
    if (config.identifier !== undefined) requireIdentifier(where, "identifier", config.identifier);
    if (config.search !== undefined) {
      const { criteria, operator } = config.search;
      if (
        !Array.isArray(criteria) ||
        criteria.length < PROFILE_SEARCH_CRITERIA_MIN ||
        criteria.length > PROFILE_SEARCH_CRITERIA_MAX
      ) {
        throw new Error(
          `${where} search takes ${PROFILE_SEARCH_CRITERIA_MIN} to ${PROFILE_SEARCH_CRITERIA_MAX} criteria.`,
        );
      }
      criteria.forEach((c, i) => requireIdentifier(where, `search criterion ${i + 1}`, c));
      if (!(PROFILE_LOGICAL_OPERATORS as readonly string[]).includes(operator)) {
        throw new Error(
          `${where} search operator must be one of ${PROFILE_LOGICAL_OPERATORS.join(", ")}.`,
        );
      }
    }
    requireNames(where, "response", config.response ?? [], PROFILE_FIELDS, PROFILE_FIELD_PATTERNS);
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config;
    const request =
      c.identifier !== undefined
        ? { IdentifierName: c.identifier.name, IdentifierValue: c.identifier.value }
        : {
            SearchCriteria: c.search!.criteria.map((x) => ({
              IdentifierName: x.name,
              IdentifierValue: x.value,
            })),
            LogicalOperator: c.search!.operator,
          };
    return { ProfileRequestData: request, ProfileResponseData: [...(c.response ?? [])] };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [
      [NO_MATCHING_ERROR, this.config.onError],
      [MULTIPLE_FOUND_ERROR, this.config.onMultipleFound],
      [NONE_FOUND_ERROR, this.config.onNoneFound],
    ]);
  }
}

/**
 * "Retrieve a customer profile object of the desired type, based on recency
 * or any search identifier." "A ProfileId and ObjectType must be present.
 * Either UseLatest, or IdentifierName and IdentifierValue must be present."
 * `profileId` is static or a JSONPath (the admin guide's block reads it from
 * a preceding Get profile); `objectType` names one of the domain's object
 * types (`Asset`, `Order`, `Case` or the domain's own). The two retrievals
 * are D01's group alternatives: `latest: true` writes `UseLatest` as the
 * string "true" (the page's "true / false", unquoted; rule 43 probes the
 * other spellings), and `identifier` writes the pair. `response` names the
 * page's Asset, Order and Case fields or `AssetAttributes.<name>`,
 * `OrderAttributes.<name>`, `CaseAttributes.<name>` and
 * `ObjectAttributes.<name>`, stored under `$.Customer`. Two errors, the
 * catch-all and NoneFoundError, catch-all first as GetCustomerProfile's are
 * written; only the catch-all is required until the sweep.
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofileobject.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
 */
export type GetCustomerProfileObjectConfig = Wired &
  ({ latest: true; identifier?: never } | { identifier: ProfileIdentifier; latest?: never }) & {
    profileId: string;
    objectType: string;
    response?: string[];
    onNoneFound: Target;
  };

export class GetCustomerProfileObject extends Block {
  readonly type = ActionType.GetCustomerProfileObject;

  constructor(private readonly config: GetCustomerProfileObjectConfig) {
    super(config.id);
    const where = `GetCustomerProfileObject "${config.id}"`;
    requireText(where, "profileId", config.profileId);
    requireText(where, "objectType", config.objectType);
    const latest = config.latest !== undefined;
    if (latest === (config.identifier !== undefined)) {
      throw new Error(`${where} takes latest or an identifier, exactly one.`);
    }
    if (latest && config.latest !== true) throw new Error(`${where} latest must be true.`);
    if (config.identifier !== undefined) requireIdentifier(where, "identifier", config.identifier);
    requireNames(
      where,
      "response",
      config.response ?? [],
      PROFILE_OBJECT_FIELDS,
      PROFILE_OBJECT_FIELD_PATTERNS,
    );
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config;
    const request: Record<string, string> = { ProfileId: c.profileId, ObjectType: c.objectType };
    if (c.identifier !== undefined) {
      request.IdentifierName = c.identifier.name;
      request.IdentifierValue = c.identifier.value;
    } else {
      request.UseLatest = "true";
    }
    return { ProfileRequestData: request, ProfileResponseData: [...(c.response ?? [])] };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [
      [NO_MATCHING_ERROR, this.config.onError],
      [NONE_FOUND_ERROR, this.config.onNoneFound],
    ]);
  }
}

/**
 * "Retrieve calculated attributes for a customer profile." "A ProfileId must
 * be present." in `ProfileRequestData`, static or a JSONPath. `response`
 * names `CalculatedAttributes._average_hold_time`,
 * `CalculatedAttributes._frequent_caller` or any `CalculatedAttributes.<name>`
 * the domain defines, stored under `$.Customer`. Two errors, the catch-all
 * and NoneFoundError, in the order the one published flow that carries the
 * type writes them; only the catch-all is required. The Connect
 * service-linked role needs `ListCalculatedAttributeDefinitions` and
 * `GetCalculatedAttributeForProfile` at run time (the admin guide).
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcalculatedattributesforcustomerprofile.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
 */
export interface GetCalculatedAttributesForCustomerProfileConfig extends Wired {
  profileId: string;
  response?: string[];
  onNoneFound: Target;
}

export class GetCalculatedAttributesForCustomerProfile extends Block {
  readonly type = ActionType.GetCalculatedAttributesForCustomerProfile;

  constructor(private readonly config: GetCalculatedAttributesForCustomerProfileConfig) {
    super(config.id);
    const where = `GetCalculatedAttributesForCustomerProfile "${config.id}"`;
    requireText(where, "profileId", config.profileId);
    requireNames(
      where,
      "response",
      config.response ?? [],
      CALCULATED_ATTRIBUTE_FIELDS,
      CALCULATED_ATTRIBUTE_PATTERNS,
    );
  }

  protected parameters(): Record<string, unknown> {
    return {
      ProfileRequestData: { ProfileId: this.config.profileId },
      ProfileResponseData: [...(this.config.response ?? [])],
    };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [
      [NO_MATCHING_ERROR, this.config.onError],
      [NONE_FOUND_ERROR, this.config.onNoneFound],
    ]);
  }
}

/**
 * "Associate a contact to a customer profile." `ProfileRequestData` holds
 * `ProfileId` and `ContactId` ("A ProfileId and ContactId must be present"),
 * each static or a JSONPath (the admin guide's block reads both from
 * attributes); `ProfileResponseData` holds nothing ("None."), written as
 * the empty list the console writes for a block with no response fields.
 * Results "None. Conditions are not supported."; one error, the catch-all.
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-associatecontacttocustomerprofile.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
 */
export interface AssociateContactToCustomerProfileConfig extends Wired {
  profileId: string;
  contactId: string;
}

export class AssociateContactToCustomerProfile extends Block {
  readonly type = ActionType.AssociateContactToCustomerProfile;

  constructor(private readonly config: AssociateContactToCustomerProfileConfig) {
    super(config.id);
    const where = `AssociateContactToCustomerProfile "${config.id}"`;
    requireText(where, "profileId", config.profileId);
    requireText(where, "contactId", config.contactId);
  }

  protected parameters(): Record<string, unknown> {
    return {
      ProfileRequestData: { ProfileId: this.config.profileId, ContactId: this.config.contactId },
      ProfileResponseData: [],
    };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

// ---------------------------------------------------------------------------
// Cases (tasks/D06): the console's Cases block, one action per Type. Each
// links the contact to the case when `LinkContactToCase` is "true", and then
// wires ContactNotLinked before its other branches, as the console's export
// and every published flow do (actions.md, rule 44). A case field is named
// by id: a system field by its literal id (CASE_SYSTEM_FIELDS), a domain's
// own field by a `casefield` reference standing as the whole key or list
// item, because its UUID differs per domain (docs/adr/0008-case-field-ids.md).
// https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html
// ---------------------------------------------------------------------------

/**
 * Linking the contact to the case. `onContactNotLinked` is the
 * ContactNotLinked branch, which "will appear" when linking is on ("the
 * contact was not linked after the case is retrieved (partial
 * success/partial failure)"); `contact` is the admin guide's Current or
 * Related contact, written as `ContactToLink` when given, as the console's
 * export writes it. Absent, the block writes `LinkContactToCase: "false"`
 * and no ContactNotLinked branch.
 * https://docs.aws.amazon.com/connect/latest/devguide/createcase.html
 */
export interface CaseLink {
  onContactNotLinked: Target;
  contact?: CaseContactToLink;
}

/**
 * A case field key: a `casefield` reference for a domain's own field, or a
 * system field id. Computed keys carry the token, so a field map reads
 * `{ [Refs.casefield("priority")]: "high", summary: "$.Attributes.summary" }`.
 */
export type CaseFieldKey = Ref<"casefield"> | CaseSystemField;

/** Whether a key or item names a case field: a system id or a casefield token. */
function isCaseFieldId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if ((CASE_SYSTEM_FIELDS as readonly string[]).includes(value)) return true;
  const entry = parseToken(value);
  return entry !== undefined && entry.type === "casefield" && entry.alias === undefined;
}

/** CaseRequestFields: case field keys, each value static text or a JSONPath. */
function requireCaseFields(where: string, fields: Readonly<Record<string, string>>): void {
  if (fields === null || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error(`${where} fields must be an object of case field ids to values.`);
  }
  for (const [key, value] of Object.entries(fields)) {
    if (!isCaseFieldId(key)) {
      throw new Error(
        `${where} field "${key}" is neither a Cases system field id nor a casefield reference.`,
      );
    }
    if (typeof value !== "string") {
      throw new Error(`${where} field "${key}" must be a string or JSONPath.`);
    }
  }
}

function requireCaseLink(where: string, link: CaseLink | undefined): void {
  if (link === undefined) return;
  if (link.onContactNotLinked === undefined) {
    throw new Error(`${where} link needs onContactNotLinked.`);
  }
  if (link.contact !== undefined && !CASE_CONTACTS_TO_LINK.includes(link.contact)) {
    throw new Error(
      `${where} link contact must be one of ${CASE_CONTACTS_TO_LINK.join(", ")}, got "${String(link.contact)}".`,
    );
  }
}

/** LinkContactToCase and, when linking names one, ContactToLink. */
function caseLinkParameters(link: CaseLink | undefined): Record<string, unknown> {
  if (link === undefined) return { LinkContactToCase: "false" };
  return {
    LinkContactToCase: "true",
    ...(link.contact === undefined ? {} : { ContactToLink: link.contact }),
  };
}

/** ContactNotLinked first when linking, as the console writes it. */
function caseLinkErrors(link: CaseLink | undefined): [string, Target][] {
  return link === undefined ? [] : [[CONTACT_NOT_LINKED, link.onContactNotLinked]];
}

/**
 * "Creates a new case using an existing case template." `template` is the
 * case template (`CaseTemplateId`, "A templateId aligned with the existing
 * case templateName"), a `casetemplate` reference because a template id
 * belongs to one Cases domain. `fields` is `CaseRequestFields`, "An optional
 * map of case fields to be set. Keys should be fields from Cases domain.
 * Values can be static or dynamic."; the admin guide adds that a case needs
 * its template's required fields and the customer (`customer_id`, the
 * profile ARN, read from `$.Customer.ProfileARN` in every published flow).
 * Results "None."; errors ContactNotLinked (when linking) and the
 * catch-all; "This can be used in any type of flow and any channel."
 * https://docs.aws.amazon.com/connect/latest/devguide/createcase.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html
 */
export interface CreateCaseConfig extends Wired {
  template: Ref<"casetemplate">;
  fields?: Readonly<Record<string, string>>;
  link?: CaseLink;
}

export class CreateCase extends Block {
  readonly type = ActionType.CreateCase;

  constructor(private readonly config: CreateCaseConfig) {
    super(config.id);
    const where = `CreateCase "${config.id}"`;
    const template = typeof config.template === "string" ? parseToken(config.template) : undefined;
    if (
      template === undefined ||
      template.type !== "casetemplate" ||
      template.alias !== undefined
    ) {
      throw new Error(`${where} template must be a casetemplate reference.`);
    }
    if (config.fields !== undefined) requireCaseFields(where, config.fields);
    requireCaseLink(where, config.link);
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config;
    return {
      ...caseLinkParameters(c.link),
      CaseTemplateId: c.template,
      ...(c.fields === undefined ? {} : { CaseRequestFields: { ...c.fields } }),
    };
  }

  protected transitions(): Transitions {
    const c = this.config;
    return wire(c.next, [...caseLinkErrors(c.link), [NO_MATCHING_ERROR, c.onError]]);
  }
}

/**
 * "Searches all existing cases with the provided customer ID. Add request
 * fields to filter by case fields. Specify the case fields to be returned
 * in the response to persist in the context." `lastUpdated` is
 * `GetLastUpdatedCase` ("You can specify to get only the last updated case
 * for any search criteria"); `customerId` is `CustomerId` ("Search all
 * cases for this customer Id."); `fields` is `CaseRequestFields`, the search
 * fields, keyed as CreateCase's are; `response` is `CaseResponseFields`,
 * "An optional list of field names that should be persisted in the case
 * namespace", each a system field id or a casefield reference, at most ten
 * (the admin guide's configuration tips). Results "None."; errors
 * ContactNotLinked (when linking), MultipleFound, NoneFound and the
 * catch-all, in the order every published flow writes them; the admin
 * guide: "You must provide at least one search criteria. Otherwise this
 * block will take the Error branch."
 * https://docs.aws.amazon.com/connect/latest/devguide/getcase.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html
 */
export interface GetCaseConfig extends Wired {
  lastUpdated: boolean;
  customerId?: string;
  fields?: Readonly<Record<string, string>>;
  response?: readonly string[];
  link?: CaseLink;
  onMultipleFound: Target;
  onNoneFound: Target;
}

export class GetCase extends Block {
  readonly type = ActionType.GetCase;

  constructor(private readonly config: GetCaseConfig) {
    super(config.id);
    const where = `GetCase "${config.id}"`;
    if (typeof config.lastUpdated !== "boolean") {
      throw new Error(`${where} lastUpdated must be true or false.`);
    }
    if (config.customerId !== undefined) requireText(where, "customerId", config.customerId);
    if (config.fields !== undefined) requireCaseFields(where, config.fields);
    const response = config.response;
    if (response !== undefined) {
      if (!Array.isArray(response)) throw new Error(`${where} response must be a list.`);
      for (const item of response) {
        if (!isCaseFieldId(item)) {
          throw new Error(
            `${where} response names "${String(item)}", which is neither a Cases system field id nor a casefield reference.`,
          );
        }
      }
      if (new Set(response).size !== response.length) {
        throw new Error(`${where} response repeats a field.`);
      }
      if (response.length > CASE_RESPONSE_FIELDS_MAX) {
        throw new Error(
          `${where} response names ${String(response.length)} fields; a Cases block takes at most ${String(CASE_RESPONSE_FIELDS_MAX)}.`,
        );
      }
    }
    requireCaseLink(where, config.link);
    if (config.onMultipleFound === undefined || config.onNoneFound === undefined) {
      throw new Error(`${where} needs onMultipleFound and onNoneFound.`);
    }
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config;
    return {
      ...caseLinkParameters(c.link),
      GetLastUpdatedCase: c.lastUpdated ? "true" : "false",
      ...(c.customerId === undefined ? {} : { CustomerId: c.customerId }),
      ...(c.fields === undefined ? {} : { CaseRequestFields: { ...c.fields } }),
      ...(c.response === undefined ? {} : { CaseResponseFields: [...c.response] }),
    };
  }

  protected transitions(): Transitions {
    const c = this.config;
    return wire(c.next, [
      ...caseLinkErrors(c.link),
      [CASE_MULTIPLE_FOUND, c.onMultipleFound],
      [CASE_NONE_FOUND, c.onNoneFound],
      [NO_MATCHING_ERROR, c.onError],
    ]);
  }
}

/**
 * "Updates an existing case by providing the case's id and the fields that
 * should be updated." `caseId` is `CaseId`, "the unique identifier of the
 * case", static or a JSONPath (the published flows read `$.Case.case_id`,
 * which a preceding Get case stores, or an attribute); the admin guide:
 * "Case Id is the unique identifier of the case and the only field you can
 * provide here." `fields` is `CaseRequestFields`, "An optional map of case
 * fields to be updated", keyed as CreateCase's; the admin guide: "You must
 * provide an update to at least one Request field. Otherwise, this block
 * takes the Error branch." Results "None."; errors ContactNotLinked (when
 * linking) and the catch-all.
 * https://docs.aws.amazon.com/connect/latest/devguide/updatecase.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html
 */
export interface UpdateCaseConfig extends Wired {
  caseId: string;
  fields?: Readonly<Record<string, string>>;
  link?: CaseLink;
}

export class UpdateCase extends Block {
  readonly type = ActionType.UpdateCase;

  constructor(private readonly config: UpdateCaseConfig) {
    super(config.id);
    const where = `UpdateCase "${config.id}"`;
    requireText(where, "caseId", config.caseId);
    if (config.fields !== undefined) requireCaseFields(where, config.fields);
    requireCaseLink(where, config.link);
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config;
    return {
      ...caseLinkParameters(c.link),
      CaseId: c.caseId,
      ...(c.fields === undefined ? {} : { CaseRequestFields: { ...c.fields } }),
    };
  }

  protected transitions(): Transitions {
    const c = this.config;
    return wire(c.next, [...caseLinkErrors(c.link), [NO_MATCHING_ERROR, c.onError]]);
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
// Types the Developer Guide does not list (tasks/D09)
// ---------------------------------------------------------------------------

/**
 * The Get stored content block: "retrieve stored data from your S3 bucket
 * when you need to make branching decisions in your flows". Its one option,
 * Email message (Plain text), downloads the plain text of the contact's email
 * message, up to 64 KB, onto `$.Email.EmailMessage.Plaintext`, so a following
 * Check contact attributes block can branch on it. No Developer Guide page
 * documents the Type; the admin guide's block page does, with a Flow language
 * example of one parameter, `"ContentType": enum "EmailMessage"`, and one
 * error, the catch-all. Email only (voice, chat and task "No"); every flow
 * type but a campaign's.
 *
 * The class takes no configuration but its wiring and always writes the
 * page's `ContentType`. The service accepted the action with `Parameters`
 * empty on 2026-10-05 (actions.md, rule 40), so the catalog does not require
 * the key; codegen reads back only the page's form, and an action without
 * `ContentType` stays a GenericBlock.
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-stored-content.html
 */
export type LoadContactContentConfig = Wired;

export class LoadContactContent extends Block {
  readonly type = ActionType.LoadContactContent;

  constructor(private readonly config: LoadContactContentConfig) {
    super(config.id);
  }

  protected parameters(): Record<string, unknown> {
    return { ContentType: STORED_CONTENT_TYPES[0] };
  }

  protected transitions(): Transitions {
    return wire(this.config.next, [[NO_MATCHING_ERROR, this.config.onError]]);
  }
}

/**
 * The Transfer to phone number block: "Transfers the customer to a phone
 * number external to your instance." No AWS page documents the Type (its
 * API Reference page renders only its title); the shape is the kept export
 * (conformance/flow-language/exports/), whose three keys the class writes:
 * `ThirdPartyPhoneNumber`, `ThirdPartyConnectionTimeLimitSeconds` (the
 * console's Set timeout, 30 seconds in the block page's example) and
 * `ContinueFlowExecution` (the console's Resume flow after disconnect, which
 * "works only if the external party disconnects, and the customer doesn't
 * disconnect"). Voice only (chat, task and email "No - Error branch");
 * inbound, customer queue, transfer to agent and transfer to queue flows.
 *
 * The number is a JSONPath: the console's static form (a country code and a
 * number) has no recorded export, and a destination number is the kind of
 * value a deployment supplies at run time rather than commits; rule 47's
 * `third-static-number` probe records whether the service takes a static
 * one, and until then codegen leaves a static number generic.
 *
 * `continueFlow: true` writes the export's three errors in its order:
 * `onCallFailed` (Call failed), `onTimeout` (Timeout) and `onError`. The
 * service refused that form without any one of them on 2026-09-30, so they
 * are required here. `continueFlow: false` requires only the catch-all and
 * writes the other two when given: a cookbook comment of 2026-09-29 says
 * that form takes only the catch-all, no message was recorded, and rule
 * 47's probes settle whether the service refuses, allows or requires them.
 * Taking them in both forms lets an author wire the branches before
 * switching the flag, without a step where the block is generic. The page's Send
 * DTMF, Caller ID number and Caller ID name have no key in the export and
 * are not modeled; a document carrying any other key stays generic.
 * https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-phone-number.html
 * https://docs.aws.amazon.com/connect/latest/APIReference/participant-actions-transferparticipanttothirdparty.html
 */
interface TransferParticipantToThirdPartyBase extends Wired {
  /** A JSONPath to the destination, an E.164 number at run time. */
  number: JsonPath;
  /** Seconds the third party may take to answer; a positive integer. */
  timeLimitSeconds: number;
}

export type TransferParticipantToThirdPartyConfig = TransferParticipantToThirdPartyBase &
  (
    | { continueFlow: true; onCallFailed: Target; onTimeout: Target }
    | { continueFlow: false; onCallFailed?: Target; onTimeout?: Target }
  );

export class TransferParticipantToThirdParty extends Block {
  readonly type = ActionType.TransferParticipantToThirdParty;

  constructor(private readonly config: TransferParticipantToThirdPartyConfig) {
    super(config.id);
    if (typeof config.number !== "string" || !/^\$\.[A-Za-z0-9_$.[\]'-]+$/.test(config.number)) {
      throw new Error(
        `TransferParticipantToThirdParty "${config.id}" number must be a JSONPath (jsonPath("$.Attributes...")).`,
      );
    }
    const t = config.timeLimitSeconds;
    if (!Number.isInteger(t) || t < 1) {
      throw new Error(
        `TransferParticipantToThirdParty "${config.id}" timeLimitSeconds must be a positive integer, got ${t}.`,
      );
    }
    if (typeof (config as { continueFlow: unknown }).continueFlow !== "boolean") {
      throw new Error(
        `TransferParticipantToThirdParty "${config.id}" continueFlow must be true or false.`,
      );
    }
  }

  protected parameters(): Record<string, unknown> {
    const c = this.config;
    return {
      ThirdPartyPhoneNumber: c.number,
      ThirdPartyConnectionTimeLimitSeconds: String(c.timeLimitSeconds),
      ContinueFlowExecution: c.continueFlow ? "True" : "False",
    };
  }

  protected transitions(): Transitions {
    const c = this.config;
    const errors: [string, Target][] = [];
    if (c.onCallFailed !== undefined) errors.push([CALL_FAILED, c.onCallFailed]);
    if (c.onTimeout !== undefined) errors.push([CONNECTION_TIME_LIMIT_EXCEEDED, c.onTimeout]);
    errors.push([NO_MATCHING_ERROR, c.onError]);
    return wire(c.next, errors);
  }
}

// ---------------------------------------------------------------------------
// Passthrough
// ---------------------------------------------------------------------------

/**
 * Any Action the builder does not model. Preserved verbatim through synth,
 * codegen, the studio, and both emitters. This is what keeps a small modeled
 * set survivable: 61 action types are in the catalog (56 on the Developer
 * Guide's category pages, 5 documented elsewhere) and the builder models 56.
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
