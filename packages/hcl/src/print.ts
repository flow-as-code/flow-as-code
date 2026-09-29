/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HclFile, Span } from "./ast.js";
import type { Token } from "./tokens.js";

/** The tokens as written: `print(parse(text)) === text` for any text that parses. */
export function printTokens(tokens: readonly Token[]): string {
  let out = "";
  for (const t of tokens) out += t.space + t.text;
  return out;
}

/** The file exactly as it was read. */
export function print(file: HclFile): string {
  return printTokens(file.tokens);
}

/** The source text of one node, from its first token's text to its last token's. */
export function sourceOf(file: HclFile, node: Span): string {
  return file.tokens
    .slice(node.first, node.last + 1)
    .map((t, k) => (k === 0 ? t.text : t.space + t.text))
    .join("");
}
