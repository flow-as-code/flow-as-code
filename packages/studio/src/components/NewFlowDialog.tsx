/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// New flow: a name, flow or module, and the companion it is paired with on
// disk (docs/06-terraform-provider.md, "Companions"). The companion is chosen
// here, once; switching later is `flow-cli convert`. Only the flow-cli studio
// bridge can create one, so the toolbar offers this only on that store.

import { useState } from "react";
import { newDoc, newDocNameProblem, type NewDocKind } from "../model/newDoc.js";
import { createDoc, useStudio } from "../state/studio.js";
import type { SourceKind } from "../store/bridgeProtocol.js";

const KINDS: { id: NewDocKind; label: string }[] = [
  { id: "flow", label: "Flow" },
  { id: "module", label: "Module" },
];

const COMPANIONS: { id: SourceKind; label: string; blurb: string }[] = [
  { id: "ts", label: "TypeScript (.flow.ts)", blurb: "Builder code, synthesized by flow-cli." },
  {
    id: "tf",
    label: "Terraform (.flow.tf)",
    blurb: "A flowascode_contact_flow resource the flowascode provider applies.",
  },
];

export function NewFlowDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStudio();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NewDocKind>("flow");
  const [companion, setCompanion] = useState<SourceKind>("ts");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = newDocNameProblem(
    name,
    state.docList.map((d) => d.name),
  );

  const create = async () => {
    if (problem !== undefined) return;
    setBusy(true);
    const failed = await createDoc(dispatch, state.store, newDoc(name, kind), companion);
    setBusy(false);
    if (failed === undefined) onClose();
    else setError(failed);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-900/50 p-4"
      data-testid="new-flow-dialog"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-flow-title"
        className="w-full max-w-md rounded border border-neutral-300 bg-white p-4 shadow-xl dark:border-neutral-600 dark:bg-neutral-900"
      >
        <h2 id="new-flow-title" className="text-sm font-semibold">
          New flow
        </h2>
        <label className="mt-3 block text-xs">
          Name
          <input
            data-testid="new-flow-name"
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-800"
            value={name}
            placeholder="appointment-line"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </label>
        {name !== "" && problem !== undefined && (
          <p data-testid="new-flow-problem" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {problem}
          </p>
        )}
        <fieldset className="mt-3 text-xs">
          <legend className="font-medium">Kind</legend>
          {KINDS.map((k) => (
            <label key={k.id} className="mr-4 inline-flex items-center gap-1">
              <input
                type="radio"
                name="new-flow-kind"
                data-testid={`new-flow-kind-${k.id}`}
                checked={kind === k.id}
                onChange={() => setKind(k.id)}
              />
              {k.label}
            </label>
          ))}
        </fieldset>
        <fieldset className="mt-3 text-xs">
          <legend className="font-medium">Companion</legend>
          {COMPANIONS.map((c) => (
            <label key={c.id} className="mt-1 flex items-start gap-1">
              <input
                type="radio"
                name="new-flow-companion"
                data-testid={`new-flow-companion-${c.id}`}
                checked={companion === c.id}
                onChange={() => setCompanion(c.id)}
              />
              <span>
                {c.label}
                <span className="block text-neutral-500 dark:text-neutral-400">{c.blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {error !== null && (
          <p
            data-testid="new-flow-error"
            role="alert"
            className="mt-3 text-xs break-words text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="new-flow-create"
            disabled={problem !== undefined || busy}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void create()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
