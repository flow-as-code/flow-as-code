/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import type { Attribute } from "./ast.js";
import { evaluateLiteral } from "./literal.js";
import { parse } from "./parser.js";
import { hasLoneSurrogate, quote, unquoteLiteral } from "./quote.js";

const value = (source: string) => {
  const file = parse(`x = ${source}\n`, "v.tf");
  return evaluateLiteral((file.body.items[0] as Attribute).expr, file);
};

describe("evaluateLiteral", () => {
  it("reads strings, numbers, booleans, null, tuples and objects", () => {
    expect(value('"a\\nb\\u00e9 $${c} %%{d}"')).toBe("a\nb\u00e9 ${c} %{d}");
    expect(value("-2.5")).toBe(-2.5);
    expect(value('[true, null, 3, "x"]')).toEqual([true, null, 3, "x"]);
    expect(value('{ a = 1, "b c" = { d = [] } }')).toEqual({ a: 1, "b c": { d: [] } });
    expect(value("<<-EOT\n    one\n      two\n    EOT")).toBe("one\n  two\n");
  });

  it("refuses anything that needs evaluation, with the contract's code and a location", () => {
    expect(() => value("var.x")).toThrow(
      /^v\.tf:1:5: NON_LITERAL_VALUE: A reference is not a literal/,
    );
    expect(() => value('"a ${b}"')).toThrow(/NON_LITERAL_VALUE/);
    expect(() => value("f(1)")).toThrow(/NON_LITERAL_VALUE/);
    expect(() => value("[1, local.y]")).toThrow(/^v\.tf:1:9: NON_LITERAL_VALUE/);
  });
});

describe("quote and unquoteLiteral", () => {
  const hostile = [
    "Your balance is ${amount} and %{ if x } is owed.",
    "Doubled already: $${literal} and %%{directive}",
    'She said "${it}" and wrote C:\\temp\\%{x}.',
    "tab\tnew\nline\rcr \u0001 \u007f del",
    "caf\u00e9 \u{1f600} \u2028",
  ];

  it("round-trips every string through HCL's escapes", () => {
    for (const s of hostile) {
      const q = quote(s);
      expect(q.startsWith('"') && q.endsWith('"')).toBe(true);
      expect(unquoteLiteral(q.slice(1, -1))).toBe(s);
      // The quoted form holds no live template sequence.
      expect(q.slice(1, -1).replaceAll("$${", "").replaceAll("%%{", "")).not.toMatch(/[$%]\{/);
    }
  });

  it("writes the escapes rule 16 names and nothing else", () => {
    expect(quote('a\\b"c\nd\re\tf\u0001g\u00e9')).toBe('"a\\\\b\\"c\\nd\\re\\tf\\u0001g\u00e9"');
  });

  it("refuses a lone surrogate either way", () => {
    expect(hasLoneSurrogate("\ud800")).toBe(true);
    expect(hasLoneSurrogate("\u{1f600}")).toBe(false);
    expect(() => quote("a\ud800")).toThrow(/LONE_SURROGATE/);
    expect(() => unquoteLiteral("a\\ud800b")).toThrow(/LONE_SURROGATE/);
  });
});
