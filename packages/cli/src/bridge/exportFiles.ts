/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Writing a studio export to disk (POST /bridge/export).
//
// The studio computes the bytes: it holds the documents, the address map, and
// the resource map, and it runs the same emitters the CLI runs
// (@flow-as-code/tf, the @flow-as-code/cdk scaffold, @flow-as-code/core
// materialization). All that is left here is the half a browser cannot do,
// and it is deliberately dumb: check, then write.
//
// The checks are the same ones every other bridge path gets. Paths are
// validated by the shared protocol rule and then, independently, by resolving
// them and requiring the result to be inside the served directory: the first
// check states the rule, the second is what actually holds if the rule is ever
// loosened. Nothing is sanitized into shape, because a sanitizer is a guess
// about intent and this writes files the user owns.
//
// Unlike a document write this publishes no event and pairs nothing: emitted
// terraform and CDK files are outputs, not documents, and the watch engine
// ignores them (it pairs *.flow.ts with *.flowdoc.json only).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { BridgeError } from "./pair.js";
import {
  EXPORT_MAX_BYTES,
  EXPORT_MAX_FILES,
  EXPORT_TARGETS,
  isExportPath,
  isExportSubdir,
  type BridgeExportRequest,
  type BridgeExportResult,
  type ExportTarget,
} from "./protocol.js";

const TARGETS = new Set<string>(EXPORT_TARGETS);

/**
 * The absolute path an export file lands on, or undefined when it would leave
 * the served directory. Containment is checked against `dir` itself rather
 * than against `dir/subdir`, so neither half can escape on its own.
 */
export function exportPathFor(dir: string, subdir: string, relative: string): string | undefined {
  const base = resolve(dir);
  const target = resolve(base, subdir, relative);
  return target !== base && target.startsWith(base + sep) ? target : undefined;
}

/** Validates a request body from the wire. Throws BridgeError with a status. */
export function checkExportRequest(body: unknown): BridgeExportRequest {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new BridgeError(400, "The body must be a JSON object.");
  }
  const request = body as Partial<BridgeExportRequest>;
  if (typeof request.target !== "string" || !TARGETS.has(request.target)) {
    throw new BridgeError(400, `"target" must be one of: ${[...TARGETS].sort().join(", ")}.`);
  }
  const subdir = request.subdir ?? "";
  if (typeof subdir !== "string" || !isExportSubdir(subdir)) {
    throw new BridgeError(400, `"${subdir}" is not a usable export subdirectory.`);
  }
  const files = request.files;
  if (files === null || typeof files !== "object" || Array.isArray(files)) {
    throw new BridgeError(400, '"files" must be a JSON object of path to content.');
  }

  const entries = Object.entries(files as Record<string, unknown>);
  if (entries.length === 0) throw new BridgeError(400, "An export must carry at least one file.");
  if (entries.length > EXPORT_MAX_FILES) {
    throw new BridgeError(413, `An export may carry at most ${String(EXPORT_MAX_FILES)} files.`);
  }

  let bytes = 0;
  for (const [path, content] of entries) {
    if (typeof content !== "string") {
      throw new BridgeError(400, `The content of "${path}" is not a string.`);
    }
    if (!isExportPath(path)) {
      throw new BridgeError(400, `"${path}" is not a usable export path.`);
    }
    bytes += Buffer.byteLength(content, "utf8");
  }
  if (bytes > EXPORT_MAX_BYTES) {
    throw new BridgeError(413, `An export may carry at most ${String(EXPORT_MAX_BYTES)} bytes.`);
  }

  return { target: request.target as ExportTarget, files: files as Record<string, string>, subdir };
}

/**
 * Writes a checked export under `dir`, creating directories as needed, and
 * returns the absolute paths written, sorted. Existing files are overwritten
 * and nothing else is touched, exactly as `flow-cli emit` behaves.
 */
export async function writeExport(
  dir: string,
  request: BridgeExportRequest,
): Promise<BridgeExportResult> {
  const subdir = request.subdir ?? "";
  const written: string[] = [];
  for (const [relative, content] of Object.entries(request.files).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const target = exportPathFor(dir, subdir, relative);
    if (target === undefined) {
      throw new BridgeError(400, `"${relative}" resolves outside the served directory.`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    written.push(target);
  }
  return { target: request.target, paths: written };
}
