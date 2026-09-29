/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { format } from "./format.js";

describe("format", () => {
  // The expected text is what `tofu fmt` (OpenTofu 1.12.6) wrote for the
  // input, 2026-09-28; the conformance test holds the formatter to the real
  // binary over every committed file.
  it("indents, spaces and aligns as terraform fmt does", () => {
    const input = [
      "x   =   1",
      "",
      "",
      "y = [ 1 ,2 ]",
      "z = { a = 1, b= 2 }",
      "w = foo( 1,  -2 )",
      "v = a . b [ 0 ]",
      "u = !true",
      "t = 1+2*3",
      "s = a ? b : c",
      "q {}",
      "p = { }",
      'o = "${ path.module }/x"',
      "n = [",
      "1,",
      "  2,",
      "]",
      "  # indented comment",
      "k = 1 # c1",
      "kk = 22 # c2",
      "j = {",
      "  a = 1 # x",
      "  bbb = 2",
      "}",
      "",
    ].join("\n");
    expect(format(input)).toBe(
      [
        "x = 1",
        "",
        "",
        "y = [1, 2]",
        "z = { a = 1, b = 2 }",
        "w = foo(1, -2)",
        "v = a.b[0]",
        "u = !true",
        "t = 1 + 2 * 3",
        "s = a ? b : c",
        "q {}",
        "p = {}",
        'o = "${path.module}/x"',
        "n = [",
        "  1,",
        "  2,",
        "]",
        "# indented comment",
        "k  = 1  # c1",
        "kk = 22 # c2",
        "j = {",
        "  a   = 1 # x",
        "  bbb = 2",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("leaves a multi-line value's opening line out of the alignment run", () => {
    expect(format("a = 1\nlonger_name = {\n  b = 2\n}\nc = 3\n")).toBe(
      "a = 1\nlonger_name = {\n  b = 2\n}\nc = 3\n",
    );
  });

  it("is idempotent", () => {
    const once = format('resource "x" "y" {\n name="a"\n  list = [\n1,\n]\n}\n');
    expect(format(once)).toBe(once);
  });
});
