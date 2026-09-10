/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Loader for the conformance/emit-tf cases, shared by the golden-file tests and
// the gated `tofu validate` tests. The directory format is documented in
// conformance/README.md and is part of the cross-language contract: a future Go
// provider reads these same case directories.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { FlowDoc } from "@flow-as-code/core";
import type { EmitTfOptions } from "../emit.js";

/** Repo root, from src/__fixtures__/ and from the compiled dist/__fixtures__/. */
export const REPO_ROOT = new URL("../../../../", import.meta.url);
export const EMIT_TF_ROOT = new URL("conformance/emit-tf/", REPO_ROOT);

export type ValidateExpectation = "pass" | "fail" | "skip";

interface CaseFile {
  description: string;
  docs: string[];
  options?: EmitTfOptions;
  validate?: ValidateExpectation;
}

export interface EmitCase {
  name: string;
  dir: URL;
  description: string;
  docs: FlowDoc[];
  options: EmitTfOptions;
  /** Golden output, relative POSIX path to content, sorted by path. */
  expected: Record<string, string>;
  /** Test-only providers and stub resources for the validate run, if any. */
  support: Record<string, string>;
  validate: ValidateExpectation;
}

const readText = (url: URL): string => readFileSync(url, "utf8");

/** Every regular file under `dir`, relative POSIX path to content, sorted. */
export function readTree(dir: URL, prefix = ""): Record<string, string> {
  // A case without goldens yet, or without validate support files, is normal.
  if (!existsSync(dir)) return {};
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: Record<string, string> = {};
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isDirectory()) {
      Object.assign(files, readTree(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`));
    } else {
      files[`${prefix}${entry.name}`] = readText(new URL(entry.name, dir));
    }
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function loadCases(): EmitCase[] {
  const names = readdirSync(EMIT_TF_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  return names.map((name) => {
    const dir = new URL(`${name}/`, EMIT_TF_ROOT);
    const spec = JSON.parse(readText(new URL("case.json", dir))) as CaseFile;
    const docs = spec.docs.map((p) => JSON.parse(readText(new URL(p, dir))) as FlowDoc);

    // The map is optional, but a malformed one is an error, not an absent one.
    const mapPath = new URL("address-map.json", dir);
    const addressMap = existsSync(mapPath)
      ? (JSON.parse(readText(mapPath)) as Record<string, string>)
      : undefined;

    return {
      name,
      dir,
      description: spec.description,
      docs,
      options: { ...spec.options, ...(addressMap === undefined ? {} : { addressMap }) },
      expected: readTree(new URL("expected/", dir)),
      support: readTree(new URL("validate/", dir)),
      validate: spec.validate ?? "skip",
    };
  });
}
