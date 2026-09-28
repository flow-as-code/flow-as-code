/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli init [dir] [--author ts|tf]`: the first step of the npm path.
//
// Every other command consumes a document that already exists, so an install
// from npm had nowhere to start: `flow-cli studio flows/` on a fresh machine
// printed "No such directory" and no command wrote one. This writes the
// smallest complete thing to open: one FlowDoc, its companion (the builder
// file, or with --author tf a `.flow.tf` resource), and, for a builder file
// only and only when nothing above the directory has declared one, a
// package.json saying `"type": "module"`.
//
// The pair goes through bridge/pair.ts's writePair, which is the same code the
// studio runs on a canvas save: the companion's generator, the canonical
// serializer for the document, and meta.sourceHash stamped with the hash of the
// source it just generated. That last part is what makes the pair open in sync
// rather than as a conflict on the first edit, and using the real path rather
// than shipping a pre-generated companion is what stops the two from drifting.
//
// template/appointment-line.flowdoc.json is a byte copy of
// conformance/demo/appointment-line.flowdoc.json, kept inside the package
// because the conformance tree is not published; src/init.test.ts fails if the
// two drift. It is the same document the hosted studio demo opens, so what
// `init` writes is what a reader has already seen.
//
// Nothing is overwritten. When a target file exists the command writes nothing
// at all and exits 1 naming every collision, because a partial scaffold is
// worse than none: the pair would be half the user's and half ours, and
// meta.sourceHash would describe a file that was never generated.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FlowDoc } from "@flow-as-code/core";

import { writePair } from "./bridge/pair.js";
import { parseKind, suffixOf } from "./companion.js";
import { CliError } from "./errors.js";

/** The document `init` writes. Also the name of both files it becomes. */
export const TEMPLATE_DOC_NAME = "appointment-line";

/** Absolute path of the packaged template FlowDoc (`../template` from src or dist). */
export const TEMPLATE_DOC_PATH = fileURLToPath(
  new URL(`../template/${TEMPLATE_DOC_NAME}.flowdoc.json`, import.meta.url),
);

/**
 * True when no package.json exists in `dir` or in any directory above it.
 *
 * The same walk node does to decide a file's module system
 * (https://nodejs.org/api/packages.html#determining-module-system). A
 * package.json anywhere above is a decision somebody made about their own
 * project, and writing a second one underneath it would be this command
 * reorganising a repository it was pointed at, so the answer is to leave it
 * alone: `flow-cli synth` evaluates a builder file as ESM whatever the project
 * declares (src/synth-resolve-hook.ts), so an existing project needs nothing
 * written into it.
 */
export function nothingAboveDeclaresAPackage(dir: string): boolean {
  let at = resolve(dir);
  for (;;) {
    if (existsSync(join(at, "package.json"))) return false;
    const parent = dirname(at);
    if (parent === at) return true;
    at = parent;
  }
}

/** The package.json `init` writes for a directory with no project above it. */
export function templatePackageJson(name: string): string {
  return `${JSON.stringify({ name, private: true, type: "module" }, null, 2)}\n`;
}

export interface InitResult {
  /** Absolute paths written, in write order. */
  written: string[];
}

/**
 * Scaffolds a directory. Throws CliError (exit 1) without writing anything when
 * a file it would write is already there.
 */
export interface InitOptions {
  /** The companion to scaffold: ts (the default) or tf. */
  author?: string;
}

export async function runInit(dir?: string, options: InitOptions = {}): Promise<InitResult> {
  const author = parseKind(options.author ?? "ts", "--author");
  const target = resolve(dir ?? ".");
  const docPath = join(target, `${TEMPLATE_DOC_NAME}.flowdoc.json`);
  const sourcePath = join(target, `${TEMPLATE_DOC_NAME}${suffixOf(author)}`);
  const otherPath = join(target, `${TEMPLATE_DOC_NAME}${suffixOf(author === "ts" ? "tf" : "ts")}`);
  const pkgPath = join(target, "package.json");

  // A directory that already holds other files is fine, and common: a repo's
  // flows/ folder, or a project the user is adding flows to. Only a collision
  // with one of the files this writes (or the other companion, which would
  // make the pair ambiguous) is a refusal.
  const collisions = [docPath, sourcePath, otherPath].filter((path) => existsSync(path));
  if (collisions.length > 0) {
    throw new CliError(
      `Refusing to overwrite ${collisions.join(" and ")}. ` +
        `\`flow-cli init\` writes ${TEMPLATE_DOC_NAME}.flowdoc.json and ` +
        `${TEMPLATE_DOC_NAME}${suffixOf(author)}, and never replaces a file that is already there. ` +
        `Pass a different directory, or delete what is in the way.`,
    );
  }

  // A .flow.ts needs a package.json declaring ES modules to synth; a .flow.tf
  // is parsed, not run, and needs nothing.
  const needsPackageJson = author === "ts" && nothingAboveDeclaresAPackage(target);

  await mkdir(target, { recursive: true });

  const doc = JSON.parse(readFileSync(TEMPLATE_DOC_PATH, "utf8")) as FlowDoc;
  // writePair is the studio's own save path: it validates the document,
  // generates the TypeScript, and stamps meta.sourceHash so the pair starts in
  // sync. It writes the builder file first, then the document.
  await writePair(target, TEMPLATE_DOC_NAME, doc, undefined, { sourceKind: author });

  const written = [sourcePath, docPath];
  if (needsPackageJson) {
    // Last, so a failure earlier does not leave a package.json behind claiming
    // a project that has nothing in it.
    await writeFile(pkgPath, templatePackageJson(`${TEMPLATE_DOC_NAME}-flows`), "utf8");
    written.push(pkgPath);
  }
  return { written };
}
