/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The modeled Amazon Connect action types.
//
// Every fact here is transcribed from conformance/flow-language/actions.md,
// which cites a doc URL per entry. Do not add an entry without adding the
// citation there first.

import type { RefType } from "./flowdoc.js";

export const ActionType = {
  MessageParticipant: "MessageParticipant",
  GetParticipantInput: "GetParticipantInput",
  DisconnectParticipant: "DisconnectParticipant",
  CheckHoursOfOperation: "CheckHoursOfOperation",
  Compare: "Compare",
  TransferToFlow: "TransferToFlow",
  EndFlowExecution: "EndFlowExecution",
  TransferContactToQueue: "TransferContactToQueue",
  UpdateContactTargetQueue: "UpdateContactTargetQueue",
  UpdateContactAttributes: "UpdateContactAttributes",
  UpdateContactRecordingBehavior: "UpdateContactRecordingBehavior",
  InvokeFlowModule: "InvokeFlowModule",
  EndFlowModuleExecution: "EndFlowModuleExecution",
  InvokeLambdaFunction: "InvokeLambdaFunction",
} as const;

export type ModeledActionType = (typeof ActionType)[keyof typeof ActionType];

/**
 * Reference-bearing parameter fields, by action type. These are the only
 * places a `${cdref:...}` token may appear.
 */
export const REFERENCE_FIELDS: Readonly<Record<string, Readonly<Record<string, RefType>>>> = {
  [ActionType.UpdateContactTargetQueue]: { QueueId: "queue", AgentId: "queue" },
  [ActionType.CheckHoursOfOperation]: { HoursOfOperationId: "hours" },
  [ActionType.InvokeLambdaFunction]: { LambdaFunctionARN: "lambda" },
  [ActionType.InvokeFlowModule]: { FlowModuleId: "module" },
  [ActionType.TransferToFlow]: { ContactFlowId: "flow" },
  [ActionType.MessageParticipant]: { PromptId: "prompt" },
  [ActionType.GetParticipantInput]: { PromptId: "prompt" },
};

/**
 * Actions that terminate the flow. These carry an empty Transitions object and
 * have no errors at all.
 */
export const TERMINAL_ACTIONS: readonly string[] = [
  ActionType.DisconnectParticipant,
  ActionType.EndFlowExecution,
  ActionType.EndFlowModuleExecution,
];

/**
 * The catch-all error every non-terminal modeled action supports. `Compare` is
 * the exception: it fails with NoMatchingCondition instead.
 */
export const NO_MATCHING_ERROR = "NoMatchingError";
export const NO_MATCHING_CONDITION = "NoMatchingCondition";

/** The error GetParticipantInput takes when no digit arrives in time. */
export const INPUT_TIME_LIMIT_EXCEEDED = "InputTimeLimitExceeded";

/**
 * Additional error types beyond the catch-all, by action type, in the order
 * the builder emits them.
 */
export const EXTRA_ERRORS: Readonly<Record<string, readonly string[]>> = {
  [ActionType.TransferContactToQueue]: ["QueueAtCapacity"],
  // NoMatchingCondition "Must be defined only if StoreInput is False", which
  // is the only form the builder emits; the order is the admin page's example.
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
  [ActionType.GetParticipantInput]: [INPUT_TIME_LIMIT_EXCEEDED, NO_MATCHING_CONDITION],
};

// The Restrictions section of an action page names flow types in the console's
// vocabulary. These groups are that vocabulary in ConnectType terms; every
// entry in the table below is spelled with them so a restriction can be read
// straight off the page it cites.
//
//   inbound flow, contact flow -> INBOUND
//   transfer flow              -> TRANSFER
//   whisper flow               -> WHISPER (agent, customer, outbound)
//   hold flow                  -> agent and customer hold; no action allows one
//   customer queue flow        -> CUSTOMER_QUEUE
//   flow module                -> IN_MODULE
const INBOUND = ["CONTACT_FLOW"] as const;
const TRANSFER = ["AGENT_TRANSFER", "QUEUE_TRANSFER"] as const;
const WHISPER = ["CUSTOMER_WHISPER", "AGENT_WHISPER", "OUTBOUND_WHISPER"] as const;
const CUSTOMER_QUEUE = ["CUSTOMER_QUEUE"] as const;

// A module has no flow type of its own. It runs under whichever flow invokes
// it ("You can use modules across all flow types"), and AWS documents the
// consequence of an unsupported block as a runtime one, not a static ban: "If
// your module contains blocks that are not supported by the specific flow type,
// this incompatibility might lead the blocks to take the error branch."
// https://docs.aws.amazon.com/connect/latest/adminguide/contact-flow-modules.html
// So the invoking flow type, which a module document does not know, decides.
// MODULE is therefore allowed wherever the action page does not scope the
// action to modules; EndFlowModuleExecution is the only action whose page
// mentions modules at all, and it is module-only.
const IN_MODULE = ["MODULE"] as const;

/**
 * Which flow types each action is legal in, transcribed from the Restrictions
 * section of each action's doc page (the modeled set and its pages are listed
 * in conformance/flow-language/actions.md). Consumed by the
 * `action-allowed-in-flow-type` lint rule.
 *
 * An action absent from this table is unrestricted; FLOW_TYPE_UNRESTRICTED
 * names those explicitly, and actions.test.ts holds the two lists to the whole
 * modeled set so a new block cannot land with its Restrictions section unread.
 */
export const FLOW_TYPE_RESTRICTIONS: Readonly<Record<string, readonly string[]>> = {
  // "This action is supported in contact flows, transfer flows, whisper flows,
  // and customer queue flows. It is not supported in hold flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-messageparticipant.html
  [ActionType.MessageParticipant]: [
    ...INBOUND,
    ...TRANSFER,
    ...WHISPER,
    ...CUSTOMER_QUEUE,
    ...IN_MODULE,
  ],
  // "This action can be used in contact flows, transfer flows, and customer
  // queue flows but not in whisper flows or hold flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
  // The admin guide's block page also marks the outbound whisper flow as
  // supported; the action page governs here, as it does for every other row.
  // https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
  [ActionType.GetParticipantInput]: [...INBOUND, ...TRANSFER, ...CUSTOMER_QUEUE, ...IN_MODULE],
  // "This action is supported for all channels and in contact flows, transfer
  // flows, and customer queue flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-disconnectparticipant.html
  [ActionType.DisconnectParticipant]: [...INBOUND, ...TRANSFER, ...CUSTOMER_QUEUE, ...IN_MODULE],
  // "This action is available in inbound flows, transfer flows, and customer
  // queue flows. It is not available to hold flows or to whisper flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkhoursofoperation.html
  [ActionType.CheckHoursOfOperation]: [...INBOUND, ...TRANSFER, ...CUSTOMER_QUEUE, ...IN_MODULE],
  // "This action is available only in whisper flows and customer queue flows.
  // It is not available in flows, hold flows, or transfer flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-endflowexecution.html
  [ActionType.EndFlowExecution]: [...WHISPER, ...CUSTOMER_QUEUE, ...IN_MODULE],
  // "This action is available only in flow modules."
  // https://docs.aws.amazon.com/connect/latest/devguide/endflowmoduleexecution.html
  [ActionType.EndFlowModuleExecution]: [...IN_MODULE],
  // "This action is supported by all channels and only supports Inbound flow
  // types."
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-language-actions-invoke-flow-module.html
  // Modules can invoke modules ("up to five levels of nesting",
  // https://docs.aws.amazon.com/connect/latest/adminguide/contact-flow-modules.html),
  // so MODULE is allowed too; the nesting depth itself is module-depth-5's job.
  [ActionType.InvokeFlowModule]: [...INBOUND, ...IN_MODULE],
  // "This action is supported in inbound contact flows and transfer flows. It
  // is not supported in whisper flows, customer queue flows, or hold flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-transfercontacttoqueue.html
  [ActionType.TransferContactToQueue]: [...INBOUND, ...TRANSFER, ...IN_MODULE],
  // "This action is supported only in inbound contact flows and transfer flows.
  // It is not supported in whisper flows, hold flows, or customer queue flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacttargetqueue.html
  [ActionType.UpdateContactTargetQueue]: [...INBOUND, ...TRANSFER, ...IN_MODULE],
  // "This action is available in inbound flows and transfer flows. It is not
  // available to hold flows, customer queue flows, or whisper flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-transfertoflow.html
  [ActionType.TransferToFlow]: [...INBOUND, ...TRANSFER, ...IN_MODULE],
  // "This is supported only in contact flows, transfer flows, outbound
  // whispers, and customer queue flows. This is not supported in agent/customer
  // whispers or hold flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactrecordingbehavior.html
  [ActionType.UpdateContactRecordingBehavior]: [
    ...INBOUND,
    ...TRANSFER,
    "OUTBOUND_WHISPER",
    ...CUSTOMER_QUEUE,
    ...IN_MODULE,
  ],
};

/**
 * Modeled actions whose doc page states no flow-type restriction. Listed rather
 * than merely omitted from the table above so that "unrestricted" is a recorded
 * reading of the page, not a gap.
 *
 * Compare: "This action is available in every type of flow."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-compare.html
 * UpdateContactAttributes: "None. This can be used in any type of flow and any
 * channel."
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactattributes.html
 * InvokeLambdaFunction: "None. This action is supported by all channels and in
 * all types of flows."
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-invokelambdafunction.html
 */
export const FLOW_TYPE_UNRESTRICTED: readonly string[] = [
  ActionType.Compare,
  ActionType.UpdateContactAttributes,
  ActionType.InvokeLambdaFunction,
];

/** InvokeLambdaFunction.InvocationTimeLimitSeconds bounds, per the doc page. */
export const LAMBDA_TIMEOUT_MIN = 1;
export const LAMBDA_TIMEOUT_MAX = 8;

/**
 * GetParticipantInput.InputTimeLimitSeconds bounds. The action page requires
 * "a valid integer larger than zero"; the ceiling is the console's Set timeout
 * control, which accepts 1 to 180 seconds.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
 */
export const INPUT_TIMEOUT_MIN = 1;
export const INPUT_TIMEOUT_MAX = 180;

/**
 * The keys a DTMF menu branch may match: "must be static and be a single
 * character - 0-9 numeric, *, or #".
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 */
export const DTMF_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"] as const;
export type DtmfDigit = (typeof DTMF_DIGITS)[number];
