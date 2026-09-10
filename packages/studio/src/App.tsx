/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Studio shell: toolbar, palette, canvas, inspector, lint panel. One source of
// truth (the FlowDoc in StudioProvider); everything else derives from it.

import { Canvas } from "./components/Canvas.js";
import { ConflictModal } from "./components/ConflictModal.js";
import { DanglingPanel } from "./components/DanglingPanel.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Inspector } from "./components/Inspector.js";
import { LintPanel } from "./components/LintPanel.js";
import { NarrowNotice } from "./components/NarrowNotice.js";
import { NoticeBar } from "./components/NoticeBar.js";
import { Palette } from "./components/Palette.js";
import { RefsPanel } from "./components/RefsPanel.js";
import { Toolbar } from "./components/Toolbar.js";
import { useBridgeSync } from "./hooks/useBridgeSync.js";
import { useLintWorker } from "./hooks/useLintWorker.js";
import { StudioProvider, useStudio } from "./state/studio.js";
import type { DocStore } from "./store/types.js";

function Shell() {
  const { state, dispatch } = useStudio();
  useLintWorker(state.doc, dispatch);
  // Live round trip: an edit to <name>.flow.ts reaches the canvas through this.
  useBridgeSync(state.store, dispatch);

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* First in the DOM as well as on top of it: on a narrow viewport this is
          what a visitor reads before anything else. */}
      <NarrowNotice />
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-52 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
          <Palette />
          <RefsPanel />
        </div>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <Canvas />
          <NoticeBar />
          <DanglingPanel />
          <LintPanel />
          <ConflictModal />
        </main>
        <Inspector />
      </div>
    </div>
  );
}

/** `store` overrides the boot store; production never passes it, tests do. */
export function App({ store }: { store?: DocStore } = {}) {
  return (
    <ErrorBoundary>
      <StudioProvider store={store}>
        <Shell />
      </StudioProvider>
    </ErrorBoundary>
  );
}
