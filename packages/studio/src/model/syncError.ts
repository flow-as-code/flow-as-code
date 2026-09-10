/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// How a synth failure reads on screen.
//
// The bridge reports a builder file that did not become a FlowDoc as an
// absolute path plus the message the sandboxed child threw, and the message
// repeats that path. Rendered verbatim that gave the out-of-sync badge an
// accessible name that was nothing but the path, a visible label that clipped
// mid-path, and a toast carrying the same path twice. Both surfaces read the
// same sentence from here instead: the file, then what is wrong with it.
//
// A module of its own rather than a helper in the toolbar, because the reducer
// (state/studio.tsx) builds the toast and the toolbar renders the badge, and a
// component importing the reducer that imports the component is a cycle.

/** The last segment of a path the bridge reported. */
export function baseName(path: string): string {
  const last = path.split(/[/\\]/).pop();
  return last === undefined || last === "" ? path : last;
}

/**
 * One line naming the file and the failure. The message is cut to its first
 * line (the rest is a stack that belongs in the terminal running `flow-cli
 * studio`) and every occurrence of the absolute path inside it is reduced to
 * the file name this sentence already opens with.
 */
export function syncErrorText(path: string, message: string): string {
  const base = baseName(path);
  const firstLine = (message.split("\n")[0] ?? "").trim();
  return `Code out of sync: ${base}: ${firstLine.split(path).join(base)}`;
}
