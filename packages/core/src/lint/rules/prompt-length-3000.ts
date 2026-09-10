/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ActionType } from "../../actions.js";
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
 */
export const MAX_BILLED_CHARACTERS = 3000;
export const MAX_TOTAL_CHARACTERS = 6000;

/** The modeled actions that carry a Text or SSML prompt. */
const PROMPT_ACTIONS: readonly string[] = [
  ActionType.MessageParticipant,
  ActionType.GetParticipantInput,
];

const stripSsmlTags = (s: string): string => s.replace(/<[^>]*>/g, "");

export const promptLength3000: Rule = {
  id: "prompt-length-3000",
  description: "Prompt text must stay within 3,000 billed characters and 6,000 total.",
  check({ doc, report }) {
    for (const action of doc.content.Actions) {
      if (!PROMPT_ACTIONS.includes(action.Type)) continue;

      const text = action.Parameters.Text;
      if (typeof text === "string" && text.length > MAX_BILLED_CHARACTERS) {
        report({
          severity: "error",
          blockId: action.Identifier,
          message: `Text is ${text.length} characters; Connect allows ${MAX_BILLED_CHARACTERS} billed characters.`,
        });
      }

      const ssml = action.Parameters.SSML;
      if (typeof ssml === "string") {
        if (ssml.length > MAX_TOTAL_CHARACTERS) {
          report({
            severity: "error",
            blockId: action.Identifier,
            message: `SSML is ${ssml.length} characters; Connect allows ${MAX_TOTAL_CHARACTERS} total.`,
          });
        }
        const spoken = stripSsmlTags(ssml).length;
        if (spoken > MAX_BILLED_CHARACTERS) {
          report({
            severity: "error",
            blockId: action.Identifier,
            message: `SSML contains ${spoken} spoken characters; Connect allows ${MAX_BILLED_CHARACTERS} billed characters.`,
          });
        }
      }
    }
  },
};
