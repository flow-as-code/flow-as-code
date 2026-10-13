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

import type { Channel } from "./catalog.js";
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
  ResumeContact: "ResumeContact",
  UpdatePreviousContactParticipantState: "UpdatePreviousContactParticipantState",
  UpdateContactMediaStreamingBehavior: "UpdateContactMediaStreamingBehavior",
  UpdateContactMediaProcessing: "UpdateContactMediaProcessing",
  CreateTask: "CreateTask",
  CreateWisdomSession: "CreateWisdomSession",
  AssociateContactToCustomerProfile: "AssociateContactToCustomerProfile",
  CreateCustomerProfile: "CreateCustomerProfile",
  UpdateCustomerProfile: "UpdateCustomerProfile",
  GetCustomerProfile: "GetCustomerProfile",
  GetCustomerProfileObject: "GetCustomerProfileObject",
  GetCalculatedAttributesForCustomerProfile: "GetCalculatedAttributesForCustomerProfile",
  CreateCase: "CreateCase",
  GetCase: "GetCase",
  UpdateCase: "UpdateCase",
  UpdateContactRoutingCriteria: "UpdateContactRoutingCriteria",
  CheckOutboundCallStatus: "CheckOutboundCallStatus",
  CompleteOutboundCall: "CompleteOutboundCall",
  StartOutboundChatContact: "StartOutboundChatContact",
  LoadContactContent: "LoadContactContent",
  TransferParticipantToThirdParty: "TransferParticipantToThirdParty",
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
  // The chat message processor, nested; "Must be set statically", so a
  // token and never a JSONPath.
  [ActionType.UpdateContactMediaProcessing]: { "ChatProcessor.LambdaProcessorARN": "lambda" },
  // The flow the task runs ("Must be fully static or a single valid
  // JSONPath identifier") and its template ("This must be defined
  // statically", so a token and never a JSONPath).
  [ActionType.CreateTask]: { ContactFlowId: "flow", TaskTemplateId: "tasktemplate" },
  // The AI agents assistant ("May be specified statically or dynamically").
  [ActionType.CreateWisdomSession]: { WisdomAssistantArn: "assistant" },
  // The case template, and every key of CaseRequestFields: a Cases field id
  // is per domain, so a domain's own field is a casefield reference standing
  // as the whole key (docs/adr/0008-case-field-ids.md). A system field id
  // (CASE_SYSTEM_FIELDS) is the same on every domain and stays literal.
  [ActionType.CreateCase]: { CaseTemplateId: "casetemplate", "CaseRequestFields.*~": "casefield" },
  // The search fields' keys, as CreateCase's, and every item of the list
  // of fields stored in the case namespace.
  [ActionType.GetCase]: {
    "CaseRequestFields.*~": "casefield",
    "CaseResponseFields[]": "casefield",
  },
  // The keys of the fields to update, as CreateCase's.
  [ActionType.UpdateCase]: { "CaseRequestFields.*~": "casefield" },
  // The number the SMS is sent from ("ConnectPhoneNumberArn of the
  // SourceEndpoint"), nested, and the flow that runs the new chat
  // ("ContactFlowArn of the flow to be executed for the new outbound
  // chat"); the admin guide's Send message block sets each manually or
  // dynamically, so a token or a JSONPath.
  [ActionType.StartOutboundChatContact]: {
    "SourceEndpoint.Address": "phonenumber",
    ContactFlowArn: "flow",
  },
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
 * GetParticipantInput's stored-input error: "the stored input was not a valid
 * phone number according to the specified PhoneNumberValidation. Must be
 * defined only if StoreInput is true, and PhoneNumberValidation is
 * specified."
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 */
export const INVALID_PHONE_NUMBER = "InvalidPhoneNumber";

/**
 * The branches each form of GetParticipantInput wires, in the order the
 * block class writes them. The menu form (StoreInput "False") takes the
 * admin page's example order. The stored form (StoreInput "True") wires the
 * catch-all alone when the digits are validated by length, which is the
 * shape of the service's own "Sample secure input" flows (actions.md, rule
 * 39), and InvalidPhoneNumber before it when they are validated as a phone
 * number; that order is the console's convention of the catch-all last, as
 * on TransferContactToQueue, not a shape read from an export.
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
 */
export const INPUT_MENU_ERRORS: readonly string[] = [
  INPUT_TIME_LIMIT_EXCEEDED,
  NO_MATCHING_CONDITION,
  NO_MATCHING_ERROR,
];
export const INPUT_STORED_ERRORS: readonly string[] = [INVALID_PHONE_NUMBER, NO_MATCHING_ERROR];

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
 * The Customer Profiles lookups' branches: "MultipleFoundError - if
 * multiple profiles were found for the associated profile search key." and
 * "NoneFoundError - if no profiles were found for the associated profile
 * search key."
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofile.html
 */
export const MULTIPLE_FOUND_ERROR = "MultipleFoundError";
export const NONE_FOUND_ERROR = "NoneFoundError";

/**
 * The Cases actions' linking branch: "ContactNotLinked - If you specify to
 * link the contact to case, then this error branch will appear. It might be
 * that the contact was not linked after the case is retrieved (partial
 * success/partial failure)." The catalog marks it required when and only
 * when `LinkContactToCase` is `"true"` (its `requiredWhenValue`), and the
 * builder wires it on exactly those blocks.
 * https://docs.aws.amazon.com/connect/latest/devguide/createcase.html
 */
export const CONTACT_NOT_LINKED = "ContactNotLinked";

/**
 * GetCase's lookups: "MultipleFound - Multiple cases are found with the
 * search criteria." and "NoneFound - No cases are found with the search
 * criteria.", spelled without the Customer Profiles lookups' `Error`
 * suffix, as the page and every published flow write them (rule 44).
 * https://docs.aws.amazon.com/connect/latest/devguide/getcase.html
 */
export const CASE_MULTIPLE_FOUND = "MultipleFound";
export const CASE_NONE_FOUND = "NoneFound";

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

/**
 * TransferParticipantToThirdParty's two errors besides the catch-all, the
 * console's Call failed and Timeout branches, spelled as the kept export
 * writes them (conformance/flow-language/exports/).
 */
export const CALL_FAILED = "CallFailed";
export const CONNECTION_TIME_LIMIT_EXCEEDED = "ConnectionTimeLimitExceeded";
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
  // Errors "None."; the admin guide's Call phone number block: "There is no
  // error branch for the block. If a call is not successfully initiated,
  // the flow ends and the agent is placed in an AfterContactWork (ACW)."
  // Every published export of the block carries no error (actions.md, rule
  // 46). Rule 37 found the service refusing NoMatchingError on
  // UpdateContactRecordingBehavior, whose page also says "None";
  // complete-with-catch-all puts the same question to this type.
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-completeoutboundcall.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/call-phone-number.html
  ActionType.CompleteOutboundCall,
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
  // The union of both forms' branches, in each form's order with the
  // catch-all last (INPUT_MENU_ERRORS and INPUT_STORED_ERRORS): the first two
  // belong to the menu form ("NoMatchingCondition: Must be defined only if
  // StoreInput is False"), InvalidPhoneNumber to the stored form with a
  // PhoneNumberValidation. No one block wires all three.
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
  [ActionType.GetParticipantInput]: [
    INPUT_TIME_LIMIT_EXCEEDED,
    NO_MATCHING_CONDITION,
    INVALID_PHONE_NUMBER,
  ],
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
  // The page's order, catch-all first: "NoMatchingError - if no other Error
  // matches. Must always be defined." and "ChannelMismatch - if the media
  // channel that initiated the contact is not the same as the one defined
  // in the action. As of now, only chat is supported in this action." Only
  // the catch-all is marked required on the page, but the service refuses
  // the action without ChannelMismatch too (rule 41, 2026-10-13), so it is
  // in REQUIRED_EXTRAS, as it is on the recording action.
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediaprocessing.html
  [ActionType.UpdateContactMediaProcessing]: [NO_MATCHING_ERROR, CHANNEL_MISMATCH],
  // The order every published flow writes (actions.md, rule 43), the
  // catch-all first; the page lists the two lookups' errors first. The page
  // marks none "Must always be defined", but the service requires all three
  // (rule 43), so both lookups are in REQUIRED_EXTRAS. The published flows
  // wire all three.
  // https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofile.html
  [ActionType.GetCustomerProfile]: [NO_MATCHING_ERROR, MULTIPLE_FOUND_ERROR, NONE_FOUND_ERROR],
  // Catch-all first, as GetCustomerProfile's are written; no published flow
  // carries the type. The service requires both (rule 43).
  // https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofileobject.html
  [ActionType.GetCustomerProfileObject]: [NO_MATCHING_ERROR, NONE_FOUND_ERROR],
  // Catch-all first, the order of the one published flow that carries the
  // type (actions.md, rule 43); the service requires both.
  // https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcalculatedattributesforcustomerprofile.html
  [ActionType.GetCalculatedAttributesForCustomerProfile]: [NO_MATCHING_ERROR, NONE_FOUND_ERROR],
  // The order of the console's export and of every published flow
  // (actions.md, rule 44): ContactNotLinked first, the catch-all last. The
  // builder wires ContactNotLinked only on a linking block (builderErrorsFor
  // reads the catalog's requiredWhenValue), and only the catch-all is
  // always required.
  // https://docs.aws.amazon.com/connect/latest/devguide/createcase.html
  [ActionType.CreateCase]: [CONTACT_NOT_LINKED, NO_MATCHING_ERROR],
  // ContactNotLinked, the two lookups and the catch-all last, the order of
  // every published flow (rule 44); the page lists the catch-all first.
  // The page marks neither lookup "Must always be defined", but the service
  // requires both (rule 44, 2026-10-13), as it does the Customer Profiles
  // lookups (rule 43); every published flow wires both.
  // https://docs.aws.amazon.com/connect/latest/devguide/getcase.html
  [ActionType.GetCase]: [
    CONTACT_NOT_LINKED,
    CASE_MULTIPLE_FOUND,
    CASE_NONE_FOUND,
    NO_MATCHING_ERROR,
  ],
  // As CreateCase's: the order of every published flow (rule 44).
  // https://docs.aws.amazon.com/connect/latest/devguide/updatecase.html
  [ActionType.UpdateCase]: [CONTACT_NOT_LINKED, NO_MATCHING_ERROR],
  // The kept export's order, catch-all last. No page documents the action.
  // With ContinueFlowExecution "True" the service requires all three (the
  // catalog's shape); with "False" only the catch-all is required, which a
  // cookbook comment says is all that form takes and rule 47's probes
  // settle, and the builder writes the other two only when wired.
  // https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-phone-number.html
  [ActionType.TransferParticipantToThirdParty]: [
    CALL_FAILED,
    CONNECTION_TIME_LIMIT_EXCEEDED,
    NO_MATCHING_ERROR,
  ],
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
  // The page marks only the catch-all "Must always be defined", but
  // CreateContactFlow refuses the action without ChannelMismatch ("Action is
  // missing required error. Error: ChannelMismatch", us-west-2, 2026-10-13;
  // actions.md, rule 41).
  [ActionType.UpdateContactMediaProcessing]: [CHANNEL_MISMATCH],
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
  // The Customer Profiles lookups' pages mark neither lookup error "Must
  // always be defined", but CreateContactFlow refuses each type without
  // them ("Action is missing required error. Error: MultipleFoundError",
  // and the same for NoneFoundError, us-west-2, 2026-10-13; actions.md,
  // rule 43).
  [ActionType.GetCustomerProfile]: [MULTIPLE_FOUND_ERROR, NONE_FOUND_ERROR],
  [ActionType.GetCustomerProfileObject]: [NONE_FOUND_ERROR],
  [ActionType.GetCalculatedAttributesForCustomerProfile]: [NONE_FOUND_ERROR],
  // GetCase's page does not mark its lookups "Must always be defined"
  // either, and CreateContactFlow refuses it without them ("Action is
  // missing required error. Error: MultipleFound", and NoneFound,
  // us-west-2, 2026-10-13; actions.md, rule 44).
  [ActionType.GetCase]: [CASE_MULTIPLE_FOUND, CASE_NONE_FOUND],
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
  // "This action is supported only in inbound contact flows and transfer
  // flows."
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatepreviouscontactparticipantstate.html
  // The admin guide's Hold customer or agent block also lists the outbound
  // whisper flow; the service refuses it there ("not supported in contact
  // flow type outboundWhisper", 2026-10-13, rule 41), so the action page is
  // right.
  // https://docs.aws.amazon.com/connect/latest/adminguide/hold-customer-agent.html
  [ActionType.UpdatePreviousContactParticipantState]: [...INBOUND, ...TRANSFER, ...IN_MODULE],
  // "This is supported in contact flows, customer queue flows, transfer
  // flows, and whisper flows. It is not supported in hold flows." The Start
  // and Stop media streaming blocks list the same seven flow types. Neither
  // page names a module, which the note above IN_MODULE allows; rule 41's
  // probe puts a module and a hold flow to the service.
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediastreamingbehavior.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/start-media-streaming.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/stop-media-streaming.html
  [ActionType.UpdateContactMediaStreamingBehavior]: [
    ...INBOUND,
    ...CUSTOMER_QUEUE,
    ...TRANSFER,
    ...WHISPER,
    ...IN_MODULE,
  ], // "This action is supported on all channels and in only in Inbound flow,
  // Customer Queue flow, Transfer to Agent flow, and Transfer to Queue flow
  // types." The admin guide's Set routing criteria block lists the same four.
  // Neither page names a module, which the note above IN_MODULE allows;
  // rule 45's probes put a module and a whisper flow to the service.
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateroutingcriteria.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/set-routing-criteria.html
  [ActionType.UpdateContactRoutingCriteria]: [
    ...INBOUND,
    ...CUSTOMER_QUEUE,
    ...TRANSFER,
    ...IN_MODULE,
  ],
  // The action page's Restrictions name no flow type: "This action can be
  // used only when the contact is in the process of making an outbound
  // call, but has not yet called the outbound number." The admin guide's
  // Call phone number block: "Use this block to set the caller ID number
  // for an outbound call in an Outbound Whisper flow", and its flow types
  // list that one alone. The service agrees, and goes further than the note
  // above IN_MODULE: it refused the action in every other flow type and in
  // a module ("Action with identifier probe is not supported in a flow
  // module", us-west-2, 2026-10-13; actions.md, rule 46), so the
  // restriction is the service's and no module is allowed.
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-completeoutboundcall.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/call-phone-number.html
  [ActionType.CompleteOutboundCall]: ["OUTBOUND_WHISPER"],
  // No page documents the action. The Transfer to phone number block, which
  // the console writes as it, lists inbound, customer queue, transfer to
  // agent and transfer to queue flows; a module by the note above
  // IN_MODULE. Rule 47's probes put each, and a customer whisper and a
  // customer hold flow, to the service.
  // https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-phone-number.html
  [ActionType.TransferParticipantToThirdParty]: [
    ...INBOUND,
    ...CUSTOMER_QUEUE,
    ...TRANSFER,
    ...IN_MODULE,
  ],
};

/**
 * Which channels an action is restricted to, where its page names any. The
 * catalog's `channels` is the same fact, and catalog.test.ts holds the two
 * together. Consumed by the `channel-restricted-action` lint rule, which
 * warns rather than errors: a flow's channel is decided by the contact that
 * reaches it, not by the document, and FlowDoc does not record it.
 *
 * An action absent from this table has no channel restriction recorded: the
 * modeled pages were read for conformance/flow-language/actions.md, these
 * are the ones that name a channel, and where another page mentions channels
 * at all it says "all channels" (quoted beside FLOW_TYPE_UNRESTRICTED and in
 * FLOW_TYPE_RESTRICTIONS above).
 */
export const CHANNEL_RESTRICTIONS: Readonly<Record<string, readonly Channel[]>> = {
  // "This is supported in every type of flow, but is supported only by the
  // chat channel."
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html
  [ActionType.Wait]: ["CHAT"],
  // "This action is only supported on the chat channel."
  // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-showview.html
  [ActionType.ShowView]: ["CHAT"],
  // The action page has no channel restriction ("None. This action can be
  // used everywhere."); the Resume contact block's channel table does: task
  // "Yes", voice, chat and email "No - Error branch". The block resumes a
  // paused task, which no other channel can be, so the admin guide's table
  // is recorded (actions.md, rule 41).
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactresumecontact.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/resume-contact.html
  [ActionType.ResumeContact]: ["TASK"],
  // "One of ["AgentOnHold", "CustomerOnHold", "OffHold"], which are only
  // supported for voice contacts." The admin guide's Hold customer or agent
  // block agrees: voice "Yes", chat, task and email "No - Error branch".
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatepreviouscontactparticipantstate.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/hold-customer-agent.html
  [ActionType.UpdatePreviousContactParticipantState]: ["VOICE"],
  // "This is supported only by the voice channel." The Start and Stop media
  // streaming blocks agree: voice "Yes", chat, task and email "No - Error
  // branch".
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediastreamingbehavior.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/start-media-streaming.html
  [ActionType.UpdateContactMediaStreamingBehavior]: ["VOICE"],
  // The page has no Restrictions section, but its ChannelMismatch error
  // says "As of now, only chat is supported in this action", and the admin
  // guide's Set message processor action is "Yes" for chat alone.
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediaprocessing.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/set-recording-analytics-processing-behavior.html
  [ActionType.UpdateContactMediaProcessing]: ["CHAT"],
  // "This action is only supported on the voice channel." The admin guide's
  // Connect assistant block reads voice, chat, task and email "Yes", and
  // says conversational analytics "is not required to use AI agents with
  // chats"; the action page governs here as everywhere else, and rule 42
  // records the disagreement.
  // https://docs.aws.amazon.com/connect/latest/devguide/createwisdomsession.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/connect-assistant-block.html
  [ActionType.CreateWisdomSession]: ["VOICE"],
  // The action page names no channel ("This action works with Connect
  // Customer outbound campaigns only"); the admin guide's Check call progress
  // block does: voice "Yes", chat, task and email "No - Error branch". It
  // reads an answering machine's result on a placed call, which no other
  // channel has, so the admin guide's table is recorded, as for
  // ResumeContact (actions.md, rule 46).
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkoutboundcallstatus.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/check-call-progress.html
  [ActionType.CheckOutboundCallStatus]: ["VOICE"],
  // The action page names no channel; the admin guide's Call phone number
  // block: voice "Yes", chat, task and email "No". It places a call.
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-completeoutboundcall.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/call-phone-number.html
  [ActionType.CompleteOutboundCall]: ["VOICE"],
  // The Get stored content block's channel table: voice, chat and task
  // "No", email "Yes". The one content type it loads is an email message
  // body. The admin guide is the only page (actions.md, rule 47).
  // https://docs.aws.amazon.com/connect/latest/adminguide/get-stored-content.html
  [ActionType.LoadContactContent]: ["EMAIL"],
  // The Transfer to phone number block's channel table: voice "Yes", chat,
  // task and email "No - Error branch". No page documents the action.
  // https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-phone-number.html
  [ActionType.TransferParticipantToThirdParty]: ["VOICE"],
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
  // No Restrictions section on the page; the admin guide's block "is
  // supported for all flow types except journey flows", which have no
  // ConnectType.
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediaprocessing.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/set-recording-analytics-processing-behavior.html
  ActionType.UpdateContactMediaProcessing,
  // "None. This action can be used everywhere."; the admin guide: "You can
  // use this block on all flow types."
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactresumecontact.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/resume-contact.html
  ActionType.ResumeContact,
  // "This action is supported on all channels and in all contact flow
  // types."; the admin guide's Create task block: "All flows".
  // https://docs.aws.amazon.com/connect/latest/devguide/createtask.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/create-task-block.html
  ActionType.CreateTask,
  // "This action can be used in all contact flow types." The admin guide's
  // Connect assistant block lists five (inbound, customer queue, outbound
  // whisper, transfer to agent, transfer to queue); the action page
  // governs, and the service accepted it in every flow type rule 42's
  // probes put to it, holds, whispers and a module among them (2026-10-13).
  // https://docs.aws.amazon.com/connect/latest/devguide/createwisdomsession.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/connect-assistant-block.html
  ActionType.CreateWisdomSession,
  // The Customer Profiles actions' pages have no Restrictions section; the
  // admin guide's Customer profiles block: "All flow types", and voice,
  // chat, task and email each "Yes".
  // https://docs.aws.amazon.com/connect/latest/devguide/interactions-associatecontacttocustomerprofile.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
  ActionType.AssociateContactToCustomerProfile,
  // https://docs.aws.amazon.com/connect/latest/devguide/interactions-createcustomerprofile.html
  ActionType.CreateCustomerProfile,
  // https://docs.aws.amazon.com/connect/latest/devguide/interactions-updatecustomerprofile.html
  ActionType.UpdateCustomerProfile,
  // https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofile.html
  ActionType.GetCustomerProfile,
  // https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofileobject.html
  ActionType.GetCustomerProfileObject,
  // https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcalculatedattributesforcustomerprofile.html
  ActionType.GetCalculatedAttributesForCustomerProfile,
  // The Cases actions' pages: "None. This can be used in any type of flow
  // and any channel."; the admin guide's Cases block: "All flows", and
  // voice, chat, task and email each "Yes".
  // https://docs.aws.amazon.com/connect/latest/devguide/createcase.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html
  ActionType.CreateCase,
  // https://docs.aws.amazon.com/connect/latest/devguide/getcase.html
  ActionType.GetCase,
  // https://docs.aws.amazon.com/connect/latest/devguide/updatecase.html
  ActionType.UpdateCase,
  // The action page's Restrictions name no flow type ("This action works with
  // Connect Customer outbound campaigns only"); the admin guide's Check call
  // progress block: "All flow types", with the note that it "functions only
  // for the call types listed" (outbound campaigns and customer-first
  // callbacks). The service accepted it in every flow type probed, a
  // module among them, on an instance without outbound campaigns (rule 46,
  // 2026-10-13).
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkoutboundcallstatus.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/check-call-progress.html
  ActionType.CheckOutboundCallStatus,
  // The action page's Restrictions are about the new contact ("only
  // supports connect:SMS as the ContactSubtype", and the two endpoint
  // types), not the flow type; the admin guide's Send message block lists
  // every flow type with "Yes" (inbound, customer queue, customer hold,
  // customer whisper, outbound whisper, agent hold, agent whisper, transfer
  // to agent, transfer to queue, disconnect) and voice, chat, task and
  // email each "Yes". The service accepted it in every flow type probed
  // (rule 46, 2026-10-13).
  // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-startoutboundchatcontact.html
  // https://docs.aws.amazon.com/connect/latest/adminguide/send-message.html
  ActionType.StartOutboundChatContact,
  // No Developer Guide page. The Get stored content block lists inbound,
  // customer queue, customer hold, customer whisper, outbound whisper, agent
  // hold, agent whisper, transfer to agent, transfer to queue and disconnect
  // flows: every FlowDoc connectType (a disconnect flow is a CONTACT_FLOW),
  // and a module by the note above IN_MODULE. Only a campaign flow, which
  // FlowDoc does not model, is not named. Rule 47's probes put a customer
  // hold flow and a module to the service.
  // https://docs.aws.amazon.com/connect/latest/adminguide/get-stored-content.html
  ActionType.LoadContactContent,
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
 * CreateTask.DelaySeconds, "Time in seconds after which the task should be
 * created ... The integer value between 1 and 518400 (6 days)."
 * https://docs.aws.amazon.com/connect/latest/devguide/createtask.html
 */
export const TASK_DELAY_MIN = 1;
export const TASK_DELAY_MAX = 518_400;

/**
 * The profile fields the Customer Profiles pages list, in their order: the
 * keys `CreateCustomerProfile` and `UpdateCustomerProfile` take in
 * `ProfileRequestData`, and the names those two and `GetCustomerProfile`
 * store from `ProfileResponseData` under `$.Customer`. Beside them the pages
 * list `"Attributes.x"`, a custom attribute, which PROFILE_FIELD_PATTERNS
 * spells as a key pattern (a name holding no further dot). The service
 * refuses that key in ProfileRequestData ("Invalid Action property name",
 * 2026-10-13, actions.md, rule 43), so the pattern applies to the response
 * names only. The catalog's `keys` and `keyPatterns` on those parameters
 * are held to these two.
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-createcustomerprofile.html
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-updatecustomerprofile.html
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofile.html
 */
export const PROFILE_FIELDS = [
  "FirstName",
  "MiddleName",
  "LastName",
  "PhoneNumber",
  "EmailAddress",
  "AccountNumber",
  "AdditionalInformation",
  "PartyType",
  "BusinessName",
  "BirthDate",
  "Gender",
  "MobilePhoneNumber",
  "HomePhoneNumber",
  "BusinessPhoneNumber",
  "BusinessEmailAddress",
  "Address1",
  "Address2",
  "Address3",
  "Address4",
  "City",
  "County",
  "Country",
  "PostalCode",
  "Province",
  "State",
  "ShippingAddress1",
  "ShippingAddress2",
  "ShippingAddress3",
  "ShippingAddress4",
  "ShippingCity",
  "ShippingCounty",
  "ShippingCountry",
  "ShippingPostalCode",
  "ShippingProvince",
  "ShippingState",
  "MailingAddress1",
  "MailingAddress2",
  "MailingAddress3",
  "MailingAddress4",
  "MailingCity",
  "MailingCounty",
  "MailingCountry",
  "MailingPostalCode",
  "MailingProvince",
  "MailingState",
  "BillingAddress1",
  "BillingAddress2",
  "BillingAddress3",
  "BillingAddress4",
  "BillingCity",
  "BillingCounty",
  "BillingCountry",
  "BillingPostalCode",
  "BillingProvince",
  "BillingState",
] as const;
export const PROFILE_FIELD_PATTERNS: readonly string[] = ["^Attributes\\.[^.]+$"];

/**
 * GetCustomerProfile's SearchCriteria: "Retrieve a customer profile based
 * any search identifier, up to five total", joined by a LogicalOperator "AND
 * or OR" ("Required when using SearchCriteria").
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofile.html
 */
/**
 * The names GetCustomerProfileObject stores from ProfileResponseData, in the
 * page's order: the standard Asset, Order and Case object fields, beside
 * "AssetAttributes.x", "OrderAttributes.x", "CaseAttributes.x" and
 * "ObjectAttributes.x", which PROFILE_OBJECT_FIELD_PATTERNS spells. "Asset
 * ID, if a single asset is found, is always persisted under the Customer ->
 * Asset -> AssetID attribute + $.Customer.Asset.AssetId", and likewise the
 * order and case ids.
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofileobject.html
 */
export const PROFILE_OBJECT_FIELDS = [
  "AssetAssetId",
  "AssetProfileId",
  "AssetAssetName",
  "AssetSerialNumber",
  "AssetModelNumber",
  "AssetModelName",
  "AssetProductSKU",
  "AssetPurchaseDate",
  "AssetUsageEndDate",
  "AssetStatus",
  "AssetPrice",
  "AssetQuantity",
  "AssetDescription",
  "AssetAdditionalInformation",
  "AssetDataSource",
  "OrderOrderId",
  "OrderProfileId",
  "OrderCustomerEmail",
  "OrderCustomerPhone",
  "OrderCreatedDate",
  "OrderUpdatedDate",
  "OrderProcessedDate",
  "OrderClosedDate",
  "OrderCancelledDate",
  "OrderCancelReason",
  "OrderName",
  "OrderAdditionalInformation",
  "OrderGateway",
  "OrderStatus",
  "OrderStatusCode",
  "OrderStatusUrl",
  "OrderCreditCardNumber",
  "OrderCreditCardCompany",
  "OrderFulfillmentStatus",
  "OrderTotalPrice",
  "OrderTotalTax",
  "OrderTotalDiscounts",
  "OrderTotalItemsPrice",
  "OrderTotalShippingPrice",
  "OrderTotalTipReceived",
  "OrderCurrency",
  "OrderTotalWeight",
  "OrderBillingName",
  "OrderBillingAddress1",
  "OrderBillingAddress2",
  "OrderBillingAddress3",
  "OrderBillingAddress4",
  "OrderBillingCity",
  "OrderBillingCounty",
  "OrderBillingCountry",
  "OrderBillingPostalCode",
  "OrderBillingProvince",
  "OrderBillingState",
  "OrderShippingName",
  "OrderShippingAddress1",
  "OrderShippingAddress2",
  "OrderShippingAddress3",
  "OrderShippingAddress4",
  "OrderShippingCity",
  "OrderShippingCounty",
  "OrderShippingCountry",
  "OrderShippingPostalCode",
  "OrderShippingProvince",
  "OrderShippingState",
  "CaseCaseId",
  "CaseProfileId",
  "CaseTitle",
  "CaseSummary",
  "CaseStatus",
  "CaseReason",
  "CaseCreatedBy",
  "CaseCreatedDate",
  "CaseUpdatedDate",
  "CaseClosedDate",
  "CaseAdditionalInformation",
  "CaseDataSource",
] as const;
export const PROFILE_OBJECT_FIELD_PATTERNS: readonly string[] = [
  "^AssetAttributes\\.[^.]+$",
  "^OrderAttributes\\.[^.]+$",
  "^CaseAttributes\\.[^.]+$",
  "^ObjectAttributes\\.[^.]+$",
];

/**
 * The names GetCalculatedAttributesForCustomerProfile stores, as the page
 * lists them: two predefined calculated attributes, and
 * "CalculatedAttributes.x" for any other, which the pattern spells. The
 * admin guide: "The options under Response fields are the Calculated
 * Attribute definitions defined for your Customer Profiles domain", so a
 * domain's own names are typed against the pattern.
 * https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcalculatedattributesforcustomerprofile.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
 */
export const CALCULATED_ATTRIBUTE_FIELDS = [
  "CalculatedAttributes._average_hold_time",
  "CalculatedAttributes._frequent_caller",
] as const;
export const CALCULATED_ATTRIBUTE_PATTERNS: readonly string[] = ["^CalculatedAttributes\\.[^.]+$"];

/**
 * UpdateContactRoutingCriteria's expression (docs/adr/0009). The action page: an
 * AttributeCondition's `Name` and `Value` are each "a string and has length
 * constraints between 1-64"; `ProficiencyLevel` "is a float value. Valid
 * values are: 1.0, 2.0, 3.0, 4.0 and 5.0"; `ComparisonOperator` "Valid
 * values: NumberGreaterOrEqualTo". The admin guide's Set routing criteria
 * block: "Up to eight attributes using the AND condition", "Up to three OR
 * conditions in a routing step. Each requirement separated by an OR can have
 * up to eight attributes", "OR expressions must be at the top level. You can
 * place an AND inside an OR, but not the other way around", and "Each step of
 * the criteria must have a timed expiration timer. The last step of the
 * criteria can have a timed or non-expiring expiration timer." None of these
 * is in the catalog or the schema: the expression is a `json` value, and
 * rule 45's probes (pending) have not shown the service refusing any of them
 * at create (owner decision 3). They are the builder's checks.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateroutingcriteria.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/set-routing-criteria.html
 */
export const PROFICIENCY_LEVELS = [1, 2, 3, 4, 5] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];
export const ROUTING_COMPARISON_OPERATOR = "NumberGreaterOrEqualTo";
export const PREDEFINED_ATTRIBUTE_TEXT_MIN = 1;
export const PREDEFINED_ATTRIBUTE_TEXT_MAX = 64;
export const ROUTING_AND_MAX = 8;

/**
 * LoadContactContent.ContentType: the Get stored content block's one option,
 * "Email message (Plain text)", written `"ContentType": enum "EmailMessage"`
 * in the page's Flow language example. The block stores the message on
 * `$.Email.EmailMessage.Plaintext`.
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-stored-content.html
 */
export const STORED_CONTENT_TYPES = ["EmailMessage"] as const;

/**
 * GetCustomerProfileObject.UseLatest, "true / false" on the page. The
 * service accepts the string "true" and refuses "false", "True" and the
 * JSON boolean (us-west-2, 2026-10-13; actions.md, rule 43): the flag
 * chooses the latest object, and leaving it out is how a block says not to.
 */
export const PROFILE_USE_LATEST = ["true"] as const;

/**
 * The Cases system field ids, in the admin guide's table order: the same on
 * every Cases domain, so a flow names them literally ("For system fields,
 * you can read the syntax and understand which field it refers to. For
 * example: `$.Case.status`"), as every published flow does (actions.md,
 * rule 44). A domain's own field has a UUID per domain and is a `casefield`
 * reference (docs/adr/0008-case-field-ids.md). These are the catalog's
 * `keys` on each `CaseRequestFields` and `CaseResponseFields`, held to this
 * list by catalog.test.ts; a key at a `casefield` reference path is one of
 * them or a token of that type. `reference_id` is listed as "coming later
 * in 2026".
 * https://docs.aws.amazon.com/connect/latest/adminguide/case-fields.html#system-case-fields
 * https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html#cases-persist-fields
 */
export const CASE_SYSTEM_FIELDS = [
  "assigned_queue",
  "assigned_user",
  "case_id",
  "case_reason",
  "created_by",
  "customer_id",
  "last_closed_datetime",
  "created_datetime",
  "last_updated_datetime",
  "last_updated_user",
  "reference_number",
  "reference_id",
  "status",
  "summary",
  "title",
] as const;
export type CaseSystemField = (typeof CASE_SYSTEM_FIELDS)[number];

/**
 * The Cases actions' flags, `"true" or "false"` on the pages, strings in
 * the console's export and every published flow (`LinkContactToCase`,
 * `GetLastUpdatedCase`).
 * https://docs.aws.amazon.com/connect/latest/devguide/createcase.html
 */
export const CASE_FLAGS = ["true", "false"] as const;

/**
 * GetCase's CaseResponseFields: "You can specify up to 10 Response fields on
 * a Cases block. If you specify more than 10 and then publish the flow, the
 * following error is displayed: Invalid or missing parameter data".
 * https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html#create-case-tips
 */
export const CASE_RESPONSE_FIELDS_MAX = 10;

/**
 * Which contact a linking Cases block links: the admin guide's "Current
 * contact is the contact on which the current flow is being executed" and
 * "Related contact". The console's export writes `ContactToLink: "Current"`
 * beside `LinkContactToCase: "true"` (rule 44); no page names the key, and
 * older published flows link without it.
 * https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html
 */
export const CASE_CONTACTS_TO_LINK = ["Current", "Related"] as const;
export type CaseContactToLink = (typeof CASE_CONTACTS_TO_LINK)[number];

export const PROFILE_SEARCH_CRITERIA_MIN = 1;
export const PROFILE_SEARCH_CRITERIA_MAX = 5;
export const PROFILE_LOGICAL_OPERATORS = ["AND", "OR"] as const;
export type ProfileLogicalOperator = (typeof PROFILE_LOGICAL_OPERATORS)[number];

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
 * CheckOutboundCallStatus's run results, in the page's order: "Conditions
 * are supported, but only the "Equals" operator is supported.
 * "CallAnswered", "VoicemailBeep" , "VoicemailNoBeep" and "NotDetected"
 * are the only supported operands."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkoutboundcallstatus.html
 */
export const OUTBOUND_CALL_STATUSES = [
  "CallAnswered",
  "VoicemailBeep",
  "VoicemailNoBeep",
  "NotDetected",
] as const;
export type OutboundCallStatus = (typeof OUTBOUND_CALL_STATUSES)[number];

/**
 * CompleteOutboundCall.ConnectionTimeLimitSeconds: "Optional, Only used for
 * Voice Connector use case. An integer between 1 and 600 (inclusive)
 * representing the number of seconds to wait for the voice connector to
 * answer before canceling the call. Can be set statically or dynamically."
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-completeoutboundcall.html
 */
export const OUTBOUND_CONNECTION_TIME_LIMIT_MIN = 1;
export const OUTBOUND_CONNECTION_TIME_LIMIT_MAX = 600;

/**
 * StartOutboundChatContact's constants, each the one value its page allows:
 * "This action only supports `connect:SMS` as the **ContactSubtype**
 * currently", "only supports `CONNECT_PHONENUMBER_ARN` as the Type of
 * **SourceEndpoint**", "only supports `TELEPHONE_NUMBER` as the Type of
 * **DestinationEndpoint**", and RelatedContact's "Only supported value is
 * CURRENT". The catalog records each as a single-value enum.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-startoutboundchatcontact.html
 */
export const OUTBOUND_CHAT_SUBTYPE = "connect:SMS";
export const OUTBOUND_CHAT_SOURCE_TYPE = "CONNECT_PHONENUMBER_ARN";
export const OUTBOUND_CHAT_DESTINATION_TYPE = "TELEPHONE_NUMBER";
export const OUTBOUND_CHAT_RELATED_CONTACT = "CURRENT";

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
 * UpdatePreviousContactParticipantState.PreviousContactParticipantState, "One
 * of ["AgentOnHold", "CustomerOnHold", "OffHold"]". The console's Hold
 * customer or agent block names them Agent on hold ("customer is on the
 * call"), Customer on hold ("agent is on the call") and Conference all.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatepreviouscontactparticipantstate.html
 * https://docs.aws.amazon.com/connect/latest/adminguide/hold-customer-agent.html
 */
export const PREVIOUS_PARTICIPANT_STATES = ["AgentOnHold", "CustomerOnHold", "OffHold"] as const;
export type PreviousParticipantState = (typeof PREVIOUS_PARTICIPANT_STATES)[number];

/**
 * UpdateContactMediaStreamingBehavior: `MediaStreamingState` is "One of
 * "Enabled" or "Disabled". Must be specified statically."; each participant's
 * `MediaDirections` is "A list of the directions of media to include in the
 * stream - "From" and "To". Must be defined statically."; `ParticipantType`
 * "Currently, only "Customer" is supported" and `MediaStreamType`
 * "Currently, only "Audio" is supported", each static.
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediastreamingbehavior.html
 */
export const MEDIA_STREAMING_STATES = ["Enabled", "Disabled"] as const;
export type MediaStreamingState = (typeof MEDIA_STREAMING_STATES)[number];
export const MEDIA_DIRECTIONS = ["From", "To"] as const;
export type MediaDirection = (typeof MEDIA_DIRECTIONS)[number];

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
 * a valid integer between 1 and 20". The builder does not model
 * DTMFConfiguration (a block carrying it stays a GenericBlock); the bound is
 * the catalog's, held here so the catalog test reaches it.
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
