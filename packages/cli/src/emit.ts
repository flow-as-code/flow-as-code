/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli emit <dir> --target cdk|flowascode|tf`.
//
// The targets are not symmetric, because the emitters are not.
//
// - flowascode writes the set as flowascode provider resources through
//   @flow-as-code/hcl's emitFlowascode, byte for byte what it returns: flows.tf,
//   variables.tf and versions.tf.example, never a per-document companion.
// - tf is a real code generator: @flow-as-code/tf turns the document set into HCL plus
//   .tftpl files. This command is a thin wrapper over `emitTf`, deliberately
//   adding nothing of its own so the bytes it writes are exactly the bytes
//   `emitTf` returns. src/cli.test.ts asserts that equality.
// - cdk is a library binding: FlowSet reads the FlowDoc directory itself at
//   synth time, so there is nothing per-document to emit and what gets written
//   is a stack scaffold with a TODO binder. See cdk-scaffold.ts.
//
// What the address map does not cover is where the two Terraform targets
// part. The flat target's placeholder is an undeclared reference, loud at
// `validate`, so it exits 0 and leaves the placeholder to fail there. The
// flowascode target's `null` binding validates and is refused only at plan
// time, so here an unbound reference is an error, listing every key and the
// documents that make it, unless --allow-unbound asks for the partial map
// (C12). A map key no reference in the set uses is a warning on either
// target, and an error under --strict.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { EmitFlowascodeError, emitFlowascode, type UnboundRef } from "@flow-as-code/hcl";
import { EmitTfError, emitTf } from "@flow-as-code/tf";

import { CDK_SCAFFOLD_FILE, cdkScaffoldForDirs } from "./cdk-scaffold.js";
import { defaultOutDir, loadDocs, readStringMap } from "./docs.js";
import { CliError } from "./errors.js";

export type EmitTarget = "cdk" | "flowascode" | "tf";

export interface EmitOptions {
  target: string;
  addressMap?: string;
  out?: string;
  /** flowascode: write an unbound reference as `null` under a TODO comment and exit 0. */
  allowUnbound?: boolean;
  /** tf and flowascode: an address map key no reference uses is an error, not a warning. */
  strict?: boolean;
}

export interface EmitOutcome {
  /** Absolute paths of the files written, in the emitter's order. */
  written: string[];
  /** What the run noticed without refusing, one line each, for stderr. */
  warnings: string[];
}

const TARGETS = new Set<string>(["cdk", "flowascode", "tf"]);

const unboundLines = (unbound: readonly UnboundRef[]): string[] =>
  unbound.map((u) => `  - ${u.key} (referenced by ${u.documents.join(", ")})`);

const unusedWarnings = (keys: readonly string[]): string[] =>
  keys.map((key) => `warning: address map key "${key}" matches no reference in the set`);

function writeFiles(outDir: string, files: Record<string, string>): string[] {
  return Object.entries(files).map(([file, text]) => {
    const path = join(outDir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
    return path;
  });
}

export function runEmit(input: string, options: EmitOptions): EmitOutcome {
  if (!TARGETS.has(options.target)) {
    throw new CliError(`Unknown --target "${options.target}". Use "cdk", "flowascode" or "tf".`);
  }
  if (options.target === "cdk") {
    for (const [flag, set] of [
      ["--address-map", options.addressMap !== undefined],
      ["--allow-unbound", options.allowUnbound === true],
      ["--strict", options.strict === true],
    ] as const) {
      if (set) {
        throw new CliError(
          `${flag} applies to --target tf and flowascode only; the cdk target uses a binder.`,
        );
      }
    }
  }

  const docsDir = defaultOutDir(input);
  const docs = loadDocs(input).map((l) => l.doc);
  const outDir = resolve(options.out ?? docsDir);
  mkdirSync(outDir, { recursive: true });

  const addressMap =
    options.addressMap === undefined ? undefined : readStringMap(options.addressMap, "address map");
  const emitOptions = addressMap === undefined ? {} : { addressMap };

  if (options.target === "cdk") {
    const path = join(outDir, CDK_SCAFFOLD_FILE);
    writeFileSync(path, cdkScaffoldForDirs({ docs, outDir, docsDir }), "utf8");
    return { written: [path], warnings: [] };
  }

  let result;
  try {
    result =
      options.target === "flowascode"
        ? emitFlowascode(docs, emitOptions)
        : emitTf(docs, emitOptions);
  } catch (error) {
    if (error instanceof EmitFlowascodeError || error instanceof EmitTfError) {
      throw new CliError(error.message);
    }
    throw error;
  }

  // Nothing is written when the run is refused: a half-written tree with a
  // message beside it is harder to read than the message alone.
  if (options.strict === true && result.unusedMapKeys.length > 0) {
    throw new CliError(
      `Cannot emit with --strict: ${String(result.unusedMapKeys.length)} address map ` +
        `key(s) match no reference in the set:\n` +
        result.unusedMapKeys.map((key) => `  - ${key}`).join("\n") +
        "\nRemove them from the map, or fix the key, and re-emit.",
    );
  }
  if (
    options.target === "flowascode" &&
    options.allowUnbound !== true &&
    result.unbound.length > 0
  ) {
    throw new CliError(
      `Cannot emit flowascode configuration: ${String(result.unbound.length)} reference(s) ` +
        `have no terraform address:\n${unboundLines(result.unbound).join("\n")}\n` +
        "Add each key to the address map (--address-map) and re-emit, or pass " +
        "--allow-unbound to write them as null under a TODO comment, which the " +
        "provider refuses at plan time.",
    );
  }

  return {
    written: writeFiles(outDir, result.files),
    warnings: unusedWarnings(result.unusedMapKeys),
  };
}
