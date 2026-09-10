/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { isValidIdentifier } from "../../flowdoc.js";
import type { Rule } from "../types.js";

/**
 * Identifiers are unique within a flow and document names unique within a set,
 * because both are used as keys by the emitters.
 */
export const uniqueNames: Rule = {
  id: "unique-names",
  description:
    "Action Identifiers are unique within a flow, document names unique within a set, and both are valid.",
  check({ doc, all, report }) {
    const seen = new Set<string>();
    for (const action of doc.content.Actions) {
      if (seen.has(action.Identifier)) {
        report({
          severity: "error",
          blockId: action.Identifier,
          message: `Duplicate Identifier "${action.Identifier}".`,
        });
      }
      seen.add(action.Identifier);

      if (!isValidIdentifier(action.Identifier)) {
        report({
          severity: "error",
          blockId: action.Identifier,
          message: `Identifier "${action.Identifier}" is not valid: at most 50 characters, and none of % : ( \\ / ) = $ , ; [ ] { }.`,
        });
      }
    }

    if (all.filter((d) => d.name === doc.name).length > 1) {
      report({
        severity: "error",
        message: `Duplicate document name "${doc.name}" in this flow set.`,
      });
    }
  },
};
