/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  ActionType,
  NO_MATCHING_CONDITION,
  NO_MATCHING_ERROR,
  TERMINAL_ACTIONS,
} from "../../actions.js";
import { isTerminal } from "../graph.js";
import type { Rule } from "../types.js";

const MODELED = new Set<string>(Object.values(ActionType));

/**
 * The backstop for the type-level enforcement in the builder. It catches what
 * types cannot: hand-edited FlowDocs, exported flows, and studio edits.
 *
 * Only modeled actions are checked. We cannot know an unmodeled action's error
 * set, and some documented actions genuinely have none.
 */
export const errorBranches: Rule = {
  id: "error-branches",
  description: "Every non-terminal modeled action must wire its catch-all error branch.",
  check({ doc, report }) {
    for (const action of doc.content.Actions) {
      if (isTerminal(action)) continue;
      if (!MODELED.has(action.Type)) continue;
      if (TERMINAL_ACTIONS.includes(action.Type)) continue;

      // Compare is the one modeled action that fails with NoMatchingCondition.
      const expected =
        action.Type === ActionType.Compare ? NO_MATCHING_CONDITION : NO_MATCHING_ERROR;
      const wired = (action.Transitions.Errors ?? []).some((e) => e.ErrorType === expected);
      if (!wired) {
        report({
          severity: "error",
          blockId: action.Identifier,
          message: `${action.Type} does not wire its "${expected}" branch.`,
        });
      }
    }
  },
};
