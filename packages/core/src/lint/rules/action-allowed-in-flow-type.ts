/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { FLOW_TYPE_RESTRICTIONS } from "../../actions.js";
import type { Rule } from "../types.js";

/**
 * Almost every Connect action documents a Restrictions section naming the flow
 * types it is legal in. Deploying a flow that violates one fails at create time
 * with a message that does not say which block is at fault.
 *
 * Added 2026-08-31 from the A00b reference; not one of the original nine rules
 * in SPEC.md. Restrictions live in actions.ts, sourced per action page.
 */
export const actionAllowedInFlowType: Rule = {
  id: "action-allowed-in-flow-type",
  description: "Each action must be legal in the flow type that contains it.",
  check({ doc, report }) {
    for (const action of doc.content.Actions) {
      const allowed = FLOW_TYPE_RESTRICTIONS[action.Type];
      if (allowed === undefined) continue;
      if (!allowed.includes(doc.connectType)) {
        report({
          severity: "error",
          blockId: action.Identifier,
          message: `${action.Type} is not allowed in a ${doc.connectType} flow. Allowed: ${allowed.join(", ")}.`,
        });
      }
    }
  },
};
