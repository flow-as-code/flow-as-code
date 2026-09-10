/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// What a drag from a handle should MEAN for each block type.
//
// These are authoring-intent rules, not the legality gate. Legality has one
// implementation and it lives in model/demotion.ts, which asks the real
// codegen whether a block still inverts; model/mutations.ts wraps every
// mutation in it. This file previously restated @flow-as-code/core's inverter rules as
// a second gate, and every rule it did not restate became a hole: the reviewed
// defects were all edits that walked past this list into a silent demotion.
//
// So the questions answered here are narrow and about the gesture, not the
// outcome: does this type have a success path at all, and does a drag from its
// primary handle mean "a branch" or "the next action"? Getting one of these
// wrong now produces a refusal the user can read, not a corrupted block.

import type { Condition, ConditionOperator, DtmfDigit, FlowAction } from "@flow-as-code/core";
import { ActionType, TERMINAL_ACTIONS } from "@flow-as-code/core";
import { isModeled } from "./palette.js";

/** Terminal actions carry an empty Transitions object and have no errors. */
export function isTerminalType(type: string): boolean {
  return TERMINAL_ACTIONS.includes(type);
}

/**
 * Whether this GetParticipantInput is the DTMF menu form, the one form the
 * builder models and the only one the menu gestures below apply to.
 *
 * The action has two forms. With StoreInput "False" (or absent: the parameter
 * is optional) the key pressed is the run result, conditions branch on it, and
 * NoMatchingCondition "Must be defined only if StoreInput is False". With
 * StoreInput "True" the digits are stored, there is no run result, and
 * conditions are not supported. That form parses as a GenericBlock and must
 * keep the gestures every unmodeled block has: a drag from its primary handle
 * means the next action, never a key branch, or its Transitions would gain a
 * condition the action page says it cannot carry.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 */
export function isDtmfMenu(action: FlowAction): boolean {
  return action.Type === ActionType.GetParticipantInput && action.Parameters.StoreInput !== "True";
}

/**
 * Whether a drag can author a NextAction on this action. Compare is modeled
 * with wire(undefined, ...): its paths are all conditions, and codegen rejects
 * the block outright when a NextAction is present
 * (`if (t.NextAction !== undefined) return undefined;`). A DTMF menu carries
 * one, but it is not authored: the block class writes it as a mirror of the
 * NoMatchingCondition branch, the way the console does, and the mutations
 * keep the two together (mirrorNoMatch in mutations.ts). A drag from its
 * primary handle means a key branch, never a bare NextAction. The
 * stored-input form of the same action has no branches, so there the drag
 * means the next action as it does on any other block.
 */
export function acceptsNextAction(action: FlowAction): boolean {
  if (isTerminalType(action.Type)) return false;
  return action.Type !== ActionType.Compare && !isDtmfMenu(action);
}

/**
 * Whether a drag from this action's primary handle should mean "add a branch".
 *
 * Compare authors free-form branches and a DTMF menu authors one branch per
 * key (defaultConditionFor picks the key); the stored-input form of
 * GetParticipantInput has no branches at all. CheckHoursOfOperation carries
 * exactly two conditions fixed by its builder (Equals True, Equals False), so
 * a drag from it means the success path, not a third branch. An unmodeled
 * action that already carries conditions demonstrably uses them, and its
 * parameters and transitions are re-emitted verbatim, so a drag there means a
 * branch too.
 */
export function acceptsConditions(action: FlowAction): boolean {
  if (isTerminalType(action.Type)) return false;
  if (action.Type === ActionType.Compare) return true;
  if (action.Type === ActionType.GetParticipantInput) return isDtmfMenu(action);
  if (isModeled(action.Type)) return false;
  return (action.Transitions.Conditions ?? []).length > 0;
}

/**
 * The condition operators the Flow language defines, in schema order
 * (conformance/schema/flowdoc-0.1.schema.json, $defs.condition.Operator). The
 * `satisfies` keeps this list from drifting from @flow-as-code/core's type.
 */
export const CONDITION_OPERATORS = [
  "Equals",
  "TextStartsWith",
  "TextEndsWith",
  "TextContains",
  "NumberGreaterThan",
  "NumberGreaterOrEqualTo",
  "NumberLessThan",
  "NumberLessOrEqualTo",
] as const satisfies readonly ConditionOperator[];

export function isConditionOperator(value: string): value is ConditionOperator {
  return (CONDITION_OPERATORS as readonly string[]).includes(value);
}

/**
 * What a comma-separated operand field means, for BOTH surfaces that author
 * operands: the inspector's text field and the branch a drag creates.
 *
 * Blank entries between commas are dropped, because "gold, , silver" is a typo
 * and not a three-operand condition. A field that is blank all the way through
 * is different: it is the placeholder state, one empty operand, which is
 * exactly the branch a drag from a Compare's handle creates. The FlowDoc schema
 * requires at least one operand ($defs.condition.Operands, minItems 1), so the
 * empty list is not a state a branch can be saved in at all.
 *
 * This lives in one function because the two surfaces used to disagree: a drag
 * authored [""] while the inspector refused to, so the same condition was
 * reachable by one gesture and rejected by the other.
 */
export function normalizeOperands(text: string): string[] {
  const parts = text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return parts.length === 0 ? [""] : parts;
}

/**
 * A branch created by dragging from a Compare's condition handle. The operand
 * starts empty on purpose: the branch has no meaning until the inspector fills
 * it in, and an invented operand would look authored. Lint has no rule for an
 * empty operand yet.
 */
export const DEFAULT_CONDITION_OPERATOR: ConditionOperator = "Equals";
export const DEFAULT_CONDITION_OPERANDS: readonly string[] = normalizeOperands("");

/**
 * The order a menu hands out keys when a drag creates a branch: 1 to 9 first,
 * the way a menu is read out to the caller, then 0, then * and #. The same
 * twelve keys as @flow-as-code/core's DTMF_DIGITS, which a test pins.
 */
export const DTMF_KEY_ORDER: readonly DtmfDigit[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "*",
  "#",
];

/** The keys a menu's branches already answer to. */
function usedKeys(action: FlowAction): Set<string> {
  const used = new Set<string>();
  for (const c of action.Transitions.Conditions ?? []) {
    for (const operand of c.Condition.Operands) used.add(String(operand));
  }
  return used;
}

/**
 * The condition a drag from this block's primary handle creates, or undefined
 * when the gesture has nothing left to mean.
 *
 * Compare gets the empty placeholder the inspector fills in. A
 * GetParticipantInput gets Equals on the first key none of its branches use
 * yet: its block class takes exactly one key per branch and the empty
 * placeholder is not a key, so handing a typed menu the Compare default would
 * have demoted it on every drag. Once all twelve keys are taken there is no
 * branch left to add.
 */
export function defaultConditionFor(action: FlowAction): Condition | undefined {
  if (action.Type !== ActionType.GetParticipantInput) {
    return { Operator: DEFAULT_CONDITION_OPERATOR, Operands: [...DEFAULT_CONDITION_OPERANDS] };
  }
  const used = usedKeys(action);
  const key = DTMF_KEY_ORDER.find((k) => !used.has(k));
  return key === undefined ? undefined : { Operator: "Equals", Operands: [key] };
}
