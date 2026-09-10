/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Root vitest `globalSetup`, wired in vitest.config.ts.
//
// It exists for one job: fill the shared OpenTofu plugin cache before any test
// worker starts. Two test files run `tofu init` (packages/tf/src/validate.test.ts
// and packages/studio/tests/exportTofu.test.ts) and vitest runs them in
// parallel, which on OpenTofu 1.7.0 corrupts the dependency lock file when both
// have to download the same provider. ./tofu.ts has the mechanism and the
// reproduction.
//
// globalSetup is the right hook rather than a per-file `beforeAll` because it
// runs once for the whole run, in the main process, even across projects; a
// beforeAll runs once per worker, which is the concurrency being avoided. It is
// a no-op unless RUN_TOFU_VALIDATE=1, so `npm test` is unaffected.

import { prewarmTofuCache } from "./tofu.js";

export function setup(): void {
  prewarmTofuCache();
}
