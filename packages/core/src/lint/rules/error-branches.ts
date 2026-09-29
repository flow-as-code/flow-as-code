/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { minConditionsFor, modeledEntry, requiredErrorsFor } from "../../catalog.js";
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
 * growing into, and none at all for others. A type the service refuses
 * without a condition (the catalog's minConditions) is reported here too:
 * a condition is a branch, and the refusal is the same InvalidContactFlow.
 * So is a branch the catalog does not list for the type: the service refuses
 * an error type an action does not have ("Invalid Action error", observed
 * 2026-09-29 on UpdateContactRecordingBehavior's NoMatchingError, which an
 * earlier builder wrote).
 */
export const errorBranches: Rule = {
  id: "error-branches",
  description:
    "Every non-terminal modeled action must wire the error branches the service requires, the catch-all for most, any branch a parameter it carries makes required, and the conditions its type cannot do without, and no error branch its type does not have.",
  check({ doc, report }) {
    for (const action of doc.content.Actions) {
      if (isTerminal(action)) continue;
      const entry = modeledEntry(action.Type);
      if (entry === undefined || entry.terminal) continue;

      const wired = new Set((action.Transitions.Errors ?? []).map((e) => e.ErrorType));
      for (const expected of requiredErrorsFor(action.Type, action.Parameters)) {
        if (wired.has(expected)) continue;
        report({
          severity: "error",
          blockId: action.Identifier,
          message: `${action.Type} does not wire its "${expected}" branch.`,
        });
      }
      const listed = new Set(entry.transitions.errors.map((e) => e.type));
      for (const error of action.Transitions.Errors ?? []) {
        if (listed.has(error.ErrorType)) continue;
        report({
          severity: "error",
          blockId: action.Identifier,
          message: `${action.Type} has no "${error.ErrorType}" branch.`,
        });
      }
      const least = minConditionsFor(action.Type);
      if ((action.Transitions.Conditions ?? []).length < least) {
        report({
          severity: "error",
          blockId: action.Identifier,
          message: `${action.Type} needs at least ${String(least)} condition${least === 1 ? "" : "s"}.`,
        });
      }
    }
  },
};
