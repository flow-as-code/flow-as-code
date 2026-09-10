/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ActionType } from "../../actions.js";
import { parseToken } from "../../refs.js";
import type { FlowDoc } from "../../flowdoc.js";
import type { Rule } from "../types.js";

/**
 * "You can invoke modules within other modules, supporting up to five levels of
 * nesting with a stack limit to prevent recursive invocations."
 * https://docs.aws.amazon.com/connect/latest/adminguide/contact-flow-modules.html
 */
export const MAX_MODULE_DEPTH = 5;

function invokedModules(doc: FlowDoc): string[] {
  const names: string[] = [];
  for (const action of doc.content.Actions) {
    if (action.Type !== ActionType.InvokeFlowModule) continue;
    const id = action.Parameters.FlowModuleId;
    if (typeof id !== "string") continue;
    const ref = parseToken(id);
    if (ref?.type === "module") names.push(ref.name);
  }
  return names;
}

/**
 * Depth is only computable across a set: a document alone cannot know what the
 * modules it invokes go on to invoke. Linting a single document therefore
 * reports nothing here, which is correct rather than a false pass.
 */
export const moduleDepth5: Rule = {
  id: "module-depth-5",
  description:
    "Flow module invocation must not nest more than five levels deep, and must not recurse.",
  check({ doc, all, report }) {
    // Depth is measured from an entry point. Walking from every document would
    // report the same violation once per document in the chain, so only flows
    // start a walk. A module unreachable from any flow is dead code, which is
    // reachable-blocks territory rather than this rule's.
    if (doc.kind !== "flow") return;

    const modules = new Map(all.filter((d) => d.kind === "module").map((d) => [d.name, d]));

    const walk = (current: FlowDoc, depth: number, stack: string[]): void => {
      for (const name of invokedModules(current)) {
        if (stack.includes(name)) {
          report({
            severity: "error",
            message: `Recursive module invocation: ${[...stack, name].join(" -> ")}.`,
          });
          continue;
        }
        if (depth + 1 > MAX_MODULE_DEPTH) {
          report({
            severity: "error",
            message: `Module nesting reaches depth ${depth + 1} via ${[...stack, name].join(" -> ")}; Connect allows ${MAX_MODULE_DEPTH}.`,
          });
          continue;
        }
        const next = modules.get(name);
        if (next !== undefined) walk(next, depth + 1, [...stack, name]);
      }
    };

    walk(doc, 0, [doc.name]);
  },
};
