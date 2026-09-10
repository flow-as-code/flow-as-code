/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { documentStrings, findingsForActions, walkStrings } from "../graph.js";
import type { Rule } from "../types.js";

const ARN = /arn:aws[a-z-]*:/;

/** This rule's id, for tools that report the violation before lint can run. */
export const NO_LITERAL_ARN = "no-literal-arn";

/** The sentence every literal-ARN report ends with. */
export function literalArnMessage(path: string): string {
  return `"${path}" contains a literal ARN. Use a \${cdref:type:name} token instead.`;
}

/**
 * Paths of every string holding a literal ARN in an arbitrary JSON value.
 *
 * Takes `unknown` rather than a FlowDoc on purpose: the CLI runs this over a
 * document the schema has already rejected, because the schema's own pattern
 * errors describe that one mistake several times over and never name the rule.
 * See packages/cli/src/docs.ts.
 */
export function literalArnPaths(value: unknown): string[] {
  return walkStrings(value)
    .filter(([, v]) => ARN.test(v))
    .map(([path]) => path);
}

/**
 * References are tokens, never literal ARNs. A literal ARN pins a flow to one
 * account, region, and instance, which is the whole thing this tooling exists
 * to avoid.
 */
export const noLiteralArn: Rule = {
  id: NO_LITERAL_ARN,
  description: "Authored content must not contain a literal ARN; use a ${cdref:...} token.",
  hard: true,
  check({ doc, report }) {
    // `refs` is authored content too: it is what the studio's reference
    // pickers and the emitters read, and an ARN placed there satisfied this
    // rule while the schema was the only thing catching it.
    const documentLevel = [...documentStrings(doc), ...walkStrings(doc.refs ?? [], "refs")];
    for (const [path, value] of documentLevel) {
      if (ARN.test(value)) {
        report({ severity: "error", message: literalArnMessage(path) });
      }
    }

    for (const { action, strings } of findingsForActions(doc)) {
      for (const [path, value] of strings) {
        if (ARN.test(value)) {
          report({
            severity: "error",
            blockId: action.Identifier,
            message: `${path.startsWith("Transitions") ? "Transition" : "Parameter"} ${literalArnMessage(path)}`,
          });
        }
      }
    }
  },
};
