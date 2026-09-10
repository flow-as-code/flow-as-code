/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli emit <dir> --target cdk|tf`.
//
// The two targets are not symmetric, because the two emitters are not.
//
// - tf is a real code generator: @flow-as-code/tf turns the document set into HCL plus
//   .tftpl files. This command is a thin wrapper over `writeTf`, deliberately
//   adding nothing of its own so the bytes it writes are exactly the bytes
//   `emitTf` returns. src/cli.test.ts asserts that equality.
// - cdk is a library binding: FlowSet reads the FlowDoc directory itself at
//   synth time, so there is nothing per-document to emit and what gets written
//   is a stack scaffold with a TODO binder. See cdk-scaffold.ts.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { EmitTfError, writeTf } from "@flow-as-code/tf";

import { CDK_SCAFFOLD_FILE, cdkScaffoldForDirs } from "./cdk-scaffold.js";
import { defaultOutDir, loadDocs, readStringMap } from "./docs.js";
import { CliError } from "./errors.js";

export type EmitTarget = "cdk" | "tf";

export interface EmitOptions {
  target: string;
  addressMap?: string;
  out?: string;
}

const TARGETS = new Set<string>(["cdk", "tf"]);

export function runEmit(input: string, options: EmitOptions): string[] {
  if (!TARGETS.has(options.target)) {
    throw new CliError(`Unknown --target "${options.target}". Use "cdk" or "tf".`);
  }
  if (options.target === "cdk" && options.addressMap !== undefined) {
    throw new CliError("--address-map applies to --target tf only; the cdk target uses a binder.");
  }

  const docsDir = defaultOutDir(input);
  const docs = loadDocs(input).map((l) => l.doc);
  const outDir = resolve(options.out ?? docsDir);
  mkdirSync(outDir, { recursive: true });

  if (options.target === "tf") {
    const addressMap =
      options.addressMap === undefined
        ? undefined
        : readStringMap(options.addressMap, "address map");
    let result;
    try {
      result = writeTf(docs, outDir, addressMap === undefined ? {} : { addressMap });
    } catch (error) {
      if (error instanceof EmitTfError) throw new CliError(error.message);
      throw error;
    }
    return Object.keys(result.files)
      .sort()
      .map((file) => join(outDir, file));
  }

  const path = join(outDir, CDK_SCAFFOLD_FILE);
  writeFileSync(path, cdkScaffoldForDirs({ docs, outDir, docsDir }), "utf8");
  return [path];
}
