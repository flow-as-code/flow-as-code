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
import { ActionType, type ModeledActionType } from "@flow-as-code/core";

export type PaletteCategory = "Interact" | "Set" | "Branch" | "Integrate" | "Terminate";

export const CATEGORY_BY_TYPE: Readonly<Record<ModeledActionType, PaletteCategory>> = {
  [ActionType.MessageParticipant]: "Interact",
  [ActionType.GetParticipantInput]: "Interact",
  [ActionType.Wait]: "Interact",
  [ActionType.UpdateContactTargetQueue]: "Set",
  [ActionType.UpdateContactAttributes]: "Set",
  [ActionType.UpdateContactRecordingBehavior]: "Set",
  [ActionType.UpdateContactRoutingBehavior]: "Set",
  [ActionType.UpdateContactCallbackNumber]: "Set",
  [ActionType.UpdateFlowAttributes]: "Set",
  [ActionType.GetMetricData]: "Set",
  [ActionType.TagContact]: "Set",
  [ActionType.UnTagContact]: "Set",
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
  [ActionType.UpdateContactRoutingBehavior]: "set-routing-priority",
  [ActionType.UpdateContactCallbackNumber]: "set-callback-number",
  [ActionType.UpdateFlowAttributes]: "set-flow-attributes",
  [ActionType.GetMetricData]: "get-metrics",
  [ActionType.TagContact]: "tag-contact",
  [ActionType.UnTagContact]: "untag-contact",
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
    case ActionType.Wait:
      // A minute; the page states no console default. Events are added in
      // the inspector before their branches are dragged.
      // https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html
      return { TimeLimitSeconds: "60" };
    case ActionType.CheckMetricData:
      // The console's Check staffing block opens on its first status, agents
      // available. https://docs.aws.amazon.com/connect/latest/adminguide/check-staffing.html
      return { MetricType: "NumberOfAgentsAvailable" };
    case ActionType.Loop:
      // The smallest count that loops at all; the page states no console
      // default. https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-loop.html
      return { LoopCount: 1 };
    case ActionType.UpdateContactAttributes:
      return { Attributes: {}, TargetContact: "Current" };
    case ActionType.UpdateFlowAttributes:
      return { FlowAttributes: {} };
    case ActionType.TagContact:
      // Schema-valid but empty; the block class wants at least one tag, so
      // the block is generic until the inspector fills one in.
      return { Tags: {} };
    case ActionType.UnTagContact:
      return { TagKeys: [] };
    case ActionType.UpdateContactRecordingBehavior:
      return { RecordingBehavior: { RecordedParticipants: ["Agent", "Customer"] } };
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
    Transitions: {},
  };
}
