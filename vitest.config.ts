/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      {
        // Repo-level checks that belong to no single package: packaging,
        // workspace wiring, and anything about how this repo ships.
        test: {
          name: "repo",
          root: ".",
          include: ["tests/**/*.test.ts"],
        },
      },
    ],
    // dist/ holds compiled copies of the same tests; running them twice is noise.
    exclude: ["**/node_modules/**", "**/dist/**", "**/dist-demo/**"],
    // Runs once for the whole run, before any worker and across every project,
    // which is the only place the shared OpenTofu plugin cache can be filled
    // without two test files racing to fill it. A no-op unless
    // RUN_TOFU_VALIDATE=1. See the file, and packages/tf/src/__fixtures__/tofu.ts.
    globalSetup: ["packages/tf/src/__fixtures__/global-setup.ts"],
    // Vitest defaults to 5s. Several tests here do real work that is slow on a
    // cold cache and slower on a shared two-core CI runner: building a
    // TypeScript program over generated modules, synthesizing CDK templates,
    // running dagre. Three of them intermittently blew the default budget, so
    // `npm test` was not reliably green from a clean checkout, which is exactly
    // the state CI runs in. This is a ceiling for hangs, not a latency budget;
    // tests that assert latency do so explicitly.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
