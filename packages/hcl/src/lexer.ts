/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The HCL native syntax scanner. It keeps every character: whitespace rides on
// the token after it, comments are tokens, and template strings are split
// into their literal and interpolated parts as hclsyntax splits them.
// https://github.com/hashicorp/hcl/blob/main/hclsyntax/spec.md

import { HclError, type Position } from "./errors.js";
import type { Token, TokenType } from "./tokens.js";

type Mode =
  | { kind: "body" }
  | { kind: "brace" }
  | { kind: "interp" }
  | { kind: "quoted" }
  | { kind: "heredoc"; marker: string; flush: boolean; atLineStart: boolean };

const PUNCTUATION: readonly [string, TokenType][] = [
  ["...", "Ellipsis"],
  ["=>", "FatArrow"],
  ["==", "EqualOp"],
  ["!=", "NotEqual"],
  ["<=", "LessThanEq"],
  [">=", "GreaterThanEq"],
  ["&&", "And"],
  ["||", "Or"],
  ["::", "DoubleColon"],
  ["[", "OBrack"],
  ["]", "CBrack"],
  ["(", "OParen"],
  [")", "CParen"],
  [",", "Comma"],
  [".", "Dot"],
  ["=", "Equal"],
  [":", "Colon"],
  ["?", "Question"],
  ["!", "Bang"],
  ["<", "LessThan"],
  [">", "GreaterThan"],
  ["+", "Plus"],
  ["-", "Minus"],
  ["*", "Star"],
  ["/", "Slash"],
  ["%", "Percent"],
];

const IDENT_START = /[\p{L}_]/u;
const IDENT_PART = /[\p{L}\p{N}_-]/u;

/** Splits `source` into tokens, ending with an EOF token that carries any trailing whitespace. */
export function lex(source: string, file = "<input>"): Token[] {
  const tokens: Token[] = [];
  const modes: Mode[] = [{ kind: "body" }];
  let i = 0;
  let line = 1;
  let column = 1;
  let space = "";

  const here = (): Position => ({ line, column, offset: i });
  const fail = (message: string): never => {
    throw new HclError(message, { file, position: here() });
  };
  const advance = (text: string): void => {
    for (const ch of text) {
      if (ch === "\n") {
        line += 1;
        column = 1;
      } else {
        column += ch.length;
      }
    }
    i += text.length;
  };
  const emit = (type: TokenType, text: string): void => {
    tokens.push({ type, text, space, start: here() });
    space = "";
    advance(text);
  };
  const top = (): Mode => modes[modes.length - 1]!;

  while (i < source.length) {
    const mode = top();
    if (mode.kind === "quoted") {
      lexQuoted();
      continue;
    }
    if (mode.kind === "heredoc") {
      lexHeredoc(mode);
      continue;
    }
    const ch = source[i]!;
    const rest = source.slice(i);
    if (ch === " " || ch === "\t") {
      let j = i;
      while (j < source.length && (source[j] === " " || source[j] === "\t")) j += 1;
      space += source.slice(i, j);
      advance(source.slice(i, j));
      continue;
    }
    if (ch === "\n" || rest.startsWith("\r\n")) {
      emit("Newline", ch === "\n" ? "\n" : "\r\n");
      continue;
    }
    if (ch === "#" || rest.startsWith("//")) {
      const end = source.indexOf("\n", i);
      emit("Comment", end === -1 ? rest : source.slice(i, end + 1));
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) fail("Unterminated block comment.");
      emit("Comment", source.slice(i, end + 2));
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const m = /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(rest)!;
      emit("Number", m[0]);
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + ch.length;
      while (j < source.length && IDENT_PART.test(source[j]!)) j += 1;
      emit("Ident", source.slice(i, j));
      continue;
    }
    if (ch === '"') {
      emit("OQuote", '"');
      modes.push({ kind: "quoted" });
      continue;
    }
    if (rest.startsWith("<<")) {
      const m = /^<<(-?)([\p{L}_][\p{L}\p{N}_-]*)(\r?\n)/u.exec(rest);
      if (m === null)
        fail("Invalid heredoc introducer; expected <<MARKER or <<-MARKER and a newline.");
      emit("OHeredoc", m![0]);
      modes.push({ kind: "heredoc", marker: m![2]!, flush: m![1] === "-", atLineStart: true });
      continue;
    }
    if (ch === "{") {
      emit("OBrace", "{");
      modes.push({ kind: "brace" });
      continue;
    }
    if (ch === "}" || rest.startsWith("~}")) {
      const closing = mode.kind;
      if (closing === "interp") {
        emit("TemplateSeqEnd", ch === "~" ? "~}" : "}");
        modes.pop();
        continue;
      }
      if (ch === "~") fail('Unexpected "~".');
      if (closing !== "brace") fail('Unexpected "}".');
      emit("CBrace", "}");
      modes.pop();
      continue;
    }
    const punct = PUNCTUATION.find(([p]) => rest.startsWith(p));
    if (punct !== undefined) {
      emit(punct[1], punct[0]);
      continue;
    }
    fail(`Invalid character ${JSON.stringify(ch)}.`);
  }

  if (modes.length > 1) {
    const open = top().kind;
    fail(
      open === "quoted"
        ? "Unterminated string."
        : open === "heredoc"
          ? "Unterminated heredoc."
          : open === "interp"
            ? "Unterminated template interpolation."
            : 'Unclosed "{".',
    );
  }
  tokens.push({ type: "EOF", text: "", space, start: here() });
  return tokens;

  /** Inside "...": literal runs, escapes kept verbatim, and ${ } / %{ } sequences. */
  function lexQuoted(): void {
    let j = i;
    while (j < source.length) {
      const c = source[j]!;
      if (c === '"') break;
      if (c === "\n" || c === "\r") {
        advance(source.slice(i, j));
        fail("Unterminated string; a quoted string cannot span lines.");
      }
      if (c === "\\") {
        j += 2;
        continue;
      }
      if ((c === "$" || c === "%") && source[j + 1] === c && source[j + 2] === "{") {
        j += 3;
        continue;
      }
      if ((c === "$" || c === "%") && source[j + 1] === "{") break;
      j += 1;
    }
    if (j > i) emit("QuotedLit", source.slice(i, j));
    if (i >= source.length) return;
    if (source[i] === '"') {
      emit("CQuote", '"');
      modes.pop();
      return;
    }
    openSequence();
  }

  /** Inside a heredoc: literal lines up to the closing marker, with ${ } / %{ } sequences. */
  function lexHeredoc(mode: Extract<Mode, { kind: "heredoc" }>): void {
    if (mode.atLineStart) {
      const lineEnd = source.indexOf("\n", i);
      const text = lineEnd === -1 ? source.slice(i) : source.slice(i, lineEnd);
      if (text.replace(/\r$/, "").trim() === mode.marker) {
        emit("CHeredoc", text.replace(/\r$/, ""));
        modes.pop();
        return;
      }
    }
    let j = i;
    while (j < source.length) {
      const c = source[j]!;
      if (c === "\n") {
        j += 1;
        break;
      }
      if ((c === "$" || c === "%") && source[j + 1] === c && source[j + 2] === "{") {
        j += 3;
        continue;
      }
      if ((c === "$" || c === "%") && source[j + 1] === "{") break;
      j += 1;
    }
    const text = source.slice(i, j);
    mode.atLineStart = text.endsWith("\n");
    if (text.length > 0) emit("StringLit", text);
    if (i < source.length && !mode.atLineStart) openSequence();
  }

  /** At `${` or `%{` (with an optional `~` strip marker): the start of an interpolation or directive. */
  function openSequence(): void {
    const c = source[i]!;
    const strip = source[i + 2] === "~";
    emit(c === "$" ? "TemplateInterp" : "TemplateControl", strip ? `${c}{~` : `${c}{`);
    modes.push({ kind: "interp" });
  }
}
