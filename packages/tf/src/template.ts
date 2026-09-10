/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Rendering FlowDoc content into a `templatefile` template (.tftpl).
//
// The body of a .tftpl is Connect Flow language JSON, and that JSON legitimately
// contains prompt text a caller wrote, which may include the two sequences HCL
// treats as template introducers: `${` (interpolation) and `%{` (directive).
// Both must survive rendering byte for byte, so both are escaped by doubling
// their leading character, per the HCL string template grammar:
// https://developer.hashicorp.com/terraform/language/expressions/strings#escape-sequences
// https://github.com/hashicorp/hcl/blob/main/hclsyntax/spec.md#template-expressions
//
// Escaping is applied to the WHOLE serialized document, then the reference
// interpolations this emitter owns are substituted in. Doing it the other way
// round would escape our own interpolations. The intermediate values are unique
// sentinels chosen so they cannot appear in the document (see sentinelPrefix),
// which keeps the substitution from colliding with authored text that happens to
// look like a sentinel.

import { type FlowDoc, materializeWithMap, serializeContent } from "@flow-as-code/core";

/**
 * Doubles the leading character of every HCL template introducer so the text
 * renders literally. `${` becomes `$${` and `%{` becomes `%%{`.
 *
 * The two patterns are disjoint and the expansion of one can never produce the
 * other, so a single pass in either order is correct. It is also correct for
 * already-doubled input: HCL scans left to right and takes the longest match,
 * so escaping `$${` to `$$${` renders back to `$${` (a literal `$` followed by
 * the escape for a literal `${`).
 */
export function escapeTemplateText(text: string): string {
  // The replacements are functions on purpose. A string replacement gives `$`
  // its substitution meaning, so the literal "$${" would be inserted as "${"
  // and every escape would silently undo itself.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replaceAll#specifying_a_string_as_the_replacement
  return text.replaceAll("${", () => "$${").replaceAll("%{", () => "%%{");
}

/** Root of the sentinel names used while substituting reference tokens. */
const SENTINEL_BASE = "CDREF_TF_SENTINEL";

/**
 * A sentinel prefix that does not occur in `haystack`. Authored text is allowed
 * to contain anything, sentinel lookalikes included, so the prefix grows until
 * it is absent from the document being rendered. It terminates: every extra
 * character makes the prefix longer, and a string cannot contain a substring
 * longer than itself.
 */
export function sentinelPrefix(haystack: string): string {
  let prefix = SENTINEL_BASE;
  while (haystack.includes(prefix)) prefix += "X";
  return `${prefix}_`;
}

/**
 * The `.tftpl` body for one document: deployable content JSON with every
 * `${cdref:...}` token replaced by a `${var}` interpolation naming the entry in
 * `local.flow_refs`, and every other template introducer escaped.
 *
 * `variableNames` maps token to template variable name and must cover every
 * token in the document; @flow-as-code/core's strict materializer raises a
 * MaterializeError listing all missing tokens at once if it does not.
 */
export function renderTemplate(doc: FlowDoc, variableNames: ReadonlyMap<string, string>): string {
  // Sentinels are chosen against the authored document, before materialization,
  // so a value that looks like a sentinel cannot be smuggled in through a token.
  const prefix = sentinelPrefix(JSON.stringify(doc.content));

  const sentinels = new Map<string, string>();
  const substitutions = new Map<string, string>();
  let index = 0;
  for (const [token, variable] of [...variableNames].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const sentinel = `${prefix}${String(index)}_`;
    index += 1;
    sentinels.set(token, sentinel);
    substitutions.set(sentinel, `\${${variable}}`);
  }

  const content = materializeWithMap(doc, Object.fromEntries(sentinels));
  let body = escapeTemplateText(serializeContent(content));
  for (const [sentinel, interpolation] of substitutions) {
    body = body.replaceAll(sentinel, interpolation);
  }
  return body;
}
