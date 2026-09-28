/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import type { Attribute, Block, Expr } from "./ast.js";
import { HclError } from "./errors.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";
import { print, sourceOf } from "./print.js";

const attr = (source: string): Expr => {
  const file = parse(`x = ${source}\n`);
  return (file.body.items[0] as Attribute).expr;
};

describe("the lexer", () => {
  it("keeps whitespace on the following token and a line comment's newline in the comment", () => {
    const tokens = lex('a  = "b" # note\n');
    expect(tokens.map((t) => [t.type, t.space, t.text])).toEqual([
      ["Ident", "", "a"],
      ["Equal", "  ", "="],
      ["OQuote", " ", '"'],
      ["QuotedLit", "", "b"],
      ["CQuote", "", '"'],
      ["Comment", " ", "# note\n"],
      ["EOF", "", ""],
    ]);
  });

  it("splits a template into literal runs and interpolations, and keeps escapes verbatim", () => {
    const types = lex('a = "x${b.c}\\"$${d}%{ if e }y%{ endif }"').map((t) => t.type);
    expect(types).toEqual([
      "Ident",
      "Equal",
      "OQuote",
      "QuotedLit",
      "TemplateInterp",
      "Ident",
      "Dot",
      "Ident",
      "TemplateSeqEnd",
      "QuotedLit",
      "TemplateControl",
      "Ident",
      "Ident",
      "TemplateSeqEnd",
      "QuotedLit",
      "TemplateControl",
      "Ident",
      "TemplateSeqEnd",
      "CQuote",
      "EOF",
    ]);
  });

  it("reads a heredoc to its closing marker", () => {
    const tokens = lex("a = <<-EOT\n  one ${b}\n  two\n  EOT\n");
    expect(tokens.map((t) => t.type)).toEqual([
      "Ident",
      "Equal",
      "OHeredoc",
      "StringLit",
      "TemplateInterp",
      "Ident",
      "TemplateSeqEnd",
      "StringLit",
      "StringLit",
      "CHeredoc",
      "Newline",
      "EOF",
    ]);
  });

  it("names the file, line and column of what it cannot read", () => {
    expect(() => lex('a = 1\nb = "open\n', "main.tf")).toThrow(
      /^main\.tf:2:10: Unterminated string/,
    );
    expect(() => lex("a = 1 @", "main.tf")).toThrow(/^main\.tf:1:7: Invalid character "@"/);
  });
});

describe("the parser", () => {
  it("reads attributes and labelled blocks, single-line and empty ones included", () => {
    const file = parse(
      'resource "aws_x" "y" {\n  a = 1\n  inner { b = 2 }\n  empty {}\n}\n',
      "main.tf",
    );
    const block = file.body.items[0] as Block;
    expect([block.type, ...block.labels]).toEqual(["resource", "aws_x", "y"]);
    expect(block.body.items.map((i) => (i.kind === "block" ? `${i.type}{}` : i.name))).toEqual([
      "a",
      "inner{}",
      "empty{}",
    ]);
    const inner = block.body.items[1] as Block;
    expect((inner.body.items[0] as Attribute).name).toBe("b");
  });

  it("reads the expression forms the native syntax has", () => {
    expect(attr("var.x").kind).toBe("traversal");
    expect(attr('local.m["k"][0].z')).toMatchObject({
      kind: "traversal",
      root: "local",
      steps: [
        { kind: "attr", name: "m" },
        { kind: "index" },
        { kind: "index" },
        { kind: "attr", name: "z" },
      ],
    });
    expect(attr('templatefile("${path.module}/a", local.r)')).toMatchObject({
      kind: "call",
      name: "templatefile",
    });
    expect(attr("provider::aws::arn_parse(x)")).toMatchObject({
      kind: "call",
      name: "provider::aws::arn_parse",
    });
    expect(attr("a ? b : c").kind).toBe("conditional");
    expect(attr("1 + 2 * 3")).toMatchObject({ kind: "binary", op: "+" });
    expect(attr("!a").kind).toBe("unary");
    expect(attr('[for k, v in m : v if k != "x"]').kind).toBe("for");
    expect(attr("{ for k, v in m : k => v... }").kind).toBe("for");
    expect(attr("x[*].id").kind).toBe("traversal");
    expect(attr("(1)").kind).toBe("paren");
    expect(attr("f()[0]").kind).toBe("postfix");
  });

  it("takes newlines inside brackets, and as separators in an object", () => {
    const obj = attr('{\n  a = 1\n  "b" = [\n    1,\n    2,\n  ]\n  c: 3, d = 4\n}');
    expect(obj.kind).toBe("object");
    expect(obj.kind === "object" && obj.items.map((i) => i.bareKey)).toEqual([
      true,
      false,
      true,
      true,
    ]);
  });

  it("names the file, line and column of what it cannot parse", () => {
    expect(() => parse("a = \n", "main.tf")).toThrow(/^main\.tf:1:5: Expected an expression/);
    expect(() => parse("a = 1 2\n", "main.tf")).toThrow(/^main\.tf:1:7: Expected a newline/);
    expect(() => parse("block {\n  a = 1\n", "main.tf")).toThrow(/Unclosed "\{"/);
    expect(() => parse("}", "main.tf")).toThrow(HclError);
  });

  it("prints any file exactly as written, and any node as its source", () => {
    const text = 'a   =   [ 1 ,2 ] # c\n\n\n  b {\n\tc = "${d}"\n}\n';
    const file = parse(text);
    expect(print(file)).toBe(text);
    const b = file.body.items[1] as Block;
    expect(sourceOf(file, (b.body.items[0] as Attribute).expr)).toBe('"${d}"');
  });
});
