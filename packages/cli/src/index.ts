/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Library entry. Importing this package must not run the CLI, so the commander
// program lives in ./bin.ts and nothing here has a side effect at load time.
// The three subpath exports (./synth, ./watch, ./bridge) are the public API and
// this module is their union; src/index.test.ts holds the two in step.

import { pathToFileURL } from "node:url";

export * from "./synth.js";
export * from "./watch.js";
export * from "./bridge/server.js";

// Before the bin split this file was the CLI, so `node .../dist/index.js studio`
// still exists in scripts and in muscle memory. Left alone it now exits 0 having
// done nothing, which reads as success. Refuse instead, but only when this module
// is the process entry point: on the import path argv[1] is some other script (or
// undefined under `node -e`), the branch is not taken, and importing stays free of
// side effects.
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stderr.write(
    "flow-cli: this is the library entry and runs no commands. Run the CLI as dist/bin.js (or the installed flow-cli bin).\n",
  );
  process.exit(1);
}
