/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli studio` command body: asset resolution and the lines it prints.
// The server itself is covered by src/bridge/server.test.ts.

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FlowDoc } from "@flow-as-code/core";

import { CliError } from "./errors.js";
import { eventLine, resolveStudioAssets, runStudio } from "./studio.js";
import { sha256Hex } from "./synth.js";

const pkgRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = resolve(pkgRoot, "../..");
const DEMO = join(repoRoot, "conformance/demo/appointment-line.flowdoc.json");
const dirs: string[] = [];
const servers: { close(): Promise<void> }[] = [];

async function tempDir(): Promise<string> {
  const base = join(pkgRoot, ".vitest");
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, "studio-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe("resolveStudioAssets", () => {
  it("finds the built studio through the studio package's exports", () => {
    // The studio is built before the tests run (CI builds, then tests), so
    // this is the real resolution the command performs.
    const dist = resolveStudioAssets();
    expect(dist.endsWith(join("packages", "studio", "dist"))).toBe(true);
  });
});

describe("flow-cli studio", () => {
  it("serves 127.0.0.1 on a free port and says so", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "placeholder.txt"), "", "utf8");
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });

    const server = await runStudio(dir, {});
    servers.push(server);

    expect(server.host).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);
    expect(lines.join("\n")).toContain(`open http://127.0.0.1:${String(server.port)}/`);
    expect(lines.join("\n")).toContain("listens on 127.0.0.1 only");

    // The page it serves is the built studio, told it has a bridge.
    const html = await (await fetch(server.url)).text();
    expect(html).toContain("__FLOW_STUDIO_BRIDGE__");
    expect(html).toContain('<div id="root">');
  }, 30_000);

  it("rejects a --port that is not a port, before starting anything", async () => {
    const dir = await tempDir();
    await expect(runStudio(dir, { port: "not-a-port" })).rejects.toThrow(CliError);
    await expect(runStudio(dir, { port: "70000" })).rejects.toThrow(/between 0 and 65535/);
  });

  it("names the directory that does not exist", async () => {
    const dir = join(await tempDir(), "nope");
    await expect(runStudio(dir, { assetsDir: pkgRoot })).rejects.toThrow(/No such directory/);
  });

  it("prints one line per bridge event", () => {
    expect(eventLine({ seq: 1, kind: "synced", name: "demo", doc: {} as never, text: "" }, "/d")) //
      .toBe("synced   demo");
    expect(
      eventLine(
        {
          seq: 2,
          kind: "conflict",
          name: "demo",
          reason: "both sides changed",
          origin: "disk",
          docSide: null,
          codeSide: null,
        },
        "/d",
      ),
    ).toContain("conflict demo: both sides changed");
    expect(
      eventLine({ seq: 3, kind: "error", path: "/d/demo.flow.ts", message: "boom" }, "/d"),
    ).toBe("error    demo.flow.ts: boom");
  });
});

/** Captures console.log, which is how the command reports what it does. */
function captureLog(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  return lines;
}

/** Waits for a printed line matching `match`, or fails with everything printed. */
async function waitForLine(lines: string[], match: RegExp, budgetMs = 20_000): Promise<string> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const hit = lines.find((line) => match.test(line));
    if (hit !== undefined) return hit;
    if (Date.now() > deadline) {
      throw new Error(
        `no line matching ${match.source}; the command printed:\n${lines.join("\n")}`,
      );
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("opening a directory with no builder files", () => {
  it("writes the paired .flow.ts for a directory holding only a FlowDoc", async () => {
    // The documented loop is "edit the builder file, watch the canvas follow".
    // A directory of documents alone (exported from an instance, copied from
    // conformance/, sent by a colleague) had no builder file to edit, so the
    // loop could not start there and the studio wrote one only on the first
    // canvas save.
    const dir = await tempDir();
    await writeFile(
      join(dir, "appointment-line.flowdoc.json"),
      await readFile(DEMO, "utf8"),
      "utf8",
    );
    const lines = captureLog();

    const server = await runStudio(dir, { assetsDir: pkgRoot });
    servers.push(server);

    const tsPath = join(dir, "appointment-line.flow.ts");
    expect(existsSync(tsPath)).toBe(true);
    expect(lines.join("\n")).toContain(
      "wrote    appointment-line.flow.ts from appointment-line.flowdoc.json",
    );

    // The document must carry the hash of the source just written, or the
    // watcher meets a pair it has never seen in sync and reports a conflict on
    // the first edit instead of syncing it.
    const doc = JSON.parse(
      await readFile(join(dir, "appointment-line.flowdoc.json"), "utf8"),
    ) as FlowDoc;
    expect(doc.meta?.sourceHash).toBe(`sha256:${sha256Hex(await readFile(tsPath, "utf8"))}`);

    // The loop itself, which is the thing the finding said could not start:
    // edit the generated builder file and the watcher syncs it rather than
    // reporting the pair as diverged.
    await writeFile(tsPath, `${await readFile(tsPath, "utf8")}\n// touched by the test\n`, "utf8");
    const deadline = Date.now() + 20_000;
    while (!lines.some((line) => line.startsWith("synced   appointment-line"))) {
      if (Date.now() > deadline) {
        throw new Error(`no synced event; the command printed:\n${lines.join("\n")}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(lines.some((line) => line.startsWith("conflict"))).toBe(false);
  }, 40_000);

  it("writes nothing when the directory is empty and still serves it", async () => {
    const dir = await tempDir();
    const lines = captureLog();

    const server = await runStudio(dir, { assetsDir: pkgRoot });
    servers.push(server);

    expect(await readdir(dir)).toEqual([]);
    expect(lines.join("\n")).not.toContain("wrote");
    expect(server.port).toBeGreaterThan(0);
    const info = await fetch(`http://${server.host}:${String(server.port)}/bridge/info`, {
      headers: { "x-flow-studio-token": server.token },
    });
    expect(info.status).toBe(200);
  }, 30_000);

  it("names a document it cannot generate from and opens the directory anyway", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "broken.flowdoc.json"), '{"name":"broken"}', "utf8");
    const lines = captureLog();

    const server = await runStudio(dir, { assetsDir: pkgRoot });
    servers.push(server);

    expect(existsSync(join(dir, "broken.flow.ts"))).toBe(false);
    expect(lines.join("\n")).toContain("skipped  broken.flowdoc.json:");
    expect(server.port).toBeGreaterThan(0);
  }, 30_000);
});

describe("a syntax error in a watched builder file", () => {
  it("prints the file and the reason, and no node_modules frames under it", async () => {
    // The whole terminal report used to be the actionable line plus ten frames
    // of esbuild and node stream internals, which pushed the file, line and
    // column off the top of a narrow terminal. The studio's badge shows only
    // the first line; this is the terminal matching that intent.
    const dir = await tempDir();
    await writeFile(join(dir, "broken-line.flow.ts"), "const broken = ;\n", "utf8");
    const lines = captureLog();

    const server = await runStudio(dir, { assetsDir: pkgRoot });
    servers.push(server);

    await waitForLine(lines, /^error {4}broken-line\.flow\.ts:/);
    const printed = lines.join("\n");
    expect(printed).toContain("broken-line.flow.ts");
    // The reason, with the position esbuild reports, is what the user acts on.
    expect(printed).toMatch(/Unexpected ";"/);
    expect(printed).toMatch(/broken-line\.flow\.ts:1:15/);
    // Mutation: dropping the node_modules filter from actionableFrames turns
    // this red with `at failureErrorWithLog (.../node_modules/esbuild/...)`.
    expect(printed).not.toContain("node_modules");
    expect(printed).not.toContain("    at ");
  }, 40_000);
});
