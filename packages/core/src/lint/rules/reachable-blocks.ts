/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { reachable, transitionTargets } from "../graph.js";
import { actionsById } from "../graph.js";
import type { Rule } from "../types.js";

/**
 * Unreachable actions are kept, never dropped, but they are almost always an
 * editing mistake. Dangling targets are a hard error: Connect rejects the flow.
 */
export const reachableBlocks: Rule = {
  id: "reachable-blocks",
  description:
    "Every action should be reachable from StartAction, and every transition target must exist.",
  check({ doc, report }) {
    const byId = actionsById(doc);

    if (!byId.has(doc.content.StartAction)) {
      report({
        severity: "error",
        message: `StartAction "${doc.content.StartAction}" does not match any action.`,
      });
    }

    for (const action of doc.content.Actions) {
      for (const target of transitionTargets(action)) {
        if (!byId.has(target)) {
          report({
            severity: "error",
            blockId: action.Identifier,
            message: `Transition points at "${target}", which does not exist.`,
          });
        }
      }
    }

    const live = reachable(doc);
    for (const action of doc.content.Actions) {
      if (!live.has(action.Identifier)) {
        report({
          severity: "warning",
          blockId: action.Identifier,
          message: "Action is not reachable from StartAction.",
        });
      }
    }
  },
};
