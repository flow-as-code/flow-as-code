/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Right-hand inspector: parameter editing generated per modeled block type;
// GenericBlocks are read-only raw JSON. Delete runs the mutation first and
// only prompts for a delete that will actually happen: see onDelete.
//
// Every commit goes through a mutation in src/model, which is where legality
// is enforced. This file may show an error, never decide what is legal.

import type { FlowDoc } from "@flow-as-code/core";
import { useEffect, useState } from "react";
import {
  CONDITION_OPERATORS,
  acceptsConditions,
  isDtmfMenu,
  normalizeOperands,
} from "../model/capabilities.js";
import { demotedIds } from "../model/demotion.js";
import {
  bodyIsOptional,
  fieldsFor,
  hasMessageBody,
  MESSAGE_BODY_KINDS,
  type FieldDesc,
} from "../model/inspectorSchema.js";
import {
  MESSAGE_BODY_KEYS,
  MutationRefused,
  deleteBlock,
  getAction,
  incomingCount,
  messageBodyKey,
  removeCondition,
  setCondition,
  setMessageBody,
  setNumberParam,
  setParam,
  type MessageBodyKey,
} from "../model/mutations.js";
import { commit, useStudio } from "../state/studio.js";
import { RefPicker } from "./RefPicker.js";

function JsonField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: unknown;
  onCommit: (parsed: unknown) => void;
}) {
  const pretty = JSON.stringify(value ?? {}, null, 2);
  const [text, setText] = useState(pretty);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
        {label}
      </span>
      <textarea
        className="h-28 w-full rounded border border-neutral-300 bg-white p-2 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-800"
        value={editing ? text : pretty}
        onFocus={() => {
          setText(pretty);
          setEditing(true);
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setEditing(false);
          try {
            const parsed: unknown = JSON.parse(text);
            setError(null);
            if (JSON.stringify(parsed) !== JSON.stringify(value ?? {})) onCommit(parsed);
          } catch {
            setError("Not valid JSON; change discarded.");
          }
        }}
      />
      {error !== null && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </label>
  );
}

/**
 * A free-text field's draft, reset whenever the document underneath it moves.
 *
 * These fields commit on blur, so between focus and blur the DOM holds text
 * the document has never seen. They used to be uncontrolled (`defaultValue`
 * keyed by block id and parameter), which meant a doc-synced event -- an edit
 * to the paired .flow.ts arriving over the bridge -- replaced the document
 * while the field kept rendering the previous text. Clicking into that field
 * and clicking away then committed the stale text as a mutation, and the next
 * Save wrote it over the edit that had just arrived from disk. No conflict
 * dialog could catch it: as far as the reducer knew the canvas and the disk
 * agreed right up to the blur, so there was nothing to ask about.
 *
 * Reset in render rather than in an effect, so no frame ever shows the stale
 * text (https://react.dev/reference/react/useState, "storing information from
 * previous renders"). Uncommitted keystrokes are dropped when the document
 * moves, which is the safe direction: text that reached disk outranks text the
 * document has never seen.
 */
function useDraft(value: string): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  return [draft, setDraft];
}

function TextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useDraft(value);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
        {label}
      </span>
      <input
        type="text"
        className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
      />
    </label>
  );
}

/**
 * A refused numeric commit keeps the text that was refused on screen (the
 * parameter is unchanged, so `value` does not move and the draft is not
 * reset), which is what lets the user correct "3.5" to "3" without retyping.
 */
function NumberField({
  field,
  value,
  error,
  onCommit,
}: {
  field: Extract<FieldDesc, { kind: "number" }>;
  value: string;
  error: string | undefined;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useDraft(value);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
        {field.label}
      </span>
      <input
        type="number"
        data-testid={`number-${field.key}`}
        min={field.min}
        max={field.max}
        step={field.integer === false ? undefined : 1}
        className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          // String(undefined) is "undefined", which no input ever holds, so
          // comparing against it made every blur on an absent parameter a
          // commit. An absent parameter shows as "".
          if (draft === value) return;
          onCommit(draft);
        }}
      />
      {error !== undefined && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </label>
  );
}

function MessageBodyField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useDraft(value);
  return (
    <textarea
      data-testid="message-body"
      className="h-24 w-full rounded border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

export function Inspector() {
  const { state, dispatch } = useStudio();
  // Errors from the last rejected numeric commit, keyed by parameter.
  const [numberErrors, setNumberErrors] = useState<Record<string, string>>({});
  // A body kind the user picked that cannot be written yet: PromptId has no
  // empty representation the schema accepts, so the switch waits for a ref.
  const [pendingBody, setPendingBody] = useState<{ id: string; kind: MessageBodyKey } | null>(null);
  // A body choice; "" is "no body", offered only where the schema allows it.
  type BodyChoice = MessageBodyKey | "";
  const { doc, selected } = state;

  // Both pieces of local state describe the selected block. Without this they
  // survived a selection change and reappeared later against a different
  // block: a rejected timeout on one Lambda showed its error on the next.
  useEffect(() => {
    setNumberErrors({});
    setPendingBody(null);
  }, [selected]);

  if (doc === null || selected === null) {
    return (
      <aside className="w-72 shrink-0 border-l border-neutral-200 p-3 text-sm text-neutral-500 dark:border-neutral-700">
        Select a block to edit its parameters.
      </aside>
    );
  }
  const action = getAction(doc, selected);
  if (action === undefined) {
    return (
      <aside className="w-72 shrink-0 border-l border-neutral-200 p-3 text-sm text-neutral-500 dark:border-neutral-700" />
    );
  }

  const fields = fieldsFor(action.Type);
  const generic = fields === undefined;
  const demoted = demotedIds(doc).has(selected);

  /**
   * Commits a mutation that cannot decline (it returns a document or throws).
   * A MutationRefused becomes a notice; everything else is a real error.
   */
  const mutate = (run: () => FlowDoc) => {
    try {
      dispatch({ type: "mutated", doc: run() });
    } catch (err) {
      if (err instanceof MutationRefused) {
        dispatch({ type: "notice", message: err.message });
        return;
      }
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  /**
   * Delete, in the order the outcomes actually happen.
   *
   * The mutation runs FIRST, before any prompt. deleteBlock detaches the
   * transitions pointing at the block, and detaching can leave a neighbour
   * inexpressible, in which case the demotion invariant refuses the whole
   * delete (model/mutations.ts). Asking "N transition(s) will be detached,
   * delete?" and then refusing was a prompt that described an outcome the code
   * would not produce: on the demo flow, confirming the deletion of "hang-up"
   * deleted nothing. So the refusal is surfaced without a prompt, and the
   * prompt only appears for a delete that is going to happen. Running the
   * mutation early costs nothing: it is pure, and its result is discarded when
   * the user cancels.
   */
  const onDelete = () => {
    let next: FlowDoc;
    try {
      next = deleteBlock(doc, selected);
    } catch (err) {
      if (err instanceof MutationRefused) {
        // The refusal names the neighbours and the route forward: rewire those
        // edges to another block first, then delete.
        dispatch({ type: "notice", message: err.message });
        return;
      }
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
      return;
    }
    const incoming = incomingCount(doc, selected);
    const ok =
      incoming === 0 ||
      window.confirm(
        `${incoming} transition(s) point at "${selected}". Deleting it removes those branches ` +
          `from the blocks that hold them. Delete?`,
      );
    if (!ok) return;
    dispatch({ type: "select", id: null });
    dispatch({ type: "mutated", doc: next });
  };

  const renderField = (field: FieldDesc) => {
    const value = action.Parameters[field.key];
    switch (field.kind) {
      case "text":
        return (
          <TextField
            key={`${selected}:${field.key}`}
            label={field.label}
            value={typeof value === "string" ? value : ""}
            onCommit={(next) => mutate(() => setParam(doc, selected, field.key, next, field))}
          />
        );
      case "number": {
        const errorKey = `${selected}:${field.key}`;
        // A stored value is a number, or its decimal string for fields
        // declared asString; anything else (absent, malformed) shows empty.
        const shown =
          typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
        return (
          <NumberField
            key={`${selected}:${field.key}`}
            field={field}
            value={shown}
            error={numberErrors[errorKey]}
            onCommit={(next) => {
              const result = setNumberParam(doc, selected, field.key, next, field);
              if (result.ok) {
                setNumberErrors((prev) => {
                  const rest = { ...prev };
                  delete rest[errorKey];
                  return rest;
                });
                dispatch({ type: "mutated", doc: result.doc });
              } else {
                // The parameter keeps its previous value; the field shows why.
                setNumberErrors((prev) => ({ ...prev, [errorKey]: result.error }));
              }
            }}
          />
        );
      }
      case "select":
        return (
          <label key={`${selected}:${field.key}`} className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {field.label}
            </span>
            <select
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              value={typeof value === "string" ? value : ""}
              onChange={(e) =>
                mutate(() =>
                  setParam(
                    doc,
                    selected,
                    field.key,
                    e.target.value === "" ? undefined : e.target.value,
                  ),
                )
              }
            >
              {field.optional === true && <option value="">(not set)</option>}
              {field.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        );
      case "ref":
        return (
          <div key={`${selected}:${field.key}`}>
            <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {field.label}
            </span>
            <RefPicker
              doc={doc}
              refType={field.refType}
              value={typeof value === "string" ? value : undefined}
              optional={field.optional}
              onChange={(v) => mutate(() => setParam(doc, selected, field.key, v, field))}
            />
          </div>
        );
      case "json":
        return (
          <JsonField
            key={`${selected}:${field.key}`}
            label={field.label}
            value={value}
            onCommit={(parsed) => mutate(() => setParam(doc, selected, field.key, parsed))}
          />
        );
    }
  };

  const bodyOptional = bodyIsOptional(action.Type);
  // A block that may have no body and has none shows "(none)"; a block that
  // must have one and has none anyway (a file authored elsewhere) shows Text,
  // so the first keystroke repairs it.
  const storedBodyKind: BodyChoice = messageBodyKey(action) ?? (bodyOptional ? "" : "Text");
  const bodyKind: BodyChoice = pendingBody?.id === selected ? pendingBody.kind : storedBodyKind;
  const storedBodyText =
    storedBodyKind === "PromptId" ||
    storedBodyKind === "" ||
    typeof action.Parameters[storedBodyKind] !== "string"
      ? ""
      : (action.Parameters[storedBodyKind] as string);

  /** Removes every body parameter; the guard refuses it where a body is required. */
  const clearBody = () =>
    mutate(() => setParam(doc, selected, "Text", undefined, { clears: MESSAGE_BODY_KEYS }));

  const onBodyKindChange = (kind: BodyChoice) => {
    if (kind === bodyKind) return;
    if (kind === "PromptId") {
      // Nothing is written until the picker yields a reference: a PromptId
      // must be a token or JSONPath, and no body parameter at all is invalid.
      setPendingBody({ id: selected, kind });
      return;
    }
    setPendingBody(null);
    if (kind === "") {
      clearBody();
      return;
    }
    mutate(() => setMessageBody(doc, selected, kind, storedBodyText));
  };

  const onPromptChange = (value: string | undefined) => {
    setPendingBody(null);
    if (value !== undefined) {
      mutate(() => setMessageBody(doc, selected, "PromptId", value));
    } else if (storedBodyKind === "PromptId") {
      // Clearing the prompt cannot leave a message bodyless; a menu may be.
      if (bodyOptional) clearBody();
      else mutate(() => setMessageBody(doc, selected, "Text", ""));
    }
  };

  const conditions = action.Transitions.Conditions ?? [];

  return (
    <aside
      data-testid="inspector"
      className="w-72 shrink-0 space-y-3 overflow-y-auto border-l border-neutral-200 p-3 dark:border-neutral-700"
    >
      <div>
        <h2 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {action.Identifier}
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{action.Type}</p>
      </div>

      {generic ? (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            This block type is not modeled yet. Its parameters are preserved verbatim and stay
            read-only; transitions can still be rewired on the canvas.
          </p>
          <pre
            data-testid="raw-json"
            className="max-h-80 overflow-auto rounded border border-neutral-200 bg-neutral-50 p-2 font-mono text-[11px] leading-snug dark:border-neutral-700 dark:bg-neutral-800"
          >
            {JSON.stringify(action, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="space-y-3">
          {demoted && (
            <p
              data-testid="demoted-banner"
              className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
            >
              Generated TypeScript uses GenericBlock for this block: its parameters and transitions
              do not yet match what the {action.Type} builder can express. That is normal for a
              block you just added and have not wired up. No edit here can put an already-expressed
              block into this state.
            </p>
          )}
          {hasMessageBody(action.Type) && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  Body
                </span>
                <select
                  data-testid="message-body-kind"
                  className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                  value={bodyKind}
                  onChange={(e) => onBodyKindChange(e.target.value as BodyChoice)}
                >
                  {bodyOptional && <option value="">(none)</option>}
                  {MESSAGE_BODY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k === "PromptId" ? "Prompt" : k}
                    </option>
                  ))}
                </select>
              </label>
              {bodyKind === "" ? null : bodyKind === "PromptId" ? (
                <RefPicker
                  doc={doc}
                  refType="prompt"
                  value={
                    typeof action.Parameters.PromptId === "string"
                      ? action.Parameters.PromptId
                      : undefined
                  }
                  optional={bodyOptional}
                  onChange={onPromptChange}
                />
              ) : (
                <MessageBodyField
                  key={`${selected}:${bodyKind}`}
                  value={
                    typeof action.Parameters[bodyKind] === "string"
                      ? (action.Parameters[bodyKind] as string)
                      : ""
                  }
                  onCommit={(next) => mutate(() => setMessageBody(doc, selected, bodyKind, next))}
                />
              )}
            </>
          )}
          {fields?.map(renderField)}

          {/*
            Shown whenever the block HAS branches, not only when it may gain
            one. CheckHoursOfOperation carries two fixed branches it can never
            add a third to, and gating the whole editor on "may add" left their
            operators and targets uneditable.
          */}
          {(acceptsConditions(action) || conditions.length > 0) && (
            <div data-testid="conditions" className="space-y-2">
              <h3 className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                Branches
              </h3>
              {conditions.length === 0 && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  Drag from this block&rsquo;s upper handle to a target to add a branch.
                </p>
              )}
              {isDtmfMenu(action) && (
                <p
                  data-testid="menu-branch-hint"
                  className="text-xs text-neutral-400 dark:text-neutral-500"
                >
                  Each branch answers one key: 0 to 9, * or #. A drag picks the next free key.
                </p>
              )}
              {conditions.map((c, i) => (
                <div
                  key={`${selected}:condition:${String(i)}`}
                  data-testid={`condition-${String(i)}`}
                  className="space-y-1 rounded border border-neutral-200 p-2 dark:border-neutral-700"
                >
                  <select
                    aria-label={`Branch ${String(i + 1)} operator`}
                    className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-800"
                    value={c.Condition.Operator}
                    onChange={(e) => {
                      commit(
                        dispatch,
                        () =>
                          setCondition(doc, selected, i, {
                            ...c.Condition,
                            Operator: e.target.value as (typeof CONDITION_OPERATORS)[number],
                          }),
                        `"${e.target.value}" is not an operator this branch can use.`,
                      );
                    }}
                  >
                    {CONDITION_OPERATORS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    aria-label={`Branch ${String(i + 1)} operands`}
                    placeholder="operands, comma separated"
                    className="w-full rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-800"
                    defaultValue={c.Condition.Operands.join(", ")}
                    onBlur={(e) => {
                      // One rule for what a comma-separated field means, shared
                      // with the branch a canvas drag creates; see
                      // normalizeOperands in model/capabilities.ts.
                      const operands = normalizeOperands(e.target.value);
                      if (operands.join(", ") === c.Condition.Operands.join(", ")) return;
                      commit(
                        dispatch,
                        () =>
                          setCondition(doc, selected, i, { ...c.Condition, Operands: operands }),
                        "A branch takes between 1 and 10 operands.",
                      );
                    }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      goes to {c.NextAction}
                    </span>
                    <button
                      type="button"
                      className="rounded border border-neutral-300 px-1 text-[10px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      onClick={() => {
                        commit(
                          dispatch,
                          () => removeCondition(doc, selected, i),
                          `Branch ${String(i + 1)} is no longer there.`,
                        );
                      }}
                    >
                      remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-neutral-200 pt-3 dark:border-neutral-700">
        <button
          type="button"
          data-testid="delete-block"
          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
          disabled={doc.content.StartAction === selected}
          title={
            doc.content.StartAction === selected
              ? "The StartAction cannot be deleted."
              : "Delete this block"
          }
          onClick={onDelete}
        >
          Delete block
        </button>
      </div>
    </aside>
  );
}
