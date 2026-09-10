/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// lintPending disables Save, so every way the worker can fail to answer has to
// end in an answer. A worker that boots, accepts the message, and then never
// posts back is the case with no error to catch: without a watchdog the studio
// sits on "Checking..." with Save disabled until the page is reloaded.

import type { FlowDoc } from "@flow-as-code/core";
import { useEffect } from "react";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LINT_DEBOUNCE_MS, LINT_TIMEOUT_MS, useLintWorker } from "../src/hooks/useLintWorker.js";
import type { StudioAction } from "../src/state/studio.js";
import { installDomStubs, render, unmount } from "./appHarness.js";
import { demoDoc } from "./helpers.js";

/** A Worker that boots and accepts messages but never answers. */
class SilentWorker {
  static instances: SilentWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  terminated = false;
  posted = 0;

  constructor() {
    SilentWorker.instances.push(this);
  }
  postMessage(_message?: unknown) {
    this.posted++;
  }
  terminate() {
    this.terminated = true;
  }
}

function Probe({ doc, onAction }: { doc: FlowDoc; onAction: (a: StudioAction) => void }) {
  useLintWorker(doc, onAction);
  useEffect(() => undefined, []);
  return null;
}

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  SilentWorker.instances = [];
});

describe("a worker that never answers", () => {
  it("falls back to the main thread and clears lintPending", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", SilentWorker);
    const actions: StudioAction[] = [];
    await render(<Probe doc={demoDoc()} onAction={(a) => actions.push(a)} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LINT_DEBOUNCE_MS + 10);
    });
    expect(SilentWorker.instances).toHaveLength(1);
    expect(SilentWorker.instances[0]?.posted).toBe(1);
    // The worker has the message and is not answering.
    expect(actions).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LINT_TIMEOUT_MS + 10);
    });
    const lint = actions.find((a) => a.type === "lint");
    expect(lint).toBeDefined();
    if (lint?.type === "lint") expect(lint.blocked).toBe(false);
    // It was given up on, so the next edit does not wait on it again.
    expect(SilentWorker.instances[0]?.terminated).toBe(true);
  });
});

describe("a worker that answers", () => {
  it("does not fall back, and cancels the watchdog", async () => {
    vi.useFakeTimers();
    class TalkativeWorker extends SilentWorker {
      postMessage(message: unknown) {
        super.postMessage(message);
        const { seq } = message as { seq: number };
        queueMicrotask(() =>
          this.onmessage?.({ data: { seq, findings: [], blocked: false } } as MessageEvent),
        );
      }
    }
    vi.stubGlobal("Worker", TalkativeWorker);
    const actions: StudioAction[] = [];
    await render(<Probe doc={demoDoc()} onAction={(a) => actions.push(a)} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LINT_DEBOUNCE_MS + 10);
    });
    expect(actions.filter((a) => a.type === "lint")).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LINT_TIMEOUT_MS * 2);
    });
    // The watchdog did not also fire a second, redundant result.
    expect(actions.filter((a) => a.type === "lint")).toHaveLength(1);
    expect(SilentWorker.instances[0]?.terminated).toBe(false);
  });
});
