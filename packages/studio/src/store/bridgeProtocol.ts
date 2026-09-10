/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The `flow-cli studio` bridge protocol: the whole contract between the local
// server (packages/cli/src/bridge/server.ts) and the studio's BridgeStore
// (packages/studio/src/store/bridgeStore.ts).
//
// This file exists twice, byte for byte, once in each package. The studio does
// not depend on @flow-as-code/cli (which depends on the studio, for its built
// assets), so importing across would make the dependency circular. The copy is
// only safe while it is provably a copy: packages/cli/src/bridge/
// protocol.test.ts fails if the two files differ by a single byte, the same
// arrangement src/schema.test.ts uses for the packaged FlowDoc schema.
//
// Transport notes that belong to the contract, not to either implementation:
//
//   - Everything is JSON over plain HTTP on 127.0.0.1. No websocket library
//     and no EventSource: the event stream is a long poll, which needs nothing
//     but fetch, behaves identically in a browser and in a node test, and
//     cannot half-close the way a streamed response can.
//   - The client holds one GET /bridge/events?cursor=<seq> open at a time. The
//     server answers immediately when it already has events past the cursor,
//     and otherwise parks the request until one arrives or the poll times out
//     with an empty batch. The client then re-polls from the returned cursor,
//     so no event can be missed between two polls.
//   - Every document is addressed by NAME, never by path. A name is a
//     @flow-as-code/core slug; the server refuses anything else, which is also what
//     keeps ".." out of the file paths it builds.

import type { FlowDoc } from "@flow-as-code/core";
import { SLUG_PATTERN } from "@flow-as-code/core";

/** Bumped when a change to this file is not backwards compatible. */
export const BRIDGE_PROTOCOL = 1;

/** Every bridge route lives under this prefix; everything else is an asset. */
export const BRIDGE_PREFIX = "/bridge";

/**
 * The global the server injects into the served index.html. Its presence is
 * how the studio knows it is being served by the bridge rather than opened as
 * a static build, so the app never has to speculatively probe for a server
 * that is not there.
 */
export const BRIDGE_GLOBAL = "__FLOW_STUDIO_BRIDGE__";

/**
 * Per-session secret proving a request came from the page flow-cli opened.
 *
 * Binding to loopback keeps the network out but not the developer's own
 * browser: any site they visit can send this server a CORS-simple POST. A page
 * cannot read the URL of a document it did not open, so it cannot learn this,
 * which is what separates the studio from any other tab.
 */
export const TOKEN_PARAM = "token";
export const TOKEN_HEADER = "x-flow-studio-token";

/** The file suffixes the bridge pairs, matching the A04 watch engine. */
export const DOC_SUFFIX = ".flowdoc.json";
export const TS_SUFFIX = ".flow.ts";

/** What the bridge says about itself. Injected, and served at /bridge/info. */
export interface BridgeInfo {
  protocol: number;
  /** Absolute path of the served directory, for the toolbar. */
  dir: string;
  /** Short label for the toolbar (the directory's base name). */
  label: string;
  /** Session token; every bridge API request must present it. */
  token: string;
}

export interface BridgeDocRef {
  name: string;
}

export interface BridgeDocList {
  docs: BridgeDocRef[];
}

/** A document as it exists on disk right now. `text` is the exact file bytes. */
export interface BridgeDocPayload {
  name: string;
  doc: FlowDoc;
  text: string;
}

/** PUT /bridge/docs/<name> */
export interface BridgeWriteRequest {
  doc: FlowDoc;
  /**
   * Write even though the builder file no longer matches the doc's
   * meta.sourceHash. This is the user answering the conflict dialog with "keep
   * the canvas version", and it is the ONLY thing that may set it: a write
   * that sets it by default would be the silent overwrite the dirty guard
   * exists to prevent.
   */
  force?: boolean;
}

/** What a successful write wrote, both halves of the pair. */
export interface BridgeWriteResult extends BridgeDocPayload {
  docPath: string;
  tsPath: string;
  /** The regenerated builder source. */
  tsText: string;
}

/** Which side of a conflict the user chose: the FlowDoc or the builder code. */
export type ConflictSide = "doc" | "code";

/** POST /bridge/docs/<name>/resolve */
export interface BridgeResolveRequest {
  side: ConflictSide;
}

/**
 * Both sides of a dirty-both pair, so the studio can show the diff and ask.
 * Either side can be null when it cannot be read (unparseable JSON, a builder
 * file that throws); the matching *Error says why, and the UI must then offer
 * only the side it has.
 */
export interface BridgeConflict {
  name: string;
  /** The sentence describing what diverged, from whichever side noticed. */
  reason: string;
  /**
   * Where the canvas side lives, which decides how the choice is applied.
   *
   *   "disk"   both sides are files: the watcher found the pair diverged.
   *            Either choice is a POST to /resolve.
   *   "canvas" the canvas side is the unsaved document in the studio (a write
   *            the bridge refused, or a builder-file edit arriving while the
   *            canvas had unsaved changes). Keeping it is a forced write of
   *            that document, which only the studio holds.
   */
  origin: "disk" | "canvas";
  /** Absolute paths, when the side that raised the conflict knows them. */
  docPath?: string;
  tsPath?: string;
  /** The canvas side: the FlowDoc on disk, or the one the studio holds. */
  docSide: FlowDoc | null;
  /** The FlowDoc the builder file synths to right now. */
  codeSide: FlowDoc | null;
  docError?: string;
  codeError?: string;
}

/**
 * The A04 watch engine's three events, enriched with the payload the studio
 * needs: "synced" carries the new document so the canvas can hot-reload
 * without a second request, and "conflict" carries both sides.
 */
export type BridgeEvent =
  | ({ seq: number; kind: "synced" } & BridgeDocPayload)
  | ({ seq: number; kind: "conflict" } & BridgeConflict)
  | { seq: number; kind: "error"; name?: string; path: string; message: string };

export interface BridgeEventBatch {
  /** Highest seq in this batch, or the cursor unchanged when it is empty. */
  cursor: number;
  events: BridgeEvent[];
}

/** Every non-2xx response body. */
export interface BridgeErrorBody {
  error: string;
  /** Set on the 409 a write gets while the pair is in conflict. */
  conflict?: BridgeConflict;
}

/** The export targets, the same three `flow-cli emit` and `render` produce. */
export const EXPORT_TARGETS = ["cdk", "raw", "tf"] as const;
export type ExportTarget = (typeof EXPORT_TARGETS)[number];

/**
 * POST /bridge/export: the studio has emitted a file map and the CLI writes
 * it, because the browser cannot and the bridge is the only thing here that
 * touches disk. The studio computes the bytes (it holds the documents and the
 * address or resource map); the server only checks and writes them.
 *
 * Deliberately not a document write: nothing is paired, nothing is synced, no
 * event is published, and existing files are overwritten in place exactly as
 * `flow-cli emit` overwrites them.
 */
export interface BridgeExportRequest {
  target: ExportTarget;
  /**
   * Relative POSIX path to file content, each path satisfying isExportPath and
   * taken relative to `subdir`.
   */
  files: Record<string, string>;
  /**
   * Subdirectory of the served directory to write into. Absent or "" writes to
   * its root, which is where `flow-cli emit` writes with no --out.
   */
  subdir?: string;
}

export interface BridgeExportResult {
  target: ExportTarget;
  /** Absolute paths written, sorted. */
  paths: string[];
}

/** Most files an export may carry, and the most bytes across all of them. */
export const EXPORT_MAX_FILES = 200;
export const EXPORT_MAX_BYTES = 4 * 1024 * 1024;

/**
 * One path segment of an export path: printable, no separator, no traversal,
 * and never a dotfile. Anything else is refused rather than sanitized, because
 * a sanitizer is a guess about intent and this writes files the user owns.
 */
const EXPORT_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/** Deepest an export path may nest, counting the file itself. */
const EXPORT_MAX_DEPTH = 4;

function exportSegments(path: string, maxDepth: number): string[] | undefined {
  if (path === "" || path.length > 200 || path.includes("\0") || path.includes("\\")) {
    return undefined;
  }
  const segments = path.split("/");
  if (segments.length > maxDepth) return undefined;
  return segments.every((s) => EXPORT_SEGMENT.test(s)) ? segments : undefined;
}

/** `flows.tf`, `flows/support-line.flow.tftpl`: relative, POSIX, no traversal. */
export function isExportPath(path: string): boolean {
  return exportSegments(path, EXPORT_MAX_DEPTH) !== undefined;
}

/** A destination subdirectory: the same rule, and "" for the served root. */
export function isExportSubdir(subdir: string): boolean {
  return subdir === "" || exportSegments(subdir, EXPORT_MAX_DEPTH - 1) !== undefined;
}

/** Documents are addressed by @flow-as-code/core slug, which is also the path guard. */
export function isBridgeDocName(name: string): boolean {
  return SLUG_PATTERN.test(name);
}

export function infoUrl(base: string): string {
  return `${base}${BRIDGE_PREFIX}/info`;
}

export function docsUrl(base: string): string {
  return `${base}${BRIDGE_PREFIX}/docs`;
}

export function docUrl(base: string, name: string): string {
  return `${docsUrl(base)}/${encodeURIComponent(name)}`;
}

export function resolveUrl(base: string, name: string): string {
  return `${docUrl(base, name)}/resolve`;
}

export function eventsUrl(base: string, cursor: number): string {
  return `${base}${BRIDGE_PREFIX}/events?cursor=${String(cursor)}`;
}

export function exportUrl(base: string): string {
  return `${base}${BRIDGE_PREFIX}/export`;
}

/** Type guard for the injected global, used by the studio at boot. */
export function readBridgeInfo(scope: unknown): BridgeInfo | undefined {
  if (scope === null || typeof scope !== "object") return undefined;
  const value = (scope as Record<string, unknown>)[BRIDGE_GLOBAL];
  if (value === null || typeof value !== "object") return undefined;
  const info = value as Partial<BridgeInfo>;
  if (info.protocol !== BRIDGE_PROTOCOL) return undefined;
  if (typeof info.token !== "string" || info.token === "") return undefined;
  if (typeof info.dir !== "string" || typeof info.label !== "string") return undefined;
  return { protocol: info.protocol, dir: info.dir, label: info.label, token: info.token };
}

/**
 * The script tag the server injects into index.html. "<" is escaped so a
 * directory name containing "</script>" cannot close the tag it sits in;
 * JSON.stringify handles the rest, and the result is still valid JSON.
 */
export function bridgeBootScript(info: BridgeInfo): string {
  const json = JSON.stringify(info).replace(/</g, "\\u003c");
  return `<script>window.${BRIDGE_GLOBAL} = ${json};</script>`;
}
