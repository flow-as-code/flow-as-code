/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Local-first: the studio must build and run with no network access. Nothing
// here may add a remote origin (fonts, CDNs, analytics). See docs/02-studio-design.md.
//
// Chunking. A single 620 kB entry chunk tripped Vite's size warning on every
// build. The two candidate fixes were compiling the FlowDoc schema with ajv's
// standalone code generator (so no compiler ships) and splitting the chunk;
// raising the warning limit was not one, because the warning is describing a
// real cost. The standalone route is blocked on ajv 8: its generated module
// emits `require("ajv/dist/runtime/ucs2length")` for the minLength/maxLength
// helper even with code.esm set, which does not load in a browser, and the
// alternatives are hand-editing generated validator code or setting
// `unicode: false` and quietly changing what minLength means for non-BMP
// characters. Neither is a good trade inside the save gate, so the chunk is
// split by dependency instead: React, React Flow, and ajv change on their own
// release cadence, so separating them also makes the app chunk cacheable
// across studio releases.
//
// Two builds come out of this file. `vite build` is the studio `flow-cli
// studio` serves from dist/. `vite build --mode demo` (npm run build:demo) is
// the hosted read-only demo in dist-demo/ (docs/05-hosted-demo.md): relative
// asset paths so it serves from any static host or subpath, two source modules
// swapped for stubs so the bundle carries neither a network client nor an npm
// package name, and a Content-Security-Policy that forbids every connection.
// The app itself learns which build it is from import.meta.env.MODE
// (src/demoBuild.ts).

/** Module ids the demo build replaces, matched on the fully resolved path. */
const DEMO_STUBS: ReadonlyArray<{ pattern: RegExp; stub: string; hint: RegExp }> = [
  {
    // @flow-as-code/core's package-names, whether resolved to the built dist or to src.
    pattern: /[\\/]core[\\/](?:dist|src)[\\/]package-names\.(?:js|ts)$/,
    stub: "./src/demo/package-names.ts",
    hint: /package-names/,
  },
  {
    // The studio's only network client.
    pattern: /[\\/]studio[\\/]src[\\/]store[\\/]bridgeStore\.ts$/,
    stub: "./src/demo/bridgeStore.ts",
    hint: /bridgeStore/,
  },
];

/**
 * Sent as a meta tag because a static host may not let us set headers. Every
 * connection is refused (connect-src 'none'), so a request the tests missed
 * still fails in the browser, and nothing loads from another origin at all.
 * 'unsafe-eval' is there because ajv compiles the FlowDoc schema with
 * `new Function` (the standalone route is blocked, see above); the first
 * runtime check found the page blank without it. It widens what the page's own
 * scripts may do, not where they may come from or connect to.
 */
/**
 * What a search result and a link preview say about /studio/. It names no
 * package and carries no URL, which is what index.html is allowed to hold
 * (packages/studio/tests/demo-bundle.test.ts), and it says the two things a
 * reader landing there directly needs: it is read-only, and it is offline.
 */
const DEMO_DESCRIPTION =
  "A read-only build of the flow-as-code visual editor for Amazon Connect contact flows, " +
  "running entirely in your browser on a demo flow. Nothing is saved and no request leaves the page.";

const DEMO_CSP = [
  "default-src 'self'",
  "connect-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-eval'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * Redirects the two swapped modules to their stubs, in the app bundle and
 * (via worker.plugins) in the lint worker. The match is on the resolved id,
 * not the import specifier, so it holds however the module is reached:
 * @flow-as-code/core's own `./package-names.js`, the studio's `../store/bridgeStore.js`,
 * or a re-export through @flow-as-code/core's index.
 */
function demoStubs(): Plugin {
  return {
    name: "flow-studio:demo-stubs",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const candidate = DEMO_STUBS.filter(({ hint }) => hint.test(source));
      if (candidate.length === 0) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved === null) return null;
      const match = candidate.find(({ pattern }) => pattern.test(resolved.id));
      return match === undefined ? null : fileURLToPath(new URL(match.stub, import.meta.url));
    },
    transformIndexHtml(html) {
      // The description tag is matched loosely because Prettier decides how it
      // is wrapped in index.html, and a reformat there must not silently leave
      // the demo describing itself as an editor that saves. A miss throws.
      const described = html.replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
        `<meta name="description" content="${DEMO_DESCRIPTION}">`,
      );
      if (described === html) {
        throw new Error(
          'demo build: no <meta name="description"> found in index.html to swap. ' +
            "Restore the tag, or update this matcher.",
        );
      }
      return {
        html: described.replace(
          "<title>Flow Studio</title>",
          "<title>Flow Studio (read-only demo)</title>",
        ),
        tags: [
          {
            tag: "meta",
            attrs: { "http-equiv": "Content-Security-Policy", content: DEMO_CSP },
            injectTo: "head-prepend",
          },
        ],
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    // Relative asset paths, so dist-demo serves from a subpath as well as a root.
    base: demo ? "./" : "/",
    plugins: [react(), tailwindcss(), ...(demo ? [demoStubs()] : [])],
    worker: { plugins: () => (demo ? [demoStubs()] : []) },
    build: {
      outDir: demo ? "dist-demo" : "dist",
      emptyOutDir: true,
      // The modulepreload polyfill is the only other `fetch(` in the bundle;
      // the demo drops it and lets browsers without native modulepreload
      // simply not preload.
      ...(demo ? { modulePreload: { polyfill: false } } : {}),
      rollupOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: "reactflow", test: /node_modules[\\/]@xyflow[\\/]/ },
              { name: "ajv", test: /node_modules[\\/]ajv[\\/]/ },
            ],
          },
        },
      },
    },
    server: { host: "127.0.0.1" },
  };
});
