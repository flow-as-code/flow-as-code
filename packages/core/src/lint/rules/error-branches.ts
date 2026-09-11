/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { modeledEntry, requiredErrors } from "../../catalog.js";
import { isTerminal } from "../graph.js";
import type { Rule } from "../types.js";

/**
 * The backstop for the type-level enforcement in the builder. It catches what
 * types cannot: hand-edited FlowDocs, exported flows, and studio edits.
 *
 * Only modeled actions are checked. We cannot know an unmodeled action's error
 * set, and some documented actions genuinely have none. Which branches an
 * action must wire comes from the catalog (conformance/flow-language/
 * catalog.json): the catch-all for most, NoMatchingCondition for Compare, two
 * named errors and no catch-all for some of the types the modeled set is
 * growing into, and none at all for others.
 */
export const errorBranches: Rule = {
  id: "error-branches",
  description: "Every non-terminal modeled action must wire its catch-all error branch.",
  check({ doc, report }) {
    for (const action of doc.content.Actions) {
      if (isTerminal(action)) continue;
      const entry = modeledEntry(action.Type);
      if (entry === undefined || entry.terminal) continue;

      const wired = new Set((action.Transitions.Errors ?? []).map((e) => e.ErrorType));
      for (const expected of requiredErrors(action.Type)) {
        if (wired.has(expected)) continue;
        report({
          severity: "error",
          blockId: action.Identifier,
          message: `${action.Type} does not wire its "${expected}" branch.`,
        });
      }
    }
  },
};
