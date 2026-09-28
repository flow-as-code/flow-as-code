/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A recursive-descent parser for the HCL native syntax over lexer.ts's
// tokens. Newlines end attributes and body items; inside brackets they are
// insignificant, except in an object constructor, where they separate items
// as commas do. https://github.com/hashicorp/hcl/blob/main/hclsyntax/spec.md

import type {
  Attribute,
  Block,
  Body,
  Expr,
  HclFile,
  ObjectItem,
  TemplatePart,
  TraversalStep,
} from "./ast.js";
import { HclError } from "./errors.js";
import { lex } from "./lexer.js";
import type { Token, TokenType } from "./tokens.js";

const BINARY: readonly (readonly TokenType[])[] = [
  ["Or"],
  ["And"],
  ["EqualOp", "NotEqual"],
  ["LessThan", "LessThanEq", "GreaterThan", "GreaterThanEq"],
  ["Plus", "Minus"],
  ["Star", "Slash", "Percent"],
];

/** Parses `source` into a syntax tree over its full token array. */
export function parse(source: string, file = "<input>"): HclFile {
  const tokens = lex(source, file);
  let i = 0;

  const peek = (n = 0): Token => tokens[Math.min(i + n, tokens.length - 1)]!;
  const fail = (message: string, at: Token = peek()): never => {
    throw new HclError(message, { file, position: at.start });
  };
  const describe = (t: Token): string =>
    t.type === "EOF"
      ? "the end of the file"
      : t.type === "Newline"
        ? "a newline"
        : JSON.stringify(t.text);
  const expect = (type: TokenType, what: string): Token => {
    const t = peek();
    if (t.type !== type) fail(`Expected ${what}, found ${describe(t)}.`);
    i += 1;
    return t;
  };
  /** Skips newlines and comments, which inside brackets are insignificant. */
  const skipTrivia = (): void => {
    while (peek().type === "Newline" || peek().type === "Comment") i += 1;
  };
  /** Skips block comments only (a line comment ends the line). */
  const skipInlineComments = (): void => {
    while (peek().type === "Comment" && !peek().text.endsWith("\n")) i += 1;
  };

  const body = parseBody(false);
  if (peek().type !== "EOF") fail(`Unexpected ${describe(peek())}.`);
  return { file, source, tokens, body };

  function parseBody(nested: boolean): Body {
    const first = i;
    const items: (Attribute | Block)[] = [];
    for (;;) {
      skipTrivia();
      const t = peek();
      if (t.type === "EOF") {
        if (nested) fail('Expected "}" to close the block.');
        break;
      }
      if (t.type === "CBrace") {
        if (!nested) fail('Unexpected "}".');
        break;
      }
      items.push(parseItem());
    }
    return { first, last: Math.max(first, i - 1), items };
  }

  function parseItem(): Attribute | Block {
    const start = i;
    const name = expect("Ident", "an attribute or block name");
    skipInlineComments();
    if (peek().type === "Equal") {
      i += 1;
      const expr = parseExpr(false);
      const last = i - 1;
      endItem();
      return { kind: "attribute", name: name.text, expr, first: start, last };
    }
    const labels: string[] = [];
    for (;;) {
      skipInlineComments();
      const t = peek();
      if (t.type === "Ident") {
        labels.push(t.text);
        i += 1;
      } else if (t.type === "OQuote") {
        const tmpl = parseTemplate();
        if (tmpl.parts.some((p) => p.kind !== "text")) {
          fail("A block label must be a literal string.", tokens[tmpl.first]);
        }
        labels.push(tmpl.parts.map((p) => (p.kind === "text" ? p.raw : "")).join(""));
      } else break;
    }
    expect("OBrace", `"=" or "{" after "${name.text}"`);
    skipInlineComments();
    let inner: Body;
    if (peek().type === "CBrace") {
      inner = { first: i, last: i - 1, items: [] };
    } else if (peek().type === "Newline" || peek().type === "Comment") {
      inner = parseBody(true);
    } else {
      // A single-line block holds at most one attribute: `name { a = 1 }`.
      const attrStart = i;
      const attrName = expect("Ident", "an attribute name");
      expect("Equal", '"="');
      const expr = parseExpr(false);
      inner = {
        first: attrStart,
        last: i - 1,
        items: [{ kind: "attribute", name: attrName.text, expr, first: attrStart, last: i - 1 }],
      };
      skipInlineComments();
    }
    expect("CBrace", '"}" to close the block');
    const last = i - 1;
    endItem();
    return { kind: "block", type: name.text, labels, body: inner, first: start, last };
  }

  /** An item ends at a newline, a line comment, the end of the file, or a closing brace. */
  function endItem(): void {
    skipInlineComments();
    const t = peek();
    if (t.type === "Newline" || t.type === "Comment") {
      i += 1;
      return;
    }
    if (t.type === "EOF" || t.type === "CBrace") return;
    fail(`Expected a newline after the item, found ${describe(t)}.`);
  }

  function parseExpr(inBrackets: boolean): Expr {
    const start = i;
    const condition = parseBinary(0, inBrackets);
    if (inBrackets) skipTrivia();
    if (peek().type !== "Question") return condition;
    i += 1;
    if (inBrackets) skipTrivia();
    const then = parseExpr(inBrackets);
    if (inBrackets) skipTrivia();
    expect("Colon", '":" in a conditional expression');
    if (inBrackets) skipTrivia();
    const otherwise = parseExpr(inBrackets);
    return { kind: "conditional", condition, then, else: otherwise, first: start, last: i - 1 };
  }

  function parseBinary(level: number, inBrackets: boolean): Expr {
    if (level === BINARY.length) return parseUnary(inBrackets);
    const start = i;
    let left = parseBinary(level + 1, inBrackets);
    for (;;) {
      const save = i;
      if (inBrackets) skipTrivia();
      skipInlineComments();
      const op = peek();
      if (!BINARY[level]!.includes(op.type)) {
        i = save;
        return left;
      }
      i += 1;
      if (inBrackets) skipTrivia();
      const right = parseBinary(level + 1, inBrackets);
      left = { kind: "binary", op: op.text, left, right, first: start, last: i - 1 };
    }
  }

  function parseUnary(inBrackets: boolean): Expr {
    const t = peek();
    if (t.type === "Bang" || t.type === "Minus") {
      const start = i;
      i += 1;
      const operand = parseUnary(inBrackets);
      return {
        kind: "unary",
        op: t.type === "Bang" ? "!" : "-",
        operand,
        first: start,
        last: i - 1,
      };
    }
    return parsePostfix(parsePrimary(), inBrackets);
  }

  function parseSteps(): TraversalStep[] {
    const steps: TraversalStep[] = [];
    for (;;) {
      const t = peek();
      if (t.type === "Dot") {
        const next = peek(1);
        if (next.type === "Ident") {
          steps.push({ kind: "attr", name: next.text });
          i += 2;
        } else if (next.type === "Number") {
          steps.push({ kind: "index", key: literalNumber(i + 1) });
          i += 2;
        } else if (next.type === "Star") {
          steps.push({ kind: "splat", full: false });
          i += 2;
        } else fail('Expected an attribute name after ".".', next);
      } else if (t.type === "OBrack") {
        if (peek(1).type === "Star" && peek(2).type === "CBrack") {
          steps.push({ kind: "splat", full: true });
          i += 3;
          continue;
        }
        i += 1;
        skipTrivia();
        const key = parseExpr(true);
        skipTrivia();
        expect("CBrack", '"]" to close the index');
        steps.push({ kind: "index", key });
      } else return steps;
    }
  }

  function literalNumber(at: number): Expr {
    const t = tokens[at]!;
    return { kind: "literal", value: Number(t.text), raw: t.text, first: at, last: at };
  }

  function parsePostfix(target: Expr, _inBrackets: boolean): Expr {
    const steps = parseSteps();
    if (steps.length === 0) return target;
    if (target.kind === "traversal") {
      return { ...target, steps: [...target.steps, ...steps], last: i - 1 };
    }
    return { kind: "postfix", target, steps, first: target.first, last: i - 1 };
  }

  function parsePrimary(): Expr {
    const t = peek();
    const start = i;
    switch (t.type) {
      case "Number":
        i += 1;
        return literalNumber(start);
      case "OQuote":
      case "OHeredoc":
        return parseTemplate();
      case "OBrack":
        return parseTupleOrFor();
      case "OBrace":
        return parseObjectOrFor();
      case "OParen": {
        i += 1;
        skipTrivia();
        const inner = parseExpr(true);
        skipTrivia();
        expect("CParen", '")"');
        return { kind: "paren", inner, first: start, last: i - 1 };
      }
      case "Ident": {
        if (t.text === "true" || t.text === "false" || t.text === "null") {
          const next = peek(1);
          if (next.type !== "Dot" && next.type !== "OBrack") {
            i += 1;
            return {
              kind: "literal",
              value: t.text === "null" ? null : t.text === "true",
              raw: t.text,
              first: start,
              last: start,
            };
          }
        }
        // A function call, possibly namespaced: `provider::name::fn(...)`.
        let j = i;
        let name = t.text;
        while (tokens[j + 1]?.type === "DoubleColon" && tokens[j + 2]?.type === "Ident") {
          name += `::${tokens[j + 2]!.text}`;
          j += 2;
        }
        if (tokens[j + 1]?.type === "OParen") {
          i = j + 2;
          return parseCall(name, start);
        }
        i += 1;
        return { kind: "traversal", root: t.text, steps: [], first: start, last: start };
      }
      default:
        return fail(`Expected an expression, found ${describe(t)}.`);
    }
  }

  function parseCall(name: string, start: number): Expr {
    const args: Expr[] = [];
    let expandFinal = false;
    skipTrivia();
    while (peek().type !== "CParen") {
      args.push(parseExpr(true));
      skipTrivia();
      if (peek().type === "Ellipsis") {
        expandFinal = true;
        i += 1;
        skipTrivia();
      }
      if (peek().type === "Comma") {
        i += 1;
        skipTrivia();
        continue;
      }
      if (peek().type !== "CParen") fail(`Expected "," or ")" in the call to ${name}.`);
    }
    i += 1;
    return { kind: "call", name, args, expandFinal, first: start, last: i - 1 };
  }

  function parseTupleOrFor(): Expr {
    const start = i;
    i += 1;
    skipTrivia();
    if (isForStart()) return parseFor(start, false);
    const items: Expr[] = [];
    while (peek().type !== "CBrack") {
      items.push(parseExpr(true));
      skipTrivia();
      if (peek().type === "Comma") {
        i += 1;
        skipTrivia();
        continue;
      }
      if (peek().type !== "CBrack") fail('Expected "," or "]" in the tuple.');
    }
    i += 1;
    return { kind: "tuple", items, first: start, last: i - 1 };
  }

  function parseObjectOrFor(): Expr {
    const start = i;
    i += 1;
    skipTrivia();
    if (isForStart()) return parseFor(start, true);
    const items: ObjectItem[] = [];
    while (peek().type !== "CBrace") {
      const keyToken = peek();
      const bareKey =
        keyToken.type === "Ident" && (peek(1).type === "Equal" || peek(1).type === "Colon");
      const key: Expr = bareKey
        ? { kind: "traversal", root: keyToken.text, steps: [], first: i, last: i }
        : parseExpr(true);
      if (bareKey) i += 1;
      skipInlineComments();
      const sep = peek();
      if (sep.type !== "Equal" && sep.type !== "Colon") {
        fail('Expected "=" or ":" after the object key.');
      }
      i += 1;
      skipTrivia();
      const value = parseExpr(true);
      items.push({ key, bareKey, value });
      skipInlineComments();
      if (peek().type === "Comma") i += 1;
      skipTrivia();
    }
    i += 1;
    return { kind: "object", items, first: start, last: i - 1 };
  }

  function isForStart(): boolean {
    return peek().type === "Ident" && peek().text === "for" && peek(1).type === "Ident";
  }

  function parseFor(start: number, object: boolean): Expr {
    i += 1;
    const first = expect("Ident", "a variable name after for").text;
    let keyVar: string | undefined;
    let valueVar = first;
    if (peek().type === "Comma") {
      i += 1;
      keyVar = first;
      valueVar = expect("Ident", "a value variable name").text;
    }
    const kw = expect("Ident", '"in"');
    if (kw.text !== "in") fail('Expected "in".', kw);
    skipTrivia();
    const collection = parseExpr(true);
    skipTrivia();
    expect("Colon", '":" in the for expression');
    skipTrivia();
    let keyExpr: Expr | undefined;
    let valueExpr = parseExpr(true);
    skipTrivia();
    if (object) {
      expect("FatArrow", '"=>" in the object for expression');
      skipTrivia();
      keyExpr = valueExpr;
      valueExpr = parseExpr(true);
      skipTrivia();
    }
    let group = false;
    if (peek().type === "Ellipsis") {
      group = true;
      i += 1;
      skipTrivia();
    }
    let condition: Expr | undefined;
    if (peek().type === "Ident" && peek().text === "if") {
      i += 1;
      skipTrivia();
      condition = parseExpr(true);
      skipTrivia();
    }
    expect(object ? "CBrace" : "CBrack", object ? '"}"' : '"]"');
    return {
      kind: "for",
      object,
      keyVar,
      valueVar,
      collection,
      keyExpr,
      valueExpr,
      group,
      condition,
      first: start,
      last: i - 1,
    };
  }

  function parseTemplate(): Expr & { kind: "template" } {
    const start = i;
    const open = peek();
    const quoted = open.type === "OQuote";
    i += 1;
    const parts: TemplatePart[] = [];
    const close: TokenType = quoted ? "CQuote" : "CHeredoc";
    for (;;) {
      const t = peek();
      if (t.type === close) {
        i += 1;
        break;
      }
      if (t.type === "QuotedLit" || t.type === "StringLit") {
        parts.push({ kind: "text", raw: t.text });
        i += 1;
        continue;
      }
      if (t.type === "TemplateInterp") {
        i += 1;
        skipTrivia();
        const expr = parseExpr(true);
        skipTrivia();
        const end = expect("TemplateSeqEnd", '"}" to close the interpolation');
        parts.push({
          kind: "interp",
          expr,
          strip: [t.text.endsWith("~"), end.text.startsWith("~")],
        });
        continue;
      }
      if (t.type === "TemplateControl") {
        // Directives (%{ if }, %{ for }) are kept as token spans; nothing in the
        // contract uses them, and evaluateLiteral refuses a template holding one.
        const dStart = i;
        let depth = 0;
        do {
          const u = peek();
          if (u.type === "EOF") fail("Unterminated template directive.");
          if (u.type === "TemplateControl" || u.type === "TemplateInterp") depth += 1;
          if (u.type === "TemplateSeqEnd") depth -= 1;
          i += 1;
        } while (depth > 0);
        parts.push({ kind: "directive", first: dStart, last: i - 1 });
        continue;
      }
      fail(`Unexpected ${describe(t)} in a string.`);
    }
    const flush = !quoted && open.text.startsWith("<<-");
    return { kind: "template", quoted, flush, parts, first: start, last: i - 1 };
  }
}
