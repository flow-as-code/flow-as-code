/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Bottom panel: every lint finding with rule, severity, and message. Clicking
// a finding focuses its node on the canvas.

import { useStudio } from "../state/studio.js";

export function LintPanel() {
  const { state, dispatch } = useStudio();
  const { findings } = state;

  return (
    <section
      data-testid="lint-panel"
      className="max-h-40 shrink-0 overflow-y-auto border-t border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <h2 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        Lint {findings.length > 0 ? `(${findings.length})` : "(clean)"}
      </h2>
      {findings.length === 0 ? (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">No findings.</p>
      ) : (
        <ul className="space-y-0.5">
          {findings.map((f, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => {
                  if (f.blockId !== undefined) dispatch({ type: "focus", id: f.blockId });
                }}
              >
                <span
                  className={
                    f.severity === "error"
                      ? "shrink-0 font-semibold text-red-600 dark:text-red-400"
                      : "shrink-0 font-semibold text-amber-600 dark:text-amber-400"
                  }
                >
                  {f.severity}
                </span>
                <span className="shrink-0 font-mono text-neutral-500 dark:text-neutral-400">
                  {f.rule}
                </span>
                <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-200">
                  {f.blockId !== undefined ? `${f.blockId}: ` : ""}
                  {f.message}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
