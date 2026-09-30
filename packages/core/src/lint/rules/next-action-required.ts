/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { modeledEntry } from "../../catalog.js";
import type { FlowAction } from "../../flowdoc.js";
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
 * branch. The fifteen non-terminal modeled types rule 38 lists as unprobed
 * are checked from the catalog alone; that the service refuses them without
 * a NextAction is assumed. Only presence is checked. The service accepted
 * every target tried, so a NextAction that does not equal the mirrored
 * branch is legal (codegen reads it back as a GenericBlock, which re-emits
 * it unchanged). Terminal types, `none` types and unmodeled actions are not
 * checked; a NextAction on a terminal type, which the service refuses, is
 * left unchecked (SPEC.md).
 *
 * For a `mirrors:*` type whose mirrored branch is wired to a string target,
 * the message names that target, the value the builder writes, so a
 * document written before Compare carried one can be fixed by copying it.
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
        message: `${action.Type} has no NextAction; Connect refuses the action without one.${hint(action, rule)}`,
      });
    }
  },
};

/** The mirrored branch's target, in words, or "" when there is none to copy. */
function hint(action: FlowAction, rule: string): string {
  const error = "mirrors:error:";
  const condition = "mirrors:condition:";
  const t = action.Transitions as unknown as Record<string, unknown>;
  if (rule.startsWith(error)) {
    const type = rule.slice(error.length);
    const branch = list(t["Errors"]).find((e) => e["ErrorType"] === type);
    const target = branch?.["NextAction"];
    return typeof target === "string"
      ? ` Set it to "${target}", the ${type} branch's target, as the builder does.`
      : "";
  }
  if (rule.startsWith(condition)) {
    const operand = rule.slice(condition.length);
    const branch = list(t["Conditions"]).find((c) => {
      const cond = c["Condition"];
      if (cond === null || typeof cond !== "object" || Array.isArray(cond)) return false;
      const operands = (cond as Record<string, unknown>)["Operands"];
      return Array.isArray(operands) && operands[0] === operand;
    });
    const target = branch?.["NextAction"];
    return typeof target === "string"
      ? ` Set it to "${target}", the ${operand} condition's target, as the builder does.`
      : "";
  }
  return "";
}

/** The plain-object elements of a value meant to be an array. */
function list(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (e): e is Record<string, unknown> => e !== null && typeof e === "object" && !Array.isArray(e),
  );
}
