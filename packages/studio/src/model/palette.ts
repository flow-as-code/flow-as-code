/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Palette taxonomy and defaults for new blocks.
//
// Groups mirror the Connect console taxonomy (Interact, Set, Branch,
// Integrate, Terminate) per docs/02-studio-design.md, but only actions
// @flow-as-code/core models are insertable. Everything else renders as a read-only
// GenericBlock.

import type { FlowAction } from "@flow-as-code/core";
import { ActionType, type ModeledActionType, holdsParticipant } from "@flow-as-code/core";

export type PaletteCategory = "Interact" | "Set" | "Branch" | "Integrate" | "Terminate";

export const CATEGORY_BY_TYPE: Readonly<Record<ModeledActionType, PaletteCategory>> = {
  [ActionType.MessageParticipant]: "Interact",
  [ActionType.GetParticipantInput]: "Interact",
  [ActionType.Wait]: "Interact",
  [ActionType.MessageParticipantIteratively]: "Interact",
  [ActionType.ConnectParticipantWithLexBot]: "Interact",
  [ActionType.ShowView]: "Interact",
  [ActionType.UpdateContactTargetQueue]: "Set",
  [ActionType.UpdateContactAttributes]: "Set",
  [ActionType.UpdateContactRecordingBehavior]: "Set",
  [ActionType.UpdateContactRecordingAndAnalyticsBehavior]: "Set",
  [ActionType.UpdateFlowLoggingBehavior]: "Set",
  [ActionType.UpdateContactRoutingBehavior]: "Set",
  [ActionType.UpdateContactCallbackNumber]: "Set",
  [ActionType.UpdateFlowAttributes]: "Set",
  [ActionType.GetMetricData]: "Set",
  [ActionType.TagContact]: "Set",
  [ActionType.UntagContact]: "Set",
  [ActionType.UpdateContactTextToSpeechVoice]: "Set",
  [ActionType.UpdateContactData]: "Set",
  [ActionType.UpdateContactEventHooks]: "Set",
  [ActionType.ResumeContact]: "Set",
  [ActionType.UpdatePreviousContactParticipantState]: "Set",
  [ActionType.UpdateContactMediaStreamingBehavior]: "Set",
  [ActionType.UpdateContactMediaProcessing]: "Set",
  [ActionType.CreateTask]: "Integrate",
  [ActionType.CreateCase]: "Integrate",
  [ActionType.GetCase]: "Integrate",
  [ActionType.CreateWisdomSession]: "Integrate",
  [ActionType.AssociateContactToCustomerProfile]: "Integrate",
  [ActionType.CreateCustomerProfile]: "Integrate",
  [ActionType.UpdateCustomerProfile]: "Integrate",
  [ActionType.GetCustomerProfile]: "Integrate",
  [ActionType.GetCustomerProfileObject]: "Integrate",
  [ActionType.GetCalculatedAttributesForCustomerProfile]: "Integrate",
  [ActionType.CheckHoursOfOperation]: "Branch",
  [ActionType.Compare]: "Branch",
  [ActionType.Loop]: "Branch",
  [ActionType.DistributeByPercentage]: "Branch",
  [ActionType.CheckMetricData]: "Branch",
  [ActionType.InvokeLambdaFunction]: "Integrate",
  [ActionType.InvokeFlowModule]: "Integrate",
  [ActionType.TransferToFlow]: "Terminate",
  [ActionType.TransferContactToQueue]: "Terminate",
  [ActionType.DequeueContactAndTransferToQueue]: "Terminate",
  [ActionType.TransferContactToAgent]: "Terminate",
  [ActionType.CreateCallbackContact]: "Terminate",
  [ActionType.DisconnectParticipant]: "Terminate",
  [ActionType.EndFlowExecution]: "Terminate",
  [ActionType.EndFlowModuleExecution]: "Terminate",
};

export const PALETTE_GROUPS: readonly {
  category: PaletteCategory;
  types: readonly ModeledActionType[];
}[] = (["Interact", "Set", "Branch", "Integrate", "Terminate"] as const).map((category) => ({
  category,
  types: (Object.keys(CATEGORY_BY_TYPE) as ModeledActionType[]).filter(
    (t) => CATEGORY_BY_TYPE[t] === category,
  ),
}));

export function isModeled(type: string): type is ModeledActionType {
  return type in CATEGORY_BY_TYPE;
}

export function categoryOf(type: ModeledActionType): PaletteCategory {
  return CATEGORY_BY_TYPE[type];
}

/** Base Identifier slug used when inserting a block of the given type. */
export const ID_SLUG_BY_TYPE: Readonly<Record<ModeledActionType, string>> = {
  [ActionType.MessageParticipant]: "message",
  [ActionType.GetParticipantInput]: "menu",
  [ActionType.Wait]: "wait",
  [ActionType.MessageParticipantIteratively]: "loop-prompts",
  [ActionType.ConnectParticipantWithLexBot]: "lex-bot",
  [ActionType.ShowView]: "show-view",
  [ActionType.DisconnectParticipant]: "disconnect",
  [ActionType.CheckHoursOfOperation]: "check-hours",
  [ActionType.Compare]: "compare",
  [ActionType.Loop]: "loop",
  [ActionType.DistributeByPercentage]: "split",
  [ActionType.CheckMetricData]: "check-metric",
  [ActionType.TransferToFlow]: "transfer-to-flow",
  [ActionType.EndFlowExecution]: "end-flow",
  [ActionType.TransferContactToQueue]: "transfer-to-queue",
  [ActionType.DequeueContactAndTransferToQueue]: "queue-to-queue",
  [ActionType.TransferContactToAgent]: "transfer-to-agent",
  [ActionType.CreateCallbackContact]: "create-callback",
  [ActionType.UpdateContactTargetQueue]: "set-queue",
  [ActionType.UpdateContactAttributes]: "set-attributes",
  [ActionType.UpdateContactRecordingBehavior]: "set-recording",
  [ActionType.UpdateContactRecordingAndAnalyticsBehavior]: "set-recording-analytics",
  [ActionType.UpdateFlowLoggingBehavior]: "set-logging",
  [ActionType.UpdateContactRoutingBehavior]: "set-routing-priority",
  [ActionType.UpdateContactCallbackNumber]: "set-callback-number",
  [ActionType.UpdateFlowAttributes]: "set-flow-attributes",
  [ActionType.GetMetricData]: "get-metrics",
  [ActionType.TagContact]: "tag-contact",
  [ActionType.UntagContact]: "untag-contact",
  [ActionType.UpdateContactTextToSpeechVoice]: "set-voice",
  [ActionType.UpdateContactData]: "set-contact-data",
  [ActionType.UpdateContactEventHooks]: "set-event-hook",
  [ActionType.ResumeContact]: "resume-contact",
  [ActionType.UpdatePreviousContactParticipantState]: "hold-participant",
  [ActionType.UpdateContactMediaStreamingBehavior]: "media-streaming",
  [ActionType.UpdateContactMediaProcessing]: "message-processor",
  [ActionType.CreateTask]: "create-task",
  [ActionType.CreateCase]: "create-case",
  [ActionType.GetCase]: "get-case",
  [ActionType.CreateWisdomSession]: "connect-assistant",
  [ActionType.AssociateContactToCustomerProfile]: "associate-profile",
  [ActionType.CreateCustomerProfile]: "create-profile",
  [ActionType.UpdateCustomerProfile]: "update-profile",
  [ActionType.GetCustomerProfile]: "get-profile",
  [ActionType.GetCustomerProfileObject]: "get-profile-object",
  [ActionType.GetCalculatedAttributesForCustomerProfile]: "calculated-attributes",
  [ActionType.InvokeFlowModule]: "invoke-module",
  [ActionType.EndFlowModuleExecution]: "end-module",
  [ActionType.InvokeLambdaFunction]: "invoke-lambda",
};

/**
 * Minimal schema-valid Parameters for a freshly inserted block. Reference
 * fields are omitted rather than blank: the schema constrains them to a token
 * or JSONPath when present, and the inspector's ref picker fills them in.
 */
export function defaultParameters(type: ModeledActionType): Record<string, unknown> {
  switch (type) {
    case ActionType.MessageParticipant:
      return { Text: "New message" };
    case ActionType.GetParticipantInput:
      // The console's defaults for a new "Get customer input" block: a five
      // second timeout, no stored input. Both are strings there, and the
      // GetParticipantInput block class emits the same spelling.
      // https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
      return { Text: "New menu", InputTimeLimitSeconds: "5", StoreInput: "False" };
    case ActionType.Compare:
      return { ComparisonValue: "$.Attributes.value" };
    case ActionType.MessageParticipantIteratively:
      return { Messages: [{ Text: "Please hold." }] };
    case ActionType.ConnectParticipantWithLexBot:
      // The bot is required (the page: "Provide either LexBot or LexV2Bot
      // object"; the schema holds exactly one), so the default carries a
      // JSONPath placeholder the inspector's picker replaces.
      // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-connectparticipantwithlexbot.html
      return {
        Text: "How can I help you today?",
        LexV2Bot: { AliasArn: "$.Attributes.botAlias" },
      };
    case ActionType.Wait:
      // A minute; the page states no console default. Events are listed by
      // the drags that add their branches (mutations.ts, withWaitEvent).
      // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html
      return { TimeLimitSeconds: "60" };
    case ActionType.CheckMetricData:
      // The first metric the action page lists; neither page states a
      // console default.
      // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkmetricdata.html
      return { MetricType: "NumberOfAgentsAvailable" };
    case ActionType.Loop:
      // The smallest count that loops at all, in the console's decimal
      // string spelling; the page states no console default.
      // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-loop.html
      return { LoopCount: "1" };
    case ActionType.UpdateContactAttributes:
      return { Attributes: {}, TargetContact: "Current" };
    case ActionType.UpdateContactEventHooks:
      // Schema-valid but empty; the block class wants exactly one hook, so
      // the block is generic until the inspector names one.
      return { EventHooks: {} };
    case ActionType.UpdateFlowAttributes:
      return { FlowAttributes: {} };
    case ActionType.TagContact:
      // Schema-valid but empty; the block class wants at least one tag, so
      // the block is generic until the inspector fills one in.
      return { Tags: {} };
    case ActionType.UntagContact:
      // The service refuses an empty key list, so the default names a
      // placeholder key for the inspector to change.
      return { TagKeys: ["tag-key"] };
    case ActionType.UpdateContactTextToSpeechVoice:
      // "This defaults to Joanna if this action is never run."
      // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacttexttospeechvoice.html
      return { TextToSpeechVoice: "Joanna" };
    case ActionType.UpdateContactRecordingBehavior:
      return { RecordingBehavior: { RecordedParticipants: ["Agent", "Customer"] } };
    case ActionType.ShowView:
      // Both keys are required on the wire (the service refuses the block
      // without a time limit); the view is a JSONPath placeholder until the
      // inspector's picker names one. The page states no console default.
      // https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-showview.html
      return { ViewResource: { Id: "$.Attributes.view" }, InvocationTimeLimitSeconds: "300" };
    case ActionType.UpdatePreviousContactParticipantState:
      // The admin guide's Hold customer or agent example is configured for
      // Agent on hold; the page states no console default.
      // https://docs.aws.amazon.com/connect/latest/adminguide/hold-customer-agent.html
      return { PreviousContactParticipantState: "AgentOnHold" };
    case ActionType.UpdateContactMediaStreamingBehavior:
      // Start media streaming with both of the console's checkboxes (from and
      // to the customer); the pages state no console default.
      // https://docs.aws.amazon.com/connect/latest/adminguide/start-media-streaming.html
      return {
        MediaStreamingState: "Enabled",
        Participants: [{ ParticipantType: "Customer", MediaDirections: ["From", "To"] }],
        MediaStreamType: "Audio",
      };
    case ActionType.UpdateContactMediaProcessing:
      // The disabled form, the only one with no Lambda: the processor is a
      // static lambda reference ("Must be set statically"), which the
      // inspector's picker fills before the author turns processing on.
      // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediaprocessing.html
      return { ChatProcessor: { ProcessingEnabled: "False" } };
    case ActionType.CreateTask:
      // Name is the one key the page does not mark optional besides the
      // flow, which is a JSONPath placeholder until the inspector's picker
      // names a flow or a template. The page states no console default.
      // https://docs.aws.amazon.com/connect/latest/devguide/createtask.html
      return { ContactFlowId: "$.Attributes.taskFlow", Name: "Follow up" };
    case ActionType.CreateCase:
      // "You must provide a case template", a casetemplate reference the
      // refs panel then asks to bind; the contact is not linked until the
      // inspector says so, which also wires ContactNotLinked.
      // https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html
      return {
        LinkContactToCase: "false",
        CaseTemplateId: "${cdref:casetemplate:case-template}",
        CaseRequestFields: { customer_id: "$.Customer.ProfileARN" },
      };
    case ActionType.GetCase:
      // The admin guide's example: the customer's cases found by profile
      // ARN, the case id, status and summary stored; "You must provide at
      // least one search criteria".
      // https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html
      return {
        LinkContactToCase: "false",
        GetLastUpdatedCase: "true",
        CaseRequestFields: { customer_id: "$.Customer.ProfileARN" },
        CaseResponseFields: ["case_id", "status", "summary"],
      };
    case ActionType.CreateWisdomSession:
      // A JSONPath placeholder until the inspector's picker names an
      // assistant; the page allows either form.
      // https://docs.aws.amazon.com/connect/latest/devguide/createwisdomsession.html
      return { WisdomAssistantArn: "$.Attributes.assistantArn" };
    case ActionType.CreateCustomerProfile:
      // "All of these fields are optional."; the console writes both
      // containers, empty until a field is chosen.
      // https://docs.aws.amazon.com/connect/latest/devguide/interactions-createcustomerprofile.html
      return { ProfileRequestData: {}, ProfileResponseData: [] };
    case ActionType.GetCustomerProfile:
      // The caller's phone number, the search the admin guide's example and
      // most published flows make.
      // https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
      return {
        ProfileRequestData: {
          IdentifierName: "_phone",
          IdentifierValue: "$.CustomerEndpoint.Address",
        },
        ProfileResponseData: [],
      };
    case ActionType.GetCustomerProfileObject:
      // The profile a preceding Get profile found and the latest object of
      // a standard type; the page states no console default.
      // https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofileobject.html
      return {
        ProfileRequestData: {
          ProfileId: "$.Customer.ProfileId",
          ObjectType: "Order",
          UseLatest: "true",
        },
        ProfileResponseData: [],
      };
    case ActionType.GetCalculatedAttributesForCustomerProfile:
      // The profile a preceding Get profile found; no attribute is chosen
      // until the author ticks one.
      // https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcalculatedattributesforcustomerprofile.html
      return { ProfileRequestData: { ProfileId: "$.Customer.ProfileId" }, ProfileResponseData: [] };
    case ActionType.UpdateCustomerProfile:
      // The same optional fields; the profile is the one a preceding Get or
      // Create profile left at $.Customer.ProfileId.
      // https://docs.aws.amazon.com/connect/latest/devguide/interactions-updatecustomerprofile.html
      return { ProfileRequestData: {}, ProfileResponseData: [] };
    case ActionType.AssociateContactToCustomerProfile:
      // The admin guide's example: the profile found by a preceding Get
      // profile and the current contact, both read from attributes.
      // https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
      return {
        ProfileRequestData: { ProfileId: "$.Customer.ProfileId", ContactId: "$.ContactId" },
        ProfileResponseData: [],
      };
    case ActionType.UpdateFlowLoggingBehavior:
      // The demo's own setting; the page states no console default.
      // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateflowloggingbehavior.html
      return { FlowLoggingBehavior: "Enabled" };
    case ActionType.UpdateContactRecordingAndAnalyticsBehavior:
      // The voice recording form with both participants, as the older
      // block's default; the page states no console default.
      // https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactrecordingandanalyticsbehavior.html
      return {
        VoiceBehavior: { VoiceRecordingBehavior: { RecordedParticipants: ["Agent", "Customer"] } },
      };
    case ActionType.CreateCallbackContact:
      // Starting values inside the page's bounds; the admin guide states no
      // console defaults for the Transfer to Callback tab. A minute before
      // the first attempt, one attempt, ten minutes between attempts.
      // https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-queue.html
      return {
        InitialCallDelaySeconds: "60",
        MaximumConnectionAttempts: "1",
        RetryDelaySeconds: "600",
      };
    case ActionType.UpdateContactCallbackNumber:
      // "The Store customer input block often comes before this block. It
      // stores the customer's callback number."
      // https://docs.aws.amazon.com/connect/latest/adminguide/set-callback-number.html
      return { CallbackNumber: "$.StoredCustomerInput" };
    case ActionType.UpdateContactRoutingBehavior:
      // "The default priority for new contacts is 5", so a fresh block starts
      // where the contact already is and the author moves it from there.
      // https://docs.aws.amazon.com/connect/latest/adminguide/change-routing-priority.html
      return { QueuePriority: "5" };
    case ActionType.InvokeLambdaFunction:
      return {
        InvocationTimeLimitSeconds: 8,
        InvocationType: "SYNCHRONOUS",
        ResponseValidation: { ResponseType: "STRING_MAP" },
      };
    default:
      return {};
  }
}

/**
 * A new block starts with empty Transitions. For non-terminal types that is a
 * lint finding (terminal-blocks, error-branches), which is the guided path to
 * wiring it, not a schema violation and not a save blocker.
 */
export function defaultAction(type: ModeledActionType, identifier: string): FlowAction {
  return {
    Identifier: identifier,
    Type: type,
    Parameters: defaultParameters(type),
    // A type that holds the participant is finished with nothing wired, the
    // way the console writes its hold and queue flows, and its class writes
    // the empty lists; an empty object would be read as a terminal action.
    Transitions: holdsParticipant(type) ? { Errors: [], Conditions: [] } : {},
  };
}
