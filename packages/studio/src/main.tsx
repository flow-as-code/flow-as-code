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

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
