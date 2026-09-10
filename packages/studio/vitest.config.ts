/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Tests default to the node environment (the model layer is pure). Component
// smoke tests opt into happy-dom per file via // @vitest-environment happy-dom.
//
// The workspace packages the studio imports are resolved to their TypeScript
// sources rather than to the dist/ builds their package.json "exports" point
// at, so `npm ci && npm test` works on a clean tree with no build step. Three
// files still need `npm run build`: tests/bundle-offline.test.ts, which fails
// with one message naming the command, and tests/bundle-boot.test.tsx and
// tests/exportParity.test.ts, which skip silently because bundle-offline has
// already said it.
//
// Only the subpaths the studio may import are aliased. The @flow-as-code/tf index is
// deliberately absent: it re-exports writeTf, which imports node:fs and cannot
// be bundled into a browser, and an alias here would let that import pass
// tests and fail the build. tests/browserSafe.test.ts enforces the same rule
// on the source.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const source = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@flow-as-code\/core\/lint$/,
        replacement: source("core/src/lint/index.ts"),
      },
      { find: /^@flow-as-code\/core$/, replacement: source("core/src/index.ts") },
      { find: /^@flow-as-code\/tf\/emit$/, replacement: source("tf/src/emit.ts") },
      {
        find: /^@flow-as-code\/cdk\/scaffold$/,
        replacement: source("cdk/src/scaffold.ts"),
      },
    ],
  },
  test: {
    environment: "node",
  },
});
