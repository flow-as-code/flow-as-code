/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The hook's format decision, driven directly rather than through a spawned
// child, because the thing worth pinning is runtime-independent and the child
// only ever shows it on the one runtime that gets it wrong.
//
// src/synth.test.ts covers the same behaviour end to end, but only ever
// exercises the answer its own runtime gives: Node 20 defaulted a builder file
// in a plain folder to "commonjs" while Node 22 and later return a null
// `format`, so the old nullish-only check happened to be enough on 22 and was
// broken on 20. Node 20 is no longer supported, but which answer a runtime
// gives is not a contract, so these cases hold the decision on every runtime by
// feeding the hook both answers.

import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initialize, resolve } from "./synth-resolve-hook.js";

const dirs: string[] = [];

/** A directory with no package.json in it or in any directory above it. */
async function plainDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "flow-cli-hook-"));
  dirs.push(dir);
  return dir;
}

/** Resolves `specifier` to `url` with `format`, the way the default resolver would. */
function resolverReturning(url: string, format: string | null | undefined) {
  return () => Promise.resolve({ url, format });
}

beforeEach(() => {
  initialize({ fallbackParentURL: import.meta.url, flowCorePackage: "@scope/core" });
});

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("the synth resolution hook's module-type decision", () => {
  it("makes a builder file in a plain folder ESM when the resolver left it undecided", async () => {
    // Node 22 and later.
    const url = pathToFileURL(join(await plainDir(), "line.flow.ts")).href;
    const result = await resolve("./line.flow.ts", {}, resolverReturning(url, null));
    expect(result.format).toBe("module");
  });

  it("makes a builder file in a plain folder ESM when the resolver defaulted it to CommonJS", async () => {
    // The answer Node 20 gave. Without this the builder's `import` becomes a
    // `require` and the file is compiled as CommonJS, which is a different
    // module system from the one codegen emits for, so the decision is pinned
    // regardless of which runtime hands us this answer.
    const url = pathToFileURL(join(await plainDir(), "line.flow.ts")).href;
    const result = await resolve("./line.flow.ts", {}, resolverReturning(url, "commonjs"));
    expect(result.format).toBe("module");
  });

  it("leaves CommonJS alone when a package.json above the file declared it", async () => {
    const dir = await plainDir();
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "consumer" }), "utf8");
    const url = pathToFileURL(join(dir, "line.flow.ts")).href;
    const result = await resolve("./line.flow.ts", {}, resolverReturning(url, "commonjs"));
    expect(result.format).toBe("commonjs");
  });

  it("leaves a declared module type alone", async () => {
    const dir = await plainDir();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "consumer", type: "module" }),
      "utf8",
    );
    const url = pathToFileURL(join(dir, "line.flow.ts")).href;
    const result = await resolve("./line.flow.ts", {}, resolverReturning(url, "module"));
    expect(result.format).toBe("module");
  });

  it("does not touch anything that is not a TypeScript file", async () => {
    const url = pathToFileURL(join(await plainDir(), "helper.js")).href;
    const result = await resolve("./helper.js", {}, resolverReturning(url, "commonjs"));
    expect(result.format).toBe("commonjs");
  });
});

describe("the builder entry file's module system", () => {
  it('is ESM even under an explicit "type": "commonjs"', async () => {
    // `npm init -y` writes "type": "commonjs" EXPLICITLY, so this is every
    // fresh npm project, not an edge case. Without the override the builder's
    // `import` of the ESM-only core package becomes a `require` and node
    // reports a missing `exports` main in a package.json under node_modules.
    const dir = await plainDir();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "consumer", type: "commonjs" }),
      "utf8",
    );
    const url = pathToFileURL(join(dir, "line.flow.ts")).href;
    initialize({
      fallbackParentURL: import.meta.url,
      flowCorePackage: "@scope/core",
      builderURL: url,
    });

    const result = await resolve(url, {}, resolverReturning(url, "commonjs"));
    expect(result.format).toBe("module");
  });

  it("is recognised through a symlinked path", async () => {
    // The parent passes the path the user typed, made absolute; the resolver
    // reports the path it resolved, and node resolves symlinks on the way. On
    // macOS every os.tmpdir() path is such a pair (/tmp -> /private/tmp).
    const dir = await plainDir();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "consumer", type: "commonjs" }),
      "utf8",
    );
    const link = join(dir, "linked");
    const real = join(dir, "real");
    await mkdir(real);
    await symlink(real, link, "dir");
    const typed = pathToFileURL(join(link, "line.flow.ts")).href;
    const resolved = pathToFileURL(join(realpathSync(real), "line.flow.ts")).href;
    expect(typed).not.toBe(resolved);
    await writeFile(join(realpathSync(real), "line.flow.ts"), "export {};\n", "utf8");
    initialize({
      fallbackParentURL: import.meta.url,
      flowCorePackage: "@scope/core",
      builderURL: typed,
    });

    const result = await resolve(resolved, {}, resolverReturning(resolved, "commonjs"));
    expect(result.format).toBe("module");
  });

  it("does not drag the project's other TypeScript files with it", async () => {
    // The claim is about the one file flow-cli generated and was asked to
    // evaluate, not about the project. A helper module in a CommonJS project
    // stays CommonJS, which is what src/synth.ts's rewritten error is for.
    const dir = await plainDir();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "consumer", type: "commonjs" }),
      "utf8",
    );
    const entry = pathToFileURL(join(dir, "line.flow.ts")).href;
    const helper = pathToFileURL(join(dir, "greeting.ts")).href;
    initialize({
      fallbackParentURL: import.meta.url,
      flowCorePackage: "@scope/core",
      builderURL: entry,
    });

    const result = await resolve("./greeting.js", {}, resolverReturning(helper, "commonjs"));
    expect(result.format).toBe("commonjs");
  });
});
