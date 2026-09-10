/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Lint engine types.
//
// Nothing in this directory may import a Node builtin. The studio runs the
// engine in a web worker, so the whole module graph has to be browser-safe.
// Enforced by lint-browser-safe.test.ts, which walks the imports statically.

import type { FlowDoc } from "../flowdoc.js";

export type Severity = "error" | "warning";

export interface Finding {
  /** Stable rule id. Never renamed; the Go provider keys off these. */
  rule: string;
  severity: Severity;
  message: string;
  /** Name of the FlowDoc the finding belongs to. */
  doc: string;
  /** Action Identifier, when the finding is about one action. */
  blockId?: string;
}

export interface RuleContext {
  doc: FlowDoc;
  /** Every doc being linted, for rules that need to follow module references. */
  all: readonly FlowDoc[];
  report(finding: Omit<Finding, "rule" | "doc">): void;
}

export interface Rule {
  id: string;
  description: string;
  /**
   * A hard rule blocks a save in the studio rather than merely reporting.
   * docs/02-studio-design.md: the studio can never save a doc that fails
   * no-literal-arn or no-unresolved-token.
   */
  hard?: boolean;
  check(ctx: RuleContext): void;
}
