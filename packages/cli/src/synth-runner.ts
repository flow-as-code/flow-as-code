/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Child-process entry point for `flow-cli synth`. Never imported by the
// parent: it is spawned (see synth.ts) so that evaluating an untrusted
// builder file cannot touch the CLI process. Runs under tsx (--import), so
// this file works both compiled (dist/synth-runner.js) and straight from
// source in tests (src/synth-runner.ts).
//
// Contract with the parent: argv[2] is the absolute path of the builder file,
// argv[3] the path of the resolution hook module, and argv[4] the module URL
// that hook resolves @flow-as-code/core from when the builder file's own directory
// cannot. The runner prints exactly one envelope line to stdout, prefixed with
// SYNTH_ENVELOPE_SENTINEL, so user code writing to stdout during module
// evaluation cannot corrupt the channel. Everything else on stdout is ignored
// by the parent.

import { register } from "node:module";
import { pathToFileURL } from "node:url";

import type { Flow } from "@flow-as-code/core";
import { PACKAGE_NAMES, synth } from "@flow-as-code/core";

export const SYNTH_ENVELOPE_SENTINEL = "__FLOW_CLI_SYNTH_ENVELOPE_V1__";

export interface SynthEnvelope {
  flows?: { name: string; doc: unknown }[];
  error?: { message: string; stack?: string; code?: string };
}

/**
 * Structural check instead of `instanceof Flow`: the builder file may resolve
 * its own copy of @flow-as-code/core (dual-package or version skew), and a Flow from
 * that copy is still a Flow for our purposes.
 */
function isFlowLike(value: unknown): value is Flow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    (v.kind === "flow" || v.kind === "module") &&
    typeof v.all === "function" &&
    typeof v.startId === "function"
  );
}

/**
 * Convention: every exported Flow instance, plus the result of every exported
 * zero-argument function that returns one. Functions that throw when called
 * (including classes, which throw without `new`) are skipped; a throw during
 * module evaluation itself is a hard error and is reported by main().
 */
function collectFlows(mod: Record<string, unknown>): Flow[] {
  const flows: Flow[] = [];
  const seen = new Set<unknown>();
  const push = (f: Flow) => {
    if (!seen.has(f)) {
      seen.add(f);
      flows.push(f);
    }
  };
  for (const value of Object.values(mod)) {
    if (isFlowLike(value)) {
      push(value);
    } else if (typeof value === "function" && value.length === 0) {
      let result: unknown;
      try {
        result = (value as () => unknown)();
      } catch {
        continue; // not a flow factory (e.g. a class, or a helper that needs setup)
      }
      if (isFlowLike(result)) push(result);
    }
  }
  return flows;
}

function emit(envelope: SynthEnvelope): void {
  process.stdout.write("\n" + SYNTH_ENVELOPE_SENTINEL + JSON.stringify(envelope) + "\n");
}

/**
 * Registers the @flow-as-code/core resolution fallback before the builder file is
 * imported. See synth-resolve-hook.ts for what it does and why it is safe.
 *
 * `module.register` is the only registration API present on every Node this
 * package supports (`registerHooks` landed in 22.15). Its deprecation warning
 * on newer runtimes would otherwise reach the user inside a synth failure
 * message, which is why it is silenced for the length of the call and no
 * longer.
 */
function registerResolveFallback(
  hookPath: string,
  fallbackParentURL: string,
  builderURL: string,
): void {
  const { noDeprecation } = process;
  process.noDeprecation = true;
  try {
    register(pathToFileURL(hookPath).href, {
      parentURL: import.meta.url,
      data: { fallbackParentURL, flowCorePackage: PACKAGE_NAMES.core, builderURL },
    });
  } finally {
    process.noDeprecation = noDeprecation;
  }
}

async function main(): Promise<void> {
  const sourcePath = process.argv[2];
  if (sourcePath === undefined) {
    emit({ error: { message: "synth-runner: missing source file argument" } });
    process.exitCode = 1;
    return;
  }
  const hookPath = process.argv[3];
  const fallbackParentURL = process.argv[4];
  const builderURL = pathToFileURL(sourcePath).href;
  if (hookPath !== undefined && fallbackParentURL !== undefined) {
    registerResolveFallback(hookPath, fallbackParentURL, builderURL);
  }

  let mod: Record<string, unknown>;
  try {
    mod = (await import(builderURL)) as Record<string, unknown>;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    // `code` travels with the message so the parent can recognise a module-system
    // failure and say something better than node's own wording. See synth.ts.
    emit({
      error: { message: err.message, stack: err.stack, code: (e as NodeJS.ErrnoException).code },
    });
    process.exitCode = 1;
    return;
  }

  const flows = collectFlows(mod);
  const byName = new Map<string, Flow>();
  for (const flow of flows) {
    if (byName.has(flow.name)) {
      emit({
        error: {
          message: `Two exported flows share the name "${flow.name}". Flow names must be unique per file because each becomes <name>.flowdoc.json.`,
        },
      });
      process.exitCode = 1;
      return;
    }
    byName.set(flow.name, flow);
  }

  try {
    // meta is stamped by the parent (generator + sourceHash of the file it
    // actually read), so the runner synths without one.
    emit({
      flows: flows.map((f) => ({ name: f.name, doc: synth(f, { includeMeta: false }) })),
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    emit({ error: { message: err.message, stack: err.stack } });
    process.exitCode = 1;
  }
}

void main();
