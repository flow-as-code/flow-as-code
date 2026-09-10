/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// Boots the BUILT bundle, not the sources. The source tests resolve every
// import the way node does; the shipped artifact goes through Vite's CJS
// interop instead, which is where a dependency like ajv (CommonJS, consumed as
// a named import) can turn into undefined at runtime and blank the page. This
// mounts dist/assets/index-*.js against a real #root and checks the studio
// came up with the demo doc and a working schema validator.
//
// Needs `npm run build`; skips with one message from bundle-offline.test.ts
// when dist/ is missing.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { installDomStubs, unmount } from "./appHarness.js";

// happy-dom rewrites import.meta.url to an http URL, so the path comes from
// the working directory instead: vitest runs this project from either the
// repo root or the package directory.
const candidates = [
  join(process.cwd(), "dist", "assets"),
  join(process.cwd(), "packages", "studio", "dist", "assets"),
];
const assets = candidates.find((p) => existsSync(p)) ?? candidates[0]!;
const entry = existsSync(assets)
  ? readdirSync(assets).find((f) => f.startsWith("index-") && f.endsWith(".js"))
  : undefined;

beforeAll(installDomStubs);
afterEach(unmount);

describe("the built bundle boots", () => {
  it.runIf(entry !== undefined)("mounts the studio on #root", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
    try {
      // The entry chunk mounts itself into #root on import.
      await import(pathToFileURL(join(assets, entry!)).href);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const text = root.textContent ?? "";
      expect(text).toContain("Flow Studio");
      // The demo doc rendered: canvas nodes and the refs sidebar are present.
      expect(text).toContain("MessageParticipant");
      expect(text).toContain("References");
    } finally {
      root.remove();
    }
  });
});
