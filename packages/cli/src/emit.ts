/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli emit <dir-or-file...> --target cdk|flowascode|tf`.
//
// Each argument is a set and is emitted on its own: one emitter call per set,
// into that set's own directory, so module aliasing and reference resolution
// never reach across sets, exactly as `lint` keeps them apart. `--out` names
// one directory, so with more than one set it is refused rather than letting
// two sets overwrite each other's `flows.tf`.
//
// A run over several sets is two-phase: every set goes through its emitter
// first, and nothing is written unless every set passed, so a refusal in one
// set leaves every directory as it was, the promise a single set already had.
// One address map serves every set, so an unused key is one no set uses; a
// --module-alias is routed to the set(s) whose documents hold the module it
// names, and refused only when no set does.
//
// The targets are not symmetric, because the emitters are not.
//
// - flowascode writes the set as flowascode provider resources through
//   @flow-as-code/hcl's emitFlowascode, byte for byte what it returns: flows.tf,
//   outputs.tf, variables.tf and versions.tf.example, never a per-document
//   companion.
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

import type { FlowDoc } from "@flow-as-code/core";
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
  /**
   * tf and flowascode: `module:<name>@<alias>` keys, one per --module-alias,
   * naming an alias a module in the set publishes though no flow in the set
   * invokes it (task C05).
   */
  moduleAlias?: readonly string[];
  /**
   * flowascode only: the HCL expression every resource's `instance_id` takes,
   * passed through as `emitFlowascode`'s `instanceIdExpression`. With it the
   * emitter writes no `variables.tf`, so a root that declares
   * `connect_instance_id` itself takes the whole tree.
   */
  instanceIdExpression?: string;
}

export interface EmitOutcome {
  /** Absolute paths of the files written, in the emitter's order. */
  written: string[];
  /** What the run noticed without refusing, one line each, for stderr. */
  warnings: string[];
}

const TARGETS = new Set<string>(["cdk", "flowascode", "tf"]);

/** `module:<name>@<alias>`, the key a flow in another root binds the alias by. */
const MODULE_ALIAS_KEY = /^module:([a-z0-9]+(?:-[a-z0-9]+)*)@([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** The --module-alias keys as the emitters take them, by module name. */
function moduleAliasesFrom(keys: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of keys) {
    const match = MODULE_ALIAS_KEY.exec(key);
    if (match === null) {
      throw new CliError(
        `--module-alias "${key}" is not a module:<name>@<alias> key (slugs on both sides, ` +
          `as a flow binds it: module:greeting@live).`,
      );
    }
    const [, module, alias] = match as unknown as [string, string, string];
    const aliases = (out[module] ??= []);
    if (!aliases.includes(alias)) aliases.push(alias);
  }
  return out;
}

const unboundLines = (unbound: readonly UnboundRef[]): string[] =>
  unbound.map((u) => `  - ${u.key} (referenced by ${u.documents.join(", ")})`);

const unusedWarnings = (keys: readonly string[]): string[] =>
  keys.map((key) => `warning: address map key "${key}" matches no reference in the set`);

/** Writes the files under `outDir`, creating it then: a refused run touches nothing. */
function writeFiles(outDir: string, files: Record<string, string>): string[] {
  mkdirSync(outDir, { recursive: true });
  return Object.entries(files).map(([file, text]) => {
    const path = join(outDir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
    return path;
  });
}

/**
 * What one set's emitter run produced, before anything is written. A set is
 * judged by the emitter alone; what is written is decided over every set.
 */
interface EmittedSet {
  input: string;
  outDir: string;
  files: Record<string, string>;
  unbound: readonly UnboundRef[];
  unusedMapKeys: readonly string[];
}

/** The module names a loaded set emits. */
function modulesOf(docs: readonly FlowDoc[]): Set<string> {
  return new Set(docs.filter((d) => d.kind === "module").map((d) => d.name));
}

/**
 * Emits every set named, each into its own directory, in two phases: every
 * set is run through its emitter first, and only when no set is refused is
 * anything written, so a refusal in the second set leaves the first set's
 * directory as it was. One address map serves every set, so a key is unused
 * only when no set uses it: warned once, and refused once under --strict. A
 * --module-alias goes to the set(s) that emit the module it names, and is
 * refused, once, when none does. Paths and warnings come back in argument
 * order.
 */
export function runEmit(inputs: string | readonly string[], options: EmitOptions): EmitOutcome {
  const sets = typeof inputs === "string" ? [inputs] : [...inputs];
  if (!TARGETS.has(options.target)) {
    throw new CliError(`Unknown --target "${options.target}". Use "cdk", "flowascode" or "tf".`);
  }
  if (options.target === "cdk") {
    for (const [flag, set] of [
      ["--address-map", options.addressMap !== undefined],
      ["--allow-unbound", options.allowUnbound === true],
      ["--strict", options.strict === true],
      ["--module-alias", (options.moduleAlias ?? []).length > 0],
      ["--instance-id-expression", options.instanceIdExpression !== undefined],
    ] as const) {
      if (set) {
        throw new CliError(
          `${flag} applies to --target tf and flowascode only; the cdk target uses a binder.`,
        );
      }
    }
  }
  if (options.instanceIdExpression !== undefined && options.target !== "flowascode") {
    throw new CliError("--instance-id-expression applies to --target flowascode only.");
  }
  if (sets.length > 1 && options.out !== undefined) {
    throw new CliError(
      `--out names one directory and ${String(sets.length)} sets were given; they would overwrite ` +
        "each other there. Omit --out to write each set beside its documents, or emit one set per run.",
    );
  }
  const outDirs = new Map<string, string>();
  for (const set of sets) {
    const dir = resolve(options.out ?? defaultOutDir(set));
    const other = outDirs.get(dir);
    if (other !== undefined) {
      throw new CliError(
        `${set} and ${other} would both write to ${dir}; give each set its own directory.`,
      );
    }
    outDirs.set(dir, set);
  }

  const addressMap =
    options.addressMap === undefined ? undefined : readStringMap(options.addressMap, "address map");
  const moduleAliases = moduleAliasesFrom(options.moduleAlias ?? []);

  // Every set loaded before any is emitted: an alias is routed by which set
  // holds its module, and a set that does not load refuses the whole run.
  const loaded = sets.map((input) => ({ input, docs: loadDocs(input).map((l) => l.doc) }));
  const orphaned = Object.keys(moduleAliases).filter((module) =>
    loaded.every((set) => !modulesOf(set.docs).has(module)),
  );
  if (orphaned.length > 0) {
    throw new CliError(
      `--module-alias names ${orphaned.length === 1 ? "a module" : "modules"} no set emits: ` +
        `${orphaned.map((m) => `"${m}"`).join(", ")} (searched ${sets.join(", ")}).`,
    );
  }

  // Phase one: every set through its emitter, nothing written.
  const emitted = loaded.map(({ input, docs }) => {
    const own = modulesOf(docs);
    const aliases = Object.fromEntries(
      Object.entries(moduleAliases).filter(([module]) => own.has(module)),
    );
    return emitSet(input, docs, options, addressMap, aliases);
  });

  // A key is unused only when every set left it unused.
  const unused = (emitted[0]?.unusedMapKeys ?? []).filter((key) =>
    emitted.every((set) => set.unusedMapKeys.includes(key)),
  );
  if (options.strict === true && unused.length > 0) {
    throw new CliError(
      `Cannot emit with --strict: ${String(unused.length)} address map ` +
        `key(s) match no reference in ${sets.length > 1 ? "any set" : "the set"}:\n` +
        unused.map((key) => `  - ${key}`).join("\n") +
        "\nRemove them from the map, or fix the key, and re-emit.",
    );
  }
  if (options.target === "flowascode" && options.allowUnbound !== true) {
    const refused = emitted.filter((set) => set.unbound.length > 0);
    if (refused.length > 0) {
      const count = refused.reduce((n, set) => n + set.unbound.length, 0);
      const lines = refused.flatMap((set) =>
        sets.length > 1
          ? [`  ${set.input}:`, ...unboundLines(set.unbound).map((line) => `  ${line}`)]
          : unboundLines(set.unbound),
      );
      throw new CliError(
        `Cannot emit flowascode configuration: ${String(count)} reference(s) ` +
          `have no terraform address:\n${lines.join("\n")}\n` +
          "Add each key to the address map (--address-map) and re-emit, or pass " +
          "--allow-unbound to write them as null under a TODO comment, which the " +
          "provider refuses at plan time." +
          (sets.length > 1 ? " Nothing was written for any set." : ""),
      );
    }
  }

  // Phase two: every set, in argument order.
  return {
    written: emitted.flatMap((set) => writeFiles(set.outDir, set.files)),
    warnings: unusedWarnings(unused),
  };
}

/** One set through its emitter: files and diagnostics, nothing written. */
function emitSet(
  input: string,
  docs: readonly FlowDoc[],
  options: EmitOptions,
  addressMap: Record<string, string> | undefined,
  moduleAliases: Record<string, string[]>,
): EmittedSet {
  const docsDir = defaultOutDir(input);
  const outDir = resolve(options.out ?? docsDir);
  const emitOptions = {
    ...(addressMap === undefined ? {} : { addressMap }),
    ...(Object.keys(moduleAliases).length > 0 ? { moduleAliases } : {}),
  };
  const flowascodeOptions = {
    ...emitOptions,
    ...(options.instanceIdExpression === undefined
      ? {}
      : { instanceIdExpression: options.instanceIdExpression }),
  };

  if (options.target === "cdk") {
    return {
      input,
      outDir,
      files: { [CDK_SCAFFOLD_FILE]: cdkScaffoldForDirs({ docs, outDir, docsDir }) },
      unbound: [],
      unusedMapKeys: [],
    };
  }

  try {
    const result =
      options.target === "flowascode"
        ? emitFlowascode(docs, flowascodeOptions)
        : emitTf(docs, emitOptions);
    return {
      input,
      outDir,
      files: result.files,
      unbound: result.unbound,
      unusedMapKeys: result.unusedMapKeys,
    };
  } catch (error) {
    if (error instanceof EmitFlowascodeError || error instanceof EmitTfError) {
      throw new CliError(error.message);
    }
    throw error;
  }
}
