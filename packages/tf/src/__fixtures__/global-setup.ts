/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Root vitest `globalSetup`, wired in vitest.config.ts.
//
// It exists for one job: fill the shared OpenTofu plugin cache before any test
// worker starts. Three test files run `tofu init`
// (packages/tf/src/validate.test.ts, packages/studio/tests/exportTofu.test.ts
// and tests/promoteAcrossEnvironments.test.ts) and vitest runs them in
// parallel, which on OpenTofu 1.7.0 corrupts the dependency lock file when two
// of them have to download the same provider. ./tofu.ts has the mechanism and
// the reproduction.
//
// This said "two" and named the first two until 2026-09-10. The miscount was
// the defect: the file it left out was also the only one whose providers did
// not go through the seam, so the prewarm never fetched what it resolved.
// prewarmTofuCache() now works from providerSites(), which discovers the files
// rather than listing them, and tofu() refuses an init outside that set.
//
// globalSetup is the right hook rather than a per-file `beforeAll` because it
// runs once for the whole run, in the main process, even across projects; a
// beforeAll runs once per worker, which is the concurrency being avoided. It is
// a no-op unless RUN_TOFU_VALIDATE=1, so `npm test` is unaffected.

import { prewarmTofuCache } from "./tofu.js";

export function setup(): void {
  prewarmTofuCache();
}
