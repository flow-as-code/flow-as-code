/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Debounced lint on every doc change, run in a Web Worker so a large flow
// never blocks the canvas. Environments without workers (tests) fall back to
// running the same pure handler on the main thread.
//
// Every way the worker can fail to answer has to end in an answer, because
// lintPending disables Save: a worker that boots, accepts a message, and never
// posts back left the studio stuck on "Checking..." with Save disabled for the
// rest of the session and no way to recover short of a reload. onerror covers
// a worker that throws; the timeout below covers one that simply goes quiet.

import type { FlowDoc } from "@flow-as-code/core";
import { useEffect, useRef } from "react";
import type { StudioAction } from "../state/studio.js";
import type { LintResult } from "../worker/lintProtocol.js";
import { handleLintRequest } from "../worker/lintProtocol.js";

export const LINT_DEBOUNCE_MS = 200;

/**
 * How long to wait for the worker before linting on the main thread instead.
 * Generous next to the debounce: linting a 250-action flow is milliseconds, so
 * anything near this is a worker that is not coming back.
 */
export const LINT_TIMEOUT_MS = 4000;

export function useLintWorker(doc: FlowDoc | null, dispatch: (action: StudioAction) => void): void {
  const workerRef = useRef<Worker | null>(null);
  const triedRef = useRef(false);
  const seqRef = useRef(0);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      triedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (doc === null) return;
    const seq = ++seqRef.current;
    let answered = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;

    const apply = (result: LintResult) => {
      if (result.seq !== seqRef.current) return; // stale
      answered = true;
      if (watchdog !== undefined) clearTimeout(watchdog);
      dispatch({ type: "lint", findings: result.findings, blocked: result.blocked });
      // A result that could not be linted keeps blocked true; surface why.
      if (result.error !== undefined) dispatch({ type: "error", message: result.error });
    };

    const timer = setTimeout(() => {
      if (!triedRef.current) {
        triedRef.current = true;
        try {
          const worker = new Worker(new URL("../worker/lint.worker.ts", import.meta.url), {
            type: "module",
          });
          worker.onmessage = (event: MessageEvent<LintResult>) => apply(event.data);
          // If the worker fails to boot, fall back to the main thread for good.
          worker.onerror = () => {
            worker.terminate();
            workerRef.current = null;
            const latest = docRef.current;
            if (latest !== null) apply(handleLintRequest({ seq: seqRef.current, doc: latest }));
          };
          workerRef.current = worker;
        } catch {
          workerRef.current = null;
        }
      }
      if (workerRef.current !== null) {
        workerRef.current.postMessage({ seq, doc });
        // A worker that accepted the message and never answers must not leave
        // Save disabled forever: give up on it and lint here instead.
        watchdog = setTimeout(() => {
          if (answered || seq !== seqRef.current) return;
          workerRef.current?.terminate();
          workerRef.current = null;
          apply(handleLintRequest({ seq, doc }));
        }, LINT_TIMEOUT_MS);
      } else {
        apply(handleLintRequest({ seq, doc }));
      }
    }, LINT_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      if (watchdog !== undefined) clearTimeout(watchdog);
    };
  }, [doc, dispatch]);
}
