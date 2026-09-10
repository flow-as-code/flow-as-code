/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { TERMINAL_ACTIONS } from "../../actions.js";
import { isTerminal, reachable } from "../graph.js";
import { actionsById } from "../graph.js";
import type { Rule } from "../types.js";

/**
 * A flow that cannot terminate strands the contact. Also catches the inverse
 * mistake: an action with empty Transitions that is not a terminal type, which
 * Connect treats as an unintended dead end.
 */
export const terminalBlocks: Rule = {
  id: "terminal-blocks",
  description:
    "A flow must reach a terminal action, and only terminal action types may have empty transitions.",
  check({ doc, report }) {
    const byId = actionsById(doc);
    const live = reachable(doc);

    const reachesTerminal = [...live].some((id) => {
      const a = byId.get(id);
      return a !== undefined && isTerminal(a) && TERMINAL_ACTIONS.includes(a.Type);
    });

    if (!reachesTerminal) {
      report({
        severity: "error",
        message: "No terminal action is reachable from StartAction; the flow cannot end.",
      });
    }

    for (const action of doc.content.Actions) {
      if (isTerminal(action) && !TERMINAL_ACTIONS.includes(action.Type)) {
        report({
          severity: "warning",
          blockId: action.Identifier,
          message: `${action.Type} has no transitions but is not a terminal action type, so the flow dead-ends here.`,
        });
      }
    }
  },
};
