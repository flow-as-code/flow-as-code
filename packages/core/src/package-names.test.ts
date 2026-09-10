/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// PACKAGE_NAMES is the single source for package names embedded in output, so
// it has to agree with the manifests npm actually publishes.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PACKAGE_NAMES, PACKAGE_SCOPE } from "./package-names.js";

const packages = new URL("../../", import.meta.url);

const manifestName = (dir: string): string =>
  (JSON.parse(readFileSync(new URL(`${dir}/package.json`, packages), "utf8")) as { name: string })
    .name;

describe("PACKAGE_NAMES", () => {
  // The short name is also the directory: `@flow-as-code/core` lives in
  // packages/core. The keys of PACKAGE_NAMES are those short names, so this
  // reads the manifest at the matching path rather than a second list of
  // directories that a rename could leave behind.
  it.each(Object.keys(PACKAGE_NAMES))("%s matches the name in its package.json", (key) => {
    expect(PACKAGE_NAMES[key as keyof typeof PACKAGE_NAMES]).toBe(manifestName(key));
  });

  it("every name lives under PACKAGE_SCOPE", () => {
    for (const name of Object.values(PACKAGE_NAMES)) {
      expect(name.startsWith(`${PACKAGE_SCOPE}/`)).toBe(true);
    }
  });
});
