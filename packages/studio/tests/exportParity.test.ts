/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A12 acceptance: what the studio's export buttons produce is what the CLI
// produces, byte for byte.
//
// The comparison is against the BUILT CLI run as a subprocess, not against the
// shared functions it calls, because "they call the same function" is exactly
// what a parity test must not assume. This is what catches the studio passing a
// different output directory, a different file name, or a different map key.
//
// This file therefore needs `npm run build` (CI builds before testing). Without
// it, one test fails naming the command and the rest skip, the same arrangement
// tests/bundle-offline.test.ts uses.
//
// Scratch directories live under packages/studio/.vitest (gitignored):
// module resolution from a file in there walks up into the workspace, so the
// scaffold resolves aws-cdk-lib, constructs, and @flow-as-code/cdk the
// way a real project resolves its dependencies. Same convention as
// packages/cli/src/cli.test.ts.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { exportCdk, exportRaw, exportTf } from "../src/export/targets.js";
import { demoDoc } from "./helpers.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const CLI = join(REPO, "packages", "cli", "dist", "bin.js");
const DEMO = join(REPO, "conformance", "demo", "appointment-line.flowdoc.json");
const TF_CASE = join(REPO, "conformance", "emit-tf", "demo-complete-map");
const MATERIALIZE_CASE = join(REPO, "conformance", "materialize", "demo-with-map");
const SCRATCH_BASE = join(REPO, "packages", "studio", ".vitest");
const BUILD_HINT = "packages/cli/dist is missing; run `npm run build` first";

const built = existsSync(CLI);
const scratch: string[] = [];

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** A scratch directory holding the demo FlowDoc, and nothing else. */
function demoWorkspace(): string {
  mkdirSync(SCRATCH_BASE, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_BASE, "a12-"));
  scratch.push(dir);
  cpSync(DEMO, join(dir, "appointment-line.flowdoc.json"));
  return dir;
}

function cli(...args: string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  expect(run.stderr, run.stderr).toBe("");
  expect(run.status).toBe(0);
  return run;
}

/** Every file under `dir`, relative POSIX path to content, sorted. */
function tree(dir: string, prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(files, tree(path, `${prefix}${entry.name}/`));
    else files[`${prefix}${entry.name}`] = readFileSync(path, "utf8");
  }
  return files;
}

describe("CLI parity", () => {
  it("the CLI is built", () => {
    expect(built, BUILD_HINT).toBe(true);
  });

  it.runIf(built)("cdk: same bytes as `emit --target cdk` writing beside the docs", () => {
    const dir = demoWorkspace();
    cli("emit", dir, "--target", "cdk");
    const fromCli = readFileSync(join(dir, "flow-stack.ts"), "utf8");
    expect(exportCdk({ target: "cdk", docs: [demoDoc()] }).files["flow-stack.ts"]).toBe(fromCli);
  });

  it.runIf(built)("cdk: same bytes as `emit --target cdk --out <subdir>`", () => {
    const dir = demoWorkspace();
    const out = join(dir, "infra");
    cli("emit", dir, "--target", "cdk", "--out", out);
    const fromCli = readFileSync(join(out, "flow-stack.ts"), "utf8");
    // Proves the studio's subdirectory arithmetic equals node's path.relative:
    // both have to resolve FLOW_DOCS against "..".
    expect(
      exportCdk({ target: "cdk", docs: [demoDoc()], subdir: "infra" }).files["flow-stack.ts"],
    ).toBe(fromCli);
    expect(fromCli).toContain('const FLOW_DOCS = fileURLToPath(new URL("..", import.meta.url));');
  });

  it.runIf(built)(
    "cdk: the studio's scaffold passes tsc --noEmit",
    () => {
      const dir = demoWorkspace();
      const scaffold = exportCdk({ target: "cdk", docs: [demoDoc()] }).files["flow-stack.ts"] ?? "";
      writeFileSync(join(dir, "flow-stack.ts"), scaffold, "utf8");
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              module: "NodeNext",
              moduleResolution: "NodeNext",
              strict: true,
              skipLibCheck: true,
              noEmit: true,
              types: ["node"],
            },
            include: ["flow-stack.ts"],
          },
          null,
          2,
        ),
        "utf8",
      );
      const tsc = spawnSync(
        process.execPath,
        [join(REPO, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", dir],
        { encoding: "utf8" },
      );
      expect(tsc.stdout + tsc.stderr).toBe("");
      expect(tsc.status).toBe(0);
    },
    120_000,
  );

  it.runIf(built)("tf: same file map as `emit --target tf --address-map`", () => {
    const dir = demoWorkspace();
    const out = join(dir, "tf");
    const map = join(TF_CASE, "address-map.json");
    cli("emit", dir, "--target", "tf", "--address-map", map, "--out", out);

    const addressMap = JSON.parse(readFileSync(map, "utf8")) as Record<string, string>;
    expect(exportTf({ target: "tf", docs: [demoDoc()], addressMap }).files).toEqual(tree(out));
  });

  it.runIf(built)("raw: same file map and file names as `render --resources`", () => {
    const dir = demoWorkspace();
    const out = join(dir, "raw");
    const map = join(MATERIALIZE_CASE, "map.json");
    cli("render", dir, "--resources", map, "--out", out);

    const resourceMap = JSON.parse(readFileSync(map, "utf8")) as Record<string, string>;
    expect(exportRaw({ target: "raw", docs: [demoDoc()], resourceMap }).files).toEqual(tree(out));
  });

  it.runIf(built)("keeps its scratch inside the studio package", () => {
    // The tests above write into the repo; if that ever escapes the package,
    // this says so before a `rm -rf` does.
    expect(relative(REPO, demoWorkspace()).startsWith("packages/studio/.vitest")).toBe(true);
  });
});
