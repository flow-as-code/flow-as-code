/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { modeledEntry, type CatalogShape } from "../../catalog.js";
import type { Rule } from "../types.js";

/**
 * Shapes the service enforces when an action is created and the type system
 * cannot: which parameters, error branches and conditions an action may carry
 * given the static value of another parameter. The catalog's `shapes` say
 * which (GetParticipantInput's StoreInput today), each with its source, the
 * action's page or a dated observation of the service refusing the action.
 *
 * A shape whose deciding parameter is not a plain string (a JSONPath, say)
 * is not checked: lint cannot know its value.
 */
export const conditionalShape: Rule = {
  id: "conditional-shape",
  description:
    "An action whose shape depends on a parameter's value carries the parameters, error branches and conditions that value requires, and none it forbids.",
  check({ doc, report }) {
    for (const action of doc.content.Actions) {
      const shapes = modeledEntry(action.Type)?.shapes;
      if (shapes === undefined) continue;
      const params = action.Parameters;
      const wired = new Set((action.Transitions.Errors ?? []).map((e) => e.ErrorType));
      const conditions = action.Transitions.Conditions ?? [];
      for (const shape of shapes) {
        const phrase = applies(shape, params[shape.when.key]);
        if (phrase === undefined) continue;
        const say = (what: string) =>
          report({
            severity: "error",
            blockId: action.Identifier,
            message: `${action.Type} ${phrase} ${what}.`,
          });
        for (const key of shape.requires?.parameters ?? []) {
          if (params[key] === undefined) say(`needs ${key}`);
        }
        for (const type of shape.requires?.errors ?? []) {
          if (!wired.has(type)) say(`needs its "${type}" branch`);
        }
        for (const key of shape.forbids?.parameters ?? []) {
          if (params[key] !== undefined) say(`must not carry ${key}`);
        }
        for (const type of shape.forbids?.errors ?? []) {
          if (wired.has(type)) say(`must not wire the "${type}" branch`);
        }
        if (shape.forbids?.conditions === true && conditions.length > 0) {
          say("takes no conditions");
        }
      }
    }
  },
};

/**
 * How the finding names the shape's condition when it holds, or undefined
 * when it does not (or cannot be known). An absent parameter is not equal to
 * any value.
 */
function applies(shape: CatalogShape, value: unknown): string | undefined {
  const { key, equals, notEquals } = shape.when;
  if (value !== undefined && typeof value !== "string") return undefined;
  if (typeof value === "string" && value.startsWith("$")) return undefined;
  if (equals !== undefined) {
    return value === equals ? `with ${key} "${equals}"` : undefined;
  }
  if (notEquals !== undefined) {
    return value !== notEquals ? `without ${key} "${notEquals}"` : undefined;
  }
  return undefined;
}
