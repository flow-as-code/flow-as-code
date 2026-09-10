/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A04 acceptance, synth half. The fixture is a copy of @flow-as-code/core's
// demo builder with its relative import rewritten to the package specifier,
// so the sandboxed child resolves it through the workspace symlink.
// That resolves to dist, so `npm run build` must run before tests (CI does).

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { serialize, type FlowDoc } from "@flow-as-code/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  SynthError,
  actionableFrames,
  explainModuleSystemFailure,
  generator,
  synthFile,
  synthToFiles,
} from "./synth.js";

const execFileP = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const repoRoot = resolve(pkgRoot, "../..");

const tmpDirs: string[] = [];
async function tempDir(): Promise<string> {
  // Under the package (not os.tmpdir()) so node_modules resolution from the
  // copied builder file walks up into the workspace root. .vitest/ is
  // gitignored.
  const base = join(pkgRoot, ".vitest");
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, "synth-"));
  tmpDirs.push(dir);
  return dir;
}

/**
 * A directory with nothing above it that could resolve a package: os.tmpdir()
 * has no node_modules on any ancestor, which is exactly the situation a user
 * is in when they point the studio at a folder of FlowDocs.
 */
async function plainDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "flow-cli-plain-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function demoBuilderSource(): Promise<string> {
  const original = await readFile(
    join(repoRoot, "packages/core/src/__fixtures__/appointment-line.ts"),
    "utf8",
  );
  return original.replace('"../index.js"', '"@flow-as-code/core"');
}

async function demoFixtureBytes(): Promise<string> {
  return readFile(join(repoRoot, "conformance/demo/appointment-line.flowdoc.json"), "utf8");
}

function stripMeta(doc: FlowDoc): FlowDoc {
  const { meta: _meta, ...rest } = doc;
  return rest as FlowDoc;
}

describe("flow-cli synth", () => {
  it("synths the demo builder to the conformance FlowDoc, modulo meta", async () => {
    const dir = await tempDir();
    const source = await demoBuilderSource();
    const tsPath = join(dir, "appointment-line.flow.ts");
    await writeFile(tsPath, source, "utf8");

    const written = await synthToFiles(tsPath);
    expect(written).toEqual([join(dir, "appointment-line.flowdoc.json")]);

    const bytes = await readFile(written[0]!, "utf8");
    const doc = JSON.parse(bytes) as FlowDoc;

    expect(doc.meta).toEqual({
      generator: generator(),
      sourceHash: `sha256:${createHash("sha256").update(source).digest("hex")}`,
    });
    // Everything but meta matches the canonical demo byte for byte.
    expect(serialize(stripMeta(doc))).toBe(await demoFixtureBytes());
  });

  it("is byte-stable across runs", async () => {
    const dir = await tempDir();
    const tsPath = join(dir, "appointment-line.flow.ts");
    await writeFile(tsPath, await demoBuilderSource(), "utf8");

    const [first] = await synthToFiles(tsPath);
    const a = await readFile(first!, "utf8");
    const [second] = await synthToFiles(tsPath);
    const b = await readFile(second!, "utf8");
    expect(b).toBe(a);
  });

  it("honors --out and picks up exported Flow instances, not just factories", async () => {
    const dir = await tempDir();
    const outDir = join(dir, "out");
    const tsPath = join(dir, "two.flow.ts");
    await writeFile(
      tsPath,
      [
        'import { DisconnectParticipant, Flow } from "@flow-as-code/core";',
        "",
        'export const hangUp = new Flow({ name: "hang-up-line" }).add(',
        '  new DisconnectParticipant({ id: "bye" }),',
        ");",
        "",
        "export function farewellLine(): Flow {",
        '  return new Flow({ name: "farewell-line" }).add(new DisconnectParticipant({ id: "end" }));',
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const written = await synthToFiles(tsPath, outDir);
    // ES module namespaces iterate exports alphabetically (farewellLine
    // before hangUp), which keeps the scan order deterministic.
    expect(written).toEqual([
      join(outDir, "farewell-line.flowdoc.json"),
      join(outDir, "hang-up-line.flowdoc.json"),
    ]);
    for (const p of written) expect(existsSync(p)).toBe(true);
  });

  it("fails actionably when the file does not exist", async () => {
    await expect(synthFile(join(pkgRoot, ".vitest", "missing.flow.ts"))).rejects.toThrow(
      /Cannot read .*missing\.flow\.ts: no such file/,
    );
  });

  it("surfaces the message and stack when module evaluation throws", async () => {
    const dir = await tempDir();
    const tsPath = join(dir, "boom.flow.ts");
    await writeFile(tsPath, 'throw new Error("boom at import time");\n', "utf8");

    const err = await synthFile(tsPath).then(
      () => undefined,
      (e: unknown) => e as SynthError,
    );
    expect(err).toBeInstanceOf(SynthError);
    expect(err!.message).toContain("boom at import time");
    expect(err!.message).toContain("boom.flow.ts"); // stack points at the file
  });

  it("fails actionably when the module exports no flows", async () => {
    const dir = await tempDir();
    const tsPath = join(dir, "nothing.flow.ts");
    await writeFile(tsPath, "export const answer = 42;\n", "utf8");

    await expect(synthFile(tsPath)).rejects.toThrow(/No flows exported .*zero-argument/s);
  });

  it("synths a builder file in a directory that cannot resolve the core package", async () => {
    // The studio's whole edit-the-file loop depends on this: `flow-cli
    // codegen` writes <name>.flow.ts next to the FlowDocs, and that directory
    // is usually a plain folder with no node_modules anywhere above it. The
    // child falls back to the CLI's own copy of @flow-as-code/core
    // (synth-resolve-hook.ts).
    const dir = await plainDir();
    expect(existsSync(join(dir, "node_modules"))).toBe(false);
    const tsPath = join(dir, "appointment-line.flow.ts");
    await writeFile(tsPath, await demoBuilderSource(), "utf8");

    const { flows } = await synthFile(tsPath);
    expect(flows.map((f) => f.name)).toEqual(["appointment-line"]);
  });

  it("still prefers a core package installed next to the builder file", async () => {
    // The fallback runs only after normal resolution fails, so a copy the user
    // installed themselves is the one that gets loaded. Proved with a stub that
    // announces itself by throwing: if the fallback had won, the real package
    // would have loaded and the synth would have succeeded.
    const dir = await plainDir();
    const pkg = join(dir, "node_modules", "@flow-as-code", "core");
    await mkdir(pkg, { recursive: true });
    await writeFile(
      join(pkg, "package.json"),
      JSON.stringify({ name: "@flow-as-code/core", type: "module", main: "index.js" }),
      "utf8",
    );
    await writeFile(join(pkg, "index.js"), 'throw new Error("stub core loaded");\n', "utf8");

    const tsPath = join(dir, "local.flow.ts");
    // A namespace import, so the stub is evaluated (and throws) instead of
    // failing at instantiation on a missing named export.
    await writeFile(
      tsPath,
      [
        'import * as core from "@flow-as-code/core";',
        'export const f = new core.Flow({ name: "local-line" });',
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(synthFile(tsPath)).rejects.toThrow(/stub core loaded/);
  });

  it('synths a builder file under an explicit "type": "commonjs"', async () => {
    // The blocker this exists for: `npm init -y` writes "type": "commonjs"
    // explicitly, so every fresh npm project used to fail here with
    // `No "exports" main defined in .../@flow-as-code/core/package.json`, a
    // package.json inside node_modules the user never wrote. The builder file
    // is ES module source whatever the project says: flow-cli generated it and
    // flow-cli is the only thing that evaluates it.
    const dir = await tempDir();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "consumer", type: "commonjs" }),
      "utf8",
    );
    const tsPath = join(dir, "appointment-line.flow.ts");
    await writeFile(tsPath, await demoBuilderSource(), "utf8");

    const { flows } = await synthFile(tsPath);
    expect(flows.map((f) => f.name)).toEqual(["appointment-line"]);
  });

  it("synths a builder file under a package.json with no type field", async () => {
    // Node's default for a package.json without `type` is CommonJS, so an
    // existing project that never made the choice failed the same way.
    const dir = await tempDir();
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "consumer" }), "utf8");
    const tsPath = join(dir, "appointment-line.flow.ts");
    await writeFile(tsPath, await demoBuilderSource(), "utf8");

    const { flows } = await synthFile(tsPath);
    expect(flows.map((f) => f.name)).toEqual(["appointment-line"]);
  });

  it("names the builder file and the remedy when an imported module is CommonJS", async () => {
    // Defence in depth. Only the entry file is forced to ESM, so a helper
    // module in a CommonJS project still `require`s the ESM-only core package.
    // Node's own message for that names a package.json under node_modules and
    // offers no next step; this one names the file being synthesized.
    const dir = await tempDir();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "consumer", type: "commonjs" }),
      "utf8",
    );
    await writeFile(
      join(dir, "greeting.ts"),
      [
        'import { Flow } from "@flow-as-code/core";',
        "export function greetingFlow(): Flow {",
        '  return new Flow({ name: "helper-line" });',
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    const tsPath = join(dir, "helper-line.flow.ts");
    await writeFile(
      tsPath,
      [
        'import { greetingFlow } from "./greeting.js";',
        "export const f = greetingFlow();",
        "",
      ].join("\n"),
      "utf8",
    );

    const error = await synthFile(tsPath).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(error).toBeInstanceOf(SynthError);
    expect(error?.message).toContain(tsPath);
    expect(error?.message).toContain('Set "type": "module" in the nearest package.json');
    // Node's own wording is quoted rather than hidden.
    expect(error?.message).toContain('No "exports" main defined');
  });

  it("keeps the envelope intact when the builder writes to stdout", async () => {
    const dir = await tempDir();
    const tsPath = join(dir, "noisy.flow.ts");
    await writeFile(
      tsPath,
      [
        'import { DisconnectParticipant, Flow } from "@flow-as-code/core";',
        'process.stdout.write("some build noise\\n");',
        'export const f = new Flow({ name: "noisy-line" }).add(new DisconnectParticipant({ id: "x" }));',
        "",
      ].join("\n"),
      "utf8",
    );
    const { flows } = await synthFile(tsPath);
    expect(flows.map((f) => f.name)).toEqual(["noisy-line"]);
  });
});

describe("flow-cli synth via the built CLI", () => {
  const cli = join(pkgRoot, "dist/bin.js");

  it("exits 0 and writes the doc for the demo builder", async () => {
    const dir = await tempDir();
    const tsPath = join(dir, "appointment-line.flow.ts");
    await writeFile(tsPath, await demoBuilderSource(), "utf8");

    const { stdout } = await execFileP(process.execPath, [cli, "synth", tsPath]);
    const docPath = join(dir, "appointment-line.flowdoc.json");
    expect(stdout.trim()).toBe(docPath);
    expect(existsSync(docPath)).toBe(true);
  });

  it("exits non-zero with an actionable message on a throwing module", async () => {
    const dir = await tempDir();
    const tsPath = join(dir, "boom.flow.ts");
    await writeFile(tsPath, 'throw new Error("cli boom");\n', "utf8");

    const err = (await execFileP(process.execPath, [cli, "synth", tsPath]).then(
      () => undefined,
      (e: unknown) => e,
    )) as { code: number; stderr: string };
    expect(err.code).toBe(1);
    expect(err.stderr).toContain("cli boom");
  });

  it("exits non-zero on a missing file", async () => {
    const err = (await execFileP(process.execPath, [
      cli,
      "synth",
      join(pkgRoot, ".vitest", "nope.flow.ts"),
    ]).then(
      () => undefined,
      (e: unknown) => e,
    )) as { code: number; stderr: string };
    expect(err.code).toBe(1);
    expect(err.stderr).toContain("no such file");
  });
});

describe("explainModuleSystemFailure", () => {
  const nodeSaid = 'No "exports" main defined in /w/node_modules/@flow-as-code/core/package.json';

  it("rewrites a missing export condition to name the builder file", () => {
    const message = explainModuleSystemFailure(
      { message: nodeSaid, code: "ERR_PACKAGE_PATH_NOT_EXPORTED" },
      "/w/flows/line.flow.ts",
    );
    expect(message).toContain("/w/flows/line.flow.ts");
    expect(message).toContain('Set "type": "module" in the nearest package.json');
    expect(message).toContain(nodeSaid);
  });

  it("covers the other two ways a CommonJS load reaches an ES module", () => {
    for (const code of ["ERR_REQUIRE_ESM", "ERR_REQUIRE_ASYNC_MODULE"]) {
      expect(explainModuleSystemFailure({ message: nodeSaid, code }, "/w/line.flow.ts")).toContain(
        "/w/line.flow.ts",
      );
    }
  });

  it("says nothing about a failure that is not a module-system mismatch", () => {
    expect(
      explainModuleSystemFailure({ message: "boom", code: "ERR_MODULE_NOT_FOUND" }, "/w/x.flow.ts"),
    ).toBeUndefined();
    // A throw from the user's own flow carries no code at all, and its own
    // message is the one worth printing.
    expect(explainModuleSystemFailure({ message: "boom" }, "/w/x.flow.ts")).toBeUndefined();
  });
});

describe("actionableFrames", () => {
  // The guard behind the terminal noise fix: a syntax error in a builder file
  // printed the actionable line and then ten frames of esbuild and node stream
  // internals under it, burying the file, line and column that line names.
  const esbuild = [
    "Error: Transform failed with 1 error:",
    '/w/demo.flow.ts:101:16: ERROR: Unexpected ";"',
    "    at failureErrorWithLog (/w/node_modules/esbuild/lib/main.js:1752:15)",
    "    at responseCallbacks.<computed> (/w/node_modules/esbuild/lib/main.js:886:9)",
    "    at handleIncomingPacket (/w/node_modules/esbuild/lib/main.js:941:9)",
    "    at Socket.readFromStdout (/w/node_modules/esbuild/lib/main.js:762:7)",
    "    at Socket.emit (node:events:514:20)",
    "    at addChunk (node:internal/streams/readable:559:12)",
    "    at Readable.push (node:internal/streams/readable:390:5)",
    "    at Pipe.onStreamRead (node:internal/stream_base_commons:191:23)",
  ].join("\n");

  it("keeps nothing from a stack that is all vendor and runtime frames", () => {
    expect(actionableFrames(esbuild)).toEqual([]);
  });

  it("keeps the frames in the user's own files", () => {
    // A runtime throw inside a builder file: that frame is the whole reason to
    // print a stack, so the filter must not take it.
    const frames = actionableFrames(
      [
        "Error: boom",
        "    at greet (/w/flows/demo.flow.ts:12:9)",
        "    at /w/flows/demo.flow.ts:20:1",
        "    at ModuleJob.run (node:internal/modules/esm/module_job:222:25)",
        "    at build (/w/node_modules/@flow-as-code/core/dist/builder.js:44:11)",
      ].join("\n"),
    );
    expect(frames).toEqual([
      "    at greet (/w/flows/demo.flow.ts:12:9)",
      "    at /w/flows/demo.flow.ts:20:1",
    ]);
  });

  it("keeps a frame whose path only reads like node_modules", () => {
    // The filter used to test the whole line for the substring, so a builder
    // file one directory away from the name lost every frame it appeared in:
    // a checkout under `node_modules-sandbox`, a vendored tree kept as
    // `node_modules.bak`, a function called `loadNodeModules`. None of those
    // is the dependency tree, and each of these frames is the one the user
    // needs. Matching a whole path segment is what tells them apart.
    expect(
      actionableFrames(
        [
          "Error: boom",
          "    at greet (/w/node_modules-sandbox/flows/demo.flow.ts:12:9)",
          "    at /w/node_modules.bak/flows/demo.flow.ts:20:1",
          "    at loadNodeModules (/w/flows/demo.flow.ts:31:5)",
          "    at run (file:///w/my_node_modules/demo.flow.ts:4:2)",
        ].join("\n"),
      ),
    ).toEqual([
      "    at greet (/w/node_modules-sandbox/flows/demo.flow.ts:12:9)",
      "    at /w/node_modules.bak/flows/demo.flow.ts:20:1",
      "    at loadNodeModules (/w/flows/demo.flow.ts:31:5)",
      "    at run (file:///w/my_node_modules/demo.flow.ts:4:2)",
    ]);
  });

  it("still drops a frame that really is inside a dependency", () => {
    // The other direction of the same test: a segment that is exactly
    // node_modules is vendor code wherever it sits in the path, including a
    // nested install, a `file:` URL, and a Windows-style path.
    expect(
      actionableFrames(
        [
          "Error: boom",
          "    at build (/w/packages/app/node_modules/esbuild/lib/main.js:44:11)",
          "    at load (file:///w/node_modules/tsx/dist/loader.mjs:9:3)",
          "    at run (C:\\w\\node_modules\\esbuild\\lib\\main.js:1752:15)",
          "    at greet (/w/flows/demo.flow.ts:12:9)",
        ].join("\n"),
      ),
    ).toEqual(["    at greet (/w/flows/demo.flow.ts:12:9)"]);
  });

  it("keeps the builder file's own frames when the builder sits under node_modules", async () => {
    // The dependency rule is about dependency code, and the file the user
    // asked to synth is never that, wherever it lives: a vendored flow, a
    // linked package, a directory a user happened to name node_modules. Left
    // to the rule alone, a throw in such a builder printed the message with no
    // line or column under it at all.
    const dir = await plainDir();
    await mkdir(join(dir, "node_modules"), { recursive: true });
    const builder = join(dir, "node_modules", "demo.flow.ts");
    await writeFile(builder, "throw new Error('boom');\n", "utf8");
    // The ESM loader reports the resolved real path as a file: URL, while the
    // caller holds the path it was handed (on macOS os.tmpdir() is a symlink,
    // so the two spellings differ). Both frames are the same file.
    const loaded = pathToFileURL(realpathSync(builder)).href;

    expect(
      actionableFrames(
        [
          "Error: boom",
          `    at greet (${loaded}:12:9)`,
          `    at ${builder}:20:1`,
          "    at build (/w/node_modules/esbuild/lib/main.js:44:11)",
          "    at ModuleJob.run (node:internal/modules/esm/module_job:222:25)",
        ].join("\n"),
        builder,
      ),
    ).toEqual([`    at greet (${loaded}:12:9)`, `    at ${builder}:20:1`]);
  });

  it("drops a frame that names no file", () => {
    // `at Object.<anonymous>` with no location tells the user nothing about
    // their flow, and a stack of those is the same noise in a shorter form.
    expect(
      actionableFrames(
        ["Error: boom", "    at Object.<anonymous>", "    at /w/flows/demo.flow.ts:3:1"].join("\n"),
      ),
    ).toEqual(["    at /w/flows/demo.flow.ts:3:1"]);
  });

  it("drops the header lines the message above already carries", () => {
    // The caller prints `...threw: <message>` and then these frames, so a
    // retained stack header would repeat the message verbatim. A header that
    // happens to name a path is the case that only the "is a frame" test
    // catches: everything after it filters on where a frame points.
    expect(actionableFrames(esbuild).join("\n")).not.toContain("Transform failed");
    expect(
      actionableFrames(
        ["Error: cannot read /w/flows/data.json", "    at /w/flows/demo.flow.ts:8:20"].join("\n"),
      ),
    ).toEqual(["    at /w/flows/demo.flow.ts:8:20"]);
  });

  it("has nothing to say about a thrown value with no stack", () => {
    expect(actionableFrames(undefined)).toEqual([]);
  });
});
