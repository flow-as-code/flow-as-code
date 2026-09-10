/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Block palette grouped by the Connect console taxonomy. Only modeled blocks
// are insertable (docs/02-studio-design.md); unknown types exist on the canvas
// as GenericBlocks but can never be created here.

import type { FlowDoc, Point } from "@flow-as-code/core";
import { MAX_ACTIONS_PER_FLOW } from "@flow-as-code/core";
import { PALETTE_GROUPS } from "../model/palette.js";
import { MutationRefused, addBlock, canAddBlock } from "../model/mutations.js";
import { useStudio } from "../state/studio.js";

/** Below the lowest existing node, so new blocks never land on top of one. */
export function insertPosition(doc: FlowDoc): Point {
  const ys = Object.values(doc.layout ?? {}).map((p) => p.y);
  return { x: 40, y: ys.length === 0 ? 40 : Math.max(...ys) + 140 };
}

export function Palette() {
  const { state, dispatch } = useStudio();
  const { doc } = state;
  const full = doc !== null && !canAddBlock(doc);

  return (
    <aside className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        Blocks
      </h2>
      {full && (
        <p data-testid="palette-full" className="text-xs text-amber-600 dark:text-amber-400">
          This flow has {MAX_ACTIONS_PER_FLOW} actions, the most Connect allows. Delete one before
          adding another.
        </p>
      )}
      {PALETTE_GROUPS.map((group) => (
        <div key={group.category}>
          <h3 className="mb-1 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
            {group.category}
          </h3>
          <ul className="space-y-1">
            {group.types.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  disabled={doc === null || full}
                  className="w-full truncate rounded border border-neutral-200 px-2 py-1 text-left text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  title={`Add ${type}`}
                  onClick={() => {
                    if (doc === null) return;
                    try {
                      const { doc: next, id } = addBlock(doc, type, insertPosition(doc));
                      dispatch({ type: "mutated", doc: next });
                      dispatch({ type: "focus", id });
                    } catch (err) {
                      dispatch({
                        type: err instanceof MutationRefused ? "notice" : "error",
                        message: err instanceof Error ? err.message : String(err),
                      });
                    }
                  }}
                >
                  {type}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
