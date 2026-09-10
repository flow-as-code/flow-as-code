/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Transient explanation of a refused gesture.
//
// The demotion invariant (model/mutations.ts) refuses edits that would cost a
// block its typed builder form, and refusals are ordinary events now: dragging
// a CheckHoursOfOperation's next edge onto another block, removing a Compare's
// last branch, deleting a block four transitions still point at. A canvas that
// simply ignores the drag reads as broken, so every refusal says which block
// it was about and what to do instead.

import { useEffect } from "react";
import { useStudio } from "../state/studio.js";

/** Long enough to read two lines, short enough not to need dismissing. */
export const NOTICE_MS = 8000;

export function NoticeBar() {
  const { state, dispatch } = useStudio();
  const notice = state.notice;
  const nonce = notice?.nonce;

  useEffect(() => {
    if (nonce === undefined) return;
    const timer = setTimeout(() => dispatch({ type: "notice", message: null }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [nonce, dispatch]);

  if (notice === null) return null;

  return (
    <div
      role="status"
      data-testid="mutation-notice"
      className="pointer-events-auto absolute bottom-3 left-1/2 z-10 max-w-xl -translate-x-1/2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="flex items-start gap-2">
        <span>{notice.message}</span>
        <button
          type="button"
          aria-label="Dismiss"
          data-testid="dismiss-notice"
          className="shrink-0 rounded border border-amber-400 px-1 text-[10px] hover:bg-amber-100 dark:border-amber-600 dark:hover:bg-amber-900"
          onClick={() => dispatch({ type: "notice", message: null })}
        >
          dismiss
        </button>
      </div>
    </div>
  );
}
