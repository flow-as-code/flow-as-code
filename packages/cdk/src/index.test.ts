/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// aws-cdk-lib and constructs are optional peers, so npm neither installs nor
// warns about them. Without the guard in index.ts a consumer who forgets them
// meets `ERR_MODULE_NOT_FOUND: Cannot find package 'aws-cdk-lib'` pointing at
// dist/flow-set.js, which names neither this package nor the version floor.
// The check runs against the BUILT entry, because that is what a consumer
// resolves through "exports".

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import manifest from "../package.json" with { type: "json" };

const DIST = new URL("../dist/", import.meta.url);
const CORE = fileURLToPath(new URL("../../core", import.meta.url));
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * A project with @flow-as-code/core installed and no CDK, which is what a consumer who
 * installed this package and skipped the optional peers has. The whole built
 * package is copied, flow-set.js included, so the dynamic import behind the
 * guard resolves and would fail on `aws-cdk-lib` if the guard let it run.
 */
function projectWithoutCdk(): string {
  const dir = mkdtempSync(join(tmpdir(), "flow-cdk-nopeer-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  cpSync(fileURLToPath(DIST), join(dir, "dist"), { recursive: true });
  const scope = join(dir, "node_modules", "@flow-as-code");
  mkdirSync(scope, { recursive: true });
  symlinkSync(CORE, join(scope, "core"), "junction");
  return dir;
}

/** Imports the built entry from that project and reports what came back. */
function importEntry(dir: string): { status: number | null; stderr: string } {
  const entry = pathToFileURL(join(dir, "dist", "index.js")).href;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(entry)});`],
    { cwd: dir, encoding: "utf8" },
  );
  return { status: result.status, stderr: result.stderr };
}

describe("package entry without the optional CDK peers", () => {
  it("throws one actionable error naming the packages and the version floor", () => {
    const result = importEntry(projectWithoutCdk());

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${manifest.name} needs the CDK at runtime`);
    expect(result.stderr).toContain("aws-cdk-lib is not installed");
    // The bare resolution error is what the guard exists to front-run.
    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
  });

  it("names the same version floor the manifest declares", () => {
    const result = importEntry(projectWithoutCdk());

    const peers = manifest.peerDependencies;
    expect(result.stderr).toContain(
      `npm install aws-cdk-lib@${peers["aws-cdk-lib"]} constructs@${peers.constructs}`,
    );
  });
});

describe("package entry with the peers present", () => {
  it("still exports the construct and the alias default", async () => {
    const entry: Record<string, unknown> = await import(new URL("index.js", DIST).href);

    expect(typeof entry.FlowSet).toBe("function");
    expect(entry.DEFAULT_MODULE_ALIAS).toBe("live");
    expect(typeof entry.bindRef).toBe("function");
  });
});
