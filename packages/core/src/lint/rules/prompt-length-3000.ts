/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { textBodyPaths } from "../../catalog.js";
import { readPath } from "../../paths.js";
import type { Rule } from "../types.js";

/**
 * "When you use text, either for text-to-speech or chat, you can use a maximum
 * of 3,000 billed characters, which is 6,000 characters total."
 * https://docs.aws.amazon.com/connect/latest/adminguide/play.html
 *
 * The Get customer input block states the same limit for its own text:
 * https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
 *
 * Billed characters are the spoken text. SSML markup counts toward the 6,000
 * total but not the 3,000 billed, so the two are checked separately.
 *
 * Which actions carry a body, and where, comes from the catalog's textBodies
 * (conformance/flow-language/catalog.json): `Text` and `SSML` on the two
 * announcing actions today, and list positions such as `Messages[].Text` as
 * the modeled set grows. A path ending in SSML is markup; anything else is
 * plain text.
 */
export const MAX_BILLED_CHARACTERS = 3000;
export const MAX_TOTAL_CHARACTERS = 6000;

const stripSsmlTags = (s: string): string => s.replace(/<[^>]*>/g, "");

const isSsmlPath = (path: string): boolean => path.split(".").pop() === "SSML";

export const promptLength3000: Rule = {
  id: "prompt-length-3000",
  description: "Prompt text must stay within 3,000 billed characters and 6,000 total.",
  check({ doc, report }) {
    for (const action of doc.content.Actions) {
      for (const path of textBodyPaths(action.Type)) {
        for (const hit of readPath(action.Parameters, path)) {
          const body = hit.value;
          if (typeof body !== "string") continue;
          const label = hit.path;

          if (!isSsmlPath(hit.path)) {
            if (body.length > MAX_BILLED_CHARACTERS) {
              report({
                severity: "error",
                blockId: action.Identifier,
                message: `${label} is ${body.length} characters; Connect allows ${MAX_BILLED_CHARACTERS} billed characters.`,
              });
            }
            continue;
          }

          if (body.length > MAX_TOTAL_CHARACTERS) {
            report({
              severity: "error",
              blockId: action.Identifier,
              message: `${label} is ${body.length} characters; Connect allows ${MAX_TOTAL_CHARACTERS} total.`,
            });
          }
          const spoken = stripSsmlTags(body).length;
          if (spoken > MAX_BILLED_CHARACTERS) {
            report({
              severity: "error",
              blockId: action.Identifier,
              message: `${label} contains ${spoken} spoken characters; Connect allows ${MAX_BILLED_CHARACTERS} billed characters.`,
            });
          }
        }
      }
    }
  },
};
