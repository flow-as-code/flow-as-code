/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A reference implementation of HCL string template rendering, written from the
// grammar rather than from src/template.ts, so the escaping tests check the
// emitter against the specification instead of against themselves. The gated
// tests in src/validate.test.ts render the same fixtures with a real `tofu` and
// assert the two agree.
// https://github.com/hashicorp/hcl/blob/main/hclsyntax/spec.md#template-expressions
// https://developer.hashicorp.com/terraform/language/expressions/strings#escape-sequences

/**
 * Renders `template` the way `templatefile` would: `$${` and `%%{` collapse to
 * a literal `${` and `%{`, `${name}` is replaced from `vars`, and a live `%{`
 * directive throws, because this emitter never writes one and a directive
 * surviving into output would mean the escaper let one through.
 */
export function renderHclTemplate(template: string, vars: Record<string, string>): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const three = template.slice(i, i + 3);
    if (three === "$${") {
      out += "${";
      i += 3;
      continue;
    }
    if (three === "%%{") {
      out += "%{";
      i += 3;
      continue;
    }
    const two = template.slice(i, i + 2);
    if (two === "%{") throw new Error(`unescaped directive at offset ${String(i)}`);
    if (two === "${") {
      const end = template.indexOf("}", i);
      if (end === -1) throw new Error(`unterminated interpolation at offset ${String(i)}`);
      const name = template.slice(i + 2, end).trim();
      if (!Object.hasOwn(vars, name)) throw new Error(`vars has no key "${name}"`);
      out += vars[name];
      i = end + 1;
      continue;
    }
    out += template[i];
    i += 1;
  }
  return out;
}
