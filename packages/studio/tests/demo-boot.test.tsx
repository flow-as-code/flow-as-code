/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// Boots the BUILT demo (dist-demo/assets/index-*.js), the way bundle-boot
// .test.tsx boots dist/. The source-level test (demoUi.test.tsx) mounts the
// same read-only store, but only the artifact shows whether `--mode demo`
// actually reached the app: the compile-time DEMO_BUILD flag, the swapped
// bridge client, the swapped package names. Every network entry point is
// replaced by a spy that throws, so a request the static scan missed fails
// here rather than silently succeeding.
//
// Needs `npm run build:demo`; skips with one message from demo-bundle.test.ts
// when dist-demo/ is missing.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installDomStubs, unmount } from "./appHarness.js";

// happy-dom rewrites import.meta.url to an http URL, so the path comes from
// the working directory instead: vitest runs this project from either the
// repo root or the package directory.
const candidates = [
  join(process.cwd(), "dist-demo", "assets"),
  join(process.cwd(), "packages", "studio", "dist-demo", "assets"),
];
const assets = candidates.find((p) => existsSync(p)) ?? candidates[0]!;
const entry = existsSync(assets)
  ? readdirSync(assets).find((f) => f.startsWith("index-") && f.endsWith(".js"))
  : undefined;

const NETWORK_GLOBALS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"] as const;

beforeAll(installDomStubs);
afterEach(unmount);

describe("the built demo boots", () => {
  it.runIf(entry !== undefined)("mounts read-only, offline, with the GenericBlock", async () => {
    const scope = globalThis as unknown as Record<string, unknown>;
    const spies = NETWORK_GLOBALS.map((name) => {
      const spy = vi.fn(() => {
        throw new Error(`the demo tried to use ${name}`);
      });
      scope[name] = spy;
      return [name, spy] as const;
    });
    scope["navigator"] = { ...navigator, sendBeacon: vi.fn(() => false) };

    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
    try {
      // The entry chunk mounts itself into #root on import.
      await import(pathToFileURL(join(assets, entry!)).href);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const text = root.textContent ?? "";
      expect(text).toContain("Flow Studio");
      expect(text).toContain("Read-only demo");
      // The demo flow rendered, GenericBlock included.
      expect(text).toContain("MessageParticipant");
      expect(text).toContain("UpdateFlowLoggingBehavior");
      expect(root.querySelector('[data-testid="read-only-badge"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="save-button"]')).toBeNull();
      expect(root.querySelector('[data-testid="export-button"]')).toBeNull();
      expect(root.querySelector('[data-testid="export-targets-button"]')).not.toBeNull();
      for (const [name, spy] of spies) expect(spy, `${name} was called`).not.toHaveBeenCalled();
    } finally {
      root.remove();
    }
  });
});
