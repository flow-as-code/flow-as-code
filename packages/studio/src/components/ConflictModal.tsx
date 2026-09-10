/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The dirty-both dialog: the canvas wrote the FlowDoc, someone else edited the
// builder file, and the two no longer agree.
//
// docs/02-studio-design.md is explicit that this is a question, not a repair:
// "the studio shows a diff and asks which side wins. No silent merges." So the
// dialog has no dismiss, no default, and no "merge" button; saving stays
// blocked until a side is chosen, because a save from here would overwrite
// whichever side the user has not looked at yet.
//
// A side that could not be read at all (unparseable JSON, a builder file that
// throws) is shown with its error and cannot be chosen. Choosing the other one
// is still safe: it rewrites the broken side from the good one.
//
// The dialog covers the whole shell rather than the canvas alone, and the
// reducer refuses a mutation while it is up (state/studio.tsx, CONFLICT_LOCKED).
// It used to cover the canvas only, so the inspector stayed live behind it and
// an edit made there went into a document no answer would write: "keep the
// canvas version" writes the snapshot the dialog is showing.

import type { FlowDoc } from "@flow-as-code/core";
import { Fragment, useMemo } from "react";
import { diffDocs, type DiffRow } from "../model/docDiff.js";
import { validateDoc } from "../model/validate.js";
import { resolveConflict, useStudio } from "../state/studio.js";
import { DOC_SUFFIX, TS_SUFFIX, type ConflictSide } from "../store/bridgeProtocol.js";

const ROW_STYLES: Record<DiffRow["kind"], string> = {
  same: "text-neutral-500 dark:text-neutral-400",
  changed: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  added: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  removed: "bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
};

function Cell({ text, no, kind }: { text?: string; no?: number; kind: DiffRow["kind"] }) {
  return (
    <div className={`flex gap-2 px-2 ${ROW_STYLES[kind]}`}>
      <span className="w-8 shrink-0 text-right text-neutral-400 tabular-nums dark:text-neutral-600">
        {no ?? ""}
      </span>
      <span className="min-w-0 flex-1 break-all whitespace-pre-wrap">{text ?? ""}</span>
    </div>
  );
}

/**
 * Why the canvas side cannot be kept, or null when it can.
 *
 * Only for an origin-"canvas" conflict, which is the one case where the studio
 * itself writes the bytes: nothing else holds that document, so keeping it is
 * a forced write through the same save gate as Save. Running the gate here as
 * well as inside store.write is what stops the dialog becoming inescapable. It
 * used to be run only by the write, which threw its refusal into the header
 * behind the modal and left the dialog up with the same button still inviting
 * the same click. A conflict between two files is not checked here: the bridge
 * owns those writes and validates them itself, and refusing both sides would
 * leave no way out at all.
 */
function useCanvasRefusal(conflict: { origin: string; docSide: FlowDoc | null }): string[] | null {
  const { origin, docSide } = conflict;
  return useMemo(() => {
    if (origin !== "canvas" || docSide === null) return null;
    const validation = validateDoc(docSide);
    if (validation.ok) return null;
    return [
      ...validation.blockers.map((f) => `${f.rule}: ${f.message}`),
      ...validation.schemaErrors.map((e) => `schema: ${e}`),
    ];
  }, [origin, docSide]);
}

export function ConflictModal() {
  const { state, dispatch } = useStudio();
  const conflict = state.conflict;
  const canvasRefusal = useCanvasRefusal(conflict ?? { origin: "disk", docSide: null });
  if (conflict === null) return null;

  const diff = diffDocs(conflict.docSide, conflict.codeSide);
  const choose = (side: ConflictSide) => {
    void resolveConflict(dispatch, state.store, conflict, side);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-900/50 p-4"
      data-testid="conflict-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        className="flex max-h-full w-full max-w-4xl flex-col rounded border border-neutral-300 bg-white shadow-xl dark:border-neutral-600 dark:bg-neutral-900"
      >
        <header className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h2 id="conflict-title" className="text-sm font-semibold">
            &ldquo;{conflict.name}&rdquo; changed on both sides
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">{conflict.reason}</p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
            Nothing has been overwritten, and editing and saving are paused until you choose.
            Picking a side rewrites the other one from it.
          </p>
          {state.notice !== null && (
            <p
              data-testid="conflict-notice"
              className="mt-1 text-xs text-amber-700 dark:text-amber-300"
            >
              {state.notice.message}
            </p>
          )}
        </header>

        <div className="grid shrink-0 grid-cols-2 gap-px border-b border-neutral-200 bg-neutral-200 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-700">
          <div className="bg-white px-3 py-2 dark:bg-neutral-900">
            Canvas ·{" "}
            {conflict.origin === "canvas"
              ? "unsaved edits in this window"
              : conflict.name + DOC_SUFFIX}
            {conflict.docError !== undefined && (
              <p data-testid="conflict-doc-error" className="mt-1 text-red-600 dark:text-red-400">
                {conflict.docError}
              </p>
            )}
            {canvasRefusal !== null && (
              <p
                data-testid="conflict-doc-refused"
                className="mt-1 font-normal text-red-600 dark:text-red-400"
              >
                This version cannot be written: {canvasRefusal.join("; ")}. Keep the code version,
                then make the change again on the canvas.
              </p>
            )}
          </div>
          <div className="bg-white px-3 py-2 dark:bg-neutral-900">
            Code · {conflict.name}
            {TS_SUFFIX}
            {conflict.codeError !== undefined && (
              <p data-testid="conflict-code-error" className="mt-1 text-red-600 dark:text-red-400">
                {conflict.codeError}
              </p>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-5">
          {diff.identical ? (
            <p data-testid="conflict-identical" className="p-4 text-xs text-neutral-500">
              The two sides describe the same flow. Either choice keeps it and re-syncs the pair.
            </p>
          ) : (
            <div
              data-testid="conflict-diff"
              className="grid grid-cols-2 gap-px bg-neutral-100 dark:bg-neutral-800"
            >
              {diff.rows.map((row, i) => (
                <Fragment key={String(i)}>
                  <Cell text={row.left} no={row.leftNo} kind={row.kind} />
                  <Cell text={row.right} no={row.rightNo} kind={row.kind} />
                </Fragment>
              ))}
            </div>
          )}
        </div>

        {state.error !== null && (
          <p
            role="alert"
            data-testid="conflict-error"
            className="border-t border-neutral-200 px-4 py-2 text-xs break-words text-red-600 dark:border-neutral-700 dark:text-red-400"
          >
            {state.error}
          </p>
        )}

        <footer className="flex items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <span className="mr-auto text-xs text-neutral-500">
            {diff.coarse
              ? "The documents differ too widely to align line by line."
              : `${String(diff.removed)} line(s) on the canvas side, ${String(diff.added)} on the code side`}
          </span>
          <button
            type="button"
            data-testid="conflict-keep-doc"
            disabled={state.resolving || conflict.docSide === null || canvasRefusal !== null}
            className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-600 dark:hover:bg-neutral-800"
            title={
              conflict.docSide === null
                ? "The FlowDoc on disk cannot be read, so it cannot win."
                : canvasRefusal !== null
                  ? `The canvas version fails the save gate, so it cannot be written: ${canvasRefusal.join("; ")}`
                  : `Keep the canvas version and regenerate ${conflict.name}${TS_SUFFIX} from it`
            }
            onClick={() => choose("doc")}
          >
            Keep the canvas version
          </button>
          <button
            type="button"
            data-testid="conflict-keep-code"
            disabled={state.resolving || conflict.codeSide === null}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            title={
              conflict.codeSide === null
                ? "The builder file cannot be synthed, so it cannot win."
                : `Keep the code version and rewrite ${conflict.name}${DOC_SUFFIX} from it`
            }
            onClick={() => choose("code")}
          >
            Keep the code version
          </button>
        </footer>
      </div>
    </div>
  );
}
