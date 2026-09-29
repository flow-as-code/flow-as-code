/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Every Terraform file committed to this repository parses; printing the
// parse reproduces it byte for byte; and formatting it reproduces it too,
// because every one is a `tofu fmt` fixed point, except the one parse case
// that exists to be unformatted. Gated on the binary, the formatter is held to
// `tofu fmt` itself over the same files, that one included.

import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { TOFU_ENABLED, materializeFiles, tofu } from "../../tf/src/__fixtures__/tofu.js";
import { formatFile } from "./format.js";
import { parse } from "./parser.js";
import { print } from "./print.js";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SKIP = new Set(["node_modules", "dist", "dist-demo", ".git", ".terraform"]);

function terraformFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const path = join(dir, e.name);
    if (e.isDirectory()) return terraformFiles(path);
    return e.name.endsWith(".tf") || e.name.endsWith(".tf.example") ? [path] : [];
  });
}

const FILES = [
  ...terraformFiles(join(ROOT, "conformance")),
  ...terraformFiles(join(ROOT, "examples")),
].map((p) => relative(ROOT, p));

/** Inputs that exist to be unformatted; everything else committed is fmt-clean. */
const NOT_FORMATTED = new Set(["conformance/hcl/parse/whitespace-variants/input.flow.tf"]);

/**
 * Inputs HCL's own parser refuses, so `tofu fmt` writes nothing for them and
 * fails the whole run: the lone-surrogate refuse case ("Cannot encode
 * character U+d800 in UTF-8") and the duplicate-attribute one ("Attribute
 * redefined"). This parser reads both, and the document reader refuses them
 * with the contract's codes.
 */
const TOFU_REFUSES = new Set([
  "conformance/hcl/refuse/lone-surrogate/input.flow.tf",
  "conformance/hcl/refuse/duplicate-attribute/input.flow.tf",
]);

describe("every committed Terraform file", () => {
  it("is found", () => {
    expect(FILES.length).toBeGreaterThan(80);
  });

  it.each(FILES)("%s parses, prints as written, and formats as written", (path) => {
    const text = readFileSync(join(ROOT, path), "utf8");
    const file = parse(text, path);
    expect(print(file)).toBe(text);
    if (!NOT_FORMATTED.has(path)) expect(formatFile(file)).toBe(text);
    else expect(formatFile(file)).not.toBe(text);
  });
});

describe.runIf(TOFU_ENABLED)("the formatter against tofu fmt", () => {
  it("writes what tofu fmt writes for every committed file", () => {
    const files = Object.fromEntries(
      FILES.flatMap((p, k) =>
        TOFU_REFUSES.has(p) ? [] : [[`f${k}.tf`, readFileSync(join(ROOT, p), "utf8")]],
      ),
    );
    const dir = materializeFiles(files);
    try {
      const run = tofu(["fmt"], dir);
      expect(run.status, run.output).toBe(0);
      for (const [name, text] of Object.entries(files)) {
        const theirs = readFileSync(join(dir, name), "utf8");
        const k = Number(name.slice(1, -3));
        expect(formatFile(parse(text, FILES[k]!)), FILES[k]).toBe(theirs);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
