/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Local-first acceptance: the built studio carries zero network dependencies.
// This is the one studio test file that needs `npm run build` (CI builds before
// testing, see .github/workflows/ci.yml). Without dist/ exactly one test fails
// and names the command; the rest skip instead of raising ENOENT noise.
//
// The allow-list and the scan live in offlineScan.ts, shared with the hosted
// demo's stricter version of this file (demo-bundle.test.ts).

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { URL_PATTERN, builtOutput, urlOffenders } from "./offlineScan.js";

// fileURLToPath, not URL.pathname: pathname is percent-encoded and keeps a
// leading slash on Windows drive paths.
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const built = builtOutput(dist);
const BUILD_HINT = "packages/studio/dist is missing or stale; run `npm run build` first";

describe("built bundle is offline-clean", () => {
  it("dist exists", () => {
    expect(built !== undefined, BUILD_HINT).toBe(true);
  });

  it.runIf(built)("index.html references no external URLs at all", () => {
    expect(built!.html.match(URL_PATTERN) ?? []).toEqual([]);
  });

  it.runIf(built)("assets contain no external URLs beyond library string constants", () => {
    expect(built!.assets.length).toBeGreaterThan(0);
    for (const path of built!.assets) {
      const text = readFileSync(path, "utf8");
      expect(urlOffenders(text), `unexpected external URL in ${basename(path)}`).toEqual([]);
    }
  });

  it.runIf(built)("the stylesheet loads nothing remote (no url(http), no @import http)", () => {
    const sheets = built!.assets.filter((f) => f.endsWith(".css"));
    expect(sheets.length).toBeGreaterThan(0);
    for (const path of sheets) {
      const css = readFileSync(path, "utf8");
      expect(css).not.toMatch(/url\(\s*['"]?https?:/i);
      expect(css).not.toMatch(/@import\s+['"]?https?:/i);
    }
  });
});
