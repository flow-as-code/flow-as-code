/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The modeled Amazon Connect action types.
//
// Every fact here is transcribed from conformance/flow-language/actions.md,
// which cites a doc URL per entry. Do not add an entry without adding the
// citation there first. The machine-readable twin of that document,
// conformance/flow-language/catalog.json, carries the same facts for every
// implementation, and catalog.test.ts holds every table in this file to it:
// the tables stay here, readable and cited, and a divergence fails CI.

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
  DequeueContactAndTransferToQueue: "DequeueContactAndTransferToQueue",
  TransferContactToAgent: "TransferContactToAgent",
  UpdateContactRoutingBehavior: "UpdateContactRoutingBehavior",
  CreateCallbackContact: "CreateCallbackContact",
  UpdateContactCallbackNumber: "UpdateContactCallbackNumber",
  Loop: "Loop",
  Wait: "Wait",
  DistributeByPercentage: "DistributeByPercentage",
  UpdateFlowAttributes: "UpdateFlowAttributes",
  CheckMetricData: "CheckMetricData",
} as const;

export type ModeledActionType = (typeof ActionType)[keyof typeof ActionType];

/**
 * Reference-bearing parameter fields, by action type. These are the only
 * places a `${cdref:...}` token may appear.
 *
 * Keys are catalog paths into Parameters (see paths.ts): a top-level key for
 * every field in this table today, and `LexV2Bot.AliasArn`, `Messages[].PromptId`
 * or `EventHooks.*` for the nested, list and map positions the modeled set
 * grows into. `refPathsOf` and `readRefPath` in refs.ts read them.
 */
export const REFERENCE_FIELDS: Readonly<Record<string, Readonly<Record<string, RefType>>>> = {
  [ActionType.UpdateContactTargetQueue]: { QueueId: "queue", AgentId: "queue" },
  [ActionType.DequeueContactAndTransferToQueue]: { QueueId: "queue", AgentId: "queue" },
  [ActionType.CreateCallbackContact]: { QueueId: "queue", AgentId: "queue", ContactFlowId: "flow" },
  [ActionType.CheckMetricData]: { QueueId: "queue", AgentId: "queue" },
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
  // "Ends the current flow and transfers the customer to an agent." No
  // parameters, no results, no errors.
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-transfercontacttoagent.html
  ActionType.TransferContactToAgent,
];

/**
 * The catch-all error every non-terminal modeled action supports, except the
 * types in CONDITION_CATCH_ALL, which fail with NoMatchingCondition instead,
 * and the types in WITHOUT_CATCH_ALL, whose pages list none.
 */
export const NO_MATCHING_ERROR = "NoMatchingError";
export const NO_MATCHING_CONDITION = "NoMatchingCondition";

/**
 * Non-terminal modeled actions whose only error is NoMatchingCondition: every
 * path is a condition and that branch is the remainder.
 *
 * Compare: "NoMatchingCondition if no Condition matches."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-compare.html
 * DistributeByPercentage: "NoMatchingCondition if no Condition matches. This
 * is the default option in the flow editor."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-distributebypercentage.html
 */
export const CONDITION_CATCH_ALL: readonly string[] = [
  ActionType.Compare,
  ActionType.DistributeByPercentage,
];

/** The error GetParticipantInput takes when no digit arrives in time. */
export const INPUT_TIME_LIMIT_EXCEEDED = "InputTimeLimitExceeded";

/**
 * UpdateContactCallbackNumber's two errors, the only ones its page lists:
 * "The callback number specified was not a valid (e.164) phone number" and
 * "The callback number specified is not dialable by the instance".
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactcallbacknumber.html
 */
export const INVALID_CALLBACK_NUMBER = "InvalidCallbackNumber";
export const CALLBACK_NUMBER_NOT_DIALABLE = "CallbackNumberNotDialable";

/** Wait's second error, raised when no bot participant is on the contact. */
export const PARTICIPANT_NOT_FOUND = "ParticipantNotFound";

/**
 * Non-terminal modeled actions whose page lists no catch-all. The builder
 * wires exactly EXTRA_ERRORS for them, and every listed error is one the
 * document must wire (error-branches reads the catalog's required flags,
 * which catalog.test.ts holds to this list).
 *
 * UpdateContactRoutingBehavior: results "None", errors "None".
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactroutingbehavior.html
 * Loop: errors "None"; its results are the two fixed conditions.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-loop.html
 * UpdateFlowAttributes: errors "None"; the admin guide's block has an Error
 * branch for attributes over 32 KB with no documented error type.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateflowattributes.html
 */
export const WITHOUT_CATCH_ALL: readonly string[] = [
  ActionType.UpdateContactRoutingBehavior,
  ActionType.UpdateContactCallbackNumber,
  ActionType.Loop,
  ActionType.UpdateFlowAttributes,
];

/**
 * Additional error types beyond the catch-all, by action type, in the order
 * the builder emits them. For a type in WITHOUT_CATCH_ALL this is the whole
 * list. A list that names the catch-all itself fixes its position, for a type
 * whose page or console puts it first.
 */
export const EXTRA_ERRORS: Readonly<Record<string, readonly string[]>> = {
  [ActionType.TransferContactToQueue]: ["QueueAtCapacity"],
  // "QueueAtCapacity - if the destination queue is at capacity and the
  // contact cannot be queued within it."
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-dequeuecontactandtransfertoqueue.html
  [ActionType.DequeueContactAndTransferToQueue]: ["QueueAtCapacity"],
  // The page's order; there is no catch-all (WITHOUT_CATCH_ALL).
  [ActionType.UpdateContactCallbackNumber]: [INVALID_CALLBACK_NUMBER, CALLBACK_NUMBER_NOT_DIALABLE],
  // The page's order, catch-all first: "ParticipantNotFound - The supported
  // event currently is BotParticipantDisconnected", so the builder wires it
  // only when that event is waited for.
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html
  [ActionType.Wait]: [NO_MATCHING_ERROR, PARTICIPANT_NOT_FOUND],
  // The console's order, catch-all first, as its default queue transfer flow
  // is exported: NoMatchingCondition is the block's False or No Match
  // branch. The page limits it to the two queue metrics; the console wires
  // it for NumberOfAgentsStaffed too, and that export is the evidence.
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkmetricdata.html
  [ActionType.CheckMetricData]: [NO_MATCHING_ERROR, NO_MATCHING_CONDITION],
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
  // "This action is only supported in the customer queue flow. It is not
  // supported in any other type of flow."
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-dequeuecontactandtransfertoqueue.html
  // "Any other type of flow" is read as the flow types the page's vocabulary
  // names (inbound, transfer, whisper, hold); a module has no flow type of
  // its own, so MODULE stays, as the note above IN_MODULE explains.
  [ActionType.DequeueContactAndTransferToQueue]: [...CUSTOMER_QUEUE, ...IN_MODULE],
  // "This action is supported in only transfer to agent and transfer to queue
  // flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-transfercontacttoagent.html
  [ActionType.TransferContactToAgent]: [...TRANSFER, ...IN_MODULE],
  // "This is supported only in inbound contact flows. It is not supported in
  // transfer flows, whisper flows, customer queue flows, or hold flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactroutingbehavior.html
  // The admin guide's block page also lists customer queue and transfer
  // flows; the action page governs, as for every other row.
  // https://docs.aws.amazon.com/connect/latest/adminguide/change-routing-priority.html
  [ActionType.UpdateContactRoutingBehavior]: [...INBOUND, ...IN_MODULE],
  // "This action is supported in contact flows, transfer flows, and customer
  // queue flows. It is not supported in whisper flows or hold flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/interactions-createcallbackcontact.html
  [ActionType.CreateCallbackContact]: [...INBOUND, ...TRANSFER, ...CUSTOMER_QUEUE, ...IN_MODULE],
  // "This action is available in inbound flows, transfer flows, and customer
  // queue flows. It is not available to hold flows or to whisper flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-distributebypercentage.html
  // The admin guide's block page also lists the outbound whisper flow; the
  // action page governs.
  // https://docs.aws.amazon.com/connect/latest/adminguide/distribute-by-percentage.html
  [ActionType.DistributeByPercentage]: [...INBOUND, ...TRANSFER, ...CUSTOMER_QUEUE, ...IN_MODULE],
  // "This action is only usable in flows, queue and agent transfers, and
  // customer queue flows. It is not available in any type of whisper or hold
  // flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkmetricdata.html
  [ActionType.CheckMetricData]: [...INBOUND, ...TRANSFER, ...CUSTOMER_QUEUE, ...IN_MODULE],
  // "This is supported only in contact flows, transfer flows, and customer
  // queue flows. This is not supported in whispers or hold flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactcallbacknumber.html
  [ActionType.UpdateContactCallbackNumber]: [
    ...INBOUND,
    ...TRANSFER,
    ...CUSTOMER_QUEUE,
    ...IN_MODULE,
  ],
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
 * Loop: "This is supported in every type of flow."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-loop.html
 * Wait: "This is supported in every type of flow, but is supported only by
 * the chat channel."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html
 * UpdateFlowAttributes: "This action is supported on all channels and in all
 * flow types."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateflowattributes.html
 */
export const FLOW_TYPE_UNRESTRICTED: readonly string[] = [
  ActionType.Compare,
  ActionType.UpdateContactAttributes,
  ActionType.InvokeLambdaFunction,
  ActionType.Loop,
  ActionType.Wait,
  ActionType.UpdateFlowAttributes,
];

/**
 * UpdateContactRoutingBehavior.QueuePriority lower bound: "must be larger than
 * zero, and a valid integer value". The console caps it at 9223372036854775807
 * (a signed 64-bit integer), which a JSON number cannot carry through
 * JavaScript, so the builder takes any safe integer at or above this floor.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactroutingbehavior.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/change-routing-priority.html
 */
export const QUEUE_PRIORITY_MIN = 1;

/**
 * CreateCallbackContact bounds. InitialCallDelaySeconds and RetryDelaySeconds
 * "Must be larger than 0, no greater than 259,200 (three days), and an
 * integer"; MaximumConnectionAttempts "Must be larger than zero, and an
 * integer" with no ceiling on the page.
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-createcallbackcontact.html
 */
export const CALLBACK_DELAY_MIN = 1;
export const CALLBACK_DELAY_MAX = 259_200;
export const CALLBACK_ATTEMPTS_MIN = 1;

/**
 * Loop.LoopCount "must be between 0 and 100 (inclusive)", and its two results,
 * which are the exact conditions the page requires: "there must be a Condition
 * provided for Equals ContinueLooping and for Equals DoneLooping, and no other
 * Conditions can be specified."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-loop.html
 */
export const LOOP_COUNT_MIN = 0;
export const LOOP_COUNT_MAX = 100;
export const LOOP_CONTINUE = "ContinueLooping";
export const LOOP_DONE = "DoneLooping";

/**
 * Wait's timeout "must be a positive integer value no greater than 604800
 * (seven days)" when static. The page calls it TimeoutSeconds; the console
 * writes it as TimeLimitSeconds, a decimal string (its export of the Sample
 * disconnect flow carries "TimeLimitSeconds": "900"), and what the console
 * writes is what Connect stores, so the builder uses that key. Also the run
 * results a Wait can branch on, "WaitCompleted" always and each event in
 * Events, and the events themselves.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/sample-disconnect-flow.html
 */
export const WAIT_TIMEOUT_MIN = 1;
export const WAIT_TIMEOUT_MAX = 604_800;
export const WAIT_COMPLETED = "WaitCompleted";
export const WAIT_EVENTS = ["CustomerReturned", "BotParticipantDisconnected"] as const;
export type WaitEvent = (typeof WAIT_EVENTS)[number];

/**
 * DistributeByPercentage draws "a random number between 1 and 100
 * (inclusive)" and its conditions "must be a chain of NumericLessThan
 * comparisons, with each subsequent comparison checking the previous value,
 * plus the percentage that is desired to go down this next action, and no
 * Comparison comparing a value larger than 100". The console writes each
 * threshold as 1 plus the percentages so far (3%, 6%, 8% become 4, 10, 18 in
 * its Sample AB test flow), so the branches may claim at most 99% and the
 * NoMatchingCondition branch takes the rest.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-distributebypercentage.html
 */
export const PERCENTAGE_FLOOR = 1;
export const PERCENTAGE_THRESHOLD_MAX = 100;

/**
 * CheckMetricData.MetricType, "One of [NumberOfAgentsAvailable,
 * NumberOfAgentsStaffed, NumberOfAgentsOnline, OldestContactInQueueAgeSeconds,
 * NumberOfContactsInQueue]. Dynamic values are not supported". For the
 * NumberOfAgents* types "the only supported condition is NumberGreaterThan 0,
 * otherwise Equals and any Number* Operands are allowed".
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkmetricdata.html
 */
export const METRIC_TYPES = [
  "NumberOfAgentsAvailable",
  "NumberOfAgentsStaffed",
  "NumberOfAgentsOnline",
  "OldestContactInQueueAgeSeconds",
  "NumberOfContactsInQueue",
] as const;
export type MetricType = (typeof METRIC_TYPES)[number];
export const AGENT_METRIC_TYPES: readonly MetricType[] = [
  "NumberOfAgentsAvailable",
  "NumberOfAgentsStaffed",
  "NumberOfAgentsOnline",
];
/** The operators a metric may be compared with: Equals and the Number* four. */
export const METRIC_OPERATORS = [
  "Equals",
  "NumberGreaterThan",
  "NumberGreaterOrEqualTo",
  "NumberLessThan",
  "NumberLessOrEqualTo",
] as const;
export type MetricOperator = (typeof METRIC_OPERATORS)[number];

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
