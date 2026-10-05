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
import {
  ActionType,
  PARTICIPANT_NOT_FOUND,
  TERMINAL_ACTIONS,
  builderErrors,
  conditionsKind,
  modeledEntry,
  nextRule,
} from "@flow-as-code/core";
import { isModeled } from "./palette.js";

/** Terminal actions carry an empty Transitions object and have no errors. */
export function isTerminalType(type: string): boolean {
  return TERMINAL_ACTIONS.includes(type);
}

/**
 * Whether a drag from this action's error handle has a branch to create. An
 * unmodeled action's errors are whatever it came with, and the handle is how
 * a detached one is re-attached, so it always offers; a modeled action offers
 * when its page lists an error. UpdateContactRoutingBehavior lists none, so
 * its node renders no error handle unless an existing edge needs one.
 */
export function offersErrorBranch(action: FlowAction): boolean {
  if (isTerminalType(action.Type)) return false;
  if (!isModeled(action.Type)) return true;
  return builderErrors(action.Type).length > 0;
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
 * What a type's NextAction mirrors, from the catalog's next rule: an error
 * branch (a DTMF menu's or a Compare's NoMatchingCondition, a percentage
 * split's default) or
 * a condition branch (CheckHoursOfOperation's out-of-hours path, Loop's done
 * path). The block class writes NextAction as a copy of that branch, the way
 * the console does, and the mutations keep the two together (mirrorNext in
 * mutations.ts). Undefined when NextAction is its own path or there is none.
 */
export type MirrorRule =
  { kind: "error"; errorType: string } | { kind: "condition"; operand: string };

export function mirrorRule(type: string): MirrorRule | undefined {
  const rule = nextRule(type);
  if (rule === undefined) return undefined;
  const error = "mirrors:error:";
  const condition = "mirrors:condition:";
  if (rule.startsWith(error)) return { kind: "error", errorType: rule.slice(error.length) };
  if (rule.startsWith(condition)) {
    return { kind: "condition", operand: rule.slice(condition.length) };
  }
  return undefined;
}

/**
 * Whether a drag can author a NextAction on this action. A Compare and a DTMF
 * menu carry one, but it is not authored: it mirrors the NoMatchingCondition
 * branch (mirrorRule), so a drag from the primary handle means a branch, never
 * a bare NextAction; the same holds for every type whose NextAction mirrors a
 * branch. The service refuses a Compare without the NextAction
 * (conformance/flow-language/actions.md, rule 38), and wiring its
 * NoMatchingCondition writes it (mirrorNext in mutations.ts). The
 * stored-input form of GetParticipantInput has no branches, so there the
 * drag means the next action as it does on any other block. A `none` rule
 * (MessageParticipantIteratively) means the builder omits NextAction, so no
 * drag authors one either.
 */
export function acceptsNextAction(action: FlowAction): boolean {
  if (isTerminalType(action.Type)) return false;
  if (action.Type === ActionType.GetParticipantInput) return !isDtmfMenu(action);
  const rule = nextRule(action.Type);
  if (rule === undefined) return true;
  return rule !== "none" && mirrorRule(action.Type) === undefined;
}

/** The operands the catalog lists for a fixed or enum kind, in the builder's order. */
function listedOperands(type: string): readonly string[] {
  return modeledEntry(type)?.transitions.conditionOperands ?? [];
}

/**
 * Whether a drag from this action's primary handle should mean "add a branch".
 *
 * Compare authors free-form branches and a DTMF menu authors one branch per
 * key (defaultConditionFor picks the key); the stored-input form of
 * GetParticipantInput has no branches at all. A type with a fixed set of
 * conditions (CheckHoursOfOperation's Equals True and Equals False, Loop's
 * two results) takes one drag per operand, in the builder's order, and no
 * more once every operand is wired. An unmodeled action that already carries
 * conditions demonstrably uses them, and its parameters and transitions are
 * re-emitted verbatim, so a drag there means a branch too.
 */
export function acceptsConditions(action: FlowAction): boolean {
  if (isTerminalType(action.Type)) return false;
  if (action.Type === ActionType.GetParticipantInput) return isDtmfMenu(action);
  if (isModeled(action.Type)) {
    const kind = conditionsKind(action.Type);
    if (kind === undefined || kind === "none") return false;
    if (kind === "fixed") return defaultConditionFor(action) !== undefined;
    return true;
  }
  return (action.Transitions.Conditions ?? []).length > 0;
}

/**
 * The condition operators the Flow language defines, in schema order
 * (conformance/schema/flowdoc-0.2.schema.json, $defs.condition.Operator). The
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
 * branch left to add. A fixed kind, and an enum kind whose page names its
 * operands, get Equals on the first listed operand not yet wired, in the
 * builder's order, for the same reason; a Wait's are WaitCompleted and then
 * its two events, and the drag that adds an event also lists it in the
 * block's Events parameter (mutations.ts, withWaitEvent).
 */
export function defaultConditionFor(action: FlowAction): Condition | undefined {
  const kind = conditionsKind(action.Type);
  if (kind === "dtmf") {
    const used = usedKeys(action);
    const key = DTMF_KEY_ORDER.find((k) => !used.has(k));
    return key === undefined ? undefined : { Operator: "Equals", Operands: [key] };
  }
  // A percentage split's branches are a chain of NumberLessThan thresholds
  // its block class computes from percentages, so a drag claims the next 1%
  // (threshold one above the last) and the inspector's branch editor adjusts
  // it; the empty placeholder would demote the block.
  if (action.Type === ActionType.DistributeByPercentage) {
    const last = Math.max(
      1,
      ...(action.Transitions.Conditions ?? []).map((c) => Number(c.Condition.Operands[0])),
    );
    const next = Number.isFinite(last) ? last + 1 : 2;
    return next > 100 ? undefined : { Operator: "NumberLessThan", Operands: [String(next)] };
  }
  // A metric check's branches compare numbers; NumberGreaterThan 0 is the
  // one comparison every metric accepts (and the only one the agent metrics
  // do), so a drag starts there and the branch editor adjusts it.
  if (action.Type === ActionType.CheckMetricData) {
    return { Operator: "NumberGreaterThan", Operands: ["0"] };
  }
  const listed = listedOperands(action.Type);
  if ((kind === "fixed" || kind === "enum") && listed.length > 0) {
    const used = usedKeys(action);
    const operand = listed.find((o) => !used.has(o));
    return operand === undefined ? undefined : { Operator: "Equals", Operands: [operand] };
  }
  // A numeric branch (a percentage split, a metric check) compares with an
  // operator its inspector can change; every other kind starts as the empty
  // Equals placeholder the inspector fills in.
  const operator: ConditionOperator =
    kind === "numeric" ? "NumberLessThan" : DEFAULT_CONDITION_OPERATOR;
  return { Operator: operator, Operands: [...DEFAULT_CONDITION_OPERANDS] };
}

/**
 * Whether an error edge moved from another block can land on this one: a
 * branch this block's class wires and does not have yet. A Wait's
 * ParticipantNotFound lands only beside its BotParticipantDisconnected
 * branch. An unmodeled block keeps whatever it is given, as with any drag.
 */
export function admitsError(action: FlowAction, errorType: string): boolean {
  if (isTerminalType(action.Type)) return false;
  if (!isModeled(action.Type)) return true;
  if (action.Type === ActionType.GetParticipantInput && !isDtmfMenu(action)) return false;
  if (!builderErrors(action.Type).includes(errorType)) return false;
  if ((action.Transitions.Errors ?? []).some((e) => e.ErrorType === errorType)) return false;
  if (action.Type === ActionType.Wait && errorType === PARTICIPANT_NOT_FOUND) {
    return usedKeys(action).has("BotParticipantDisconnected");
  }
  return true;
}

/**
 * Whether a condition edge moved from another block can land on this one as
 * a branch its class reads: a key a menu does not answer yet, an operand a
 * fixed or listed kind names and this block has not wired, any Equals on a
 * single string for a kind whose operands the page leaves open (a Lex
 * intent, a view action), anything for a numeric or free-form kind.
 */
export function admitsCondition(action: FlowAction, condition: Condition): boolean {
  if (isTerminalType(action.Type)) return false;
  if (!isModeled(action.Type)) return true;
  if (action.Type === ActionType.GetParticipantInput && !isDtmfMenu(action)) return false;
  const kind = conditionsKind(action.Type);
  if (kind === undefined || kind === "none") return false;
  if (kind === "numeric" || kind === "custom") return true;
  if (condition.Operator !== "Equals" || condition.Operands.length !== 1) return false;
  const operand = String(condition.Operands[0]);
  if (usedKeys(action).has(operand)) return false;
  if (kind === "dtmf") return (DTMF_KEY_ORDER as readonly string[]).includes(operand);
  const listed = listedOperands(action.Type);
  return listed.length === 0 || listed.includes(operand);
}
