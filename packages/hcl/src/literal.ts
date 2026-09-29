/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The value of an expression that needs no evaluation context: strings with
// no interpolation, numbers, booleans, null, and tuples and objects of them.
// Anything else (a variable, a call, an interpolation) is refused with
// NON_LITERAL_VALUE, which is how the reader tells a literal the document
// can hold from an expression only Terraform can evaluate.

import type { Expr, HclFile } from "./ast.js";
import { HclError } from "./errors.js";
import { unquoteLiteral } from "./quote.js";

export type LiteralValue =
  string | number | boolean | null | LiteralValue[] | { [key: string]: LiteralValue };

/** The expression's value, or an HclError with code NON_LITERAL_VALUE at its first token. */
export function evaluateLiteral(expr: Expr, file: HclFile): LiteralValue {
  const fail = (message: string): never => {
    throw new HclError(message, {
      file: file.file,
      position: file.tokens[expr.first]!.start,
      code: "NON_LITERAL_VALUE",
    });
  };
  switch (expr.kind) {
    case "literal":
      return expr.value;
    case "template": {
      if (expr.parts.some((p) => p.kind !== "text")) {
        return fail("A string with an interpolation or directive is not a literal.");
      }
      const raw = expr.parts.map((p) => (p.kind === "text" ? p.raw : "")).join("");
      if (expr.quoted) return unquoteLiteral(raw, { file: file.file });
      const text = raw.replaceAll("$${", "${").replaceAll("%%{", "%{");
      return expr.flush ? dedent(text) : text;
    }
    case "tuple":
      return expr.items.map((item) => evaluateLiteral(item, file));
    case "object": {
      const out: { [key: string]: LiteralValue } = {};
      const seen = new Set<string>();
      for (const item of expr.items) {
        const key =
          item.bareKey && item.key.kind === "traversal"
            ? item.key.root
            : evaluateLiteral(item.key, file);
        if (typeof key !== "string") {
          throw new HclError("An object key must be a string.", {
            file: file.file,
            position: file.tokens[item.key.first]!.start,
            code: "NON_LITERAL_VALUE",
          });
        }
        if (seen.has(key)) {
          throw new HclError(`The object key "${key}" is defined twice.`, {
            file: file.file,
            position: file.tokens[item.key.first]!.start,
            code: "DUPLICATE_ATTRIBUTE",
          });
        }
        seen.add(key);
        out[key] = evaluateLiteral(item.value, file);
      }
      return out;
    }
    case "paren":
      return evaluateLiteral(expr.inner, file);
    case "unary":
      if (
        expr.op === "-" &&
        expr.operand.kind === "literal" &&
        typeof expr.operand.value === "number"
      ) {
        return -expr.operand.value;
      }
      return fail("An operator expression is not a literal.");
    default:
      return fail(`A ${expr.kind === "traversal" ? "reference" : expr.kind} is not a literal.`);
  }
}

/** A flush heredoc's lines, less the indentation they all share. */
function dedent(text: string): string {
  const lines = text.split("\n");
  const body = lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  const indents = body.filter((l) => l.trim() !== "").map((l) => /^[ \t]*/.exec(l)![0].length);
  const cut = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((l) => l.slice(Math.min(cut, /^[ \t]*/.exec(l)![0].length))).join("\n");
}
