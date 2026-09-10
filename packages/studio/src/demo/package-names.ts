/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Stands in for core's package-names module in the hosted demo build.
//
// The artifact must not carry a published npm name (tasks/A14-hosted-demo.md).
// The scope below is the documentation placeholder from RFC 2606 and can never
// be a package anyone installs, so a codegen or CDK preview in the demo reads
// `@example/cdk` where the real build reads the published name.
//
// vite.config.ts swaps this file in for every import that resolves to
// core's package-names, in the app bundle and in the lint worker, only
// under `vite build --mode demo`. tests/demoStubs.test.ts keeps the export
// surface identical to the real module so a swap can never leave an import
// dangling.

/** The placeholder scope the demo shows in place of the npm scope. */
export const PACKAGE_SCOPE = "@example";

/** Same keys as core's PACKAGE_NAMES; same short names, placeholder scope. */
export const PACKAGE_NAMES = {
  core: `${PACKAGE_SCOPE}/core`,
  cdk: `${PACKAGE_SCOPE}/cdk`,
  cli: `${PACKAGE_SCOPE}/cli`,
  tf: `${PACKAGE_SCOPE}/tf`,
  studio: `${PACKAGE_SCOPE}/studio`,
} as const;
