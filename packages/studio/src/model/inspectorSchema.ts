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
  INPUT_TIMEOUT_MIN,
  LAMBDA_TIMEOUT_MAX,
  LAMBDA_TIMEOUT_MIN,
  LOOP_COUNT_MAX,
  LOOP_COUNT_MIN,
  METRIC_TYPES,
  QUEUE_CHANNELS,
  TTS_ENGINES,
  TTS_STYLES,
  VOICE_ID_RESPONSE_TIME_MAX,
  VOICE_ID_RESPONSE_TIME_MIN,
  VOICE_ID_THRESHOLD_MAX,
  VOICE_ID_THRESHOLD_MIN,
  QUEUE_PRIORITY_MIN,
  WAIT_TIMEOUT_MAX,
  WAIT_TIMEOUT_MIN,
} from "@flow-as-code/core";
import { MESSAGE_BODY_KEYS } from "./mutations.js";

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
  | { kind: "select"; key: string; label: string; options: readonly string[]; optional?: boolean }
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
  | { kind: "json"; key: string; label: string };

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

export function fieldsFor(type: string): FieldDesc[] | undefined {
  switch (type) {
    case ActionType.MessageParticipant:
      // Rendered specially: see MESSAGE_BODY_KINDS.
      return [];
    case ActionType.GetParticipantInput:
      // Body rendered as for MessageParticipant, optional here. Branches are
      // the condition editor: one key each. StoreInput stays "False": the
      // stored-input form is not modeled (@flow-as-code/core blocks.ts), so it is not
      // offered.
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
      // the condition editor, one Equals branch each. The bot is the V2 alias
      // as { "AliasArn": "${cdref:lex:name}" } or a JSONPath; the V1 LexBot
      // form is edited as a GenericBlock.
      return [
        { kind: "json", key: "LexV2Bot", label: "Lex V2 bot ({ AliasArn })" },
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
      // primary handle adds the branch once the seconds are set.
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
      // The voice recording form and the optional screen recording form;
      // the chat form and the voice analytics settings are edited as a
      // GenericBlock.
      return [
        { kind: "json", key: "VoiceBehavior", label: "Voice recording (VoiceRecordingBehavior)" },
        {
          kind: "json",
          key: "ScreenRecordingBehavior",
          label: "Screen recording (ScreenRecordedParticipants, optional)",
        },
      ];
    case ActionType.UpdateFlowAttributes:
      return [{ kind: "json", key: "FlowAttributes", label: "Flow attributes" }];
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
      // The JSONPath forms of the engine and style are edited as a GenericBlock.
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
    case ActionType.DisconnectParticipant:
    case ActionType.EndFlowExecution:
    case ActionType.EndFlowModuleExecution:
    case ActionType.TransferContactToAgent:
    case ActionType.TransferContactToQueue:
      return [];
    default:
      // Unmodeled: GenericBlock, read-only raw JSON.
      return undefined;
  }
}
