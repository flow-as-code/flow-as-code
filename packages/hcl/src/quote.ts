/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// String quoting by conformance/hcl/README.md rule 16, and its inverse.

import { HclError } from "./errors.js";

/** Whether a string holds a UTF-16 surrogate without its partner. */
export function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i += 1;
        continue;
      }
      return true;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/**
 * A double-quoted HCL string holding exactly `value`: `\\`, `\"`, `\n`, `\r`
 * and `\t` escaped; any other control character as `\uXXXX`; `${` and `%{`
 * doubled so they stay literal; everything else raw. A lone surrogate has no
 * UTF-8 spelling and is refused.
 */
export function quote(value: string): string {
  if (hasLoneSurrogate(value)) {
    throw new HclError("A string holds a lone surrogate, which HCL cannot carry.", {
      code: "LONE_SURROGATE",
    });
  }
  let out = "";
  for (const ch of value) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20 || c === 0x7f) out += `\\u${c.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  out = out.replaceAll("${", () => "$${").replaceAll("%{", () => "%%{");
  return `"${out}"`;
}

/**
 * The value of a quoted string's literal text (without its quotes): escapes
 * decoded, `$${` and `%%{` undoubled. A `\u` or `\U` escape naming a
 * surrogate, or a result holding a lone one, is refused.
 */
export function unquoteLiteral(raw: string, where?: { file?: string; offset?: number }): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if ((c === "$" || c === "%") && raw[i + 1] === c && raw[i + 2] === "{") {
      out += `${c}{`;
      i += 2;
      continue;
    }
    if (c !== "\\") {
      out += c;
      continue;
    }
    const e = raw[i + 1];
    i += 1;
    switch (e) {
      case "n":
        out += "\n";
        break;
      case "r":
        out += "\r";
        break;
      case "t":
        out += "\t";
        break;
      case '"':
        out += '"';
        break;
      case "\\":
        out += "\\";
        break;
      case "u":
      case "U": {
        const len = e === "u" ? 4 : 8;
        const hex = raw.slice(i + 1, i + 1 + len);
        if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== len) {
          throw new HclError(`Invalid \\${e} escape in a string.`, { file: where?.file });
        }
        out += String.fromCodePoint(parseInt(hex, 16));
        i += len;
        break;
      }
      default:
        throw new HclError(`Invalid escape sequence "\\${e ?? ""}" in a string.`, {
          file: where?.file,
        });
    }
  }
  if (hasLoneSurrogate(out)) {
    throw new HclError("A string holds a lone surrogate, which a FlowDoc cannot carry.", {
      code: "LONE_SURROGATE",
      file: where?.file,
    });
  }
  return out;
}
