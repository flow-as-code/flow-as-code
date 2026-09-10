/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The hosted demo's static proof (docs/05-hosted-demo.md): the artifact in
// dist-demo/ serves from any path, has no code path to a network request, and
// names no npm package. Needs `npm run build:demo`; without dist-demo/ exactly
// one test fails and names the command, the rest skip.
//
// This is bundle-offline.test.ts with the tolerance removed. The regular
// bundle may carry `fetch(` because the bridge client is in it; the demo may
// not, because the demo build swaps that client for a stub (src/demo/), and a
// primitive reappearing here means the swap stopped working. The runtime half
// of the proof, watching the browser make no request, is a procedure in the
// doc rather than a test, because it needs a browser.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAMES, PACKAGE_SCOPE } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { PACKAGE_SCOPE as DEMO_SCOPE } from "../src/demo/package-names.js";
import { URL_PATTERN, builtOutput, primitiveOffenders, urlOffenders } from "./offlineScan.js";

const dist = fileURLToPath(new URL("../dist-demo/", import.meta.url));
const built = builtOutput(dist);
const BUILD_HINT = "packages/studio/dist-demo is missing or stale; run `npm run build:demo` first";

/** Every file the artifact is made of, index.html first. */
function files(): Array<{ name: string; text: string }> {
  return [
    { name: "index.html", text: built!.html },
    ...built!.assets.map((path) => ({ name: basename(path), text: readFileSync(path, "utf8") })),
  ];
}

describe("the hosted demo artifact", () => {
  it("dist-demo exists", () => {
    expect(built !== undefined, BUILD_HINT).toBe(true);
  });

  it.runIf(built)("is relocatable: index.html loads every asset by a relative path", () => {
    const refs = [...built!.html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs)
      expect(ref, "asset reference must be relative").toMatch(/^\.\/assets\//);
    expect(built!.html.match(URL_PATTERN) ?? []).toEqual([]);
  });

  it.runIf(built)("carries a Content-Security-Policy that refuses every connection", () => {
    const meta = built!.html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
    expect(meta, "CSP meta tag").not.toBeNull();
    const csp = meta![1]!.replaceAll("&#39;", "'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it.runIf(built)("contains no network primitive at all", () => {
    for (const { name, text } of files()) {
      expect(primitiveOffenders(text), `network primitive in ${name}`).toEqual([]);
    }
  });

  it.runIf(built)("mentions no URL beyond library string constants", () => {
    expect(built!.assets.length).toBeGreaterThan(0);
    for (const { name, text } of files()) {
      expect(urlOffenders(text), `unexpected external URL in ${name}`).toEqual([]);
    }
  });

  it.runIf(built)("loads no remote stylesheet, font, or image from CSS", () => {
    const sheets = built!.assets.filter((f) => f.endsWith(".css"));
    expect(sheets.length).toBeGreaterThan(0);
    for (const path of sheets) {
      const css = readFileSync(path, "utf8");
      expect(css).not.toMatch(/url\(\s*['"]?https?:/i);
      expect(css).not.toMatch(/@import\s+['"]?https?:/i);
    }
  });

  it.runIf(built)("names no npm package: the scope is swapped for the placeholder", () => {
    // Whatever the scope is today, so a rename cannot make this test check a
    // stale string. Spelled with its leading `@`, the way a specifier spells
    // it: the bare name is also the GitHub org and the schema `$id` host, and
    // the artifact carries that `$id` by design (offlineScan.ts allows it by
    // exact match), so matching without the `@` would fail on the schema.
    const scope = new RegExp(PACKAGE_SCOPE.replaceAll("-", "\\-"), "i");
    expect(DEMO_SCOPE).not.toMatch(scope);
    for (const { name, text } of files()) {
      for (const published of Object.values(PACKAGE_NAMES)) {
        expect(text, `npm package name in ${name}`).not.toContain(published);
      }
      expect(text, `npm package scope in ${name}`).not.toMatch(scope);
    }
    // The placeholder is present, so the check passed because the swap
    // happened and not because the names were tree-shaken away.
    const app = files().find(({ name }) => name.startsWith("index-") && name.endsWith(".js"));
    expect(app, "the app chunk").toBeDefined();
    expect(app!.text).toContain(DEMO_SCOPE);
  });

  it.runIf(built)("bakes in the demo flow, its GenericBlock, and the read-only badge", () => {
    const app = files().find(({ name }) => name.startsWith("index-") && name.endsWith(".js"));
    expect(app!.text).toContain("appointment-line");
    expect(app!.text).toContain("UpdateFlowLoggingBehavior");
    expect(app!.text).toContain("Read-only demo");
  });

  it.runIf(built)("ships the lint worker as a same-origin asset", () => {
    const worker = built!.assets.find((f) => basename(f).startsWith("lint.worker-"));
    expect(worker, "lint worker chunk").toBeDefined();
  });
});
