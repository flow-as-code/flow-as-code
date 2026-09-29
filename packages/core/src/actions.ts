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
  GetMetricData: "GetMetricData",
  TagContact: "TagContact",
  UntagContact: "UntagContact",
  UpdateContactTextToSpeechVoice: "UpdateContactTextToSpeechVoice",
  UpdateContactData: "UpdateContactData",
  UpdateContactEventHooks: "UpdateContactEventHooks",
  MessageParticipantIteratively: "MessageParticipantIteratively",
  ConnectParticipantWithLexBot: "ConnectParticipantWithLexBot",
  ShowView: "ShowView",
  UpdateContactRecordingAndAnalyticsBehavior: "UpdateContactRecordingAndAnalyticsBehavior",
  UpdateFlowLoggingBehavior: "UpdateFlowLoggingBehavior",
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
  [ActionType.GetMetricData]: { QueueId: "queue", AgentId: "queue" },
  // A map-valued path: every value of EventHooks is a flow.
  [ActionType.UpdateContactEventHooks]: { "EventHooks.*": "flow" },
  [ActionType.CheckHoursOfOperation]: { HoursOfOperationId: "hours" },
  [ActionType.InvokeLambdaFunction]: { LambdaFunctionARN: "lambda" },
  [ActionType.InvokeFlowModule]: { FlowModuleId: "module" },
  [ActionType.TransferToFlow]: { ContactFlowId: "flow" },
  [ActionType.MessageParticipant]: { PromptId: "prompt" },
  [ActionType.GetParticipantInput]: { PromptId: "prompt" },
  // A list-valued path: the PromptId of every message in the loop.
  [ActionType.MessageParticipantIteratively]: { "Messages[].PromptId": "prompt" },
  // The V2 bot's alias ARN, nested; the V1 LexBot form names a bot and alias
  // by name and region, which is not what the lex reference type binds.
  [ActionType.ConnectParticipantWithLexBot]: { PromptId: "prompt", "LexV2Bot.AliasArn": "lex" },
  // The view's id, nested; its version rides in the token's alias slot.
  [ActionType.ShowView]: { "ViewResource.Id": "view" },
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
 * Compare: "NoMatchingCondition - if no other Condition matches."
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
 * ShowView's error when the view is not answered within
 * InvocationTimeLimitSeconds. Required, as the time limit is: CreateContactFlow
 * refuses a ShowView without either (checked 2026-09-15).
 */
export const TIME_LIMIT_EXCEEDED = "TimeLimitExceeded";

/**
 * UpdateContactRecordingAndAnalyticsBehavior's second required error: "if the
 * media channel that initiated the contact is not the same as the one defined
 * in the action. For screen recording, any channel other than voice, chat or
 * tasks would result in this branch being taken. Must always be defined."
 * The third, InFlightRedactionConfigurationFailed, "Must be defined if chat
 * behavior is defined in action", which the service enforces; the builder
 * writes the voice or the screen form and never the chat form, so it never
 * wires it, and the catalog's requiredWhenKey makes error-branches report it
 * on a chat-form block.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactrecordingandanalyticsbehavior.html
 */
export const CHANNEL_MISMATCH = "ChannelMismatch";
export const IN_FLIGHT_REDACTION_CONFIGURATION_FAILED = "InFlightRedactionConfigurationFailed";

/**
 * Non-terminal modeled actions whose page lists no catch-all. The builder
 * wires exactly EXTRA_ERRORS for them, and every listed error is one the
 * document must wire (error-branches reads the catalog's required flags,
 * which catalog.test.ts holds to this list).
 *
 * UpdateContactRoutingBehavior: results "None", errors "None".
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactroutingbehavior.html
 * TagContact is not here although its page says errors "None": the service
 * refuses the block without NoMatchingError ("Action is missing required
 * error. Error: NoMatchingError", CreateContactFlow, 2026-09-15), so it has
 * the ordinary required catch-all.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-tagcontact.html
 */
export const WITHOUT_CATCH_ALL: readonly string[] = [
  ActionType.UpdateContactRoutingBehavior,
  ActionType.UpdateContactCallbackNumber,
  // Errors "None."; results "None. No conditions are supported."
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateflowloggingbehavior.html
  ActionType.UpdateFlowLoggingBehavior,
  // The service refuses NoMatchingError on this action ("Invalid Action
  // error. Error: NoMatchingError") and accepts it with no error branch
  // (CreateContactFlow, 2026-09-29; conformance/flow-language/actions.md,
  // rule 37).
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactrecordingbehavior.html
  ActionType.UpdateContactRecordingBehavior,
];

/**
 * Non-terminal modeled actions whose catch-all the console may omit: the
 * builder wires it when asked and error-branches does not report its
 * absence. The evidence differs by type: the page lists it without requiring
 * it (MessageParticipantIteratively), the page lists none while the console
 * sometimes writes one (Loop), or the page requires it while the service and
 * the console's exports do not (UpdateContactTextToSpeechVoice).
 *
 * MessageParticipantIteratively: "NoMatchingError - if no other Error
 * matches", and the console's default hold and queue flows carry no error
 * branch ("Some existing flows have a version of the Loop prompts block that
 * doesn't have an Error branch").
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-messageparticipantiteratively.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/loop-prompts.html
 * Loop: the page says errors "None", but the admin guide's block has an Error
 * branch and console exports of Loop blocks published in AWS sample
 * repositories carry NoMatchingError on some and nothing on others.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-loop.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/loop.html
 * UpdateContactTextToSpeechVoice: the page says NoMatchingError "Must always
 * be defined", but CreateContactFlow accepts the block with no error branch
 * (checked 2026-09-15) and console exports published in public repositories
 * carry none on many Set voice blocks.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacttexttospeechvoice.html
 */
export const OPTIONAL_CATCH_ALL: readonly string[] = [
  // MessageParticipant: the page lists the catch-all, but CreateContactFlow
  // accepts the action without it, and a full export of Connect's default and
  // sample flows carries 59 messages with no error branch (2026-09-29;
  // conformance/flow-language/actions.md, rule 37).
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-messageparticipant.html
  ActionType.MessageParticipant,
  ActionType.MessageParticipantIteratively,
  ActionType.Loop,
  ActionType.UpdateContactTextToSpeechVoice,
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
  // event currently is \"BotParticipantDisconnected\".", so the builder wires it
  // only when that event is waited for.
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html
  [ActionType.Wait]: [NO_MATCHING_ERROR, PARTICIPANT_NOT_FOUND],
  // The order of the console's default queue transfer export, catch-all
  // first; its Sample queue configurations export writes the two the other
  // way round, so the inverter reads them by type and the builder writes this
  // order. NoMatchingCondition is the block's False or No Match branch: the
  // page limits it to the two queue metrics, the default queue transfer
  // wires it on NumberOfAgentsStaffed too.
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkmetricdata.html
  [ActionType.CheckMetricData]: [NO_MATCHING_ERROR, NO_MATCHING_CONDITION],
  // NoMatchingCondition "Must be defined only if StoreInput is False", which
  // is the only form the builder emits; the order is the admin page's example.
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
  [ActionType.GetParticipantInput]: [INPUT_TIME_LIMIT_EXCEEDED, NO_MATCHING_CONDITION],
  // The page's Action syntax block, catch-all in the middle: "InputTimeLimitExceeded:
  // if there is no response before the configured LexTimeoutSeconds",
  // "NoMatchingCondition: If no specified condition evaluated to True".
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-connectparticipantwithlexbot.html
  [ActionType.ConnectParticipantWithLexBot]: [
    INPUT_TIME_LIMIT_EXCEEDED,
    NO_MATCHING_ERROR,
    NO_MATCHING_CONDITION,
  ],
  // The order the admin guide's flow-language JSON writes, the catch-all in
  // the middle: "NoMatchingCondition - if no other Condition matches",
  // "TimeLimitExceeded - if there is no response before the configured
  // InvocationTimeLimitSeconds". The page lists the catch-all first; the
  // service accepts either order and requires all three (checked 2026-09-15).
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-showview.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/show-view-block.html
  [ActionType.ShowView]: [NO_MATCHING_CONDITION, NO_MATCHING_ERROR, TIME_LIMIT_EXCEEDED],
  // The page's order, catch-all first, both "Must always be defined"; the
  // chat form's InFlightRedactionConfigurationFailed is not written because
  // the chat form is not modeled.
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactrecordingandanalyticsbehavior.html
  [ActionType.UpdateContactRecordingAndAnalyticsBehavior]: [NO_MATCHING_ERROR, CHANNEL_MISMATCH],
};

/**
 * Extra errors a page marks "Must always be defined" on a type that also has
 * a catch-all, so error-branches reports each of them as it reports the
 * catch-all (the catalog's required flags carry it; this table holds the
 * catalog to the page). A type in WITHOUT_CATCH_ALL needs no entry: every
 * extra it lists is required.
 */
export const REQUIRED_EXTRAS: Readonly<Record<string, readonly string[]>> = {
  // "ChannelMismatch - if the media channel that initiated the contact is not
  // the same as the one defined in the action. ... Must always be defined."
  [ActionType.UpdateContactRecordingAndAnalyticsBehavior]: [CHANNEL_MISMATCH],
  // The page marks neither, but CreateContactFlow refuses the block without
  // either ("Action is missing required error", checked 2026-09-15).
  [ActionType.ShowView]: [NO_MATCHING_CONDITION, TIME_LIMIT_EXCEEDED],
  // The pages list QueueAtCapacity without saying it is required, but
  // CreateContactFlow refuses either transfer without it ("Action is missing
  // required error. Error: QueueAtCapacity", 2026-09-29; conformance/
  // flow-language/actions.md, rule 37).
  [ActionType.TransferContactToQueue]: ["QueueAtCapacity"],
  [ActionType.DequeueContactAndTransferToQueue]: ["QueueAtCapacity"],
  // The page limits NoMatchingCondition to two of the metrics, but
  // CreateContactFlow refuses the block without it whatever the metric
  // (2026-09-29, rule 37).
  [ActionType.CheckMetricData]: [NO_MATCHING_CONDITION],
};

// The Restrictions section of an action page names flow types in the console's
// vocabulary. These groups are that vocabulary in ConnectType terms; every
// entry in the table below is spelled with them so a restriction can be read
// straight off the page it cites.
//
//   inbound flow, contact flow -> INBOUND
//   transfer flow              -> TRANSFER
//   whisper flow               -> WHISPER (agent, customer, outbound)
//   hold flow                  -> HOLD (agent and customer hold)
//   customer queue flow        -> CUSTOMER_QUEUE
//   flow module                -> IN_MODULE
const INBOUND = ["CONTACT_FLOW"] as const;
const TRANSFER = ["AGENT_TRANSFER", "QUEUE_TRANSFER"] as const;
const WHISPER = ["CUSTOMER_WHISPER", "AGENT_WHISPER", "OUTBOUND_WHISPER"] as const;
const CUSTOMER_QUEUE = ["CUSTOMER_QUEUE"] as const;
const HOLD = ["CUSTOMER_HOLD", "AGENT_HOLD"] as const;

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
  // "This action is supported in Customer Queue, Customer Hold, and Agent
  // Hold flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-messageparticipantiteratively.html
  [ActionType.MessageParticipantIteratively]: [...CUSTOMER_QUEUE, ...HOLD, ...IN_MODULE],
  // "This action is available only in contact flows, transfer flows, and
  // customer queue flows. It is not available in whisper flows or hold flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-connectparticipantwithlexbot.html
  // The admin guide's block page also marks the outbound whisper flow; the
  // action page governs.
  [ActionType.ConnectParticipantWithLexBot]: [
    ...INBOUND,
    ...TRANSFER,
    ...CUSTOMER_QUEUE,
    ...IN_MODULE,
  ],
  // "This action can be used in inbound flows and customer queue flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-showview.html
  // The same page's UI section says inbound only and the admin guide lists
  // inbound alone; the Restrictions section governs, as for every other row.
  [ActionType.ShowView]: [...INBOUND, ...CUSTOMER_QUEUE, ...IN_MODULE],
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
 * GetMetricData: "This action is available in every type of flow."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-getmetricdata.html
 * TagContact: "None. This can be used in any type of flow and any channel."
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-tagcontact.html
 * UntagContact: "This action can be used in flows of all types."
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-untagcontact.html
 * UpdateContactTextToSpeechVoice: "None. This action is supported in all flow
 * types, and across all channels."
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacttexttospeechvoice.html
 * UpdateContactData: "This action is supported on all channels and in all
 * flow types."
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactdata.html
 * UpdateContactEventHooks: "This is supported in all types of flows."
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacteventhooks.html
 */
export const FLOW_TYPE_UNRESTRICTED: readonly string[] = [
  ActionType.Compare,
  ActionType.UpdateContactAttributes,
  ActionType.InvokeLambdaFunction,
  ActionType.Loop,
  ActionType.Wait,
  ActionType.UpdateFlowAttributes,
  ActionType.GetMetricData,
  ActionType.TagContact,
  ActionType.UntagContact,
  ActionType.UpdateContactTextToSpeechVoice,
  ActionType.UpdateContactData,
  ActionType.UpdateContactEventHooks,
  // No Restrictions section on the page; the admin guide's block "is
  // supported for all flow types except journey flows", which have no
  // ConnectType, and it only recommends a whisper flow for the recording
  // portion.
  // https://docs.aws.amazon.com/connect/latest/adminguide/set-recording-analytics-processing-behavior.html
  ActionType.UpdateContactRecordingAndAnalyticsBehavior,
  // "This action is available in every type of flow."
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateflowloggingbehavior.html
  ActionType.UpdateFlowLoggingBehavior,
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
 * Loop.LoopCount "must be between 0 and 100 (inclusive)", written as a decimal
 * string: the page shows no encoding, and the console spells every integer
 * parameter that way in each of its exported sample flows and in every
 * published console export of a Loop block. Also its two results,
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
 * https://docs.aws.amazon.com/connect/latest/adminguide/sample-disconnect.html
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
 * NumberOfContactsInQueue]. **Dynamic values are not supported**" (the
 * asterisks are the page's own). For the NumberOfAgents* types "the only
 * supported condition is \"NumberGreaterThan 0\", otherwise Equals and any
 * Number* Operands are allowed". OldestContactInQueueAgeSeconds is compared
 * in milliseconds on the wire: the console's Sample queue configurations
 * export writes a 300 second entry as the operand "300000".
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkmetricdata.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/sample-queue-configurations.html
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

/**
 * GetMetricData.QueueChannel: "Either "Voice" or "Chat". Can be set
 * dynamically. Determines the channel for which metrics are returned. If not
 * specified, metrics are returned for all channels."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-getmetricdata.html
 */
export const QUEUE_CHANNELS = ["Voice", "Chat"] as const;
export type QueueChannel = (typeof QUEUE_CHANNELS)[number];

/**
 * TagContact: "You can create up to 6 user-defined tags", and "A system tag is
 * prefixed with aws:. You cannot change it."
 * https://docs.aws.amazon.com/connect/latest/adminguide/contact-tags-block.html
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-tagcontact.html
 */
export const TAG_LIMIT = 6;
export const SYSTEM_TAG_PREFIX = "aws:";

/**
 * UpdateContactTextToSpeechVoice engines and styles. The action page names
 * the styles ("None, Coversational, or Newscaster", its own spelling; the
 * admin guide spells Conversational) and only describes the engine; the
 * admin guide's prose names standard, neural and generative in lower case,
 * and the console writes the engine capitalised ("Neural", "Generative") in
 * every published export of the block, which is the spelling recorded here.
 * The service validates none of it at CreateContactFlow (it accepts "neural",
 * "Neural" and an invented "Turbo" alike, checked 2026-09-15), so the list is
 * the console's vocabulary, not the wire's. Each "May be defined statically
 * or dynamically".
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacttexttospeechvoice.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-voice.html
 */
export const TTS_ENGINES = ["Standard", "Neural", "Generative"] as const;
export type TtsEngine = (typeof TTS_ENGINES)[number];
export const TTS_STYLES = ["None", "Conversational", "Newscaster"] as const;
export type TtsStyle = (typeof TTS_STYLES)[number];

/**
 * UpdateContactData's Voice ID settings, each "It is a string": the three
 * flags take "TRUE" and "FALSE" ("the only valid values"), the two thresholds
 * "must be between 0 and 100", and the response time "must be between 5 and
 * 10". TargetContact is "Current" or "Related", "the only valid values".
 * AWS ended support for Voice ID on May 20, 2026; the fields are modeled as
 * the action page still documents them (actions.md rule 30).
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactdata.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-voice-id.html
 */
export const CONTACT_DATA_FLAGS = ["TRUE", "FALSE"] as const;
export const VOICE_ID_THRESHOLD_MIN = 0;
export const VOICE_ID_THRESHOLD_MAX = 100;
export const VOICE_ID_RESPONSE_TIME_MIN = 5;
export const VOICE_ID_RESPONSE_TIME_MAX = 10;
export const TARGET_CONTACTS = ["Current", "Related"] as const;
export type TargetContact = (typeof TARGET_CONTACTS)[number];

/**
 * UpdateContactEventHooks: "The following event hooks are valid:" and then
 * the page's list of ten names, AgentHold to ResumeContact, in this order.
 * "Only one entry may be present in this map." (the block class writes one;
 * CreateContactFlow itself accepts two, and an empty map, checked
 * 2026-09-15).
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacteventhooks.html
 */
export const EVENT_HOOKS = [
  "AgentHold",
  "AgentWhisper",
  "CustomerHold",
  "CustomerQueue",
  "CustomerRemaining",
  "CustomerWhisper",
  "DefaultAgentUI",
  "DisconnectAgentUI",
  "PauseContact",
  "ResumeContact",
] as const;
export type EventHook = (typeof EVENT_HOOKS)[number];

/**
 * MessageParticipantIteratively's one run result: "When the timeout elapses,
 * the action completes with the result as "MessagesInterrupted"."
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-messageparticipantiteratively.html
 */
export const MESSAGES_INTERRUPTED = "MessagesInterrupted";

/**
 * ConnectParticipantWithLexBot.LexTimeoutSeconds.Text, "the length of Lex
 * timer in second", bounded by the console's Chat timeout field: "Minimum: 1
 * minute Maximum: 7 days".
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-connectparticipantwithlexbot.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
 */
/**
 * GetParticipantInput.DTMFConfiguration.InterdigitTimeLimitSeconds "must be
 * a valid integer between 1 and 20". The builder does not model the stored-
 * input form this belongs to; the bound is the catalog's, held here so the
 * catalog test reaches it.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 */
export const INTERDIGIT_TIMEOUT_MIN = 1;
export const INTERDIGIT_TIMEOUT_MAX = 20;

export const LEX_TIMEOUT_MIN = 60;
export const LEX_TIMEOUT_MAX = 604_800;

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
