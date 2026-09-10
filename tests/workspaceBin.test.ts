/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The CLI is runnable from a checkout after the documented getting-started
// sequence.
//
// CONTRIBUTING says `npm ci` then `npm run build`, and the root README's Quick
// start then runs `npx flow-cli ...`. On a fresh clone that failed: npm links a
// workspace's bins during install, packages/cli/dist/bin.js does not exist
// at `npm ci` time, so the link was skipped and never created afterwards.
// Reproduced by cloning to a directory with no node_modules above it, running
// the two documented commands and listing node_modules/.bin: no flow-cli. From
// inside this repo the failure hides, because npx walks up to the parent
// checkout's node_modules/.bin, so these assertions name the repo-local path
// and never shell out to npx.
//
// The fix is the `npm rebuild --workspaces --ignore-scripts` at the end of the
// root `build` script, which re-runs npm's own bin-linking (and its Windows
// shims) once dist/bin.js exists. --ignore-scripts because only the linking is
// wanted, not a re-run of every dependency's install scripts.
//
// This test assumes `npm run build` has run, like the other repo-level tests
// that read build output. It does not run npm ci.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const LINK = resolve("node_modules/.bin/flow-cli");
const TARGET = resolve("packages/cli/dist/bin.js");

describe("the documented getting-started sequence leaves the CLI runnable", () => {
  it("links node_modules/.bin/flow-cli", () => {
    expect(existsSync(LINK)).toBe(true);
  });

  it("links it at the workspace copy, not a registry download", () => {
    // realpath, because npm links through node_modules/@flow-as-code/cli,
    // itself a symlink to packages/cli.
    expect(realpathSync(LINK)).toBe(realpathSync(TARGET));
  });

  it("names the bin the manifest declares", () => {
    // So a rename of the bin key cannot leave this file asserting a stale name
    // that the build still happens to produce.
    const manifest = JSON.parse(readFileSync("packages/cli/package.json", "utf8")) as {
      bin?: Record<string, string>;
    };
    expect(Object.keys(manifest.bin ?? {})).toEqual(["flow-cli"]);
    expect(join("packages/cli", manifest.bin!["flow-cli"]!)).toBe(
      resolve(TARGET).slice(resolve(".").length + 1),
    );
  });

  it("runs", () => {
    // The point of the link: the thing a contributor types produces the CLI's
    // own help rather than ENOENT or somebody else's `flow-cli`.
    const out = execFileSync(LINK, ["--help"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    expect(out).toContain("Usage: flow-cli");
    expect(out).toContain("studio");
  });

  it("is executable", () => {
    // execFileSync above goes through the kernel's exec, so this is only a
    // clearer failure message when the bit is the thing that is missing.
    expect(statSync(realpathSync(LINK)).mode & 0o111).not.toBe(0);
  });
});
