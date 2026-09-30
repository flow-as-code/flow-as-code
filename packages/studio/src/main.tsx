/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Canvas, palette, ref pickers, and worker lint land in tasks A10 to A12.
// See docs/02-studio-design.md. This entry exists so the build is real from
// Phase 0 onward rather than being skipped in CI.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

const app = createRoot(root);
app.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// A page that is being discarded (not parked in the back/forward cache, which
// is what persisted means) unmounts the app, so every effect cleanup runs: the
// lint debounce and watchdog timers, the lint worker, the bridge subscription.
// pagehide rather than unload, because an unload listener keeps a page out of
// the back/forward cache (https://web.dev/articles/bfcache). The built-bundle
// tests (tests/bundle-boot, tests/demo-boot) fire this before the test
// environment tears down: without it the app's own timers outlived happy-dom,
// and a render they scheduled committed after `window` was gone.
window.addEventListener("pagehide", (event: PageTransitionEvent) => {
  if (!event.persisted) app.unmount();
});
