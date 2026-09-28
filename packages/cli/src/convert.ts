/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli convert <doc.flowdoc.json> --to ts|tf [--address-map <map>] [--keep-old]`:
// switch a document's companion between `<name>.flow.ts` and `<name>.flow.tf`.
// Never silent (docs/06-terraform-provider.md, "Companions"): it says what the
// new companion does not carry, deletes the old one unless --keep-old, and
// restamps the document's meta.sourceHash and meta.sourceKind so the watcher
// and the studio pair it with the new file.
//
// The document is the source of truth. What the old companion holds beside it
// is carried where the other kind has a place for it: comment lines marked
// @keep, rewritten between `//` and `#`, and nothing else. A .flow.tf's refs
// bindings, instance_id, tags and lint settings have no TypeScript spelling;
// a .flow.ts has nothing a .flow.tf needs but its kept comments, so the new
// .flow.tf binds what --address-map gives and writes null for the rest.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { collectRefs, lookupRefValue, refKey } from "@flow-as-code/core";

import {
  generateCompanion,
  keptFromTs,
  parseKind,
  readTfCompanion,
  suffixOf,
  type SourceKind,
} from "./companion.js";
import { loadOneDoc, readStringMap } from "./docs.js";
import { CliError } from "./errors.js";
import { serializeWithMeta, sha256Hex } from "./synth.js";

export interface ConvertOptions {
  to: string;
  addressMap?: string;
  keepOld?: boolean;
  /** Replace an old companion even when it holds edits the document does not. */
  force?: boolean;
}

export interface ConvertResult {
  /** The new companion, then the restamped document. */
  written: string[];
  /** The old companion, when it existed and --keep-old was not passed. */
  removed?: string;
  /** What the new companion does not carry from the old one, one sentence each. */
  dropped: string[];
}

export function runConvert(file: string, options: ConvertOptions): ConvertResult {
  const to = parseKind(options.to, "--to");
  const from: SourceKind = to === "tf" ? "ts" : "tf";
  const { path: docPath, doc } = loadOneDoc(file, "convert");
  const dir = dirname(docPath);
  const fromPath = join(dir, `${doc.name}${suffixOf(from)}`);
  const toPath = join(dir, `${doc.name}${suffixOf(to)}`);
  if (existsSync(toPath)) {
    throw new CliError(
      `${toPath} already exists. convert writes a new companion and never replaces one; ` +
        `run \`flow-cli codegen --to ${to}\` to regenerate it instead.`,
    );
  }
  if (to === "ts" && options.addressMap !== undefined) {
    throw new CliError("--address-map applies to --to tf only; a .flow.ts holds no bindings.");
  }

  const previousBytes = existsSync(fromPath) ? readFileSync(fromPath) : undefined;
  const previous = previousBytes?.toString("utf8");
  // The document is the source of truth only while it agrees with the old
  // companion. A companion edited since the document was synced holds work
  // the document does not, and converting would delete it.
  const provenance = doc.meta?.sourceHash;
  if (
    previousBytes !== undefined &&
    options.force !== true &&
    typeof provenance === "string" &&
    provenance !== `sha256:${sha256Hex(previousBytes)}`
  ) {
    throw new CliError(
      `${fromPath} has edits ${doc.name}.flowdoc.json does not hold (its meta.sourceHash ` +
        `differs). Run \`flow-cli synth ${fromPath}\` first, or pass --force to discard them.`,
    );
  }
  const dropped: string[] = [];
  let text: string;
  if (to === "tf") {
    const map =
      options.addressMap === undefined ? {} : readStringMap(options.addressMap, "address map");
    const refs = collectRefs(doc.content);
    const bindings = Object.fromEntries(
      refs.map((r) => [refKey(r), lookupRefValue(map, r) ?? null]),
    );
    const unbound = Object.values(bindings).filter((v) => v === null).length;
    if (unbound > 0) {
      dropped.push(
        `${String(unbound)} of ${String(refs.length)} references are written null under a TODO ` +
          "comment; bind them in refs, or pass --address-map.",
      );
    }
    dropped.push("instance_id is var.connect_instance_id; there are no tags and no lint settings.");
    text = generateCompanion(doc, "tf", {
      bindings,
      ...(previous === undefined ? {} : { keep: keptFromTs(previous) }),
    });
  } else {
    let keep;
    if (previous !== undefined) {
      const read = readTfCompanion(previous, fromPath);
      keep = read.keep;
      dropped.push(
        `${doc.name}${suffixOf("tf")}'s refs bindings, instance_id, tags, state and lint ` +
          "settings have no place in a .flow.ts and are not carried.",
      );
    }
    text = generateCompanion(doc, "ts", keep === undefined ? {} : { keep });
  }

  writeFileSync(toPath, text, "utf8");
  writeFileSync(docPath, serializeWithMeta(doc, `sha256:${sha256Hex(text)}`, to), "utf8");
  let removed: string | undefined;
  if (previous !== undefined && options.keepOld !== true) {
    rmSync(fromPath);
    removed = fromPath;
  }
  return { written: [toPath, docPath], ...(removed === undefined ? {} : { removed }), dropped };
}
