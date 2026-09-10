/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli init` is the first step of the npm path, so what it writes has to be
// openable by the next command without any further arrangement: the pair in
// sync, the document lint-clean, and the builder file something synth accepts.
// These drive the command body; src/cli.test.ts drives the built binary for the
// exit code.

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serialize, type FlowDoc } from "@flow-as-code/core";
import { afterEach, describe, expect, it } from "vitest";

import { CliError } from "./errors.js";
import {
  TEMPLATE_DOC_NAME,
  TEMPLATE_DOC_PATH,
  nothingAboveDeclaresAPackage,
  runInit,
} from "./init.js";
import { sha256Hex, synthFile } from "./synth.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

const dirs: string[] = [];

/** A directory with no package.json in it or in any directory above it. */
async function plainDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "flow-cli-init-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("the packaged template", () => {
  it("is byte-identical to the conformance demo document", async () => {
    // The published package cannot reach conformance/, so the template is a
    // copy. A copy is only safe while it is provably a copy: if this fails,
    // re-run `npm run sync:schema` and land the result in the same commit.
    expect(await readFile(TEMPLATE_DOC_PATH, "utf8")).toBe(
      await readFile(
        join(repoRoot, "conformance", "demo", `${TEMPLATE_DOC_NAME}.flowdoc.json`),
        "utf8",
      ),
    );
  });
});

describe("flow-cli init", () => {
  it("writes a pair plus a package.json into an empty directory", async () => {
    const dir = join(await plainDir(), "flows");
    const { written } = await runInit(dir);

    expect(written).toEqual([
      join(dir, `${TEMPLATE_DOC_NAME}.flow.ts`),
      join(dir, `${TEMPLATE_DOC_NAME}.flowdoc.json`),
      join(dir, "package.json"),
    ]);
    for (const path of written) expect(existsSync(path)).toBe(true);

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
      type?: string;
    };
    expect(pkg.type).toBe("module");
  });

  it("stamps the document with the hash of the builder file beside it", async () => {
    // Without the stamp the studio meets a pair it has never seen in sync and
    // reports a conflict on the very first edit, which is the state a
    // hand-assembled pair lands in. See bridge/pair.ts.
    const dir = await plainDir();
    await runInit(dir);

    const doc = JSON.parse(
      await readFile(join(dir, `${TEMPLATE_DOC_NAME}.flowdoc.json`), "utf8"),
    ) as FlowDoc;
    const source = await readFile(join(dir, `${TEMPLATE_DOC_NAME}.flow.ts`), "utf8");
    expect(doc.meta?.sourceHash).toBe(`sha256:${sha256Hex(source)}`);
  });

  it("writes a builder file that synths back to the document it shipped", async () => {
    // The round trip the whole product rests on, run over exactly what a new
    // user gets. A scaffold that cannot make this trip is a scaffold that
    // breaks on the first canvas save.
    const dir = await plainDir();
    await runInit(dir);

    const { flows } = await synthFile(join(dir, `${TEMPLATE_DOC_NAME}.flow.ts`));
    expect(flows.map((f) => f.name)).toEqual([TEMPLATE_DOC_NAME]);
    expect(serialize(flows[0]!.doc)).toBe(await readFile(TEMPLATE_DOC_PATH, "utf8"));
  });

  it("leaves an existing project's package.json alone", async () => {
    // A directory inside a project needs nothing written: synth evaluates the
    // builder file as ESM whatever the project declares, so adding a second
    // package.json underneath one somebody wrote would be this command
    // reorganising a repository it was pointed at.
    const project = await plainDir();
    await writeFile(
      join(project, "package.json"),
      JSON.stringify({ name: "consumer", type: "commonjs" }),
      "utf8",
    );
    const dir = join(project, "flows");

    const { written } = await runInit(dir);
    expect(written).toEqual([
      join(dir, `${TEMPLATE_DOC_NAME}.flow.ts`),
      join(dir, `${TEMPLATE_DOC_NAME}.flowdoc.json`),
    ]);
    expect(existsSync(join(dir, "package.json"))).toBe(false);
  });

  it("is happy in a directory that already holds other files", async () => {
    const dir = await plainDir();
    await writeFile(join(dir, "README.md"), "# my flows\n", "utf8");
    await mkdir(join(dir, "terraform"));

    const { written } = await runInit(dir);
    expect(written.length).toBe(3);
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe("# my flows\n");
  });

  it("refuses to overwrite, and writes nothing when it refuses", async () => {
    const dir = await plainDir();
    const docPath = join(dir, `${TEMPLATE_DOC_NAME}.flowdoc.json`);
    await writeFile(docPath, "{ mine }\n", "utf8");

    const error = await runInit(dir).then(
      () => undefined,
      (e: unknown) => e as CliError,
    );
    expect(error).toBeInstanceOf(CliError);
    expect(error?.exitCode).toBe(1);
    expect(error?.message).toContain(docPath);
    // Untouched, and no half-written pair beside it.
    expect(await readFile(docPath, "utf8")).toBe("{ mine }\n");
    expect(existsSync(join(dir, `${TEMPLATE_DOC_NAME}.flow.ts`))).toBe(false);
    expect(existsSync(join(dir, "package.json"))).toBe(false);
  });

  it("names every collision, not just the first", async () => {
    const dir = await plainDir();
    await writeFile(join(dir, `${TEMPLATE_DOC_NAME}.flowdoc.json`), "{}\n", "utf8");
    await writeFile(join(dir, `${TEMPLATE_DOC_NAME}.flow.ts`), "// mine\n", "utf8");

    const error = await runInit(dir).then(
      () => undefined,
      (e: unknown) => e as CliError,
    );
    expect(error?.message).toContain(`${TEMPLATE_DOC_NAME}.flowdoc.json`);
    expect(error?.message).toContain(`${TEMPLATE_DOC_NAME}.flow.ts`);
  });
});

describe("nothingAboveDeclaresAPackage", () => {
  it("is true for a directory with no project above it", async () => {
    expect(nothingAboveDeclaresAPackage(await plainDir())).toBe(true);
  });

  it("is false inside this repository", () => {
    expect(nothingAboveDeclaresAPackage(repoRoot)).toBe(false);
  });

  it("is false when the directory itself carries the package.json", async () => {
    const dir = await plainDir();
    await writeFile(join(dir, "package.json"), "{}", "utf8");
    expect(nothingAboveDeclaresAPackage(dir)).toBe(false);
  });

  it("answers for a directory that does not exist yet", async () => {
    // init decides before it creates the directory, so the walk has to cope
    // with a path whose leaf is not there.
    const project = await plainDir();
    await writeFile(join(project, "package.json"), "{}", "utf8");
    expect(nothingAboveDeclaresAPackage(join(project, "not", "yet"))).toBe(false);
  });
});
