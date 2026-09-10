/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Top bar: doc switcher, open file, open folder (File System Access, feature
// detected), export as download, and Save.
//
// Save and Export must be disabled exactly when the write path would refuse.
// assertSaveable refuses on TWO grounds, the hard lint rules and the FlowDoc
// schema, so a button state derived from the lint half alone left Save enabled
// for a schema-invalid doc and turned a click into a thrown error. Both halves
// are read here: `blocked` is the worker's answer to the lint half, and
// schemaErrorsFor is the same schema check assertSaveable runs. The buttons
// remain only the visible half of the rule; the write paths still refuse.
//
// A read-only store (the hosted demo) has no write path at all, so the buttons
// that would reach one (Open file, Open folder, Export as a download, Save) are
// not rendered and a badge says why. "Export as…" stays: its sink previews the
// files in the dialog instead of downloading them.

import { useMemo, useRef, useState } from "react";
import { ExportDialog } from "./ExportDialog.js";
import { openDirectoryStore, supportsDirectoryStore } from "../store/directoryStore.js";
import { downloadDoc } from "../store/exportDoc.js";
import { MemoryStore } from "../store/memoryStore.js";
import { HARD_RULES, parseFlowDoc, schemaErrorsFor } from "../model/validate.js";
import { baseName, syncErrorText } from "../model/syncError.js";
import { loadDoc, openStore, saveDoc, useStudio } from "../state/studio.js";

export { baseName, syncErrorText };

export function Toolbar() {
  const { state, dispatch } = useStudio();
  const { doc, docName, docList, store, dirty, blocked, lintPending, findings } = state;
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const readOnly = store.readOnly;
  // What the gate messages name: the demo has no Save, only the export preview.
  const gated = readOnly ? "Export" : "Save";

  const hardRules = new Set(HARD_RULES);
  const blockers = findings.filter((f) => hardRules.has(f.rule));
  // The schema half of assertSaveable, run here so the button and the write
  // path agree. It is synchronous and cheap; only the lint half is debounced
  // into a worker.
  const schemaErrors = useMemo(() => (doc === null ? [] : schemaErrorsFor(doc)), [doc]);
  // An unresolved conflict is the third reason a write cannot happen: the
  // bridge refuses it with 409 until the user picks a side, so the button must
  // say so rather than turning the click into an error.
  const unsafe = blocked || lintPending || schemaErrors.length > 0 || state.conflict !== null;

  const onOpenFile = async (file: File) => {
    try {
      // Schema-validated on the way in, not just version-checked.
      const parsed = parseFlowDoc(await file.text());
      await openStore(dispatch, new MemoryStore(file.name, [parsed]));
    } catch (err) {
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const onSave = async () => {
    if (doc === null || docName === null) return;
    await saveDoc(dispatch, store, docName, doc);
  };

  const onExport = () => {
    if (doc === null) return;
    try {
      downloadDoc(doc);
    } catch (err) {
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
      <h1 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Flow Studio</h1>

      <select
        aria-label="Document"
        className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-800"
        value={docName ?? ""}
        onChange={(e) => void loadDoc(dispatch, store, e.target.value)}
      >
        {docList.map((d) => (
          <option key={d.name} value={d.name}>
            {d.name}
          </option>
        ))}
      </select>
      <span className="text-xs text-neutral-400 dark:text-neutral-500">
        {store.label}
        {dirty ? (readOnly ? " · edited in this tab" : " · unsaved changes") : ""}
      </span>
      {readOnly && (
        <span
          data-testid="read-only-badge"
          className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
          title="Edits stay in this tab and are not saved. Reload the page to restore the demo flow."
        >
          Read-only demo
        </span>
      )}

      {state.syncError !== null && (
        <span
          data-testid="sync-error"
          role="status"
          className="max-w-96 truncate rounded border border-red-300 bg-red-50 px-2 py-0.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          // The label a screen reader announces and the tooltip a pointer gets
          // are the same sentence, and it says what is wrong. The visible text
          // stops at the file name so the badge does not clip mid-word.
          aria-label={syncErrorText(state.syncError.path, state.syncError.message)}
          title={syncErrorText(state.syncError.path, state.syncError.message)}
        >
          {/*
            The file name, not the path the bridge reported: that is absolute,
            and on a served directory nested a few levels down it filled the
            badge with a prefix every document shares.
          */}
          Code out of sync: {baseName(state.syncError.path)}
        </span>
      )}

      <span className="flex-1" />

      {!readOnly && (
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) void onOpenFile(file);
            e.target.value = "";
          }}
        />
      )}
      {!readOnly && (
        <button
          type="button"
          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
          onClick={() => fileInput.current?.click()}
        >
          Open file
        </button>
      )}
      {!readOnly && supportsDirectoryStore() && (
        <button
          type="button"
          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
          onClick={() => {
            openDirectoryStore()
              .then((s) => openStore(dispatch, s))
              .catch((err: unknown) => {
                // Cancelling the picker is not an error.
                if (err instanceof DOMException && err.name === "AbortError") return;
                dispatch({
                  type: "error",
                  message: err instanceof Error ? err.message : String(err),
                });
              });
          }}
        >
          Open folder
        </button>
      )}
      {!readOnly && (
        <button
          type="button"
          className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-600 dark:hover:bg-neutral-800"
          data-testid="export-button"
          disabled={doc === null || unsafe}
          title={
            unsafe
              ? "Export is a save: it is disabled until the doc passes the hard lint rules."
              : "Download this FlowDoc"
          }
          onClick={onExport}
        >
          Export
        </button>
      )}
      <button
        type="button"
        className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-600 dark:hover:bg-neutral-800"
        data-testid="export-targets-button"
        disabled={doc === null || unsafe}
        title={
          unsafe
            ? "Export is a save: it is disabled until the doc passes the hard lint rules."
            : "Export this flow set as CDK, Terraform, or materialized JSON"
        }
        onClick={() => setExporting(true)}
      >
        Export as…
      </button>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      <span className="flex items-center gap-2">
        {!readOnly && (
          <button
            type="button"
            data-testid="save-button"
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={doc === null || unsafe || !dirty}
            onClick={() => void onSave()}
          >
            Save
          </button>
        )}
        {state.conflict !== null && (
          <span
            data-testid="save-conflicted"
            className="max-w-64 truncate text-xs text-red-600 dark:text-red-400"
            title={state.conflict.reason}
          >
            Save disabled: choose which side of the conflict wins
          </span>
        )}
        {lintPending && !blocked && state.conflict === null && schemaErrors.length === 0 && (
          <span data-testid="save-pending" className="text-xs text-neutral-500">
            Checking…
          </span>
        )}
        {!blocked && schemaErrors.length > 0 && (
          <span
            data-testid="save-invalid"
            className="max-w-64 truncate text-xs text-red-600 dark:text-red-400"
            title={schemaErrors.join("\n")}
          >
            {gated} disabled: {schemaErrors[0]}
          </span>
        )}
        {blocked && (
          <span
            data-testid="save-blocked"
            className="max-w-64 truncate text-xs text-red-600 dark:text-red-400"
            title={blockers.map((f) => `${f.rule}: ${f.message}`).join("\n")}
          >
            {gated} disabled: {blockers[0]?.rule ?? "hard lint rule"} failing
          </span>
        )}
      </span>
      {/*
        Wrapped rather than clipped: a save refusal names the rule and the
        offending parameter, and "Refusing to write an invalid FlowDoc. no-lit…"
        tells the user nothing they can act on.
      */}
      {state.error !== null && (
        <span
          role="alert"
          className="max-w-96 text-xs break-words text-red-600 dark:text-red-400"
          title={state.error}
        >
          {state.error}
        </span>
      )}
    </header>
  );
}
