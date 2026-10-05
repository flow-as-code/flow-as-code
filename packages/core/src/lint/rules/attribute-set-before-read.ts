/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ActionType } from "../../actions.js";
import { textBodyPaths } from "../../catalog.js";
import type { FlowDoc } from "../../flowdoc.js";
import { readPath } from "../../paths.js";
import type { Rule } from "../types.js";

/**
 * A prompt that reads `$.Attributes.<name>` speaks the attribute's value, and
 * an attribute nothing has set is empty: the contact hears "Welcome back, ."
 * and no error is raised anywhere. The read is in message text, which the
 * catalog locates (`textBodies`); the write is UpdateContactAttributes, whose
 * `Attributes` map keys are the names it sets. Its `TargetContact` picks whose
 * attributes: `Current` (the default) or `Related`, the contact this one was
 * created from; a write to the related contact leaves the current contact's
 * attribute as empty as before, so only the first counts here.
 * https://docs.aws.amazon.com/connect/latest/adminguide/connect-attrib-list.html#user-defined-attributes
 * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactattributes.html
 *
 * Attributes cross flows: a whisper reads what the main flow set, a module
 * reads what its caller set. So this is a set-wide rule, and a lone document
 * reports nothing, as module-depth-5 does: one document cannot know what the
 * rest of the deployment sets. It is a warning rather than an error because
 * an attribute can also arrive from outside any flow, set on the contact by
 * the API that started it, by a chat widget, or by an agent; a set that reads
 * such attributes disables the rule.
 */
const ATTRIBUTE_READ = /\$\.Attributes\.([A-Za-z0-9_-]+)/g;

function attributesSet(docs: readonly FlowDoc[]): Set<string> {
  const names = new Set<string>();
  for (const doc of docs) {
    for (const action of doc.content.Actions) {
      if (action.Type !== ActionType.UpdateContactAttributes) continue;
      const target = action.Parameters.TargetContact;
      if (target !== undefined && target !== "Current") continue;
      const attributes = action.Parameters.Attributes;
      if (attributes === null || typeof attributes !== "object" || Array.isArray(attributes))
        continue;
      for (const name of Object.keys(attributes)) names.add(name);
    }
  }
  return names;
}

export const attributeSetBeforeRead: Rule = {
  id: "attribute-set-before-read",
  description:
    "A contact attribute read in message text must be set by some document in the linted set.",
  check({ doc, all, report }) {
    if (all.length < 2) return;
    const set = attributesSet(all);
    for (const action of doc.content.Actions) {
      const catalogPaths = textBodyPaths(action.Type);
      const paths = catalogPaths.length > 0 ? catalogPaths : ["Text", "SSML"];
      const reported = new Set<string>();
      for (const path of paths) {
        for (const hit of readPath(action.Parameters, path)) {
          if (typeof hit.value !== "string") continue;
          for (const match of hit.value.matchAll(ATTRIBUTE_READ)) {
            const name = match[1]!;
            if (set.has(name) || reported.has(name)) continue;
            reported.add(name);
            report({
              severity: "warning",
              blockId: action.Identifier,
              message: `${hit.path} reads $.Attributes.${name}, which no document in the set sets (UpdateContactAttributes); the contact hears an empty value.`,
            });
          }
        }
      }
    }
  },
};
