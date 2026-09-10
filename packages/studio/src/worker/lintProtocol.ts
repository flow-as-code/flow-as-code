/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Message protocol for the lint worker, factored out so the handling is a
// pure function testable without spawning a Worker. The worker file itself
// (lint.worker.ts) only wires postMessage to this.
//
// The handler never throws: a malformed message or a rule that blows up on a
// half-built doc would otherwise leave the worker dead and the studio
// silently unlinted. Anything it cannot lint comes back as an error result
// that keeps the doc blocked.

import type { FlowDoc } from "@flow-as-code/core";
import type { Finding } from "@flow-as-code/core/lint";
import { hasBlockingFindings, lint } from "@flow-as-code/core/lint";

export interface LintRequest {
  /** Monotonic sequence number; stale responses are dropped by the caller. */
  seq: number;
  doc: FlowDoc;
}

export interface LintResult {
  seq: number;
  findings: Finding[];
  /**
   * True when a hard rule (no-literal-arn, no-unresolved-token) failed, and
   * also whenever linting could not be completed. The studio can never save a
   * doc in this state; see docs/02-studio-design.md.
   */
  blocked: boolean;
  /** Set when the request could not be linted at all. */
  error?: string;
}

/** Sequence number reported for a message with no usable seq of its own. */
export const UNKNOWN_SEQ = -1;

function isFlowDoc(value: unknown): value is FlowDoc {
  if (value === null || typeof value !== "object") return false;
  const doc = value as Partial<FlowDoc>;
  return (
    typeof doc.name === "string" &&
    doc.content !== null &&
    typeof doc.content === "object" &&
    Array.isArray((doc.content as { Actions?: unknown }).Actions)
  );
}

/**
 * Lints one request. Returns a structured error result instead of throwing, so
 * one bad message cannot wedge the worker.
 */
export function handleLintRequest(request: unknown): LintResult {
  const seq =
    typeof request === "object" &&
    request !== null &&
    typeof (request as LintRequest).seq === "number"
      ? (request as LintRequest).seq
      : UNKNOWN_SEQ;
  const doc = (request as { doc?: unknown } | null | undefined)?.doc;
  if (!isFlowDoc(doc)) {
    return { seq, findings: [], blocked: true, error: "Malformed lint request: no FlowDoc." };
  }
  try {
    const findings = lint(doc);
    return { seq, findings, blocked: hasBlockingFindings(findings) };
  } catch (err) {
    return {
      seq,
      findings: [],
      blocked: true,
      error: `Lint failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
