/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { documentStrings, findingsForActions } from "../graph.js";
import { TOKEN_PATTERN, parseToken } from "../../refs.js";
import type { Rule } from "../types.js";

/** Any ${...} placeholder, so malformed tokens are caught rather than ignored. */
/**
 * Only placeholders that ATTEMPT to be a reference are this rule's business.
 *
 * Scanning every `${...}` produced false positives on ordinary prompt text:
 * "Your balance is ${amount}" is a literal string Connect plays verbatim, since
 * Connect's own dynamic syntax is JSONPath ($.Attributes.x), not ${}. Matching
 * on the `cdref` prefix still catches the cases that matter, a well-formed
 * token interpolated into a longer string and a misspelled cdref, without
 * claiming authority over text we do not own.
 */
const CDREF_PLACEHOLDER = /\$\{\s*cdref[^}]*\}/gi;

/**
 * Every token must be well formed, must occupy its entire field, and must
 * appear in the refs index. A token Connect never resolves deploys a flow that
 * fails at runtime with an opaque error.
 */
export const noUnresolvedToken: Rule = {
  id: "no-unresolved-token",
  description:
    "Every ${cdref:...} token must be well formed, stand alone, and appear in the refs index.",
  hard: true,
  check({ doc, report }) {
    const indexed = new Set((doc.refs ?? []).map((r) => r.token));

    const entries: { blockId?: string; path: string; value: string }[] = [
      ...documentStrings(doc).map(([path, value]) => ({ path, value })),
      ...findingsForActions(doc).flatMap(({ action, strings }) =>
        strings.map(([path, value]) => ({ blockId: action.Identifier, path, value })),
      ),
    ];

    const where = (path: string): string =>
      path.startsWith("content.Metadata")
        ? ""
        : path.startsWith("Transitions")
          ? "Transition "
          : "Parameter ";

    for (const { blockId, path, value } of entries) {
      const placeholders = value.match(CDREF_PLACEHOLDER) ?? [];
      if (placeholders.length === 0) continue;

      // Connect requires reference fields to be fully static or a single
      // JSONPath identifier, so a token cannot be part of a longer string.
      if (!TOKEN_PATTERN.test(value)) {
        report({
          severity: "error",
          ...(blockId === undefined ? {} : { blockId }),
          message: `${where(path)}"${path}" embeds a token in a larger string ("${value}"). A token must be the entire value.`,
        });
        continue;
      }

      const token = placeholders[0]!;
      if (parseToken(token) === undefined) {
        report({
          severity: "error",
          ...(blockId === undefined ? {} : { blockId }),
          message: `${where(path)}"${path}" contains a malformed token "${token}".`,
        });
      } else if (!indexed.has(token)) {
        report({
          severity: "error",
          ...(blockId === undefined ? {} : { blockId }),
          message: `Token "${token}" is missing from the refs index. Re-run synth to regenerate it.`,
        });
      }
    }
  },
};
