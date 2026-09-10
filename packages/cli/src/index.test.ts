/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The package root is a library entry, not the CLI. Before the bin split it was
// `dist/index.js` ending in `program.parseAsync(process.argv)`, so a consumer's
// `import "@flow-as-code/cli"` parsed the host process's argv, printed
// the usage block, and exited 1. Both assertions run against the BUILT files,
// since main/types/exports point at dist and that is what a consumer resolves.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const DIST = new URL("../dist/", import.meta.url);
const MANIFEST_VERSION = (
  JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as {
    version: string;
  }
).version;
const SUBPATHS = ["synth.js", "watch.js", "bridge/server.js"];

describe("package root entry", () => {
  it("imports without running the CLI, writing output, or exiting", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'await import(process.env.SPECIFIER); console.log("imported");',
      ],
      {
        encoding: "utf8",
        env: { ...process.env, SPECIFIER: new URL("index.js", DIST).href },
      },
    );

    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("imported\n");
    expect(result.status).toBe(0);
  });

  it("refuses to be run as a script and names the bin instead", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("index.js", DIST)), "studio", "--port", "4999"],
      { encoding: "utf8" },
    );

    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(
      "flow-cli: this is the library entry and runs no commands. " +
        "Run the CLI as dist/bin.js (or the installed flow-cli bin).",
    );
    expect(result.status).toBe(1);
  });

  it("re-exports exactly what the three subpath entries expose", async () => {
    const root: object = await import(new URL("index.js", DIST).href);
    const subpaths: object[] = await Promise.all(
      SUBPATHS.map((file) => import(new URL(file, DIST).href)),
    );

    const expected = new Set(subpaths.flatMap((module) => Object.keys(module)));
    expect(expected.size).toBeGreaterThan(0);
    expect(new Set(Object.keys(root))).toEqual(expected);
  });
});

describe("bin entry", () => {
  it("is a separate file that parses argv", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("bin.js", DIST)), "--version"],
      {
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    // The version comes from the manifest, never a literal; src/version.test.ts
    // is the guard on that. Here it only has to prove the bin parsed argv.
    expect(result.stdout.trim()).toBe(MANIFEST_VERSION);
  });
});
