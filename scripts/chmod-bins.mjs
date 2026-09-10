#!/usr/bin/env node
/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Owns the file mode of everything each workspace packs out of `dist`: 0755 on
// the files a manifest names in `bin`, 0644 on every other file under dist.
//
// The bin half: tsc writes its output 0644, dist/ is not tracked, and npm has
// no manifest field for file modes, so without this step the published tarball
// carries `-rw-r--r-- package/dist/bin.js`. npm's own bin-links chmods the file
// when it installs the package, which is why `npx flow-cli` works anyway; the
// tarball mode still matters to everything that is not npm's installer, from a
// plain `tar -xzf` to another package manager or a distro packaging step.
//
// The 0644 half exists because a mode nothing owns drifts and never comes back.
// tsc's writes preserve an existing file's mode, dist/ is untracked, and npm's
// bin-links chmods whatever the manifest's `bin` pointed at when the package
// was last installed. So a developer tree that once shipped `bin: dist/index.js`
// keeps a 0755 dist/index.js through every later build, and publishes a tarball
// whose library entry point claims to be a program. Clearing the bits here
// makes the packed mode a function of the manifest alone: same manifest, same
// modes, on a clean clone and on a tree with years of history.
//
// `npm pack` copies the on-disk mode into the tar header (its "portable" tar
// options normalize timestamps and ownership, not permission bits), so setting
// the modes before packing is all that is required. fs.chmodSync is used rather
// than a `chmod` invocation because it is a no-op that does not throw on
// Windows, where a shell `chmod` is not available at all.
//
// Wired into the root `build` (last, so it sees every package's finished dist)
// and into cli's `prepack`, so a pack or publish of the package that has a
// bin gets these modes even with no preceding root build. The other four
// workspaces ship no bin and are released from a root build, so the build's run
// is what owns their dist modes.

import { chmodSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PACKAGES = join(ROOT, "packages");
const BIN_MODE = 0o755;
const FILE_MODE = 0o644;

/** Every regular file under `dir`, recursively. Symlinks are left alone. */
function filesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

let executable = 0;
let plain = 0;

for (const name of readdirSync(PACKAGES).sort()) {
  const pkg = join(PACKAGES, name);
  const manifestPath = join(pkg, "package.json");
  if (!existsSync(manifestPath)) continue;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const bin = manifest.bin;
  const targets = bin === undefined ? [] : typeof bin === "string" ? [bin] : Object.values(bin);
  const bins = new Set(targets.map((target) => resolve(pkg, target)));

  for (const file of bins) {
    // A bin that has not been built yet is not an error: the root build runs
    // this after tsc, and prepack runs it after the release recipe's build.
    if (!existsSync(file)) continue;
    chmodSync(file, BIN_MODE);
    executable += 1;
  }

  const dist = join(pkg, "dist");
  if (!existsSync(dist)) continue;
  for (const file of filesUnder(dist)) {
    if (bins.has(file)) continue;
    chmodSync(file, FILE_MODE);
    plain += 1;
  }
}

// stderr, not stdout: this runs as a prepack, and `npm pack --json` hands the
// caller everything the packing run wrote to stdout as one JSON document. A
// line on stdout here breaks tests/packaging.test.ts's parse.
process.stderr.write(`Modes set: ${executable} bin file(s) 0755, ${plain} dist file(s) 0644.\n`);
