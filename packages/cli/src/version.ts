/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// This package's version, read from its own manifest at runtime.
//
// It used to be two hardcoded literals, `.version("0.0.1")` in bin.ts and
// `cli@0.0.1` here, and both drifted the moment the release bumped to 0.1.0:
// the published 0.1.0 tarball printed `0.0.1` for `flow-cli --version` and
// stamped `cli@0.0.1` into meta.generator of every FlowDoc it synthesized, so
// documents users committed to their own repositories carry false provenance.
// Reading the manifest removes the copy that can drift; there is nothing left
// to remember to bump. src/version.test.ts holds it to the manifest.
//
// packages/cli/package.json ships inside the tarball (tests/packaging.test.ts
// asserts it), so the manifest is present in an install as well as a checkout.
// This module loads from src/ under vitest and from dist/ in an install, which
// are different directories, so the lookup walks up to the first package.json
// that names this package rather than assuming a fixed count of "..": both
// depths, and any future nesting, then resolve to the same manifest.
//
// The lookup is LAZY, and the exported binding is a function rather than a
// const, on purpose. The first cut ran the walk at module load, from
// `export const CLI_VERSION = readVersion()`. ./synth.ts imports this module
// and `./synth` is a public subpath, so a consumer who bundles that subpath
// took a throw from `import` itself: once bundled, import.meta.url no longer
// names a file with this package's manifest above it, the walk runs to the
// filesystem root, and the error arrives before any of their code runs. An
// import must be inert. Asking for the version is the operation that can fail,
// so that is where the failure belongs.
//
// It still fails loudly there. A placeholder version would turn a missing
// manifest into `cli@0.0.0` stamped in meta.generator, which is the false
// provenance described above wearing a different number, and worse than an
// error because nothing reports it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PACKAGE_NAMES } from "@flow-as-code/core";

/** This package's name, as published. Never written here as a literal. */
const PACKAGE_NAME = PACKAGE_NAMES.cli;

/** Reads `version` from the nearest package.json at or above this file named PACKAGE_NAME. */
function readVersion(): string {
  const from = fileURLToPath(import.meta.url);
  let dir = dirname(from);

  while (true) {
    const manifestPath = join(dir, "package.json");
    let manifest: { name?: unknown; version?: unknown } | undefined;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof manifest;
    } catch {
      // No manifest here, or an unreadable one: keep walking up.
    }
    if (manifest?.name === PACKAGE_NAME) {
      const { version } = manifest;
      if (typeof version !== "string" || version === "") {
        throw new Error(`${manifestPath} has no version`);
      }
      return version;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`No ${PACKAGE_NAME} package.json at or above ${from}`);
    }
    dir = parent;
  }
}

/** Memoized result of the walk. Only a success is cached; a failure is retried. */
let cached: string | undefined;

/**
 * The version in packages/cli/package.json. Never write this string by hand.
 *
 * The filesystem walk runs on the first call and its result is kept, so the
 * repeated callers (`--version`, every document synth stamps) pay for it once.
 * Importing this module does no I/O at all; see the note at the top of the file
 * for why that matters. Throws when no manifest for this package is above this
 * file, rather than reporting a version it cannot back up.
 */
export function cliVersion(): string {
  cached ??= readVersion();
  return cached;
}
