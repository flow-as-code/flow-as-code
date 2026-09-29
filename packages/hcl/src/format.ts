/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The canonical layout `terraform fmt` and `tofu fmt` produce, as hclwrite
// computes it: split the tokens into lines, indent each line by its bracket
// depth, set the space between each pair of tokens by rule, then align the
// `=` of consecutive attribute lines and their trailing comments. This is a
// port of hclwrite's format.go, pass for pass, so a file this writes is a
// fixed point of the real tool; conformance/hcl holds the two to each other.
// https://github.com/hashicorp/hcl/blob/main/hclwrite/format.go
//
// Only hclwrite's formatting is reproduced. Terraform's fmt command also
// rewrites some legacy syntax (an interpolation-only string such as
// "${var.x}" becomes var.x); nothing this repository writes has that shape.

import type { HclFile } from "./ast.js";
import { parse } from "./parser.js";
import { printTokens } from "./print.js";
import { bracketChange, endsLine, type Token } from "./tokens.js";

interface Cell {
  tokens: Token[];
}
interface Line {
  lead: Token[];
  assign: Token[] | undefined;
  comment: Token[] | undefined;
}

const NIL: Token = { type: "EOF", text: "", space: "", start: { line: 0, column: 0, offset: 0 } };

/** Formats HCL source text. Throws an HclError when it does not parse. */
export function format(source: string, file = "<input>"): string {
  return formatFile(parse(source, file));
}

/** The formatted text of a parsed file. The file's tokens are not modified. */
export function formatFile(file: HclFile): string {
  const tokens = file.tokens.map((t) => ({ ...t }));
  const lines = linesOf(tokens);
  indent(lines);
  spaces(lines);
  cells(lines);
  // hclwrite trims trailing whitespace at the end of the file to a single newline.
  const eof = tokens[tokens.length - 1]!;
  eof.space = "";
  return printTokens(tokens);
}

function linesOf(tokens: Token[]): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type === "EOF") {
      if (i > start) lines.push(split(tokens.slice(start, i)));
      break;
    }
    if (endsLine(t)) {
      lines.push(split(tokens.slice(start, i + 1)));
      start = i + 1;
    }
  }
  return lines;
}

/** Moves a trailing comment and an attribute's `=` and value into their own cells. */
function split(lead: Token[]): Line {
  const line: Line = { lead, assign: undefined, comment: undefined };
  const last = lead[lead.length - 1]!;
  if (lead.length > 1 && last.type === "Comment") {
    line.comment = [last];
    line.lead = lead.slice(0, -1);
  }
  for (let i = 1; i < line.lead.length; i++) {
    if (line.lead[i]!.type !== "Equal") continue;
    // Only a whole expression moves into the assign cell: a line that opens
    // more brackets than it closes starts a multi-line value, and is left out
    // of alignment.
    let net = 0;
    for (const t of line.lead.slice(i)) {
      net += bracketChange(t);
      if (t.type === "OHeredoc") break;
    }
    if (net === 0) {
      line.assign = line.lead.slice(i);
      line.lead = line.lead.slice(0, i);
    }
    break;
  }
  return line;
}

function indent(lines: Line[]): void {
  const stack: number[] = [];
  for (const line of lines) {
    const first = line.lead[0];
    if (first === undefined) continue;
    if (first.type === "Newline") {
      first.space = "";
      continue;
    }
    let net = 0;
    for (const cell of [line.lead, line.assign ?? []]) {
      for (const t of cell) {
        net += bracketChange(t);
        if (t.type === "OHeredoc") break;
      }
    }
    if (net > 0) {
      first.space = " ".repeat(2 * stack.length);
      stack.push(net);
    } else if (net < 0) {
      let closed = -net;
      while (closed > 0 && stack.length > 0) {
        const top = stack[stack.length - 1]!;
        if (closed > top) {
          closed -= top;
          stack.pop();
        } else if (closed < top) {
          stack[stack.length - 1] = top - closed;
          closed = 0;
        } else {
          stack.pop();
          closed = 0;
        }
      }
      first.space = " ".repeat(2 * stack.length);
    } else {
      first.space = " ".repeat(2 * stack.length);
    }
  }
}

function spaces(lines: Line[]): void {
  for (const line of lines) {
    spaceCell(line.lead);
    if (line.assign !== undefined) {
      line.assign[0]!.space = " ";
      spaceCell(line.assign);
    }
  }
}

function spaceCell(cell: Token[]): void {
  for (let i = 0; i < cell.length - 1; i++) {
    const before = i > 0 ? cell[i - 1]! : NIL;
    cell[i + 1]!.space = spaceAfter(cell[i]!, before, cell[i + 1]!) ? " " : "";
  }
}

/** hclwrite's spaceAfterToken, rule for rule, plus its handling of `!`. */
function spaceAfter(subject: Token, before: Token, after: Token): boolean {
  const s = subject.type;
  const a = after.type;
  if (a === "Newline" || a === "EOF") return false;
  if (s === "Ident" && a === "OParen") return false;
  if ((s === "Ident" && a === "DoubleColon") || (s === "DoubleColon" && a === "Ident"))
    return false;
  if (s === "Dot" || a === "Dot") return false;
  if (a === "Comma" || a === "Ellipsis") return false;
  if (s === "Comma") return true;
  if (
    s === "QuotedLit" ||
    s === "StringLit" ||
    s === "OQuote" ||
    s === "OHeredoc" ||
    a === "QuotedLit" ||
    a === "StringLit" ||
    a === "CQuote" ||
    a === "CHeredoc"
  ) {
    return false;
  }
  if (s === "Ident" && subject.text === "in" && before.type === "Ident") return true;
  if (a === "OBrack" && (s === "Ident" || s === "Number" || bracketChange(subject) < 0))
    return false;
  if (s === "Bang") return false;
  if (s === "Minus") {
    switch (before.type) {
      case "EOF":
      case "OParen":
      case "OBrace":
      case "OBrack":
      case "Equal":
      case "Colon":
      case "Comma":
      case "Question":
      case "Plus":
      case "Star":
      case "Slash":
      case "Percent":
      case "Minus":
      case "EqualOp":
      case "NotEqual":
      case "GreaterThan":
      case "GreaterThanEq":
      case "LessThan":
      case "LessThanEq":
      case "And":
      case "Or":
      case "Bang":
        return false;
      default:
        return true;
    }
  }
  if (s === "OBrace" || a === "CBrace") return !(s === "OBrace" && a === "CBrace");
  if ((s === "TemplateInterp" || s === "TemplateControl") && a === "OBrace") return true;
  if (s === "CBrace" && a === "TemplateSeqEnd") return true;
  if (s === "TemplateSeqEnd" && (a === "TemplateInterp" || a === "TemplateControl")) return false;
  if (bracketChange(subject) > 0) return false;
  if (bracketChange(after) < 0) return false;
  return true;
}

/** Width of a cell as it will print, in code points. */
function columns(cell: readonly Token[]): number {
  let n = 0;
  for (const t of cell) n += [...t.space].length + [...t.text].length;
  return n;
}

function cells(lines: Line[]): void {
  align(
    lines,
    (l) => l.assign,
    (l) => columns(l.lead),
  );
  align(
    lines,
    (l) => l.comment,
    (l) => columns(l.lead) + columns(l.assign ?? []),
  );
}

/** Aligns one cell across each run of consecutive lines that have it. */
function align(
  lines: Line[],
  cell: (l: Line) => Token[] | undefined,
  width: (l: Line) => number,
): void {
  let run: Line[] = [];
  const close = () => {
    const max = Math.max(...run.map(width));
    for (const l of run) cell(l)![0]!.space = " ".repeat(max - width(l) + 1);
    run = [];
  };
  for (const line of lines) {
    if (cell(line) === undefined) {
      if (run.length > 0) close();
    } else run.push(line);
  }
  if (run.length > 0) close();
}

export type { Cell };
