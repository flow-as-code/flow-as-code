/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { modeledEntry } from "../../catalog.js";
import type { Rule } from "../types.js";

/**
 * Connect refuses a non-terminal action without Transitions.NextAction
 * ("Action is missing required property. Path:
 * Actions[N].Transitions.NextAction", InvalidContactFlowException), observed
 * on every non-terminal modeled type probed on 2026-09-30 except
 * MessageParticipantIteratively, which the service accepts either way
 * (conformance/flow-language/actions.md, rule 38).
 * https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateContactFlow.html
 *
 * Which types need it comes from the catalog's `next` rule: `required`, or
 * `mirrors:*` for a type whose builder writes NextAction as a copy of a
 * branch. Only presence is checked. The service accepts any target, so a
 * NextAction that does not equal the mirrored branch is legal (codegen reads
 * it back as a GenericBlock, which re-emits it unchanged). Terminal types,
 * `none` types and unmodeled actions are not checked.
 */
export const nextActionRequired: Rule = {
  id: "next-action-required",
  description:
    "Every non-terminal modeled action whose type the service refuses without a NextAction must carry one.",
  check({ doc, report }) {
    for (const action of doc.content.Actions) {
      const entry = modeledEntry(action.Type);
      if (entry === undefined || entry.terminal) continue;
      const rule = entry.transitions.next;
      if (rule !== "required" && !rule.startsWith("mirrors:")) continue;
      if (action.Transitions.NextAction !== undefined) continue;
      report({
        severity: "error",
        blockId: action.Identifier,
        message: `${action.Type} has no NextAction; Connect refuses the action without one.`,
      });
    }
  },
};
