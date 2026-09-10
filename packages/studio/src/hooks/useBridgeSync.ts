/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Subscribes the app to the `flow-cli studio` bridge event stream, which is
// the "edit the .flow.ts and the canvas follows" half of the round trip.
//
// The hook only routes: which events matter for the open document is decided
// in the reducer (state/studio.tsx), so the rule is stated once and can be
// tested without a DOM. A "synced" event for another document only refreshes
// the document list.

import { useEffect } from "react";
import type { Dispatch } from "react";
import { BridgeStore } from "../store/bridgeStore.js";
import type { DocStore } from "../store/types.js";
import { parseFlowDoc } from "../model/validate.js";
import type { StudioAction } from "../state/studio.js";

/** Longest a one-line message is worth showing in a badge or a toast. */
const MAX_LINE = 200;

/**
 * The first line of a reported failure.
 *
 * A synth failure arrives as a Node stack trace, tsx internals included. The
 * first line is the sentence a user can act on; the rest belongs in the
 * terminal running `flow-cli studio`, which prints it in full.
 */
export function firstLine(message: string): string {
  const line =
    message
      .split("\n")
      .find((l) => l.trim() !== "")
      ?.trim() ?? message.trim();
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line;
}

export function useBridgeSync(store: DocStore, dispatch: Dispatch<StudioAction>): void {
  useEffect(() => {
    if (!(store instanceof BridgeStore)) return;
    const stop = store.subscribe(
      (event) => {
        switch (event.kind) {
          case "synced":
            try {
              // Same gate as every other read path: a document that does not
              // satisfy the schema must not reach the canvas.
              dispatch({ type: "doc-synced", name: event.name, doc: parseFlowDoc(event.text) });
            } catch (err) {
              dispatch({
                type: "error",
                message: `${event.name}: ${err instanceof Error ? err.message : String(err)}`,
              });
            }
            return;
          case "conflict":
            dispatch({ type: "conflict", conflict: event });
            return;
          case "error":
            // The builder file did not become a FlowDoc, so the canvas and
            // that file have stopped agreeing and stay that way until it
            // synths. The reducer keeps it on screen for exactly that long.
            dispatch({
              type: "sync-error",
              ...(event.name === undefined ? {} : { name: event.name }),
              path: event.path,
              message: firstLine(event.message),
            });
            return;
        }
      },
      (message) => {
        dispatch({ type: "notice", message: `Lost contact with flow-cli studio: ${message}` });
      },
    );
    return stop;
  }, [store, dispatch]);
}
