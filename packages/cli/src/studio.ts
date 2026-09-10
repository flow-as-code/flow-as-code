/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli studio [dir]`: serve the local visual editor over a directory.
//
// The command is thin on purpose. Everything it does is start the bridge in
// src/bridge/server.ts, point it at the studio's built assets, and print the
// URL; the interesting behaviour is testable there without a subprocess. It
// asks the bridge for `ensurePairs`, which writes the missing `<name>.flow.ts`
// for every document in the directory so that a directory of FlowDocs alone
// can start the edit-the-builder-file loop, and prints what that wrote.
//
// The assets are resolved through the studio package's own exports rather than
// a relative path, because @flow-as-code/cli is published and installed on its
// own: in a user's node_modules the studio is a sibling package, not a sibling
// directory. A studio that is installed but not built is the common local
// failure and gets its own message naming the command that fixes it.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, relative, resolve } from "node:path";

import { PACKAGE_NAMES } from "@flow-as-code/core";

import type { BridgeEvent } from "./bridge/protocol.js";
import { startStudioServer, type StudioServer } from "./bridge/server.js";
import { CliError } from "./errors.js";

/** The studio's published entry point, resolved through its package exports. */
const STUDIO_INDEX = `${PACKAGE_NAMES.studio}/dist/index.html`;
const STUDIO_PACKAGE = `${PACKAGE_NAMES.studio}/package.json`;

/**
 * Absolute path of the built studio assets. Throws a CliError naming the fix
 * when the package is missing or has not been built.
 */
export function resolveStudioAssets(): string {
  const require = createRequire(import.meta.url);
  let packageJson: string;
  try {
    packageJson = require.resolve(STUDIO_PACKAGE);
  } catch {
    throw new CliError(
      `flow-cli studio needs ${PACKAGE_NAMES.studio}, which is not installed. ` +
        `It ships as a dependency of ${PACKAGE_NAMES.cli}, so this usually means a partial install: ` +
        `run "npm install".`,
    );
  }
  const dist = resolve(dirname(packageJson), "dist");
  if (!existsSync(resolve(dist, "index.html"))) {
    throw new CliError(
      `The studio has not been built: ${resolve(dist, "index.html")} does not exist. ` +
        `Run "npm run build --workspace ${PACKAGE_NAMES.studio}" (or "npm run build" ` +
        `at the repository root) and try again.`,
    );
  }
  // Resolving the entry through the exports map as well, so a package whose
  // exports stop publishing dist/ fails here rather than serving nothing.
  try {
    require.resolve(STUDIO_INDEX);
  } catch {
    throw new CliError(
      `${PACKAGE_NAMES.studio} does not export ${STUDIO_INDEX.split("/").pop() ?? "dist"}; ` +
        `this flow-cli is not compatible with the installed studio.`,
    );
  }
  return dist;
}

export interface StudioOptions {
  /** Commander passes strings; 0 or absent means "pick a free port". */
  port?: string;
  /** Test seam: skip the asset directory (API only). */
  assetsDir?: string;
}

/** One line per bridge event, so the terminal shows the sync happening. */
export function eventLine(event: BridgeEvent, dir: string): string {
  const where = (path: string): string => relative(dir, path) || path;
  switch (event.kind) {
    case "synced":
      return `synced   ${event.name}`;
    case "conflict":
      return `conflict ${event.name}: ${event.reason}`;
    case "error":
      return `error    ${where(event.path)}: ${event.message}`;
  }
}

/**
 * Starts the studio server and returns it. The caller keeps the process alive;
 * the command body below waits for a signal.
 */
export async function runStudio(dir: string | undefined, options: StudioOptions = {}) {
  const target = resolve(dir ?? process.cwd());
  const port = options.port === undefined ? 0 : Number(options.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new CliError(`--port must be a whole number between 0 and 65535, not "${options.port}".`);
  }

  const assetsDir = options.assetsDir ?? resolveStudioAssets();
  let server: StudioServer;
  try {
    server = await startStudioServer({
      dir: target,
      assetsDir,
      port,
      // A directory of FlowDocs with no builder files beside them cannot start
      // the loop this command exists for, because there is nothing to edit.
      ensurePairs: true,
      onEvent: (event) => console.log(eventLine(event, target)),
    });
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }

  for (const { tsPath, name } of server.prepared.generated) {
    console.log(`wrote    ${basename(tsPath)} from ${name}.flowdoc.json`);
  }
  for (const { name, message } of server.prepared.problems) {
    console.log(`skipped  ${name}.flowdoc.json: ${message}`);
  }
  console.log(`flow-cli studio serving ${target}`);
  console.log(`  open ${server.url}`);
  console.log(`  the bridge listens on ${server.host} only; press Ctrl+C to stop`);
  return server;
}

/** The command body: run until the terminal interrupts it. */
export async function studioCommand(
  dir: string | undefined,
  options: StudioOptions,
): Promise<void> {
  const server = await runStudio(dir, options);
  await new Promise<void>((resolveP) => {
    const stop = () => {
      void server.close().then(() => resolveP());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
