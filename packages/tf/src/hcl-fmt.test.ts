/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Every file conformance/hcl/README.md calls a `terraform fmt` fixed point is
// one: the roundtrip goldens and both companions of every regenerate case.
// Gated like the validate runs because it needs the binary; no provider is
// involved, so there is no init and no download.

import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOFU_ENABLED, materializeFiles, tofu } from "./__fixtures__/tofu.js";

const HCL = new URL("../../../conformance/hcl/", import.meta.url);

/** Every fixed-point file under conformance/hcl, keyed by a flat name for the temp dir. */
export function hclGoldens(): Record<string, string> {
  const files: Record<string, string> = {};
  const cases = (family: string) => {
    const dir = new URL(`${family}/`, HCL);
    return existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      : [];
  };
  for (const name of cases("roundtrip")) {
    files[`roundtrip-${name}.tf`] = readFileSync(
      new URL(`roundtrip/${name}/expected.flow.tf`, HCL),
      "utf8",
    );
  }
  for (const name of cases("regenerate")) {
    for (const file of ["previous", "expected"]) {
      files[`regenerate-${name}-${file}.tf`] = readFileSync(
        new URL(`regenerate/${name}/${file}.flow.tf`, HCL),
        "utf8",
      );
    }
  }
  return files;
}

describe("the fmt gate has files to check", () => {
  it("lists every roundtrip golden and both companions of every regenerate case", () => {
    const names = Object.keys(hclGoldens());
    expect(names).toContain("roundtrip-demo.tf");
    expect(names).toContain("regenerate-keep-comments-previous.tf");
    expect(names).toContain("regenerate-keep-comments-expected.tf");
  });
});

describe.runIf(TOFU_ENABLED)("conformance/hcl goldens are tofu fmt fixed points", () => {
  it("fmt -check reports nothing to change", () => {
    const dir = materializeFiles(hclGoldens());
    try {
      const run = tofu(["fmt", "-check", "-diff", "-recursive"], dir);
      expect(run.output.trim(), run.output).toBe("");
      expect(run.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
