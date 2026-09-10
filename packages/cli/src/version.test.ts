/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The guard that would have caught the shipped defect, and the guard on the fix.
//
// @flow-as-code/cli 0.1.0 went to npm printing `0.0.1` for `flow-cli --version`
// and stamping `cli@0.0.1` into meta.generator of every FlowDoc it wrote, from
// two literals that were correct when they were typed and wrong the moment the
// release bumped. Equality with the manifest alone would not have caught it:
// both literals matched the manifest on the day they were written. So the
// install-shaped test below MUTATES the manifest of a copy of the built package
// and requires both strings to follow it. Pin either one to a literal and that
// test goes red whichever literal is chosen.
//
// The first fix read the manifest at module load, which made `import` itself
// able to throw for anyone who bundled the public `./synth` subpath. The last
// test holds the lookup lazy: a copy with no manifest for this package above it
// must import clean and must still refuse to invent a version when asked.
//
// The two depths are exercised on purpose. Under vitest this module and
// version.ts load from src/, in an install they load from dist/, and a lookup
// that counts ".." segments can be right in one and wrong in the other. The
// staged copies are further layouts that match neither.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { PACKAGE_NAMES, type FlowDoc } from "@flow-as-code/core";

import { generator, serializeWithMeta } from "./synth.js";
import { cliVersion } from "./version.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const PACKAGE = join(REPO, "packages", "cli");
const DIST = join(PACKAGE, "dist");

/** The manifest, read here rather than through version.ts, so this is a second opinion. */
const manifest = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as {
  name: string;
  version: string;
  dependencies: Record<string, string>;
};

/**
 * The two lines Node prints for one of its own warnings.
 *
 * stderr used to have to be exactly empty. An ExperimentalWarning from one of
 * the three Node majors CI runs, or a deprecation notice raised from inside a
 * dependency, then turned the version guard red for a reason that has nothing
 * to do with the version. Warnings have a fixed shape, so drop exactly those
 * and hold every other line, a stack trace included, to empty as before.
 */
const NODE_WARNING = /^\(node:\d+\) |^\(Use `node /;

/** Runs node and returns trimmed stdout, failing loudly on a non-zero exit. */
function node(args: string[], env: NodeJS.ProcessEnv = {}): string {
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  const unexpected = result.stderr
    .split("\n")
    .filter((line) => line !== "" && !NODE_WARNING.test(line));
  expect(unexpected.join("\n"), "stderr").toBe("");
  expect(result.status, "exit status").toBe(0);
  return result.stdout.trim();
}

/** Runs node expecting it to fail, and returns trimmed stderr. */
function nodeFails(args: string[], env: NodeJS.ProcessEnv = {}): string {
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  expect(result.status, `exit status (stdout: ${result.stdout})`).not.toBe(0);
  return result.stderr.trim();
}

/**
 * node args that import $SPECIFIER as `m` and write `expression` to stdout.
 *
 * The module under test is always a built file addressed by URL, so it is
 * passed through the environment rather than interpolated into the script.
 */
function evaluate(expression: string): string[] {
  return [
    "--input-type=module",
    "-e",
    `const m = await import(process.env.SPECIFIER); process.stdout.write(String(${expression}));`,
  ];
}

/** The generator that a built `dist/synth.js` computes when it is actually loaded. */
function builtGenerator(dist: string): string {
  return node(evaluate("m.generator()"), {
    SPECIFIER: pathToFileURL(join(dist, "synth.js")).href,
  });
}

/** The directory node resolves `dep` to from this package, found by the same upward walk. */
function dependencyDir(dep: string): string {
  let dir = PACKAGE;
  for (;;) {
    const candidate = join(dir, "node_modules", dep);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no installed ${dep} at or above ${PACKAGE}`);
    dir = parent;
  }
}

/**
 * An install-shaped copy of the built package, under a fresh temp directory.
 *
 * `pkg` is written verbatim as the copy's package.json, so a caller can make it
 * claim a different version, or stop it naming this package at all. Its
 * node_modules gets one link per declared dependency, located by the walk node
 * itself performs, so the copy resolves bare specifiers the way an install does
 * however the workspace install happened to hoist them (this package's own ajv
 * included, since the walk finds that one first).
 *
 * Staged outside the repository on purpose. An earlier version of this file
 * staged under packages/cli/node_modules, a directory that exists only because
 * ajv did not hoist, so the guard rested on a coincidence of the lockfile.
 * tmpdir also puts no @flow-as-code/cli manifest anywhere above the copy, which
 * is the condition the lazy-lookup test needs, and leaves the repository clean
 * even when a run crashes before afterAll.
 */
function stageInstall(pkg: object): string {
  const root = mkdtempSync(join(tmpdir(), "flow-cli-version-guard-"));
  scratch.push(root);
  cpSync(DIST, join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg, null, 2));
  for (const dep of Object.keys(manifest.dependencies)) {
    const link = join(root, "node_modules", dep);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(dependencyDir(dep), link, "junction");
  }
  return root;
}

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe("the CLI version", () => {
  it("is the manifest's, read from src/ under vitest", () => {
    expect(manifest.name).toBe(PACKAGE_NAMES.cli);
    expect(cliVersion()).toBe(manifest.version);
    expect(generator()).toBe(`cli@${manifest.version}`);
  });

  it("is what the built bin prints for --version", () => {
    expect(node([join(DIST, "bin.js"), "--version"])).toBe(manifest.version);
  });

  it("is what the built synth module stamps, read from dist/", () => {
    expect(builtGenerator(DIST)).toBe(`cli@${manifest.version}`);
  });

  it("reaches meta.generator of a written document", () => {
    const doc = JSON.parse(
      readFileSync(join(REPO, "conformance", "demo", "appointment-line.flowdoc.json"), "utf8"),
    ) as FlowDoc;
    expect(serializeWithMeta(doc, "sha256:0")).toContain(`"generator": "cli@${manifest.version}"`);
  });

  it("follows the manifest rather than a literal, in an install-shaped copy", () => {
    // Both strings must track whatever the manifest says, not merely agree with
    // today's value: that agreement is exactly what the shipped 0.1.0 had.
    const install = stageInstall({ ...manifest, version: "9.9.9-guard", type: "module" });

    expect(node([join(install, "dist", "bin.js"), "--version"])).toBe("9.9.9-guard");
    expect(builtGenerator(join(install, "dist"))).toBe("cli@9.9.9-guard");
  });

  it("is looked up lazily, so a public entry imports clean with no manifest to find", () => {
    // A copy that names something else, with nothing named @flow-as-code/cli
    // above it: the same condition a consumer creates by bundling ./synth, where
    // import.meta.url stops pointing inside this package. Move the lookup back
    // to module scope and the import half of this test goes red.
    const consumer = stageInstall({
      name: "a-consumer",
      version: "0.0.0",
      private: true,
      type: "module",
    });

    for (const entry of ["synth.js", "index.js"]) {
      const specifier = pathToFileURL(join(consumer, "dist", entry)).href;

      // Importing is inert. It does no I/O and cannot fail.
      expect(node(evaluate('"imported"'), { SPECIFIER: specifier }), entry).toBe("imported");

      // Asking still refuses to answer with a version it cannot back up. A
      // placeholder here would put false provenance in meta.generator, which is
      // the defect this whole module exists to prevent.
      expect(nodeFails(evaluate("m.generator()"), { SPECIFIER: specifier }), entry).toContain(
        `No ${PACKAGE_NAMES.cli} package.json`,
      );
    }
  });
});
