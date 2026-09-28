/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Reading and writing one <name>.flowdoc.json and its companion, which is
// <name>.flow.ts or <name>.flow.tf (docs/06-terraform-provider.md,
// "Companions"). One companion per document: a directory holding both for one
// name is ambiguous, and every operation on that name refuses until one goes.
//
// This is the only place the studio bridge touches disk, and it is deliberately
// the mirror image of the A04 watch engine: the watcher owns the companion ->
// doc direction, this module owns doc -> companion.
//
// The rule that keeps the two directions from fighting each other is
// meta.sourceHash. A pair is "in sync" when the doc carries the sha256 of the
// exact companion sitting next to it (docs/01-flowdoc-spec.md), which is what
// the watcher's dirty guard reads. So a canvas save must write BOTH halves and
// stamp the doc with the hash of the source it just generated; writing only
// the doc would leave a pair the watcher then reports as dirty in an
// unknowable direction.
//
// Generation goes through ../companion.ts with the existing file passed as
// `previous`, which is how `@keep` comments a human added survive a canvas
// edit, and for a .flow.tf also its refs bindings, instance_id, tags and lint
// settings (conformance/hcl/README.md rule 24).

import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { migrateFlowDoc, type FlowDoc } from "@flow-as-code/core";
import { toFlowDoc } from "@flow-as-code/hcl";

import { generateCompanion, readTfCompanion } from "../companion.js";
import { flowDocProblems } from "../docs.js";
import { messageOf } from "../errors.js";
import { serializeWithMeta, sha256Hex, synthFile } from "../synth.js";
import { pickDoc, type FlowWatcher } from "../watch.js";
import {
  DOC_SUFFIX,
  TF_SUFFIX,
  TS_SUFFIX,
  isBridgeDocName,
  sourceSuffix,
  type BridgeDocPayload,
  type BridgeDocRef,
  type BridgeWriteResult,
  type SourceKind,
} from "./protocol.js";

/** A failure with the HTTP status the bridge should answer with. */
export class BridgeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BridgeError";
    this.status = status;
  }
}

/**
 * Thrown by writePair when the builder file has moved since the document being
 * written was generated from it. Both sides changed, so the write is refused
 * and the caller turns this into the "which side wins" question.
 */
export class PairConflict extends Error {
  readonly name = "PairConflict";
  readonly docName: string;
  readonly reason: string;

  constructor(docName: string, reason: string) {
    super(reason);
    this.docName = docName;
    this.reason = reason;
  }
}

export interface PairPaths {
  docPath: string;
  tsPath: string;
  tfPath: string;
}

/**
 * Every file path for a document name. The name is re-checked here rather than
 * only at the route, because this function is what turns a client string into
 * a filesystem path: a slug cannot contain a separator, a dot, or a NUL, so
 * traversal is impossible by construction rather than by sanitizing.
 */
export function pairPaths(dir: string, name: string): PairPaths {
  if (!isBridgeDocName(name)) {
    throw new BridgeError(
      400,
      `"${name}" is not a document name: names are lowercase words separated by single hyphens.`,
    );
  }
  const base = resolve(dir);
  return {
    docPath: join(base, name + DOC_SUFFIX),
    tsPath: join(base, name + TS_SUFFIX),
    tfPath: join(base, name + TF_SUFFIX),
  };
}

/** The companion path for a kind. */
export function sourcePathOf(paths: PairPaths, kind: SourceKind): string {
  return kind === "tf" ? paths.tfPath : paths.tsPath;
}

/** The two companions of one name, both present. Nothing may pick one for the user. */
export function ambiguousPair(name: string): BridgeError {
  return new BridgeError(
    409,
    `Both ${name}${TS_SUFFIX} and ${name}${TF_SUFFIX} exist. A document has one companion; ` +
      "delete the one you do not want (or run `flow-cli convert`, which replaces one with the other).",
  );
}

/** The companion on disk for `name`, undefined when there is none; refuses when both exist. */
export function companionOnDisk(dir: string, name: string): SourceKind | undefined {
  const paths = pairPaths(dir, name);
  const ts = existsSync(paths.tsPath);
  const tf = existsSync(paths.tfPath);
  if (ts && tf) throw ambiguousPair(name);
  return ts ? "ts" : tf ? "tf" : undefined;
}

/**
 * The companion kind to write for a document: the caller's choice, then the
 * companion on disk, then the document's meta.sourceKind, then ts. Disk comes
 * before meta so a save never writes a second companion beside the one there.
 */
export function companionKind(
  dir: string,
  name: string,
  doc: FlowDoc | undefined,
  requested?: SourceKind,
): SourceKind {
  return requested ?? companionOnDisk(dir, name) ?? doc?.meta?.sourceKind ?? "ts";
}

/** Every FlowDoc name in the directory, sorted, non-recursive. */
export async function listDocNames(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(resolve(dir));
  } catch {
    throw new BridgeError(500, `Cannot read ${resolve(dir)}.`);
  }
  return entries
    .filter((f) => f.endsWith(DOC_SUFFIX))
    .map((f) => f.slice(0, -DOC_SUFFIX.length))
    .filter((name) => isBridgeDocName(name))
    .sort();
}

/** Every document in the directory with the companion it has or will get. */
export async function listDocRefs(dir: string): Promise<BridgeDocRef[]> {
  const refs: BridgeDocRef[] = [];
  for (const name of await listDocNames(dir)) {
    let kind: SourceKind | undefined;
    try {
      kind = companionOnDisk(dir, name);
    } catch {
      kind = undefined; // ambiguous: reported when the document is opened
    }
    if (kind === undefined) {
      try {
        kind = (await readPair(dir, name)).doc.meta?.sourceKind;
      } catch {
        kind = undefined;
      }
    }
    refs.push({ name, sourceKind: kind ?? "ts" });
  }
  return refs;
}

/** Parses and schema-validates a FlowDoc, naming what is wrong with it. */
export function parseDoc(text: string, what: string): FlowDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new BridgeError(
      422,
      `${what} is not JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const problems = flowDocProblems(parsed);
  if (problems.length > 0) {
    throw new BridgeError(422, `${what} is not a valid FlowDoc: ${problems.join("; ")}`);
  }
  return migrateFlowDoc(parsed, what);
}

/** The lint rules a .flow.tf disables, or undefined when it cannot be read. */
function lintDisableOf(text: string): string[] | undefined {
  try {
    return toFlowDoc(text).sidecar.lint;
  } catch {
    return undefined;
  }
}

/** The document on disk, exactly as the file holds it. */
export async function readPair(dir: string, name: string): Promise<BridgeDocPayload> {
  const paths = pairPaths(dir, name);
  let text: string;
  try {
    text = await readFile(paths.docPath, "utf8");
  } catch {
    throw new BridgeError(404, `No document named "${name}" in ${resolve(dir)}.`);
  }
  const doc = parseDoc(text, `${name}${DOC_SUFFIX}`);
  const sourceKind = companionOnDisk(dir, name) ?? doc.meta?.sourceKind ?? "ts";
  const payload: BridgeDocPayload = { name, doc, text, sourceKind };
  if (sourceKind === "tf" && existsSync(paths.tfPath)) {
    const lint = lintDisableOf(await readFile(paths.tfPath, "utf8"));
    if (lint !== undefined && lint.length > 0) payload.lintDisable = lint;
  }
  return payload;
}

/**
 * Writes both halves of the pair from a FlowDoc the canvas produced.
 *
 * Order matters and is: generate, hash the generated source, serialize the doc
 * with that hash, write both, then tell the watcher these exact bytes are
 * ours. The watcher is told last because chokidar's awaitWriteFinish window
 * (50 ms) is far longer than the gap, so no change event can be routed against
 * a half-updated ledger, and a write that throws leaves the ledger untouched.
 */
export interface WritePairOptions {
  /**
   * Write even though the companion no longer matches the document's
   * meta.sourceHash. Set only when the user has answered the conflict dialog.
   */
  force?: boolean;
  /** The companion to write; otherwise companionKind decides. */
  sourceKind?: SourceKind;
}

export async function writePair(
  dir: string,
  name: string,
  doc: FlowDoc,
  watcher?: FlowWatcher,
  options: WritePairOptions = {},
): Promise<BridgeWriteResult> {
  const paths = pairPaths(dir, name);
  if (doc.name !== name) {
    throw new BridgeError(
      400,
      `Refusing to write flow "${doc.name}" as ${name}${DOC_SUFFIX}: the watcher pairs ` +
        `a companion with ${name}${DOC_SUFFIX} by name, so the two must agree.`,
    );
  }
  const problems = flowDocProblems(doc);
  if (problems.length > 0) {
    throw new BridgeError(422, `Refusing to write an invalid FlowDoc: ${problems.join("; ")}`);
  }
  const onDisk = companionOnDisk(dir, name);
  const kind = companionKind(dir, name, doc, options.sourceKind);
  if (onDisk !== undefined && onDisk !== kind) {
    throw new BridgeError(
      409,
      `${name} has ${name}${sourceSuffix(onDisk)}, not ${name}${sourceSuffix(kind)}; ` +
        `run \`flow-cli convert --to ${kind}\` to switch it.`,
    );
  }
  const sourcePath = sourcePathOf(paths, kind);
  const suffix = sourceSuffix(kind);

  // Read the current source first: @keep comments (and a .flow.tf's carried
  // values) live in it and would be deleted by a blind overwrite.
  const previous = existsSync(sourcePath) ? await readFile(sourcePath, "utf8") : undefined;

  // The dirty guard, in the doc -> companion direction. The document says
  // which source it was generated from; if that file has changed since,
  // regenerating it would throw away an edit nobody has seen. That is the same
  // dirty-both state the watcher detects in the other direction, and it gets
  // the same answer: refuse, and let the user choose.
  //
  // A document with no meta.sourceHash has no provenance to check (it was
  // authored outside this loop), so the write proceeds; @keep comments in the
  // existing source still survive it.
  const provenance = doc.meta?.sourceHash;
  if (options.force !== true && previous !== undefined && typeof provenance === "string") {
    if (`sha256:${sha256Hex(previous)}` !== provenance) {
      throw new PairConflict(
        name,
        `both sides changed: ${name}${suffix} was edited since this document was ` +
          `generated from it, and saving would overwrite that edit`,
      );
    }
  }

  let sourceText: string;
  try {
    sourceText = generateCompanion(doc, kind, previous === undefined ? {} : { previous });
  } catch (err) {
    throw new BridgeError(
      422,
      `Cannot generate ${name}${suffix} from this document: ${messageOf(err)}`,
    );
  }
  const text = serializeWithMeta(doc, `sha256:${sha256Hex(sourceText)}`, kind);

  await writeFile(sourcePath, sourceText, "utf8");
  await writeFile(paths.docPath, text, "utf8");
  watcher?.noteWrite(name, { sourceContent: sourceText, docContent: text });

  const result: BridgeWriteResult = {
    name,
    doc: JSON.parse(text) as FlowDoc,
    text,
    sourceKind: kind,
    docPath: paths.docPath,
    sourcePath,
    sourceText,
  };
  if (kind === "tf") {
    const lint = lintDisableOf(sourceText);
    if (lint !== undefined && lint.length > 0) result.lintDisable = lint;
  }
  return result;
}

/**
 * Creates a document and its companion. Refuses (409) when the document or
 * either companion exists: creating never overwrites.
 */
export async function createPair(
  dir: string,
  doc: FlowDoc,
  sourceKind: SourceKind,
  watcher?: FlowWatcher,
): Promise<BridgeWriteResult> {
  const paths = pairPaths(dir, doc.name);
  const taken = [paths.docPath, paths.tsPath, paths.tfPath].filter((p) => existsSync(p));
  if (taken.length > 0) {
    throw new BridgeError(
      409,
      `Refusing to create "${doc.name}": ${taken.join(" and ")} already exist.`,
    );
  }
  const { meta: _meta, ...fresh } = doc;
  return writePair(dir, doc.name, fresh as FlowDoc, watcher, { sourceKind });
}

/** The FlowDoc the companion reads to right now. */
export async function synthPair(dir: string, name: string): Promise<FlowDoc> {
  const paths = pairPaths(dir, name);
  const kind = companionOnDisk(dir, name);
  if (kind === undefined) {
    throw new BridgeError(404, `No companion for "${name}" in ${resolve(dir)}.`);
  }
  if (kind === "tf") {
    const text = await readFile(paths.tfPath, "utf8");
    try {
      return readTfCompanion(text, paths.tfPath).doc;
    } catch (err) {
      throw new BridgeError(422, messageOf(err));
    }
  }
  const { flows } = await synthFile(paths.tsPath);
  const doc = pickDoc(flows, name);
  if (doc === undefined) {
    throw new BridgeError(
      422,
      `${name}${TS_SUFFIX} exports ${String(flows.length)} flows and none is named "${name}".`,
    );
  }
  return doc;
}

/**
 * Resolution in the code direction: the companion wins, so the FlowDoc is
 * rewritten from it. The source is NOT regenerated, because the user chose the
 * source they have; only the doc moves.
 */
export async function adoptCode(
  dir: string,
  name: string,
  watcher?: FlowWatcher,
): Promise<BridgeDocPayload> {
  const paths = pairPaths(dir, name);
  const kind = companionOnDisk(dir, name);
  if (kind === undefined) {
    throw new BridgeError(404, `No companion for "${name}" in ${resolve(dir)}.`);
  }
  const sourceText = await readFile(sourcePathOf(paths, kind), "utf8");
  const doc = await synthPair(dir, name);
  const text = serializeWithMeta(doc, `sha256:${sha256Hex(sourceText)}`, kind);
  await writeFile(paths.docPath, text, "utf8");
  watcher?.noteWrite(name, { sourceContent: sourceText, docContent: text });
  const payload: BridgeDocPayload = {
    name,
    doc: JSON.parse(text) as FlowDoc,
    text,
    sourceKind: kind,
  };
  if (kind === "tf") {
    const lint = lintDisableOf(sourceText);
    if (lint !== undefined && lint.length > 0) payload.lintDisable = lint;
  }
  return payload;
}

/** One document whose companion was written by ensureCompanions. */
export interface GeneratedCompanion {
  name: string;
  sourceKind: SourceKind;
  sourcePath: string;
  /** Exact bytes written, so the caller can seed a watcher's ledger. */
  sourceText: string;
  docText: string;
}

/** One document ensureCompanions could not generate a companion for. */
export interface UnbuildableDoc {
  name: string;
  message: string;
}

export interface EnsureCompanionsResult {
  generated: GeneratedCompanion[];
  problems: UnbuildableDoc[];
}

/**
 * Writes the companion for every document in `dir` that has none: the kind
 * its meta.sourceKind names, else `<name>.flow.ts`.
 *
 * A directory holding only FlowDocs (an export from a live instance, a doc
 * copied out of conformance/, a file a colleague sent) had no companion, so
 * the loop the studio is built around - edit the source, watch the canvas
 * follow - could not start there: there was nothing to edit. Generating the
 * file on open is safe because generation is deterministic and the studio
 * already regenerates it on every canvas save, so this writes exactly the
 * bytes the first save would have written.
 *
 * It goes through writePair, which also stamps the document with the
 * meta.sourceHash of the source just generated. Without that stamp the watcher
 * would meet a pair it has never seen in sync and report a conflict on the
 * first edit, which is the state a hand-assembled pair lands in. The bytes
 * come back so the caller can hand them to the watcher's noteWrite as well:
 * the stamp alone leaves the outcome resting on the initial scan winning a
 * race against the user's first edit.
 *
 * A document that cannot be generated from (invalid, holding something the
 * generator cannot express, or with both companions) is reported and skipped,
 * not thrown: the rest of the directory still opens.
 */
export async function ensureCompanions(dir: string): Promise<EnsureCompanionsResult> {
  const generated: GeneratedCompanion[] = [];
  const problems: UnbuildableDoc[] = [];

  for (const name of await listDocNames(dir)) {
    try {
      if (companionOnDisk(dir, name) !== undefined) continue;
      const { doc } = await readPair(dir, name);
      const written = await writePair(dir, name, doc);
      generated.push({
        name,
        sourceKind: written.sourceKind,
        sourcePath: written.sourcePath,
        sourceText: written.sourceText,
        docText: written.text,
      });
    } catch (err) {
      problems.push({ name, message: messageOf(err) });
    }
  }

  return { generated, problems };
}
