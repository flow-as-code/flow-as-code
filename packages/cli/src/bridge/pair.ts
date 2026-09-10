/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Reading and writing one <name>.flowdoc.json / <name>.flow.ts pair.
//
// This is the only place the studio bridge touches disk, and it is deliberately
// the mirror image of the A04 watch engine: the watcher owns the ts -> doc
// direction, this module owns doc -> ts.
//
// The rule that keeps the two directions from fighting each other is
// meta.sourceHash. A pair is "in sync" when the doc carries the sha256 of the
// exact builder source sitting next to it (docs/01-flowdoc-spec.md), which is
// what the watcher's dirty guard reads. So a canvas save must write BOTH
// halves and stamp the doc with the hash of the source it just generated;
// writing only the doc would leave a pair the watcher then reports as dirty
// in an unknowable direction.
//
// Generation goes through @flow-as-code/core's codegen with the existing file passed as
// options.previous, which is how `// @keep` comments a human added to the
// generated file survive a canvas edit (packages/core/src/codegen.ts).

import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { codegen, type FlowDoc } from "@flow-as-code/core";

import { flowDocProblems } from "../docs.js";
import { serializeWithMeta, sha256Hex, synthFile } from "../synth.js";
import { pickDoc, type FlowWatcher } from "../watch.js";
import {
  DOC_SUFFIX,
  TS_SUFFIX,
  isBridgeDocName,
  type BridgeDocPayload,
  type BridgeWriteResult,
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
}

/**
 * Both file paths for a document name. The name is re-checked here rather than
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
  return { docPath: join(base, name + DOC_SUFFIX), tsPath: join(base, name + TS_SUFFIX) };
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
  return parsed as FlowDoc;
}

/** The document on disk, exactly as the file holds it. */
export async function readPair(dir: string, name: string): Promise<BridgeDocPayload> {
  const { docPath } = pairPaths(dir, name);
  let text: string;
  try {
    text = await readFile(docPath, "utf8");
  } catch {
    throw new BridgeError(404, `No document named "${name}" in ${resolve(dir)}.`);
  }
  return { name, doc: parseDoc(text, `${name}${DOC_SUFFIX}`), text };
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
   * Write even though the builder file no longer matches the document's
   * meta.sourceHash. Set only when the user has answered the conflict dialog.
   */
  force?: boolean;
}

export async function writePair(
  dir: string,
  name: string,
  doc: FlowDoc,
  watcher?: FlowWatcher,
  options: WritePairOptions = {},
): Promise<BridgeWriteResult> {
  const { docPath, tsPath } = pairPaths(dir, name);
  if (doc.name !== name) {
    throw new BridgeError(
      400,
      `Refusing to write flow "${doc.name}" as ${name}${DOC_SUFFIX}: the watcher pairs ` +
        `${name}${TS_SUFFIX} with ${name}${DOC_SUFFIX} by name, so the two must agree.`,
    );
  }
  const problems = flowDocProblems(doc);
  if (problems.length > 0) {
    throw new BridgeError(422, `Refusing to write an invalid FlowDoc: ${problems.join("; ")}`);
  }

  // Read the current source first: @keep comments live in it and would be
  // deleted by a blind overwrite.
  const previous = existsSync(tsPath) ? await readFile(tsPath, "utf8") : undefined;

  // The dirty guard, in the doc -> ts direction. The document says which
  // builder source it was generated from; if that file has changed since,
  // regenerating it would throw away an edit nobody has seen. That is the same
  // dirty-both state the watcher detects in the other direction, and it gets
  // the same answer: refuse, and let the user choose.
  //
  // A document with no meta.sourceHash has no provenance to check (it was
  // authored outside this loop), so the write proceeds; @keep comments in the
  // existing source still survive it.
  const provenance = doc.meta?.sourceHash;
  if (options.force !== true && previous !== undefined && typeof provenance === "string") {
    const onDisk = `sha256:${sha256Hex(previous)}`;
    if (onDisk !== provenance) {
      throw new PairConflict(
        name,
        `both sides changed: ${name}${TS_SUFFIX} was edited since this document was ` +
          `generated from it, and saving would overwrite that edit`,
      );
    }
  }

  let tsText: string;
  try {
    tsText = codegen(doc, previous === undefined ? {} : { previous });
  } catch (err) {
    throw new BridgeError(
      422,
      `Cannot generate ${name}${TS_SUFFIX} from this document: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const text = serializeWithMeta(doc, `sha256:${sha256Hex(tsText)}`);

  await writeFile(tsPath, tsText, "utf8");
  await writeFile(docPath, text, "utf8");
  watcher?.noteWrite(name, { tsContent: tsText, docContent: text });

  return { name, doc: JSON.parse(text) as FlowDoc, text, docPath, tsPath, tsText };
}

/** The FlowDoc the builder file synths to right now. */
export async function synthPair(dir: string, name: string): Promise<FlowDoc> {
  const { tsPath } = pairPaths(dir, name);
  const { flows } = await synthFile(tsPath);
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
 * Resolution in the code direction: the builder file wins, so the FlowDoc is
 * rewritten from it. The source is NOT regenerated, because the user chose the
 * source they have; only the doc moves.
 */
export async function adoptCode(
  dir: string,
  name: string,
  watcher?: FlowWatcher,
): Promise<BridgeDocPayload> {
  const { docPath, tsPath } = pairPaths(dir, name);
  const tsText = await readFile(tsPath, "utf8").catch(() => {
    throw new BridgeError(404, `No builder file named "${name}${TS_SUFFIX}" in ${resolve(dir)}.`);
  });
  const doc = await synthPair(dir, name);
  const text = serializeWithMeta(doc, `sha256:${sha256Hex(tsText)}`);
  await writeFile(docPath, text, "utf8");
  watcher?.noteWrite(name, { tsContent: tsText, docContent: text });
  return { name, doc: JSON.parse(text) as FlowDoc, text };
}

/** One document whose builder file was written by ensureBuilderFiles. */
export interface GeneratedBuilderFile {
  name: string;
  tsPath: string;
  /** Exact bytes written, so the caller can seed a watcher's ledger. */
  tsText: string;
  docText: string;
}

/** One document ensureBuilderFiles could not generate a builder file for. */
export interface UnbuildableDoc {
  name: string;
  message: string;
}

export interface EnsureBuilderFilesResult {
  generated: GeneratedBuilderFile[];
  problems: UnbuildableDoc[];
}

/**
 * Writes `<name>.flow.ts` for every document in `dir` that has none.
 *
 * A directory holding only FlowDocs (an export from a live instance, a doc
 * copied out of conformance/, a file a colleague sent) had no builder file, so
 * the loop the studio is built around - edit the builder file, watch the canvas
 * follow - could not start there: there was nothing to edit. Generating the
 * file on open is safe because codegen is deterministic and the studio already
 * regenerates it on every canvas save, so this writes exactly the bytes the
 * first save would have written.
 *
 * It goes through writePair, which also stamps the document with the
 * meta.sourceHash of the source just generated. Without that stamp the watcher
 * would meet a pair it has never seen in sync and report a conflict on the
 * first edit, which is the state a hand-assembled pair lands in. The bytes
 * come back so the caller can hand them to the watcher's noteWrite as well:
 * the stamp alone leaves the outcome resting on the initial scan winning a
 * race against the user's first edit.
 *
 * A document that cannot be generated from (invalid, or holding something
 * codegen cannot express) is reported and skipped, not thrown: the rest of the
 * directory still opens.
 */
export async function ensureBuilderFiles(dir: string): Promise<EnsureBuilderFilesResult> {
  const generated: GeneratedBuilderFile[] = [];
  const problems: UnbuildableDoc[] = [];

  for (const name of await listDocNames(dir)) {
    const { tsPath } = pairPaths(dir, name);
    if (existsSync(tsPath)) continue;
    try {
      const { doc } = await readPair(dir, name);
      const written = await writePair(dir, name, doc);
      generated.push({ name, tsPath, tsText: written.tsText, docText: written.text });
    } catch (err) {
      problems.push({ name, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { generated, problems };
}
