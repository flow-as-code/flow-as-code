/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The refs sidebar (docs/02-studio-design.md): every ${cdref:...} token in the
// doc with its type, name, alias, and usage count. Selecting a token filters
// the list down to the actions holding it; each of those focuses its node on
// the canvas.

import { useMemo, useState } from "react";
import { refUsage } from "../model/refUsage.js";
import { useStudio } from "../state/studio.js";

export function RefsPanel() {
  const { state, dispatch } = useStudio();
  const { doc } = state;
  const [open, setOpen] = useState<string | null>(null);

  const usage = useMemo(() => (doc === null ? [] : refUsage(doc)), [doc]);

  return (
    <section
      data-testid="refs-panel"
      className="min-h-0 shrink-0 overflow-y-auto border-t border-neutral-200 p-3 dark:border-neutral-700"
    >
      <h2 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        References {usage.length > 0 ? `(${String(usage.length)})` : ""}
      </h2>
      {usage.length === 0 ? (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          No references in this flow.
        </p>
      ) : (
        <ul className="space-y-1">
          {usage.map((ref) => (
            <li key={ref.token}>
              <button
                type="button"
                data-testid={`ref-${ref.token}`}
                title={ref.token}
                aria-expanded={open === ref.token}
                className="flex w-full items-baseline gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => {
                  setOpen((prev) => (prev === ref.token ? null : ref.token));
                  const first = ref.actions[0];
                  if (first !== undefined) dispatch({ type: "focus", id: first });
                }}
              >
                <span className="shrink-0 rounded bg-neutral-200 px-1 text-[10px] text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                  {ref.type}
                </span>
                <span className="min-w-0 flex-1 truncate text-neutral-800 dark:text-neutral-100">
                  {ref.name}
                  {ref.alias !== undefined ? `@${ref.alias}` : ""}
                </span>
                <span
                  data-testid={`ref-count-${ref.token}`}
                  title={`${String(ref.count)} usage(s)`}
                  className="shrink-0 font-mono text-neutral-500 dark:text-neutral-400"
                >
                  {ref.count}
                </span>
              </button>
              {open === ref.token && (
                <ul className="mt-0.5 ml-3 space-y-0.5">
                  {ref.actions.map((id) => (
                    <li key={id}>
                      <button
                        type="button"
                        data-testid={`ref-action-${id}`}
                        className="w-full truncate rounded px-1 py-0.5 text-left text-[11px] text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        onClick={() => dispatch({ type: "focus", id })}
                      >
                        {id}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
