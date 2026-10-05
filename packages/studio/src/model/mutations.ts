/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Pure FlowDoc mutations. Every mutation returns a new canonicalized doc with
// the refs index regenerated from content (collectRefs), so the doc stays
// byte-stable through serialize and the refs sidebar never goes stale.
//
// ONE INVARIANT, ENFORCED CENTRALLY
//
// No mutation may take an Action that codegen can express as a typed builder
// block and leave it in a shape codegen can only emit as `new GenericBlock`.
// That demotion is silent: the schema accepts it, lint accepts it,
// assertSaveable accepts it, and the user loses typed authoring for the block
// with no way back through the canvas.
//
// Earlier passes fought this per mutation, and every unguarded path stayed a
// hole. So the rule is not restated per mutation any more: `guard()` wraps
// EVERY exported mutation, probes the doc before and after through
// model/demotion.ts (which asks the real codegen, not a copy of its rules),
// and throws MutationRefused when a block the user already had would lose its
// typed block. tests/mutationGuard.test.ts enumerates this module's exports
// and fails if any mutation is not wrapped, so a mutation added later is
// guarded by construction.
//
// What is left in this file is AUTHORING INTENT, not legality: which kind of
// transition a drag should create, which error branch is next in a type's
// vocabulary, and which edits would clobber content the user cannot get back.
// Legality is the guard's job, and it has exactly one implementation.

import type {
  Condition,
  ConditionTransition,
  ErrorTransition,
  FlowAction,
  FlowDoc,
  ModeledActionType,
  Point,
  Transitions,
  WaitEvent,
} from "@flow-as-code/core";
import {
  builderErrorsFor,
  ActionType,
  MAX_ACTIONS_PER_FLOW,
  MESSAGES_INTERRUPTED,
  PARTICIPANT_NOT_FOUND,
  WAIT_COMPLETED,
  WAIT_EVENTS,
  canonicalize,
  collectRefs,
} from "@flow-as-code/core";
import {
  acceptsConditions,
  acceptsNextAction,
  admitsCondition,
  admitsError,
  defaultConditionFor,
  isConditionOperator,
  isDtmfMenu,
  isTerminalType,
  mirrorRule,
} from "./capabilities.js";
import { demotionDelta } from "./demotion.js";
import type { ParsedEdgeId } from "./graph.js";
import { parseEdgeId } from "./graph.js";
import { ID_SLUG_BY_TYPE, defaultAction, isModeled } from "./palette.js";

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

/**
 * Thrown when a gesture would silently demote a block to a GenericBlock. It
 * names the blocks and says why, because the UI has to be able to tell the
 * user what it refused and what to do instead: a refusal the canvas swallows
 * is indistinguishable from a bug.
 */
export class MutationRefused extends Error {
  /** The mutation that was refused, for tests and logs. */
  readonly mutation: string;
  /** Identifiers that would have lost their typed block. */
  readonly blockIds: readonly string[];

  constructor(mutation: string, blockIds: readonly string[], message: string) {
    super(message);
    this.name = "MutationRefused";
    this.mutation = mutation;
    this.blockIds = blockIds;
  }
}

/** Marks a function as having passed through guard(). */
const GUARD_TAG = Symbol.for("flow-studio.guarded-mutation");

/** The registered name of a guarded mutation, or undefined if it is not one. */
export function guardedMutationName(value: unknown): string | undefined {
  if (typeof value !== "function") return undefined;
  const tag = (value as unknown as Record<symbol, unknown>)[GUARD_TAG];
  return typeof tag === "string" ? tag : undefined;
}

interface GuardSpec {
  /** How the refusal names the gesture, e.g. "Deleting that block". */
  label: string;
  /** What the user can do instead. */
  hint: string;
}

function isFlowDoc(value: unknown): value is FlowDoc {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as FlowDoc).flowdoc === "string" &&
    typeof (value as FlowDoc).content === "object"
  );
}

/**
 * The doc a mutation produced, or undefined when it produced none. Return
 * shapes are enumerated rather than duck-typed loosely: an unrecognized shape
 * throws, so a mutation added later cannot slip past the guard by returning
 * its doc under a key this function has never heard of.
 */
function resultDoc(name: string, result: unknown): FlowDoc | undefined {
  if (result === undefined) return undefined;
  if (isFlowDoc(result)) return result;
  if (result !== null && typeof result === "object") {
    const nested = (result as { doc?: unknown }).doc;
    if (isFlowDoc(nested)) return nested;
    if ((result as { ok?: unknown }).ok === false) return undefined;
  }
  throw new TypeError(
    `${name}: a guarded mutation must return a FlowDoc, { doc }, { ok: false }, or undefined.`,
  );
}

function refusalMessage(spec: GuardSpec, ids: readonly string[]): string {
  const names = ids.map((id) => `"${id}"`).join(", ");
  const many = ids.length > 1;
  return (
    `${spec.label} would turn ${names} into ` +
    `${many ? "read-only generic blocks" : "a read-only generic block"}: the code generator ` +
    `could no longer express ${many ? "them" : "it"} as ` +
    `${many ? "typed blocks" : "a typed block"}. ${spec.hint}`
  );
}

/**
 * Wraps one mutation in the demotion invariant. The first argument must be the
 * document, which is how the guard finds the "before" state; that is asserted
 * at runtime so the convention cannot be broken silently.
 */
function guard<A extends unknown[], R>(
  name: string,
  spec: GuardSpec,
  impl: (doc: FlowDoc, ...args: A) => R,
): (doc: FlowDoc, ...args: A) => R {
  const wrapped = (doc: FlowDoc, ...args: A): R => {
    if (!isFlowDoc(doc)) {
      throw new TypeError(`${name}: the first argument of a guarded mutation must be a FlowDoc.`);
    }
    const result = impl(doc, ...args);
    const next = resultDoc(name, result);
    // Nothing produced, or the same document back: nothing can have changed.
    if (next === undefined || next === doc) return result;
    const delta = demotionDelta(doc, next);
    if (delta.unverifiable !== undefined) {
      // The oracle could not read the document, so it cannot vouch for the
      // change. Refusing is the only safe answer: treating "no answer" as
      // "nothing was demoted" is what silently disabled this invariant before.
      throw new MutationRefused(
        name,
        [],
        `${spec.label} cannot be checked because this document could not be analysed: ${delta.unverifiable}`,
      );
    }
    if (delta.ungeneratable !== undefined) {
      throw new MutationRefused(
        name,
        [],
        `${spec.label} would leave the flow in a state the code generator cannot emit at all: ${delta.ungeneratable}`,
      );
    }
    if (delta.demoted.length > 0) {
      throw new MutationRefused(name, delta.demoted, refusalMessage(spec, delta.demoted));
    }
    return result;
  };
  Object.defineProperty(wrapped, "name", { value: name });
  Object.defineProperty(wrapped, GUARD_TAG, { value: name, enumerable: false });
  return wrapped;
}

// ---------------------------------------------------------------------------
// Helpers (not mutations: they never produce a document)
// ---------------------------------------------------------------------------

/** Regenerates the derived refs index and canonicalizes key order. */
export function normalize(doc: FlowDoc): FlowDoc {
  return canonicalize({ ...doc, refs: collectRefs(doc.content) });
}

/**
 * Transitions in synth normal form: `Errors` and `Conditions` present (empty
 * when nothing is wired) on any action that has a transition at all, `{}` on
 * a terminal one. Every block class writes this form, and codegen verifies an
 * inversion by comparing bytes, so a block whose Transitions were built up by
 * gestures (`{ NextAction }`, then an error) stayed a GenericBlock until a
 * save and re-synth wrote the arrays back. Writing them here makes a wired
 * palette block typed at the moment it is wired.
 */
function normalTransitions(t: Transitions): Transitions {
  if (Object.keys(t).length === 0) return t;
  return { ...t, Errors: t.Errors ?? [], Conditions: t.Conditions ?? [] };
}

function withAction(doc: FlowDoc, id: string, f: (a: FlowAction) => FlowAction): FlowDoc {
  return {
    ...doc,
    content: {
      ...doc.content,
      Actions: doc.content.Actions.map((a) => {
        if (a.Identifier !== id) return a;
        const next = f(a);
        return { ...next, Transitions: normalTransitions(next.Transitions) };
      }),
    },
  };
}

export function getAction(doc: FlowDoc, id: string): FlowAction | undefined {
  return doc.content.Actions.find((a) => a.Identifier === id);
}

/** Transitions in other actions that point at the given block. */
export function incomingCount(doc: FlowDoc, id: string): number {
  let n = 0;
  for (const a of doc.content.Actions) {
    if (a.Identifier === id) continue;
    const t = a.Transitions;
    if (t.NextAction === id) n++;
    n += (t.Errors ?? []).filter((e) => e.NextAction === id).length;
    n += (t.Conditions ?? []).filter((c) => c.NextAction === id).length;
  }
  return n;
}

/** First free Identifier for a new block of the given type. */
export function nextIdentifier(doc: FlowDoc, type: ModeledActionType): string {
  const base = ID_SLUG_BY_TYPE[type];
  const taken = new Set(doc.content.Actions.map((a) => a.Identifier));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** False once the flow holds the 250 Actions Connect allows. */
export function canAddBlock(doc: FlowDoc): boolean {
  return doc.content.Actions.length < MAX_ACTIONS_PER_FLOW;
}

/**
 * MessageParticipant takes exactly one of Text, SSML, PromptId;
 * GetParticipantInput takes at most one (a menu may play nothing).
 */
export const MESSAGE_BODY_KEYS = ["Text", "SSML", "PromptId"] as const;
export type MessageBodyKey = (typeof MESSAGE_BODY_KEYS)[number];

/** The body parameter currently present, if any. */
export function messageBodyKey(action: FlowAction): MessageBodyKey | undefined {
  return MESSAGE_BODY_KEYS.find((k) => action.Parameters[k] !== undefined);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Dragging a node updates layout only; content is untouched. An id that is not
 * an Action is ignored rather than inventing a layout entry, so a stale
 * position can never accumulate in the file. The SAME document comes back in
 * that case, which the reducer treats as a no-op.
 */
export const moveNode = guard(
  "moveNode",
  { label: "Moving that block", hint: "This should be impossible; please report it." },
  (doc: FlowDoc, id: string, position: Point): FlowDoc => {
    if (getAction(doc, id) === undefined) return doc;
    return normalize({
      ...doc,
      layout: { ...doc.layout, [id]: { x: Math.round(position.x), y: Math.round(position.y) } },
    });
  },
);

export interface SetParamOptions {
  /** Keys deleted when this one is set, for mutually exclusive parameters. */
  clears?: readonly string[];
}

function setParamImpl(
  doc: FlowDoc,
  id: string,
  key: string,
  value: unknown,
  options: SetParamOptions = {},
): FlowDoc {
  return normalize(
    withAction(doc, id, (a) => {
      const params = { ...a.Parameters };
      for (const k of options.clears ?? []) delete params[k];
      if (value === undefined) delete params[key];
      else params[key] = value;
      return { ...a, Parameters: params };
    }),
  );
}

/**
 * Sets (or, with value undefined, deletes) one top-level parameter. Deleting a
 * parameter a block class requires (a MessageParticipant's body, a Compare's
 * ComparisonValue) demotes the block, which is why this sits behind the guard
 * like every other mutation rather than being trusted as a low-level setter.
 */
export const setParam = guard(
  "setParam",
  {
    label: "That parameter change",
    hint: "Give the parameter a value the block type accepts instead of clearing it.",
  },
  setParamImpl,
);

/** Bounds a numeric parameter must satisfy, from the inspector's FieldDesc. */
export interface NumberBounds {
  min?: number;
  max?: number;
  /** Integers unless a field explicitly declares otherwise. */
  integer?: boolean;
  /**
   * Store the value as its decimal string rather than a JSON number. Connect
   * spells some numeric parameters that way (GetParticipantInput's
   * InputTimeLimitSeconds is "5" in the console's export, and the block class
   * emits the same), and a JSON 5 there is a shape only GenericBlock holds.
   */
  asString?: boolean;
  /** An empty field deletes the parameter instead of being refused. */
  optional?: boolean;
  /** Keys deleted when this one is set, for mutually exclusive parameters. */
  clears?: readonly string[];
}

export type SetNumberResult = { ok: true; doc: FlowDoc } | { ok: false; error: string };

/**
 * Sets a numeric parameter, enforcing the bounds the field declares. The
 * inspector's min/max attributes are a hint a browser may ignore and an empty
 * field parses as Number("") === 0, so the check lives here: without it,
 * clearing the Lambda timeout wrote 0, which the schema rejects (minimum 1).
 */
export const setNumberParam = guard(
  "setNumberParam",
  {
    label: "That parameter change",
    hint: "Give the parameter a value the block type accepts instead.",
  },
  (
    doc: FlowDoc,
    id: string,
    key: string,
    raw: unknown,
    bounds: NumberBounds = {},
  ): SetNumberResult => {
    const text = typeof raw === "string" ? raw.trim() : raw;
    if (text === "" || text === null || text === undefined) {
      if (bounds.optional === true) return { ok: true, doc: setParamImpl(doc, id, key, undefined) };
      return { ok: false, error: "Enter a number." };
    }
    const value = Number(text);
    if (!Number.isFinite(value)) return { ok: false, error: `"${String(raw)}" is not a number.` };
    if (bounds.integer !== false && !Number.isInteger(value)) {
      return { ok: false, error: "Must be a whole number." };
    }
    if (bounds.min !== undefined && value < bounds.min) {
      return { ok: false, error: `Must be at least ${bounds.min}.` };
    }
    if (bounds.max !== undefined && value > bounds.max) {
      return { ok: false, error: `Must be at most ${bounds.max}.` };
    }
    const stored = bounds.asString === true ? String(value) : value;
    return { ok: true, doc: setParamImpl(doc, id, key, stored, { clears: bounds.clears }) };
  },
);

/**
 * Switches the message body to one kind, always leaving exactly one of Text,
 * SSML, and PromptId present. The value is required and the requirement is
 * checked at runtime, not only by the type: passing undefined used to delete
 * every body parameter, leaving a block the schema rejects ("must have
 * required property 'PromptId'"), and a TypeScript-only invariant is no
 * invariant at all for a value that arrives from an event handler.
 *
 * The hint names the one refusal this mutation can reach. It always writes
 * exactly one body key, so "exactly one of" is never what the guard sees;
 * what it sees is a PromptId the code generator cannot express, a value that
 * is neither a `${cdref:prompt:...}` token nor a JSONPath (codegen's
 * refSource). Text and SSML take any string, and the same body switch serves
 * a GetParticipantInput menu, so the hint does not name MessageParticipant.
 */
export const setMessageBody = guard(
  "setMessageBody",
  {
    label: "That message body change",
    hint: "Give PromptId a ${cdref:prompt:...} reference or a JSONPath; Text and SSML take any string.",
  },
  (doc: FlowDoc, id: string, kind: MessageBodyKey, value: string): FlowDoc => {
    if (typeof value !== "string") {
      throw new TypeError(
        `setMessageBody: ${kind} must be a string; a message cannot be left with no body.`,
      );
    }
    const others = MESSAGE_BODY_KEYS.filter((k) => k !== kind);
    return setParamImpl(doc, id, kind, value, { clears: others });
  },
);

export interface AddBlockResult {
  doc: FlowDoc;
  id: string;
}

/**
 * Inserts a modeled block at the given canvas position. Throws at the Connect
 * limit; the palette disables itself there (canAddBlock) so this is the guard,
 * not the message the user normally sees.
 *
 * A new block starts unwired, and most block classes cannot be expressed until
 * they are wired, so codegen emits the new id as a GenericBlock until then.
 * That is not a demotion: the block did not exist a moment ago and nothing was
 * lost. The guard only protects ids that existed before the mutation
 * (demotionDelta), and lint's terminal-blocks and error-branches findings are
 * what guide the user to finish wiring it.
 */
export const addBlock = guard(
  "addBlock",
  { label: "Adding that block", hint: "This should be impossible; please report it." },
  (doc: FlowDoc, type: ModeledActionType, position: Point): AddBlockResult => {
    if (!canAddBlock(doc)) {
      throw new Error(
        `This flow already has ${MAX_ACTIONS_PER_FLOW} actions; Connect allows no more.`,
      );
    }
    const id = nextIdentifier(doc, type);
    const next = normalize({
      ...doc,
      content: { ...doc.content, Actions: [...doc.content.Actions, defaultAction(type, id)] },
      layout: { ...doc.layout, [id]: { x: Math.round(position.x), y: Math.round(position.y) } },
    });
    return { doc: next, id };
  },
);

/**
 * Deletes a block and detaches every transition that pointed at it. The
 * StartAction cannot be deleted; reassigning the start is not in v1 scope.
 *
 * Detaching is what makes this dangerous: a MessageParticipant with its
 * NextAction removed is no longer expressible, so deleting a busy block would
 * quietly demote its neighbours (deleting "hang-up" in the demo flow demotes
 * four). The deliberate choice is to REFUSE rather than repair. Repair would
 * mean inventing a destination for someone else's transition, which is a
 * larger, unasked-for edit to a flow the user cannot see all of; and silently
 * demoting is the exact bug this guard exists to stop. The refusal names the
 * neighbours, and the user's route is to rewire those edges to another block
 * first (drag the edge end on the canvas), then delete.
 */
export const deleteBlock = guard(
  "deleteBlock",
  {
    label: "Deleting that block",
    hint: "Rewire the transitions that point at it to another block first, then delete it.",
  },
  (doc: FlowDoc, id: string): FlowDoc => {
    if (doc.content.StartAction === id) {
      throw new Error(`Cannot delete "${id}": it is the flow's StartAction.`);
    }
    const layout = { ...doc.layout };
    delete layout[id];
    return normalize({
      ...doc,
      content: {
        ...doc.content,
        Actions: doc.content.Actions.filter((a) => a.Identifier !== id).map((a) => {
          const t = a.Transitions;
          const out = { ...t };
          if (out.NextAction === id) delete out.NextAction;
          if (out.Errors !== undefined) out.Errors = out.Errors.filter((e) => e.NextAction !== id);
          if (out.Conditions !== undefined)
            out.Conditions = out.Conditions.filter((c) => c.NextAction !== id);
          return { ...a, Transitions: out };
        }),
      },
      layout,
    });
  },
);

/** The source handle a drag started from. Auto is a drag with no handle id. */
export type SourceHandle = "primary" | "error";

/**
 * Some types' NextAction mirrors another branch (capabilities.ts mirrorRule):
 * a DTMF menu's or a Compare's NoMatchingCondition error, a
 * CheckHoursOfOperation's out-of-hours condition, a Loop's done condition.
 * The console writes both
 * for the one path and the block class emits both (@flow-as-code/core
 * blocks.ts), so the canvas treats them as one path: wiring or retargeting
 * either side carries the other along. Without this, wiring the mirrored
 * branch left NextAction behind, and the only block shape with the two apart
 * is one GenericBlock can hold, so every such block would have been refused
 * or demoted at its last drag. Any other type is returned as is.
 */
function mirrorNext(action: FlowAction): FlowAction {
  const target = mirrorTarget(action);
  if (target === undefined || action.Transitions.NextAction === target) return action;
  return { ...action, Transitions: { ...action.Transitions, NextAction: target } };
}

/** Whether this branch is the fixed condition a mirroring type's NextAction copies. */
function isMirroredCondition(c: ConditionTransition, operand: string): boolean {
  return c.Condition.Operands.length === 1 && String(c.Condition.Operands[0]) === operand;
}

/** Where the branch this type's NextAction mirrors goes, if that branch is wired. */
function mirrorTarget(action: FlowAction): string | undefined {
  const rule = mirrorRule(action.Type);
  if (rule === undefined) return undefined;
  // The stored-input form of GetParticipantInput has no branches to mirror.
  if (action.Type === ActionType.GetParticipantInput && !isDtmfMenu(action)) return undefined;
  if (rule.kind === "error") {
    return (action.Transitions.Errors ?? []).find((e) => e.ErrorType === rule.errorType)
      ?.NextAction;
  }
  return (action.Transitions.Conditions ?? []).find((c) => isMirroredCondition(c, rule.operand))
    ?.NextAction;
}

/** The mirrored branch retargeted along with NextAction, for a mirroring type. */
function retargetMirrored(action: FlowAction, t: Transitions, target: string): Transitions {
  const rule = mirrorRule(action.Type);
  if (rule === undefined || mirrorTarget(action) === undefined) return t;
  if (rule.kind === "error") {
    return {
      ...t,
      Errors: (t.Errors ?? []).map((e) =>
        e.ErrorType === rule.errorType ? { ...e, NextAction: target } : e,
      ),
    };
  }
  return {
    ...t,
    Conditions: (t.Conditions ?? []).map((c) =>
      isMirroredCondition(c, rule.operand) ? { ...c, NextAction: target } : c,
    ),
  };
}

/**
 * A Wait's event branches carry bookkeeping no other type's conditions do.
 * Its Events parameter lists the events its branches wait for (the block
 * class writes both from one config and the inverter holds them equal, in
 * WAIT_EVENTS order), and ParticipantNotFound is wired exactly when
 * BotParticipantDisconnected is ("The supported event currently is
 * \"BotParticipantDisconnected\"."). So the drag that adds an event branch
 * lists the event and, for the bot event, wires ParticipantNotFound to the
 * same target for the user to retarget, and removing the branch takes both
 * away again. Without this, every event drag on a typed Wait was refused as
 * a demotion, and a Wait once typed could never gain an event.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html
 */
function waitEventOf(action: FlowAction, condition: Condition): WaitEvent | undefined {
  if (action.Type !== ActionType.Wait || condition.Operands.length !== 1) return undefined;
  const operand = String(condition.Operands[0]);
  return (WAIT_EVENTS as readonly string[]).includes(operand) ? (operand as WaitEvent) : undefined;
}

function listedWaitEvents(action: FlowAction): string[] {
  const listed = action.Parameters.Events;
  return Array.isArray(listed) ? listed.map(String) : [];
}

/** The errors in the block class's order for the form the action is in, a stable sort. */
function inBuilderOrder(action: FlowAction, errors: readonly ErrorTransition[]): ErrorTransition[] {
  const order = builderErrorsFor(action);
  const rank = (e: ErrorTransition) => {
    const i = order.indexOf(e.ErrorType);
    return i === -1 ? order.length : i;
  };
  return [...errors].sort((x, y) => rank(x) - rank(y));
}

function withWaitEvent(action: FlowAction, event: WaitEvent, target: string): FlowAction {
  const listed = listedWaitEvents(action);
  const events = WAIT_EVENTS.filter((e) => e === event || listed.includes(e));
  const errors = action.Transitions.Errors ?? [];
  const pairs =
    event === "BotParticipantDisconnected" &&
    !errors.some((e) => e.ErrorType === PARTICIPANT_NOT_FOUND);
  return {
    ...action,
    Parameters: { ...action.Parameters, Events: events },
    Transitions: {
      ...action.Transitions,
      ...(pairs
        ? {
            Errors: inBuilderOrder(action, [
              ...errors,
              { ErrorType: PARTICIPANT_NOT_FOUND, NextAction: target },
            ]),
          }
        : {}),
    },
  };
}

function withoutWaitEvent(action: FlowAction, event: WaitEvent): FlowAction {
  const events = listedWaitEvents(action).filter((e) => e !== event);
  const parameters = { ...action.Parameters };
  if (events.length === 0) delete parameters.Events;
  else parameters.Events = events;
  const t = { ...action.Transitions };
  if (event === "BotParticipantDisconnected") {
    t.Errors = (t.Errors ?? []).filter((e) => e.ErrorType !== PARTICIPANT_NOT_FOUND);
  }
  return { ...action, Parameters: parameters, Transitions: t };
}

/**
 * A Wait's conditions in its block class's order: WaitCompleted first, then
 * the events in WAIT_EVENTS order, which is also the order withWaitEvent
 * writes into Events; the inverter holds both. Any other type keeps the
 * order it has.
 */
function inConditionOrder(
  type: string,
  conditions: readonly ConditionTransition[],
): ConditionTransition[] {
  if (type !== ActionType.Wait) return [...conditions];
  const order: readonly string[] = [WAIT_COMPLETED, ...WAIT_EVENTS];
  const rank = (c: ConditionTransition) => {
    const i =
      c.Condition.Operands.length === 1 ? order.indexOf(String(c.Condition.Operands[0])) : -1;
    return i === -1 ? order.length : i;
  };
  return [...conditions].sort((x, y) => rank(x) - rank(y));
}

/**
 * A loop of prompts' interrupt is two things on the wire and one on the
 * canvas: InterruptFrequencySeconds and the MessagesInterrupted branch, which
 * the block class takes only together. A branch added without seconds gets
 * the console's "30" (its Sample interruptible queue flow writes that), for
 * the inspector's number field to change; removing the branch removes the
 * seconds.
 * https://docs.aws.amazon.com/connect/latest/adminguide/loop-prompts.html
 */
function isInterrupt(action: FlowAction, condition: Condition): boolean {
  return (
    action.Type === ActionType.MessageParticipantIteratively &&
    condition.Operands.length === 1 &&
    String(condition.Operands[0]) === MESSAGES_INTERRUPTED
  );
}

/**
 * The action with `condition` added as a branch to `target`, and every
 * parameter the block class pairs with that branch: a Wait event's listing
 * (and ParticipantNotFound for the bot event), a loop's interrupt seconds.
 * Both a fresh drag and a branch moved from another block land through here.
 */
function withBranch(a: FlowAction, condition: Condition, target: string): FlowAction {
  const branched: FlowAction = {
    ...a,
    Transitions: {
      ...a.Transitions,
      Conditions: inConditionOrder(a.Type, [
        ...(a.Transitions.Conditions ?? []),
        { NextAction: target, Condition: condition },
      ]),
    },
  };
  const event = waitEventOf(a, condition);
  if (event !== undefined) return withWaitEvent(branched, event, target);
  if (isInterrupt(a, condition) && a.Parameters.InterruptFrequencySeconds === undefined) {
    return { ...branched, Parameters: { ...branched.Parameters, InterruptFrequencySeconds: "30" } };
  }
  return branched;
}

/** The action without its condition at `index`, and without what the class pairs with it. */
function dropCondition(a: FlowAction, index: number): FlowAction {
  const conditions = a.Transitions.Conditions ?? [];
  const leaving = conditions[index];
  const next = {
    ...a,
    Transitions: { ...a.Transitions, Conditions: conditions.filter((_, i) => i !== index) },
  };
  if (leaving === undefined) return next;
  const event = waitEventOf(a, leaving.Condition);
  if (event !== undefined) return withoutWaitEvent(next, event);
  if (isInterrupt(a, leaving.Condition)) {
    const parameters = { ...next.Parameters };
    delete parameters.InterruptFrequencySeconds;
    return { ...next, Parameters: parameters };
  }
  return next;
}

function appendCondition(doc: FlowDoc, action: FlowAction, target: string): FlowDoc | undefined {
  const condition = defaultConditionFor(action);
  if (condition === undefined) return undefined;
  return normalize(
    withAction(doc, action.Identifier, (a) => mirrorNext(withBranch(a, condition, target))),
  );
}

function wireMissingError(doc: FlowDoc, action: FlowAction, target: string): FlowDoc | undefined {
  // Only modeled types have a known error vocabulary; an unmodeled block keeps
  // whatever errors it came with. This is intent, not legality: it picks WHICH
  // error branch a drag should create.
  if (!isModeled(action.Type)) return undefined;
  // The branches the block class wires on the form the action is in, in its
  // order, from the catalog: the extras and then the catch-all for most
  // types, two named errors and no catch-all for some, none at all for
  // others; for a GetParticipantInput the menu form's three or the stored
  // form's catch-all, with InvalidPhoneNumber before it on a phone number. A
  // Wait's ParticipantNotFound is wired by the drag that adds its
  // BotParticipantDisconnected branch (withWaitEvent), never on its own.
  const wanted = builderErrorsFor(action).filter(
    (e) => !(action.Type === ActionType.Wait && e === PARTICIPANT_NOT_FOUND),
  );
  const wired = new Set((action.Transitions.Errors ?? []).map((e) => e.ErrorType));
  const missing = wanted.find((e) => !wired.has(e));
  if (missing === undefined) return undefined;
  // In the class's order, not appended: a Wait whose bot branch was dragged
  // before its catch-all already holds ParticipantNotFound, and the
  // catch-all appended after it would never invert.
  return normalize(
    withAction(doc, action.Identifier, (a) =>
      mirrorNext({
        ...a,
        Transitions: {
          ...a.Transitions,
          Errors: inBuilderOrder(a, [
            ...(a.Transitions.Errors ?? []),
            { ErrorType: missing, NextAction: target },
          ]),
        },
      }),
    ),
  );
}

/**
 * A drag from a node's source handle to another node.
 *
 * From the primary handle: a new condition branch for types whose paths are
 * conditions (Compare, and one key per branch on a GetParticipantInput),
 * otherwise the success transition when the source has none. From the error
 * handle: the first error branch the type still lacks. A drag with no handle
 * id (programmatic, and older callers) tries the primary path and falls back
 * to the error branch. Returns undefined when there is nothing the gesture
 * could mean.
 */
export const connectNodes = guard(
  "connectNodes",
  {
    label: "Wiring that transition",
    hint: "That block cannot carry this transition; wire it from a different handle or block.",
  },
  (doc: FlowDoc, source: string, target: string, handle?: SourceHandle): FlowDoc | undefined => {
    const action = getAction(doc, source);
    if (action === undefined || getAction(doc, target) === undefined) return undefined;
    if (isTerminalType(action.Type)) return undefined;

    if (handle !== "error") {
      if (acceptsConditions(action)) {
        const branched = appendCondition(doc, action, target);
        // No branch left to add (a menu with all twelve keys taken) is the
        // same dead end as any other: an explicit drag stops on the early
        // return below, a handle-less one falls back to the error branch.
        if (branched !== undefined) return branched;
      } else if (acceptsNextAction(action) && action.Transitions.NextAction === undefined) {
        return normalize(
          withAction(doc, source, (a) => ({
            ...a,
            Transitions: { ...a.Transitions, NextAction: target },
          })),
        );
      }
      // An explicit drag from the primary handle never silently becomes an
      // error branch; only the handle-less fallback continues.
      if (handle === "primary") return undefined;
    }

    return wireMissingError(doc, action, target);
  },
);

/** Replaces the condition of one branch. Rejects an unknown operator or no operands. */
export const setCondition = guard(
  "setCondition",
  {
    label: "That branch change",
    hint: "Restore an operator and operands the block type accepts.",
  },
  (doc: FlowDoc, id: string, index: number, condition: Condition): FlowDoc | undefined => {
    const action = getAction(doc, id);
    if (action === undefined) return undefined;
    const conditions = action.Transitions.Conditions ?? [];
    if (conditions[index] === undefined) return undefined;
    if (!isConditionOperator(condition.Operator)) return undefined;
    if (condition.Operands.length === 0 || condition.Operands.length > 10) return undefined;
    return normalize(
      withAction(doc, id, (a) => ({
        ...a,
        Transitions: {
          ...a.Transitions,
          Conditions: (a.Transitions.Conditions ?? []).map((c, i) =>
            i === index
              ? { ...c, Condition: { ...condition, Operands: [...condition.Operands] } }
              : c,
          ),
        },
      })),
    );
  },
);

/**
 * Drops one condition branch. Removing a Compare's LAST branch leaves a block
 * @flow-as-code/core's Compare inverter refuses (conditions.length === 0), so the guard
 * turns that into a refusal instead of a silent demotion.
 */
export const removeCondition = guard(
  "removeCondition",
  {
    label: "Removing that branch",
    hint: "Wire a replacement branch before removing the last one, or delete the block instead.",
  },
  (doc: FlowDoc, id: string, index: number): FlowDoc | undefined => {
    const action = getAction(doc, id);
    if (action === undefined || (action.Transitions.Conditions ?? [])[index] === undefined) {
      return undefined;
    }
    return normalize(withAction(doc, id, (a) => dropCondition(a, index)));
  },
);

function removeEdge(doc: FlowDoc, parsed: ParsedEdgeId): FlowDoc {
  return withAction(doc, parsed.source, (a) => {
    const rule = mirrorRule(a.Type);
    const t = { ...a.Transitions };
    // A mirroring type's next path is drawn twice (mirrorNext), so whichever
    // half the user moves away takes the other with it; otherwise the path
    // would still be drawn from here as the edge left behind. The rule names
    // the half: a menu's or a split's error, a Loop's or an hours check's
    // fixed condition. This used to know only the menu's error, so moving a
    // Loop's next edge left its done branch behind.
    if (parsed.kind === "next") {
      const leaving = t.NextAction;
      delete t.NextAction;
      if (leaving !== undefined && rule !== undefined && mirrorTarget(a) === leaving) {
        if (rule.kind === "error") {
          t.Errors = (t.Errors ?? []).filter((e) => e.ErrorType !== rule.errorType);
        } else {
          const index = (t.Conditions ?? []).findIndex((c) => isMirroredCondition(c, rule.operand));
          if (index !== -1) return dropCondition({ ...a, Transitions: t }, index);
        }
      }
    }
    if (parsed.kind === "error") {
      const leaving = (t.Errors ?? [])[parsed.errorIndex];
      t.Errors = (t.Errors ?? []).filter((_, i) => i !== parsed.errorIndex);
      if (
        rule?.kind === "error" &&
        leaving?.ErrorType === rule.errorType &&
        t.NextAction === leaving.NextAction
      ) {
        delete t.NextAction;
      }
    }
    if (parsed.kind === "condition") {
      const leaving = (t.Conditions ?? [])[parsed.conditionIndex];
      if (
        rule?.kind === "condition" &&
        leaving !== undefined &&
        isMirroredCondition(leaving, rule.operand) &&
        t.NextAction === leaving.NextAction
      ) {
        delete t.NextAction;
      }
      return dropCondition({ ...a, Transitions: t }, parsed.conditionIndex);
    }
    return { ...a, Transitions: t };
  });
}

/**
 * Rewires an existing edge to a new endpoint, at either end. Works for
 * GenericBlocks too: unknown actions keep their parameters read-only but stay
 * rewireable.
 *
 * Both ends go through the same code and the same guard. The previous version
 * checked capabilities on the source end only and applied the target end with
 * no checks at all, which is how moving a CheckHoursOfOperation's branch onto
 * another block demoted it on the demo flow. There is no second list of rules
 * here now: undefined means the gesture has no meaning (an unparseable edge
 * id, a missing endpoint, an overwrite that would drop a transition), and
 * anything that would cost a block its typed form is refused by the guard.
 */
export const rewireEdge = guard(
  "rewireEdge",
  {
    label: "Rewiring that transition",
    hint: "That block cannot carry this transition; drop the edge on a different block.",
  },
  (doc: FlowDoc, edgeId: string, newSource: string, newTarget: string): FlowDoc | undefined => {
    const parsed = parseEdgeId(edgeId);
    if (parsed === undefined) return undefined;
    const oldSource = getAction(doc, parsed.source);
    const source = getAction(doc, newSource);
    if (oldSource === undefined || source === undefined) return undefined;
    if (getAction(doc, newTarget) === undefined) return undefined;

    // Target-end rewire: same source, new destination. On a type whose
    // NextAction mirrors a branch the next edge and that branch are one path
    // drawn twice, so moving either end moves both (mirrorNext carries
    // NextAction after the branch; the branch follows NextAction here).
    if (newSource === parsed.source) {
      return normalize(
        withAction(doc, newSource, (a) => {
          let t: Transitions = { ...a.Transitions };
          if (parsed.kind === "next") {
            t = retargetMirrored(a, { ...t, NextAction: newTarget }, newTarget);
          }
          if (parsed.kind === "error")
            t.Errors = (t.Errors ?? []).map((e, i) =>
              i === parsed.errorIndex ? { ...e, NextAction: newTarget } : e,
            );
          if (parsed.kind === "condition")
            t.Conditions = (t.Conditions ?? []).map((c, i) =>
              i === parsed.conditionIndex ? { ...c, NextAction: newTarget } : c,
            );
          return mirrorNext({ ...a, Transitions: t });
        }),
      );
    }

    // Source-end rewire: move the transition to another block. The checks
    // are anti-clobber and gesture meaning, not legality: dropping a "next"
    // edge on a block that already has one would overwrite that transition,
    // and lost content is invisible to a demotion probe because the result
    // stays expressible. A menu's next path is also drawn as its
    // NoMatchingCondition error, so a no-match target wired elsewhere counts
    // as an existing next edge: the mirror below would otherwise replace the
    // dropped target with it. And a block whose NextAction is never its own
    // path (a mirroring type whose branch is not wired yet) has nowhere to
    // put a bare next edge: on an unfinished Compare, Loop or menu the block
    // is generic already, so the guard would not have seen the edge land
    // where no drag could ever have put it.
    if (parsed.kind === "next") {
      if (source.Transitions.NextAction !== undefined) return undefined;
      const mirrored = mirrorTarget(source);
      if (mirrored !== undefined && mirrored !== newTarget) return undefined;
      if (mirrored === undefined && !acceptsNextAction(source)) return undefined;
    }
    // The same path from the other side: the mirrored error dropped on a
    // mirroring type (a NoMatchingCondition on a GetParticipantInput) becomes
    // its next path too (the mirror below rewrites NextAction), so the drop
    // is held to what a fresh error drag is held to (wireMissingError). The
    // stored-input form cannot carry the error at all; a block that already
    // has one has nowhere to put a second; and one whose NextAction goes
    // elsewhere would have it overwritten, the same clobber as the next-edge
    // check above. The guard cannot stand in for these checks: an unfinished
    // menu is generic already, so there is nothing for it to see demoted.
    // (The stored-input form is typed, and the guard holds it as it holds a
    // message; the vocabulary check above is what refuses the drop there.)
    // An error or a branch lands only where a fresh drag could have authored
    // it: an error the landing block's class wires and it lacks, a condition
    // its kind admits and it does not already hold. Otherwise the landing
    // block, generic until finished, would take a branch no later gesture
    // can make typed (a NoMatchingError on a percentage split, a key branch
    // on a Wait), and the guard, seeing no demotion, would let it through.
    if (parsed.kind === "error" && !admitsError(source, parsed.errorType)) return undefined;
    if (parsed.kind === "condition") {
      const entry = (oldSource.Transitions.Conditions ?? [])[parsed.conditionIndex];
      if (entry === undefined || !admitsCondition(source, entry.Condition)) return undefined;
    }
    const rule = mirrorRule(source.Type);
    if (parsed.kind === "error" && rule?.kind === "error" && rule.errorType === parsed.errorType) {
      if (source.Type === ActionType.GetParticipantInput && !isDtmfMenu(source)) return undefined;
      if (mirrorTarget(source) !== undefined) return undefined;
      const next = source.Transitions.NextAction;
      if (next !== undefined && next !== newTarget) return undefined;
    }

    const removed = removeEdge(doc, parsed);
    // The landing side does what a fresh drag does: errors in the class's
    // order, a branch with what the class pairs with it.
    const moved = withAction(removed, newSource, (a) => {
      if (parsed.kind === "condition") {
        const entry = (oldSource.Transitions.Conditions ?? [])[parsed.conditionIndex];
        if (entry === undefined) return a;
        return mirrorNext(withBranch(a, entry.Condition, newTarget));
      }
      const t = { ...a.Transitions };
      if (parsed.kind === "next") t.NextAction = newTarget;
      if (parsed.kind === "error") {
        t.Errors = inBuilderOrder(a, [
          ...(t.Errors ?? []),
          { ErrorType: parsed.errorType, NextAction: newTarget },
        ]);
      }
      return mirrorNext({ ...a, Transitions: t });
    });
    return normalize(moved);
  },
);
