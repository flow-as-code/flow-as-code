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
  INPUT_TIMEOUT_MAX,
  INPUT_TIMEOUT_MIN,
  LAMBDA_TIMEOUT_MAX,
  LAMBDA_TIMEOUT_MIN,
} from "@flow-as-code/core";
import { MESSAGE_BODY_KEYS } from "./mutations.js";

export type FieldDesc =
  | { kind: "text"; key: string; label: string; multiline?: boolean; clears?: readonly string[] }
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
    }
  | { kind: "select"; key: string; label: string; options: readonly string[]; optional?: boolean }
  | {
      kind: "ref";
      key: string;
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
  return type === ActionType.MessageParticipant || type === ActionType.GetParticipantInput;
}

/**
 * Whether that body may be absent. A MessageParticipant with no body is
 * schema-invalid; a GetParticipantInput with none is a silent menu, which the
 * action page allows (every prompt field is optional there):
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 */
export function bodyIsOptional(type: string): boolean {
  return type === ActionType.GetParticipantInput;
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
    case ActionType.DisconnectParticipant:
    case ActionType.EndFlowExecution:
    case ActionType.EndFlowModuleExecution:
    case ActionType.TransferContactToQueue:
      return [];
    default:
      // Unmodeled: GenericBlock, read-only raw JSON.
      return undefined;
  }
}
