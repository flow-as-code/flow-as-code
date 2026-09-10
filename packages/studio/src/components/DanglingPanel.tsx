/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Dangling transitions: the ones pointing at an Identifier this document does
// not have.
//
// They are preserved in the file and re-emitted verbatim (never drop content),
// but they cannot be drawn as edges because there is no node to end at, so
// without this panel they were invisible on the canvas and unrewirable: a user
// looking at the canvas would believe the block had one fewer transition than
// their file actually holds. No mutation can create one; a document authored
// elsewhere, or hand-edited, can.
//
// This is a notice, not a lint rule. @flow-as-code/core's lint owns rules, and adding
// one there is a conformance change that belongs in its own task; what the
// canvas owes the user today is not hiding the transition.

import { useMemo } from "react";
import { danglingTransitions } from "../model/graph.js";
import { useStudio } from "../state/studio.js";

export function DanglingPanel() {
  const { state, dispatch } = useStudio();
  const { doc } = state;
  const dangling = useMemo(() => (doc === null ? [] : danglingTransitions(doc)), [doc]);
  if (dangling.length === 0) return null;

  return (
    <section
      data-testid="dangling-panel"
      className="max-h-32 shrink-0 overflow-y-auto border-t border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950"
    >
      <h2 className="mb-1 text-xs font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-200">
        Dangling transitions ({dangling.length})
      </h2>
      <p className="mb-1 text-[11px] text-amber-800 dark:text-amber-200">
        These point at a block this document does not contain. They are kept in the file and
        re-emitted, but they cannot be drawn. Add a block with that Identifier, or select the source
        block and rewire the branch.
      </p>
      <ul className="space-y-0.5">
        {dangling.map((d, i) => (
          <li key={`${d.source}:${d.kind}:${String(i)}`}>
            <button
              type="button"
              data-testid="dangling-row"
              className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-amber-100 dark:hover:bg-amber-900"
              onClick={() => dispatch({ type: "focus", id: d.source })}
            >
              <span className="shrink-0 font-mono text-amber-900 dark:text-amber-100">
                {d.source}
              </span>
              <span className="shrink-0 text-amber-700 dark:text-amber-300">{d.label}</span>
              <span className="min-w-0 flex-1 truncate text-amber-900 dark:text-amber-100">
                &rarr; &ldquo;{d.target}&rdquo; is not a block in this document
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
