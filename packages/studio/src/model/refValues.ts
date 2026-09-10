/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Validation for reference-bearing parameter values. Same rules as the lint
// engine: a value is a ${cdref:...} token of the right type or a single
// JSONPath identifier, and a literal ARN is rejected outright.

import type { FlowDoc, RefEntry, RefType } from "@flow-as-code/core";
import { SLUG_PATTERN, TOKEN_PATTERN, parseToken } from "@flow-as-code/core";

/** Same pattern as the no-literal-arn lint rule. */
export const LITERAL_ARN = /arn:aws[a-z-]*:/;

const JSONPATH = /^\$\.[A-Za-z0-9_$.[\]'-]+$/;

export type RefValueCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * Validates manual text entry for a reference field. Accepts a full token of
 * the expected type or a JSONPath identifier; rejects literal ARNs with the
 * same rule lint enforces.
 */
export function checkRefValue(refType: RefType, raw: string): RefValueCheck {
  const value = raw.trim();
  if (value === "") return { ok: false, error: "Enter a token or JSONPath." };
  if (LITERAL_ARN.test(value)) {
    return {
      ok: false,
      error:
        "Literal ARNs are rejected (lint rule no-literal-arn). Use a ${cdref:type:name} token.",
    };
  }
  if (TOKEN_PATTERN.test(value)) {
    const parsed = parseToken(value);
    if (parsed !== undefined && parsed.type !== refType) {
      return { ok: false, error: `Expected a ${refType} reference, got ${parsed.type}.` };
    }
    return { ok: true, value };
  }
  if (JSONPATH.test(value)) return { ok: true, value };
  return {
    ok: false,
    error: "Not a ${cdref:" + refType + ":name} token or a $.single.jsonpath identifier.",
  };
}

/** Builds a token for a new reference. Module refs require an alias. */
export function makeToken(refType: RefType, name: string, alias?: string): RefValueCheck {
  if (!SLUG_PATTERN.test(name)) {
    return { ok: false, error: `"${name}" is not a slug (lowercase words separated by hyphens).` };
  }
  if (refType === "module") {
    if (alias === undefined || !SLUG_PATTERN.test(alias)) {
      return { ok: false, error: "Module references need a slug alias, e.g. prod." };
    }
    return { ok: true, value: `\${cdref:module:${name}@${alias}}` };
  }
  return { ok: true, value: `\${cdref:${refType}:${name}}` };
}

/** Tokens of the given type already indexed in the doc, for the picker list. */
export function refOptions(doc: FlowDoc, refType: RefType): RefEntry[] {
  return (doc.refs ?? []).filter((r) => r.type === refType);
}
