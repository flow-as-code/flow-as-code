/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Inspector field descriptors per modeled action type. The inspector renders
// these; the shapes come from @flow-as-code/core blocks.ts and
// conformance/flow-language/actions.md.

import type { RefType } from "@flow-as-code/core";
import {
  ActionType,
  CALLBACK_ATTEMPTS_MIN,
  CALLBACK_DELAY_MAX,
  CALLBACK_DELAY_MIN,
  INPUT_TIMEOUT_MAX,
  OUTBOUND_CONNECTION_TIME_LIMIT_MAX,
  OUTBOUND_CONNECTION_TIME_LIMIT_MIN,
  INPUT_TIMEOUT_MIN,
  LAMBDA_TIMEOUT_MAX,
  LAMBDA_TIMEOUT_MIN,
  LOOP_COUNT_MAX,
  LOOP_COUNT_MIN,
  MEDIA_STREAMING_STATES,
  METRIC_TYPES,
  PREVIOUS_PARTICIPANT_STATES,
  QUEUE_CHANNELS,
  TTS_ENGINES,
  TTS_STYLES,
  VOICE_ID_RESPONSE_TIME_MAX,
  VOICE_ID_RESPONSE_TIME_MIN,
  VOICE_ID_THRESHOLD_MAX,
  VOICE_ID_THRESHOLD_MIN,
  QUEUE_PRIORITY_MIN,
  TASK_DELAY_MAX,
  TASK_DELAY_MIN,
  CALCULATED_ATTRIBUTE_FIELDS,
  CASE_SYSTEM_FIELDS,
  CALCULATED_ATTRIBUTE_PATTERNS,
  PROFILE_FIELD_PATTERNS,
  PROFILE_FIELDS,
  PROFILE_LOGICAL_OPERATORS,
  PROFILE_OBJECT_FIELD_PATTERNS,
  PROFILE_OBJECT_FIELDS,
  WAIT_TIMEOUT_MAX,
  WAIT_TIMEOUT_MIN,
} from "@flow-as-code/core";
import { MESSAGE_BODY_KEYS } from "./mutations.js";
import { DEFAULT_ROUTING_EXPRESSION } from "./palette.js";

export type FieldDesc =
  | {
      kind: "text";
      key: string;
      /** When set, the field edits this key inside the object parameter `key` holds. */
      nested?: string;
      label: string;
      multiline?: boolean;
      clears?: readonly string[];
      /** An emptied field deletes the parameter instead of storing "". */
      optional?: boolean;
      /** A nested field shown only while its key is present (one form of a `form` field). */
      onlyWhenPresent?: boolean;
    }
  /**
   * Numeric field. min, max, and integrality are enforced by setNumberParam in
   * mutations.ts, not just by the input element: a browser may ignore the
   * attributes and an empty field parses as 0.
   */
  | {
      kind: "number";
      key: string;
      label: string;
      min?: number;
      max?: number;
      /** Whole numbers unless a field explicitly says otherwise. */
      integer?: boolean;
      /** Stored as a decimal string, for parameters Connect spells that way. */
      asString?: boolean;
      /** An empty field deletes the parameter instead of being refused. */
      optional?: boolean;
      /** Keys deleted when this one is set, for mutually exclusive parameters. */
      clears?: readonly string[];
    }
  | {
      kind: "select";
      key: string;
      /** When set, the field edits this key inside the object parameter `key` holds. */
      nested?: string;
      label: string;
      options: readonly string[];
      optional?: boolean;
      onlyWhenPresent?: boolean;
    }
  | {
      kind: "ref";
      key: string;
      /** When set, the field edits this key inside the object parameter `key` holds. */
      nested?: string;
      label: string;
      refType: RefType;
      optional?: boolean;
      clears?: readonly string[];
    }
  | {
      kind: "json";
      key: string;
      /** When set, the field edits this key inside the object parameter `key` holds. */
      nested?: string;
      label: string;
      /** Keys deleted when this one is set, for alternative forms. */
      clears?: readonly string[];
      onlyWhenPresent?: boolean;
    }
  /**
   * Alternative forms of an object parameter, each a group of its keys (the
   * catalog's `groups` constraint, tasks/D01): choosing a form replaces the
   * whole object with the `keeps` keys it holds and the chosen form's keys,
   * filled from what the object holds or from `defaults`, in one mutation
   * (`switchForm`). So the block never passes through a shape with both
   * forms, neither, or half of one, and a key outside every form (a
   * GetCustomerProfile searching by a named field, which codegen leaves
   * generic) is dropped rather than mixed in. The forms' keys are then
   * edited by nested fields marked `onlyWhenPresent`.
   */
  | {
      kind: "form";
      key: string;
      label: string;
      /** Keys outside every form that a switch keeps (GetCustomerProfileObject's profile and type). */
      keeps?: readonly string[];
      forms: readonly {
        label: string;
        keys: readonly string[];
        defaults: Readonly<Record<string, unknown>>;
      }[];
    }
  /**
   * An object of strings whose keys the page lists (chosen from `names`, not
   * typed) or that match one of `patterns` (typed, `Attributes.<name>`),
   * each value static or a JSONPath: a Customer Profiles create or update's
   * ProfileRequestData (catalog `keys` and `keyPatterns`).
   */
  | {
      kind: "fieldMap";
      key: string;
      label: string;
      names: readonly string[];
      patterns: readonly string[];
      /** How a typed key is spelled, shown beside the field. */
      patternHint: string;
      /**
       * Keys that are references of this type, added through a reference
       * picker beside the list (a Cases domain's own field, a `casefield`
       * token standing as the key, docs/adr/0008-case-field-ids.md).
       */
      refType?: RefType;
    }
  /**
   * A list of names: those the page lists are ticked, not typed; any other
   * is typed one per line and held to `patterns`. ProfileResponseData.
   */
  | {
      kind: "names";
      key: string;
      label: string;
      names: readonly string[];
      patterns: readonly string[];
      patternHint: string;
      /** Names that are references of this type, added through a picker, as on fieldMap. */
      refType?: RefType;
    }
  /**
   * A Cases block's link (tasks/D06): whether `LinkContactToCase` is "true"
   * and, when it is, which contact (`ContactToLink`). Written by
   * setCaseLink, which wires or removes the ContactNotLinked branch in the
   * same mutation.
   */
  | {
      kind: "caseLink";
      key: string;
      label: string;
    }
  /**
   * UpdateRoutingCriteria's `Steps`, inside the object `key` holds: a list
   * shown one step at a time, each step's Expression in the JSON editor
   * `json` fields use and its expiry as seconds (empty: never expires), or a
   * JSONPath standing for the whole list (docs/adr/0009). The block class
   * checks the expression; the guard reports what it refuses.
   */
  | {
      kind: "steps";
      key: string;
      nested: string;
      label: string;
    };

/**
 * Message body is a oneOf (Text, SSML, PromptId); the inspector renders a mode
 * switch backed by setMessageBody rather than three independent fields.
 * MESSAGE_BODY_KEYS in mutations.ts is the same list; this alias keeps the
 * inspector reading from one place.
 */
export const MESSAGE_BODY_KINDS = MESSAGE_BODY_KEYS;

/**
 * Types whose parameters include a played body (Text, SSML or PromptId), so
 * the inspector renders the body mode switch for them.
 */
export function hasMessageBody(type: string): boolean {
  return (
    type === ActionType.MessageParticipant ||
    type === ActionType.GetParticipantInput ||
    type === ActionType.ConnectParticipantWithLexBot
  );
}

/**
 * Whether that body may be absent. A MessageParticipant with no body is
 * schema-invalid; a GetParticipantInput with none is a silent menu, which the
 * action page allows (every prompt field is optional there):
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 */
export function bodyIsOptional(type: string): boolean {
  return (
    type === ActionType.GetParticipantInput || type === ActionType.ConnectParticipantWithLexBot
  );
}

/**
 * A Cases field map's keys or a response list's names: a system field id
 * chosen from the admin guide's list, or a domain's own field as a casefield
 * reference (docs/adr/0008-case-field-ids.md), picked or typed as the token.
 */
export const CASE_FIELD_NAMES = {
  names: CASE_SYSTEM_FIELDS,
  patterns: ["^\\$\\{cdref:casefield:[a-z0-9]+(?:-[a-z0-9]+)*\\}$"],
  patternHint: "${cdref:casefield:<name>}",
  refType: "casefield",
} as const;

/** The link, the request fields, and for CreateCase the template. */
function caseLinkField(): FieldDesc {
  return { kind: "caseLink", key: "LinkContactToCase", label: "Link contact to case" };
}

function caseRequestField(label: string): FieldDesc {
  return { kind: "fieldMap", key: "CaseRequestFields", label, ...CASE_FIELD_NAMES };
}

const PROFILE_NAMES = {
  names: PROFILE_FIELDS,
  patterns: PROFILE_FIELD_PATTERNS,
  patternHint: "Attributes.<name>",
} as const;

/** The response names of a profile create, update or get. */
function profileResponseField(): FieldDesc {
  return {
    kind: "names",
    key: "ProfileResponseData",
    label: "Response fields (stored under $.Customer)",
    ...PROFILE_NAMES,
  };
}

/** The request and response fields of a profile create or update. */
function profileFieldsFor(): FieldDesc[] {
  return [
    { kind: "fieldMap", key: "ProfileRequestData", label: "Request fields", ...PROFILE_NAMES },
    profileResponseField(),
  ];
}

/**
 * The object a `form` field writes when form `index` is chosen: the `keeps`
 * keys the object holds, then the chosen form's keys, each from the object
 * or from the form's defaults. Every other key goes, so the result holds
 * exactly one form. Undefined for an index that names no form.
 */
export function switchForm(
  holder: Readonly<Record<string, unknown>> | undefined,
  field: Extract<FieldDesc, { kind: "form" }>,
  index: number,
): Record<string, unknown> | undefined {
  const chosen = field.forms[index];
  if (chosen === undefined) return undefined;
  const object: Record<string, unknown> = {};
  for (const k of field.keeps ?? []) if (holder?.[k] !== undefined) object[k] = holder[k];
  for (const k of chosen.keys) object[k] = holder?.[k] ?? chosen.defaults[k];
  return object;
}

/** The seconds a step that must expire is given when a step is added after it. */
export const DEFAULT_ROUTING_EXPIRY_SECONDS = 30;

type RoutingStepValue = Record<string, unknown>;

function stepList(steps: unknown): RoutingStepValue[] {
  return Array.isArray(steps)
    ? steps.map((s) =>
        s !== null && typeof s === "object" && !Array.isArray(s)
          ? { ...(s as RoutingStepValue) }
          : {},
      )
    : [];
}

/**
 * The steps after one is appended. Only the last step may never expire (the
 * admin guide), so a last step without an expiry is given the default
 * seconds before the new step, which never expires, goes after it.
 */
export function addRoutingStep(steps: unknown): RoutingStepValue[] {
  const list = stepList(steps);
  const last = list[list.length - 1];
  if (last !== undefined && last.Expiry === undefined) {
    last.Expiry = { DurationInSeconds: String(DEFAULT_ROUTING_EXPIRY_SECONDS) };
  }
  return [...list, { Expression: DEFAULT_ROUTING_EXPRESSION }];
}

/** The steps without step `index`; undefined when it is the only one, which the page requires. */
export function removeRoutingStep(steps: unknown, index: number): RoutingStepValue[] | undefined {
  const list = stepList(steps);
  if (list.length <= 1 || index < 0 || index >= list.length) return undefined;
  return list.filter((_, i) => i !== index);
}

/**
 * The steps with step `index` changed: its Expression replaced, or its
 * expiry set to these seconds (a decimal string, the class's spelling) or,
 * for `null`, removed.
 */
export function setRoutingStep(
  steps: unknown,
  index: number,
  change: { expression: unknown } | { seconds: number | null },
): RoutingStepValue[] {
  const list = stepList(steps);
  const step = list[index];
  if (step === undefined) return list;
  if ("expression" in change) step.Expression = change.expression;
  else if (change.seconds === null) delete step.Expiry;
  else step.Expiry = { DurationInSeconds: String(change.seconds) };
  return list;
}

/**
 * A `names` field's list after the typed names are committed: every stored
 * name stays where it is unless it is a typed one no longer typed, and typed
 * names not yet stored are appended in the order typed. Listed names are
 * never touched here; their checkboxes add and remove them.
 */
export function mergeTypedNames(
  stored: readonly string[],
  listed: readonly string[],
  typed: readonly string[],
): string[] {
  const wanted = [...new Set(typed)];
  return [
    ...stored.filter((n) => listed.includes(n) || wanted.includes(n)),
    ...wanted.filter((n) => !stored.includes(n)),
  ];
}

export function fieldsFor(type: string): FieldDesc[] | undefined {
  switch (type) {
    case ActionType.MessageParticipant:
      // Rendered specially: see MESSAGE_BODY_KINDS.
      return [];
    case ActionType.GetParticipantInput:
      // Body rendered as for MessageParticipant, optional here, on both forms.
      // On the menu form the branches are the condition editor, one key each.
      // The stored form (StoreInput "True") edits the same body and timeout;
      // its InputValidation (a maximum length, or a phone number format and
      // country) is not editable here yet and is authored in the .flow.ts or
      // .flow.tf (tasks/C04). A new block from the palette is the menu form.
      return [
        {
          kind: "number",
          key: "InputTimeLimitSeconds",
          label: "Timeout (seconds)",
          min: INPUT_TIMEOUT_MIN,
          max: INPUT_TIMEOUT_MAX,
          asString: true,
        },
      ];
    case ActionType.CheckHoursOfOperation:
      return [
        {
          kind: "ref",
          key: "HoursOfOperationId",
          label: "Hours of operation",
          refType: "hours",
          optional: true,
        },
      ];
    case ActionType.Compare:
      return [{ kind: "text", key: "ComparisonValue", label: "Comparison value (JSONPath)" }];
    case ActionType.ConnectParticipantWithLexBot:
      // Body rendered as for MessageParticipant, optional here. Intents are
      // the condition editor, one Equals branch each. The bot is the V2
      // alias, LexV2Bot.AliasArn, a lex reference or a JSONPath edited as one
      // key of the LexV2Bot object, as ShowView's view is; the V1 LexBot form
      // is edited as a GenericBlock.
      return [
        {
          kind: "ref",
          key: "LexV2Bot",
          nested: "AliasArn",
          label: "Lex V2 bot alias",
          refType: "lex",
        },
        { kind: "json", key: "LexSessionAttributes", label: "Session attributes" },
        {
          kind: "json",
          key: "LexInitializationData",
          label: "Initialization ({ InitialMessage })",
        },
        { kind: "json", key: "LexTimeoutSeconds", label: "Timeout ({ Text: seconds })" },
      ];
    case ActionType.ShowView:
      // ViewResource.Id is the view reference (a token with the version in
      // its alias slot, or a JSONPath) and ViewResource.Version the separate
      // version string; each edits one key of the ViewResource object. The
      // view's actions are the condition editor, one Equals branch each; the
      // time limit and its TimeLimitExceeded branch are required.
      return [
        { kind: "ref", key: "ViewResource", nested: "Id", label: "View", refType: "view" },
        {
          kind: "text",
          key: "ViewResource",
          nested: "Version",
          label: "View version",
          optional: true,
        },
        {
          kind: "number",
          key: "InvocationTimeLimitSeconds",
          label: "Time limit (seconds)",
          min: 1,
          asString: true,
        },
        { kind: "json", key: "ViewData", label: "View data" },
        {
          kind: "json",
          key: "SensitiveDataConfiguration",
          label: "Sensitive data ({ HideResponseOn })",
        },
      ];
    case ActionType.MessageParticipantIteratively:
      // Messages is a list of one-key objects (Text, SSML, PromptId, or Media
      // with Uri, SourceType S3 and MediaType Audio). The interrupt frequency
      // and the MessagesInterrupted branch go together: a drag from the
      // primary handle adds the branch and, when none is set, the console's
      // 30 seconds for this field to change; removing the branch removes the
      // seconds (mutations.ts, withBranch and dropCondition).
      return [
        { kind: "json", key: "Messages", label: "Messages (Text, SSML, PromptId or Media)" },
        {
          kind: "number",
          key: "InterruptFrequencySeconds",
          label: "Interrupt every (seconds)",
          min: 1,
          asString: true,
          optional: true,
        },
      ];
    case ActionType.Wait:
      // Events is the list of interrupting events, each of which also has a
      // branch: a drag from the primary handle adds the next event and its
      // branch together (mutations.ts, withWaitEvent), and the list here
      // shows the result. The JSONPath form of the timeout is shown as a
      // text field (Inspector.tsx, isJsonPathValue).
      return [
        {
          kind: "number",
          key: "TimeLimitSeconds",
          label: "Timeout (seconds)",
          min: WAIT_TIMEOUT_MIN,
          max: WAIT_TIMEOUT_MAX,
          asString: true,
        },
        {
          kind: "json",
          key: "Events",
          label: "Events (CustomerReturned, BotParticipantDisconnected)",
        },
      ];
    case ActionType.Loop:
      // The console's spelling is a decimal string (asString); the dynamic
      // (JSONPath) form of the count is shown as a text field.
      return [
        {
          kind: "number",
          key: "LoopCount",
          label: "Loop count",
          min: LOOP_COUNT_MIN,
          max: LOOP_COUNT_MAX,
          asString: true,
        },
      ];
    case ActionType.TransferToFlow:
      return [{ kind: "ref", key: "ContactFlowId", label: "Flow", refType: "flow" }];
    case ActionType.UpdateContactTargetQueue:
      // QueueId and AgentId are mutually exclusive; setting one clears the other.
      return [
        { kind: "ref", key: "QueueId", label: "Queue", refType: "queue", clears: ["AgentId"] },
        {
          kind: "ref",
          key: "AgentId",
          label: "Agent queue",
          refType: "queue",
          optional: true,
          clears: ["QueueId"],
        },
      ];
    case ActionType.DequeueContactAndTransferToQueue:
      // Both optional: with neither, the contact goes to its current target
      // queue. Setting one clears the other, as for UpdateContactTargetQueue.
      return [
        {
          kind: "ref",
          key: "QueueId",
          label: "Queue",
          refType: "queue",
          optional: true,
          clears: ["AgentId"],
        },
        {
          kind: "ref",
          key: "AgentId",
          label: "Agent queue",
          refType: "queue",
          optional: true,
          clears: ["QueueId"],
        },
      ];
    case ActionType.UpdateContactRoutingBehavior:
      // One or the other, never both (the action page): setting one clears
      // the other, and an emptied field is deleted. Emptying the last one
      // leaves a shape the block class refuses, which the guard reports.
      return [
        {
          kind: "number",
          key: "QueuePriority",
          label: "Queue priority (1 is highest)",
          min: QUEUE_PRIORITY_MIN,
          asString: true,
          optional: true,
          clears: ["QueueTimeAdjustmentSeconds"],
        },
        {
          kind: "number",
          key: "QueueTimeAdjustmentSeconds",
          label: "Queue time adjustment (seconds)",
          asString: true,
          optional: true,
          clears: ["QueuePriority"],
        },
      ];
    case ActionType.UpdateContactCallbackNumber:
      // "Must be a single, valid JSONPath reference, and cannot be set
      // statically"; the guard refuses anything else through the inverter.
      return [{ kind: "text", key: "CallbackNumber", label: "Callback number (JSONPath)" }];
    case ActionType.CreateCallbackContact:
      return [
        {
          kind: "ref",
          key: "QueueId",
          label: "Queue",
          refType: "queue",
          optional: true,
          clears: ["AgentId"],
        },
        {
          kind: "ref",
          key: "AgentId",
          label: "Agent queue",
          refType: "queue",
          optional: true,
          clears: ["QueueId"],
        },
        {
          kind: "number",
          key: "InitialCallDelaySeconds",
          label: "Initial delay (seconds)",
          min: CALLBACK_DELAY_MIN,
          max: CALLBACK_DELAY_MAX,
          asString: true,
        },
        {
          kind: "number",
          key: "MaximumConnectionAttempts",
          label: "Maximum attempts",
          min: CALLBACK_ATTEMPTS_MIN,
          asString: true,
        },
        {
          kind: "number",
          key: "RetryDelaySeconds",
          label: "Delay between attempts (seconds)",
          min: CALLBACK_DELAY_MIN,
          max: CALLBACK_DELAY_MAX,
          asString: true,
        },
        {
          kind: "ref",
          key: "ContactFlowId",
          label: "Callback creation flow",
          refType: "flow",
          optional: true,
        },
        { kind: "text", key: "CallerId", label: "Caller ID (number or JSONPath)", optional: true },
      ];
    case ActionType.CreateTask:
      // The flow and the template are each optional (a template may carry
      // its flow); the template is static, so its picker offers no
      // JSONPath that the schema would accept. A delay and a schedule are
      // alternatives ("If ScheduledTime is specified, this parameter may not
      // be specified"); the schedule is a JSONPath to epoch seconds, the
      // form the builder models. References stay in the raw JSON until a
      // console export records their shape (actions.md, rule 42).
      return [
        {
          kind: "ref",
          key: "ContactFlowId",
          label: "Flow the task runs",
          refType: "flow",
          optional: true,
        },
        {
          kind: "ref",
          key: "TaskTemplateId",
          label: "Task template",
          refType: "tasktemplate",
          optional: true,
        },
        { kind: "text", key: "Name", label: "Task name" },
        { kind: "text", key: "Description", label: "Description", multiline: true, optional: true },
        { kind: "json", key: "Attributes", label: "Attributes" },
        {
          kind: "number",
          key: "DelaySeconds",
          label: "Delay (seconds)",
          min: TASK_DELAY_MIN,
          max: TASK_DELAY_MAX,
          asString: true,
          optional: true,
          clears: ["ScheduledTime"],
        },
        {
          kind: "text",
          key: "ScheduledTime",
          label: "Scheduled time (JSONPath to Unix epoch seconds)",
          optional: true,
          clears: ["DelaySeconds"],
        },
      ];
    case ActionType.CreateWisdomSession:
      return [
        {
          kind: "ref",
          key: "WisdomAssistantArn",
          label: "AI agents assistant",
          refType: "assistant",
        },
      ];
    case ActionType.GetCustomerProfile: {
      // One identifier or SearchCriteria with its operator, one form per
      // block as the page requires: the form switch clears the other, and
      // each form's keys are edited while it is the one set. A block
      // searching by a named field (AWS's step-by-step flows), which codegen
      // leaves generic, shows "(neither form)"; choosing a form replaces the
      // whole request, so the named field goes and the block becomes typed.
      const first = { IdentifierName: "_phone", IdentifierValue: "$.CustomerEndpoint.Address" };
      const nested = { key: "ProfileRequestData", onlyWhenPresent: true } as const;
      return [
        {
          kind: "form",
          key: "ProfileRequestData",
          label: "Search by",
          forms: [
            {
              label: "One identifier",
              keys: ["IdentifierName", "IdentifierValue"],
              defaults: first,
            },
            {
              label: "Search criteria, up to five",
              keys: ["SearchCriteria", "LogicalOperator"],
              defaults: { SearchCriteria: [first], LogicalOperator: "AND" },
            },
          ],
        },
        {
          kind: "text",
          ...nested,
          nested: "IdentifierName",
          label: "Identifier name (_phone, _email, ...)",
        },
        {
          kind: "text",
          ...nested,
          nested: "IdentifierValue",
          label: "Identifier value (or JSONPath)",
        },
        {
          kind: "json",
          ...nested,
          nested: "SearchCriteria",
          label: "Search criteria (IdentifierName and IdentifierValue each)",
        },
        {
          kind: "select",
          ...nested,
          nested: "LogicalOperator",
          label: "Logical operator",
          options: PROFILE_LOGICAL_OPERATORS,
        },
        profileResponseField(),
      ];
    }
    case ActionType.GetCustomerProfileObject: {
      // The profile and object type, then the latest object or a search
      // identifier, one per block: the form switch clears the other. The
      // response names are the page's Asset, Order and Case fields, with
      // the four *Attributes.<name> forms typed.
      const nested = { key: "ProfileRequestData", onlyWhenPresent: true } as const;
      return [
        {
          kind: "text",
          key: "ProfileRequestData",
          nested: "ProfileId",
          label: "Profile ID (or JSONPath)",
        },
        { kind: "text", key: "ProfileRequestData", nested: "ObjectType", label: "Object type" },
        {
          kind: "form",
          key: "ProfileRequestData",
          label: "Retrieve",
          keeps: ["ProfileId", "ObjectType"],
          forms: [
            { label: "The latest object", keys: ["UseLatest"], defaults: { UseLatest: "true" } },
            {
              label: "By a search identifier",
              keys: ["IdentifierName", "IdentifierValue"],
              defaults: { IdentifierName: "_orderId", IdentifierValue: "$.Attributes.orderId" },
            },
          ],
        },
        { kind: "text", ...nested, nested: "IdentifierName", label: "Identifier name" },
        {
          kind: "text",
          ...nested,
          nested: "IdentifierValue",
          label: "Identifier value (or JSONPath)",
        },
        {
          kind: "names",
          key: "ProfileResponseData",
          label: "Response fields (stored under $.Customer)",
          names: PROFILE_OBJECT_FIELDS,
          patterns: PROFILE_OBJECT_FIELD_PATTERNS,
          patternHint:
            "AssetAttributes.<name>, OrderAttributes.<name>, CaseAttributes.<name> or ObjectAttributes.<name>",
        },
      ];
    }
    case ActionType.UpdateRoutingCriteria:
      // The steps, one at a time: each expression in the JSON editor
      // (attributeCondition, and and or in the .flow.ts), each expiry in
      // seconds; or a JSONPath to a Lambda's list.
      return [
        {
          kind: "steps",
          key: "RoutingCriteria",
          nested: "Steps",
          label: "Routing steps",
        },
      ];
    case ActionType.GetCalculatedAttributesForCustomerProfile:
      // The profile id, and the calculated attributes to store: the two the
      // page names ticked, the domain's own typed.
      return [
        {
          kind: "text",
          key: "ProfileRequestData",
          nested: "ProfileId",
          label: "Profile ID (or JSONPath)",
        },
        {
          kind: "names",
          key: "ProfileResponseData",
          label: "Calculated attributes (stored under $.Customer)",
          names: CALCULATED_ATTRIBUTE_FIELDS,
          patterns: CALCULATED_ATTRIBUTE_PATTERNS,
          patternHint: "CalculatedAttributes.<name>",
        },
      ];
    case ActionType.CreateCase:
      // The template is a casetemplate reference; request fields are system
      // field ids chosen from the list or a domain's own fields picked as
      // casefield references. Linking adds the ContactNotLinked branch.
      // https://docs.aws.amazon.com/connect/latest/devguide/createcase.html
      return [
        caseLinkField(),
        { kind: "ref", key: "CaseTemplateId", label: "Case template", refType: "casetemplate" },
        caseRequestField("Request fields"),
      ];
    case ActionType.GetCase:
      // The search fields and the stored response fields name case fields
      // as CreateCase's do; at most ten response fields (the admin guide).
      // https://docs.aws.amazon.com/connect/latest/devguide/getcase.html
      return [
        caseLinkField(),
        {
          kind: "select",
          key: "GetLastUpdatedCase",
          label: "Get last updated case",
          options: ["true", "false"],
        },
        { kind: "text", key: "CustomerId", label: "Customer ID (or JSONPath)", optional: true },
        caseRequestField("Search fields"),
        {
          kind: "names",
          key: "CaseResponseFields",
          label: "Response fields (stored under $.Case, at most 10)",
          ...CASE_FIELD_NAMES,
        },
      ];
    case ActionType.UpdateCase:
      // "Case Id is the unique identifier of the case and the only field
      // you can provide here"; the fields to update as CreateCase's.
      // https://docs.aws.amazon.com/connect/latest/devguide/updatecase.html
      return [
        caseLinkField(),
        { kind: "text", key: "CaseId", label: "Case ID (or JSONPath)" },
        caseRequestField("Fields to update"),
      ];
    case ActionType.CreateCustomerProfile:
    case ActionType.UpdateCustomerProfile:
      // The request fields are chosen from the page's list, and a custom
      // attribute is typed as Attributes.<name>; the response fields are
      // ticked from the same list, with custom attributes typed beside them.
      // A name outside both stays in the raw JSON of a generic block.
      return profileFieldsFor();
    case ActionType.AssociateContactToCustomerProfile:
      // Both ids sit in ProfileRequestData, each static or a JSONPath; the
      // page's response data is "None.", so there is nothing to choose.
      return [
        {
          kind: "text",
          key: "ProfileRequestData",
          nested: "ProfileId",
          label: "Profile ID (or JSONPath)",
        },
        {
          kind: "text",
          key: "ProfileRequestData",
          nested: "ContactId",
          label: "Contact ID (or JSONPath)",
        },
      ];
    case ActionType.UpdateContactAttributes:
      return [
        { kind: "json", key: "Attributes", label: "Attributes" },
        {
          kind: "select",
          key: "TargetContact",
          label: "Target contact",
          options: ["Current", "Related"],
        },
      ];
    case ActionType.UpdateContactRecordingBehavior:
      return [{ kind: "json", key: "RecordingBehavior", label: "Recording behavior" }];
    case ActionType.UpdateFlowLoggingBehavior:
      return [
        {
          kind: "select",
          key: "FlowLoggingBehavior",
          label: "Flow logging",
          options: ["Enabled", "Disabled"],
        },
      ];
    case ActionType.UpdateContactRecordingAndAnalyticsBehavior:
      // The voice recording form or the screen recording form, one per
      // block as the service requires: setting either clears the other. The
      // chat form and the voice analytics settings are edited as a
      // GenericBlock.
      return [
        {
          kind: "json",
          key: "VoiceBehavior",
          label: "Voice recording (VoiceRecordingBehavior)",
          clears: ["ScreenRecordingBehavior"],
        },
        {
          kind: "json",
          key: "ScreenRecordingBehavior",
          label: "Screen recording (ScreenRecordedParticipants), instead of voice",
          clears: ["VoiceBehavior"],
        },
      ];
    case ActionType.UpdateFlowAttributes:
      return [{ kind: "json", key: "FlowAttributes", label: "Flow attributes" }];
    case ActionType.UpdateContactMediaProcessing:
      // The Lambda is ChatProcessor.LambdaProcessorARN, a lambda reference
      // edited as one key of the object, as ShowView's view is; the rest of
      // the object (ProcessingEnabled, ChatProcessorSettings) is JSON. The
      // page wants the reference static, so a JSONPath fails the schema.
      return [
        {
          kind: "ref",
          key: "ChatProcessor",
          nested: "LambdaProcessorARN",
          label: "Message processor Lambda",
          refType: "lambda",
          optional: true,
        },
        {
          kind: "json",
          key: "ChatProcessor",
          label: "Chat processor (ProcessingEnabled, ChatProcessorSettings)",
        },
      ];
    case ActionType.UpdateContactMediaStreamingBehavior:
      // Enabled is Start media streaming and Disabled Stop. The participant
      // is always the customer and the stream audio (the page supports no
      // other), so the list is edited as JSON for its MediaDirections.
      return [
        {
          kind: "select",
          key: "MediaStreamingState",
          label: "Media streaming",
          options: MEDIA_STREAMING_STATES,
        },
        {
          kind: "json",
          key: "Participants",
          label: "Participants (Customer, MediaDirections From and To)",
        },
        { kind: "select", key: "MediaStreamType", label: "Stream type", options: ["Audio"] },
      ];
    case ActionType.UpdatePreviousContactParticipantState:
      // AgentOnHold keeps the customer on the call, CustomerOnHold the
      // agent, and OffHold is the console's Conference all.
      return [
        {
          kind: "select",
          key: "PreviousContactParticipantState",
          label: "Hold (AgentOnHold, CustomerOnHold, or OffHold to conference all)",
          options: PREVIOUS_PARTICIPANT_STATES,
        },
      ];
    case ActionType.TagContact:
      return [{ kind: "json", key: "Tags", label: "Tags (up to six, no aws: keys)" }];
    case ActionType.UntagContact:
      return [{ kind: "json", key: "TagKeys", label: "Tag keys to remove" }];
    case ActionType.UpdateContactData:
      return [
        {
          kind: "select",
          key: "TargetContact",
          label: "Target contact",
          options: ["Current", "Related"],
          optional: true,
        },
        { kind: "text", key: "Name", label: "Name (text or JSONPath)", optional: true },
        { kind: "text", key: "Description", label: "Description", optional: true },
        { kind: "text", key: "LanguageCode", label: "Language code", optional: true },
        { kind: "text", key: "CustomerId", label: "Customer id", optional: true },
        { kind: "json", key: "References", label: "References" },
        {
          kind: "select",
          key: "IsVoiceIdStreamingEnabled",
          label: "Voice ID streaming",
          options: ["TRUE", "FALSE"],
          optional: true,
        },
        {
          kind: "select",
          key: "IsVoiceAuthenticationEnabled",
          label: "Voice authentication",
          options: ["TRUE", "FALSE"],
          optional: true,
        },
        {
          kind: "select",
          key: "IsFraudDetectionEnabled",
          label: "Fraud detection",
          options: ["TRUE", "FALSE"],
          optional: true,
        },
        {
          kind: "number",
          key: "VoiceAuthenticationThreshold",
          label: "Voice authentication threshold",
          min: VOICE_ID_THRESHOLD_MIN,
          max: VOICE_ID_THRESHOLD_MAX,
          asString: true,
          optional: true,
        },
        {
          kind: "number",
          key: "VoiceAuthenticationResponseTime",
          label: "Voice authentication response time (seconds)",
          min: VOICE_ID_RESPONSE_TIME_MIN,
          max: VOICE_ID_RESPONSE_TIME_MAX,
          asString: true,
          optional: true,
        },
        {
          kind: "number",
          key: "FraudDetectionThreshold",
          label: "Fraud detection threshold",
          min: VOICE_ID_THRESHOLD_MIN,
          max: VOICE_ID_THRESHOLD_MAX,
          asString: true,
          optional: true,
        },
        { kind: "text", key: "WatchlistId", label: "Watchlist id", optional: true },
        {
          kind: "text",
          key: "WisdomSessionArn",
          label: "Wisdom session (JSONPath)",
          optional: true,
        },
      ];
    case ActionType.UpdateContactEventHooks:
      // One entry: the hook name (AgentHold, AgentWhisper, CustomerHold,
      // CustomerQueue, CustomerRemaining, CustomerWhisper, DefaultAgentUI,
      // DisconnectAgentUI, PauseContact or ResumeContact) to a flow token
      // or JSONPath.
      return [{ kind: "json", key: "EventHooks", label: "Event hook (one entry: hook to flow)" }];
    case ActionType.UpdateContactTextToSpeechVoice:
      // The JSONPath forms of the engine and style are shown as text fields
      // (Inspector.tsx, isJsonPathValue).
      return [
        { kind: "text", key: "TextToSpeechVoice", label: "Voice (Polly name or JSONPath)" },
        {
          kind: "select",
          key: "TextToSpeechEngine",
          label: "Engine",
          options: TTS_ENGINES,
          optional: true,
        },
        {
          kind: "select",
          key: "TextToSpeechStyle",
          label: "Speaking style",
          options: TTS_STYLES,
          optional: true,
        },
      ];
    case ActionType.InvokeFlowModule:
      return [{ kind: "ref", key: "FlowModuleId", label: "Module", refType: "module" }];
    case ActionType.InvokeLambdaFunction:
      return [
        { kind: "ref", key: "LambdaFunctionARN", label: "Lambda function", refType: "lambda" },
        {
          kind: "number",
          key: "InvocationTimeLimitSeconds",
          label: "Timeout (seconds)",
          min: LAMBDA_TIMEOUT_MIN,
          max: LAMBDA_TIMEOUT_MAX,
        },
        {
          kind: "select",
          key: "InvocationType",
          label: "Invocation type",
          options: ["SYNCHRONOUS", "ASYNCHRONOUS"],
        },
        { kind: "json", key: "ResponseValidation", label: "Response validation" },
      ];
    case ActionType.CheckMetricData:
      // With neither queue nor agent queue the contact's target queue is
      // checked; setting one clears the other.
      return [
        { kind: "select", key: "MetricType", label: "Metric", options: METRIC_TYPES },
        {
          kind: "ref",
          key: "QueueId",
          label: "Queue",
          refType: "queue",
          optional: true,
          clears: ["AgentId"],
        },
        {
          kind: "ref",
          key: "AgentId",
          label: "Agent queue",
          refType: "queue",
          optional: true,
          clears: ["QueueId"],
        },
      ];
    case ActionType.GetMetricData:
      // With neither queue nor agent queue the contact's target queue is
      // read; without a channel, every channel. The JSONPath form of the
      // channel is shown as a text field.
      return [
        {
          kind: "ref",
          key: "QueueId",
          label: "Queue",
          refType: "queue",
          optional: true,
          clears: ["AgentId"],
        },
        {
          kind: "ref",
          key: "AgentId",
          label: "Agent queue",
          refType: "queue",
          optional: true,
          clears: ["QueueId"],
        },
        {
          kind: "select",
          key: "QueueChannel",
          label: "Channel",
          options: QUEUE_CHANNELS,
          optional: true,
        },
      ];
    case ActionType.DistributeByPercentage:
      // No parameters; the branches are the condition editor, each operand
      // the threshold below which a draw takes that branch.
      return [];
    case ActionType.CompleteOutboundCall:
      // Both optional: with no caller ID the queue's is used (the admin
      // guide's Call phone number block). The caller ID is CallerId.Number,
      // an E.164 number or a JSONPath; emptying it removes CallerId. The
      // page uses the time limit only with a voice connector, whose form is
      // generic (owner decision 4), but the typed form may carry it.
      // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-completeoutboundcall.html
      // https://docs.aws.amazon.com/connect/latest/adminguide/call-phone-number.html
      return [
        {
          kind: "text",
          key: "CallerId",
          nested: "Number",
          label: "Caller ID number (E.164 or JSONPath)",
          optional: true,
        },
        {
          kind: "number",
          key: "ConnectionTimeLimitSeconds",
          label: "Connection time limit (seconds)",
          min: OUTBOUND_CONNECTION_TIME_LIMIT_MIN,
          max: OUTBOUND_CONNECTION_TIME_LIMIT_MAX,
          asString: true,
          optional: true,
        },
      ];
    case ActionType.CheckOutboundCallStatus:
      // No parameters ("{}"); the four statuses are the condition editor,
      // one Equals branch each, added by drags in the page's order.
      // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkoutboundcallstatus.html
      return [];
    case ActionType.DisconnectParticipant:
    case ActionType.EndFlowExecution:
    case ActionType.EndFlowModuleExecution:
    case ActionType.TransferContactToAgent:
    case ActionType.TransferContactToQueue:
    case ActionType.ResumeContact:
      return [];
    default:
      // Unmodeled: GenericBlock, read-only raw JSON.
      return undefined;
  }
}
