/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Position } from "./errors.js";

/**
 * Token kinds, named after hclsyntax's so the formatter can follow hclwrite's
 * rules one for one. https://github.com/hashicorp/hcl/blob/main/hclsyntax/token.go
 */
export type TokenType =
  | "Newline"
  | "Comment"
  | "Ident"
  | "Number"
  | "OQuote"
  | "CQuote"
  | "QuotedLit"
  | "TemplateInterp"
  | "TemplateControl"
  | "TemplateSeqEnd"
  | "OHeredoc"
  | "CHeredoc"
  | "StringLit"
  | "OBrace"
  | "CBrace"
  | "OBrack"
  | "CBrack"
  | "OParen"
  | "CParen"
  | "Comma"
  | "Dot"
  | "Equal"
  | "Colon"
  | "DoubleColon"
  | "Question"
  | "Ellipsis"
  | "FatArrow"
  | "EqualOp"
  | "NotEqual"
  | "LessThan"
  | "LessThanEq"
  | "GreaterThan"
  | "GreaterThanEq"
  | "And"
  | "Or"
  | "Bang"
  | "Plus"
  | "Minus"
  | "Star"
  | "Slash"
  | "Percent"
  | "EOF";

/**
 * One token and the horizontal whitespace before it. Every character of the
 * source belongs to exactly one token's `space` or `text`, so concatenating
 * them reproduces the source byte for byte (print.ts). A line comment's text
 * includes its newline, as hclsyntax's does.
 */
export interface Token {
  type: TokenType;
  text: string;
  space: string;
  start: Position;
}

/** How a token moves the bracket depth, as hclwrite's tokenBracketChange counts it. */
export function bracketChange(token: Token): number {
  switch (token.type) {
    case "OBrace":
    case "OBrack":
    case "OParen":
    case "TemplateInterp":
    case "TemplateControl":
      return 1;
    case "CBrace":
    case "CBrack":
    case "CParen":
    case "TemplateSeqEnd":
      return -1;
    default:
      return 0;
  }
}

/** Whether a token ends a line: a newline, or a line comment (which carries its newline). */
export function endsLine(token: Token): boolean {
  return token.type === "Newline" || (token.type === "Comment" && token.text.endsWith("\n"));
}
