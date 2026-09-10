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

import type { Condition, FlowAction, FlowDoc, ModeledActionType, Point } from "@flow-as-code/core";
import {
  ActionType,
  EXTRA_ERRORS,
  MAX_ACTIONS_PER_FLOW,
  NO_MATCHING_CONDITION,
  NO_MATCHING_ERROR,
  canonicalize,
  collectRefs,
} from "@flow-as-code/core";
import {
  acceptsConditions,
  acceptsNextAction,
  defaultConditionFor,
  isConditionOperator,
  isDtmfMenu,
  isTerminalType,
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

function withAction(doc: FlowDoc, id: string, f: (a: FlowAction) => FlowAction): FlowDoc {
  return {
    ...doc,
    content: {
      ...doc.content,
      Actions: doc.content.Actions.map((a) => (a.Identifier === id ? f(a) : a)),
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
    return { ok: true, doc: setParamImpl(doc, id, key, stored) };
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
 * A GetParticipantInput's NextAction mirrors its NoMatchingCondition target.
 * The console writes both for the one "no match" path and the block class
 * emits both (@flow-as-code/core blocks.ts), so the canvas treats them as one path:
 * wiring or retargeting either side carries the other along. Without this,
 * wiring the no-match error left NextAction behind, and the only block shape
 * with the two apart is one GenericBlock can hold, so every menu would have
 * been refused or demoted at its last drag. Any other type is returned as is.
 */
function mirrorNoMatch(action: FlowAction): FlowAction {
  const noMatch = noMatchTarget(action);
  if (noMatch === undefined || action.Transitions.NextAction === noMatch) return action;
  return { ...action, Transitions: { ...action.Transitions, NextAction: noMatch } };
}

/** Where a GetParticipantInput's NoMatchingCondition error goes, if wired. */
function noMatchTarget(action: FlowAction): string | undefined {
  if (action.Type !== ActionType.GetParticipantInput) return undefined;
  return (action.Transitions.Errors ?? []).find((e) => e.ErrorType === NO_MATCHING_CONDITION)
    ?.NextAction;
}

function appendCondition(doc: FlowDoc, action: FlowAction, target: string): FlowDoc | undefined {
  const condition = defaultConditionFor(action);
  if (condition === undefined) return undefined;
  return normalize(
    withAction(doc, action.Identifier, (a) => ({
      ...a,
      Transitions: {
        ...a.Transitions,
        Conditions: [
          ...(a.Transitions.Conditions ?? []),
          { NextAction: target, Condition: condition },
        ],
      },
    })),
  );
}

function wireMissingError(doc: FlowDoc, action: FlowAction, target: string): FlowDoc | undefined {
  // Only modeled types have a known error vocabulary; an unmodeled block keeps
  // whatever errors it came with. This is intent, not legality: it picks WHICH
  // error branch a drag should create. GetParticipantInput's vocabulary is the
  // menu form's (EXTRA_ERRORS: NoMatchingCondition "Must be defined only if
  // StoreInput is False"), so the stored-input form, which is not modeled,
  // keeps its errors the way any unmodeled block does.
  if (!isModeled(action.Type)) return undefined;
  if (action.Type === ActionType.GetParticipantInput && !isDtmfMenu(action)) return undefined;
  const catchAll = action.Type === ActionType.Compare ? NO_MATCHING_CONDITION : NO_MATCHING_ERROR;
  const wanted = [...(EXTRA_ERRORS[action.Type] ?? []), catchAll];
  const wired = new Set((action.Transitions.Errors ?? []).map((e) => e.ErrorType));
  const missing = wanted.find((e) => !wired.has(e));
  if (missing === undefined) return undefined;
  return normalize(
    withAction(doc, action.Identifier, (a) =>
      mirrorNoMatch({
        ...a,
        Transitions: {
          ...a.Transitions,
          Errors: [...(a.Transitions.Errors ?? []), { ErrorType: missing, NextAction: target }],
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
    return normalize(
      withAction(doc, id, (a) => ({
        ...a,
        Transitions: {
          ...a.Transitions,
          Conditions: (a.Transitions.Conditions ?? []).filter((_, i) => i !== index),
        },
      })),
    );
  },
);

function removeEdge(doc: FlowDoc, parsed: ParsedEdgeId): FlowDoc {
  return withAction(doc, parsed.source, (a) => {
    const t = { ...a.Transitions };
    // A menu's no-match path is drawn twice (mirrorNoMatch), so whichever half
    // the user moves away takes the other with it; otherwise the path would
    // still be drawn from here as the edge left behind.
    if (parsed.kind === "next") {
      const leaving = t.NextAction;
      delete t.NextAction;
      if (leaving !== undefined && noMatchTarget(a) === leaving) {
        t.Errors = (t.Errors ?? []).filter((e) => e.ErrorType !== NO_MATCHING_CONDITION);
      }
    }
    if (parsed.kind === "error") {
      const leaving = (t.Errors ?? [])[parsed.errorIndex];
      t.Errors = (t.Errors ?? []).filter((_, i) => i !== parsed.errorIndex);
      if (
        a.Type === ActionType.GetParticipantInput &&
        leaving?.ErrorType === NO_MATCHING_CONDITION &&
        t.NextAction === leaving.NextAction
      ) {
        delete t.NextAction;
      }
    }
    if (parsed.kind === "condition")
      t.Conditions = (t.Conditions ?? []).filter((_, i) => i !== parsed.conditionIndex);
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

    // Target-end rewire: same source, new destination. On a
    // GetParticipantInput the next edge and the NoMatchingCondition edge are
    // one path drawn twice, so moving either end moves both (mirrorNoMatch
    // carries NextAction after the error; the error follows NextAction here).
    if (newSource === parsed.source) {
      return normalize(
        withAction(doc, newSource, (a) => {
          const t = { ...a.Transitions };
          if (parsed.kind === "next") {
            t.NextAction = newTarget;
            if (a.Type === ActionType.GetParticipantInput) {
              t.Errors = (t.Errors ?? []).map((e) =>
                e.ErrorType === NO_MATCHING_CONDITION ? { ...e, NextAction: newTarget } : e,
              );
            }
          }
          if (parsed.kind === "error")
            t.Errors = (t.Errors ?? []).map((e, i) =>
              i === parsed.errorIndex ? { ...e, NextAction: newTarget } : e,
            );
          if (parsed.kind === "condition")
            t.Conditions = (t.Conditions ?? []).map((c, i) =>
              i === parsed.conditionIndex ? { ...c, NextAction: newTarget } : c,
            );
          return mirrorNoMatch({ ...a, Transitions: t });
        }),
      );
    }

    // Source-end rewire: move the transition to another block. The one check
    // left is anti-clobber, not legality: dropping a "next" edge on a block
    // that already has one would overwrite that transition, and lost content
    // is invisible to a demotion probe because the result stays expressible.
    // A menu's next path is also drawn as its NoMatchingCondition error, so a
    // no-match target wired elsewhere counts as an existing next edge: the
    // mirror below would otherwise replace the dropped target with it.
    if (parsed.kind === "next") {
      if (source.Transitions.NextAction !== undefined) return undefined;
      const noMatch = noMatchTarget(source);
      if (noMatch !== undefined && noMatch !== newTarget) return undefined;
    }
    // The same path from the other side: a NoMatchingCondition error dropped
    // on a GetParticipantInput becomes its next path too (the mirror below
    // rewrites NextAction), so the drop is held to what a fresh error drag is
    // held to (wireMissingError). The stored-input form cannot carry the error
    // at all; a menu that already has one has nowhere to put a second; and a
    // menu whose NextAction goes elsewhere would have it overwritten, the same
    // clobber as the next-edge check above. The guard cannot stand in for
    // these checks: the stored-input form and an unfinished menu are generic
    // already, so there is nothing for it to see demoted.
    if (
      parsed.kind === "error" &&
      parsed.errorType === NO_MATCHING_CONDITION &&
      source.Type === ActionType.GetParticipantInput
    ) {
      if (!isDtmfMenu(source)) return undefined;
      if (noMatchTarget(source) !== undefined) return undefined;
      const next = source.Transitions.NextAction;
      if (next !== undefined && next !== newTarget) return undefined;
    }

    const removed = removeEdge(doc, parsed);
    const moved = withAction(removed, newSource, (a) => {
      const t = { ...a.Transitions };
      if (parsed.kind === "next") t.NextAction = newTarget;
      if (parsed.kind === "error")
        t.Errors = [...(t.Errors ?? []), { ErrorType: parsed.errorType, NextAction: newTarget }];
      if (parsed.kind === "condition") {
        const entry = (oldSource.Transitions.Conditions ?? [])[parsed.conditionIndex];
        if (entry === undefined) return a;
        t.Conditions = [...(t.Conditions ?? []), { ...entry, NextAction: newTarget }];
      }
      return mirrorNoMatch({ ...a, Transitions: t });
    });
    return normalize(moved);
  },
);
