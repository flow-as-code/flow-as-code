/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Watch engine: keeps <name>.flow.ts and <name>.flowdoc.json pairs in sync
// inside one directory. A library, not a command: the studio server (A11)
// consumes these events, and `flow-cli studio` will sit on top.
//
// Sync direction here is ts -> doc only. On a ts change the file is re-synthed
// in the same sandboxed child process `flow-cli synth` uses, and the FlowDoc
// is rewritten UNLESS the doc on disk was edited by someone else since this
// watcher last wrote or observed it AND that edit does not carry the
// sourceHash of the previous ts content. That state is dirty-both: the
// watcher emits "conflict" and writes nothing. Never silently overwrite
// (docs/01-flowdoc-spec.md, invariants 3 and the sourceHash dirty guard).
//
// One event is emitted for a change that alters nothing: a builder file edited
// back to the exact bytes of the last successful sync, after a failed one.
// Consumers latch "error" (the studio keeps a badge up until the document syncs
// again), so a state that ends by being undone has to end with a "synced" or
// the badge outlives the condition it reports.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { watch as chokidarWatch, type FSWatcher } from "chokidar";

import type { FlowDoc } from "@flow-as-code/core";
import { serializeWithMeta, synthFile } from "./synth.js";

const TS_SUFFIX = ".flow.ts";
const DOC_SUFFIX = ".flowdoc.json";

export interface SyncedEvent {
  tsPath: string;
  docPath: string;
  name: string;
}

export interface ConflictEvent {
  tsPath: string;
  docPath: string;
  name: string;
  reason: string;
}

export interface ErrorEvent {
  path: string;
  message: string;
}

export interface WatcherEvents {
  synced: SyncedEvent;
  conflict: ConflictEvent;
  error: ErrorEvent;
  /** Initial scan finished and every startup synth settled. Not part of the
   * A04 event contract; a convenience for consumers and tests. */
  ready: Record<string, never>;
}

export interface FlowWatcher {
  on<K extends keyof WatcherEvents>(event: K, listener: (payload: WatcherEvents[K]) => void): this;
  off<K extends keyof WatcherEvents>(event: K, listener: (payload: WatcherEvents[K]) => void): this;
  once<K extends keyof WatcherEvents>(
    event: K,
    listener: (payload: WatcherEvents[K]) => void,
  ): this;
  /**
   * Records a pair another part of this process just wrote as the clean
   * baseline, so the watcher recognizes the write as its own instead of
   * treating it as an external edit.
   *
   * The studio bridge (A11) writes both halves of a pair when the canvas
   * saves: the FlowDoc and the regenerated builder source. Without this the
   * watcher would see a ts change whose doc "changed externally" and emit a
   * conflict for an edit the same process just made.
   *
   * Pass the exact bytes written. Call it AFTER both files are on disk:
   * chokidar's awaitWriteFinish window (50 ms) is orders of magnitude longer
   * than the gap between the writes and this call, so no event can be routed
   * against a half-updated ledger. Contents that are not passed leave that
   * half of the ledger alone.
   */
  noteWrite(name: string, contents: { tsContent?: string; docContent?: string }): void;
  close(): Promise<void>;
}

/** Per-pair sync ledger. Hashes are hex sha256 of file bytes. */
interface LedgerEntry {
  /** Bytes of the doc as last written by us or observed in a clean state. */
  lastDocHash?: string;
  /** Bytes of the ts content those doc bytes were synthed from / seen with. */
  lastTsHash?: string;
  /**
   * The last change to this pair's builder file ended in an `error` event, so
   * consumers are still showing the pair as out of sync. Only then does a
   * change back to the last-synced bytes deserve a `synced`: see the no-op
   * branch in handleTsChange.
   */
  errored?: boolean;
}

function hashHex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class Watcher implements FlowWatcher {
  private readonly listeners = new Map<keyof WatcherEvents, Set<(payload: never) => void>>();
  private readonly ledger = new Map<string, LedgerEntry>();
  /** Per-pair task chain so two changes to one pair never synth concurrently. */
  private readonly chains = new Map<string, Promise<void>>();
  private readonly fsWatcher: FSWatcher;
  private readonly dir: string;
  private closed = false;

  constructor(dir: string) {
    this.dir = resolve(dir);
    // chokidar v5 takes no globs: watch the directory, filter paths here.
    // awaitWriteFinish debounces editors' partial/atomic writes; the
    // thresholds are far below the 1 second sync budget.
    this.fsWatcher = chokidarWatch(this.dir, {
      ignoreInitial: false,
      depth: 0,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
    });
    this.fsWatcher.on("add", (path) => this.route(path));
    this.fsWatcher.on("change", (path) => this.route(path));
    this.fsWatcher.on("error", (err) => {
      this.emit("error", {
        path: this.dir,
        message: err instanceof Error ? err.message : String(err),
      });
    });
    this.fsWatcher.on("ready", () => {
      // Let the initial adds settle before declaring readiness.
      void this.settled().then(() => {
        if (!this.closed) this.emit("ready", {});
      });
    });
  }

  on<K extends keyof WatcherEvents>(event: K, listener: (payload: WatcherEvents[K]) => void) {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return this;
  }

  off<K extends keyof WatcherEvents>(event: K, listener: (payload: WatcherEvents[K]) => void) {
    this.listeners.get(event)?.delete(listener as (payload: never) => void);
    return this;
  }

  once<K extends keyof WatcherEvents>(event: K, listener: (payload: WatcherEvents[K]) => void) {
    const wrapped = (payload: WatcherEvents[K]) => {
      this.off(event, wrapped);
      listener(payload);
    };
    return this.on(event, wrapped);
  }

  noteWrite(name: string, contents: { tsContent?: string; docContent?: string }): void {
    const entry = this.entry(name);
    if (contents.tsContent !== undefined) entry.lastTsHash = hashHex(contents.tsContent);
    if (contents.docContent !== undefined) entry.lastDocHash = hashHex(contents.docContent);
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.fsWatcher.close();
    await this.settled();
  }

  private emit<K extends keyof WatcherEvents>(event: K, payload: WatcherEvents[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      (listener as (p: WatcherEvents[K]) => void)(payload);
    }
  }

  private settled(): Promise<void> {
    return Promise.all([...this.chains.values()]).then(() => undefined);
  }

  private route(path: string): void {
    const file = basename(path);
    let name: string | undefined;
    if (file.endsWith(TS_SUFFIX)) name = file.slice(0, -TS_SUFFIX.length);
    else if (file.endsWith(DOC_SUFFIX)) name = file.slice(0, -DOC_SUFFIX.length);
    if (name === undefined || name === "") return;
    this.enqueue(name, file.endsWith(TS_SUFFIX));
  }

  private enqueue(name: string, tsChanged: boolean): void {
    const prev = this.chains.get(name) ?? Promise.resolve();
    const next = prev.then(() =>
      tsChanged ? this.handleTsChange(name) : this.handleDocChange(name),
    );
    // Keep the chain alive even if a handler slips an exception through.
    this.chains.set(
      name,
      next.catch((e: unknown) => {
        this.emit("error", {
          path: join(this.dir, name + TS_SUFFIX),
          message: e instanceof Error ? e.message : String(e),
        });
      }),
    );
  }

  private entry(name: string): LedgerEntry {
    let e = this.ledger.get(name);
    if (e === undefined) {
      e = {};
      this.ledger.set(name, e);
    }
    return e;
  }

  /**
   * A doc file appeared or changed. Our own writes echo back here and are
   * recognized by hash; anything else is an external edit. The ledger keeps
   * the last CLEAN state, so an external edit deliberately does not update
   * it: the divergence is detected on the next ts change.
   */
  private async handleDocChange(name: string): Promise<void> {
    const entry = this.entry(name);
    const docPath = join(this.dir, name + DOC_SUFFIX);
    let bytes: Buffer;
    try {
      bytes = await readFile(docPath);
    } catch {
      return; // deleted between event and read; the next ts change re-creates it
    }
    const docHash = hashHex(bytes);
    if (entry.lastDocHash === undefined) {
      // First observation of this doc (startup scan or a doc that appeared
      // before its ts): record it as the observed baseline.
      entry.lastDocHash = docHash;
    }
    // Otherwise: external edit (or our own echo, which matches lastDocHash
    // and needs nothing). Leave the ledger pointing at the clean state.
  }

  private async handleTsChange(name: string): Promise<void> {
    if (this.closed) return;
    const entry = this.entry(name);
    const tsPath = join(this.dir, name + TS_SUFFIX);
    const docPath = join(this.dir, name + DOC_SUFFIX);

    let tsBytes: Buffer;
    try {
      tsBytes = await readFile(tsPath);
    } catch {
      return; // deleted between event and read
    }
    const tsHash = hashHex(tsBytes);
    if (tsHash === entry.lastTsHash) {
      // Normally an echo of our own write, or a touch: nothing to say. But it
      // is also how a broken edit gets undone. Ctrl+Z back to the bytes we last
      // synced from produces no synth and no event, so a consumer that latched
      // the preceding `error` (the studio's "Code out of sync" badge) kept
      // showing it until some unrelated edit happened. The doc on disk is still
      // the one these bytes produced, so the pair IS in sync: say so.
      if (entry.errored === true) {
        entry.errored = false;
        this.emit("synced", { tsPath, docPath, name });
      }
      return;
    }

    // Read the doc side to run the dirty guard.
    let docBytes: Buffer | undefined;
    try {
      docBytes = await readFile(docPath);
    } catch {
      docBytes = undefined;
    }

    if (docBytes !== undefined) {
      const docHash = hashHex(docBytes);
      const docSourceHash = readSourceHash(docBytes);

      if (entry.lastTsHash === undefined) {
        // First look at this ts while a doc already exists (startup scan, or
        // a pair dirty since startup). If the doc carries this ts content's
        // hash the pair is in sync: baseline it without a synth. Anything
        // else is dirty in an unknowable direction, so surface it instead of
        // overwriting. Deliberately independent of lastDocHash: chokidar's
        // initial add order (ts before doc or doc before ts) must not change
        // the outcome.
        if (docSourceHash === `sha256:${tsHash}`) {
          entry.lastDocHash = docHash;
          entry.lastTsHash = tsHash;
          return;
        }
        this.emit("conflict", {
          tsPath,
          docPath,
          name,
          reason:
            "doc exists but its meta.sourceHash does not match the ts content, and this " +
            "watcher has not seen the pair in sync; run `flow-cli synth` explicitly or " +
            "remove the stale side",
        });
        return;
      }

      const docChangedExternally = entry.lastDocHash !== undefined && docHash !== entry.lastDocHash;
      if (docChangedExternally && docSourceHash !== `sha256:${entry.lastTsHash}`) {
        // Dirty-both: the doc was edited externally (studio or hand edit)
        // AND the ts changed. Never silently overwrite either side.
        this.emit("conflict", {
          tsPath,
          docPath,
          name,
          reason:
            "both sides changed: the flowdoc was edited since the last sync " +
            "and the ts file changed too; resolve manually and re-save one side",
        });
        return;
      }
    }

    // Clean (or doc missing): re-synth in the sandboxed child and write.
    try {
      const { flows, sourceHash } = await synthFile(tsPath);
      const doc = pickDoc(flows, name);
      if (doc === undefined) {
        entry.errored = true;
        this.emit("error", {
          path: tsPath,
          message:
            `${basename(tsPath)} exports ${flows.length} flows and none is named "${name}"; ` +
            `the watcher pairs ${name}${TS_SUFFIX} with ${name}${DOC_SUFFIX} by name`,
        });
        return;
      }
      const outBytes = serializeWithMeta(doc, sourceHash);
      await writeFile(docPath, outBytes, "utf8");
      entry.lastDocHash = hashHex(outBytes);
      entry.lastTsHash = tsHash;
      entry.errored = false;
      this.emit("synced", { tsPath, docPath, name });
    } catch (e) {
      entry.errored = true;
      this.emit("error", { path: tsPath, message: e instanceof Error ? e.message : String(e) });
    }
  }
}

/**
 * The flow whose name matches the file base name, else a lone export. Exported
 * so the studio bridge pairs a builder file with its FlowDoc by exactly the
 * rule the watcher uses, rather than a second one that could disagree.
 */
export function pickDoc(
  flows: { name: string; doc: FlowDoc }[],
  name: string,
): FlowDoc | undefined {
  const named = flows.find((f) => f.name === name);
  if (named !== undefined) return named.doc;
  const only = flows.length === 1 ? flows[0] : undefined;
  return only?.doc;
}

function readSourceHash(docBytes: Buffer): string | undefined {
  try {
    const doc = JSON.parse(docBytes.toString("utf8")) as FlowDoc;
    const hash = doc.meta?.sourceHash;
    return typeof hash === "string" ? hash : undefined;
  } catch {
    return undefined; // unparseable doc counts as an external edit with no provenance
  }
}

/**
 * Watches `dir` (non-recursive) and keeps every <name>.flow.ts /
 * <name>.flowdoc.json pair in sync, ts -> doc, with the sourceHash dirty
 * guard described at the top of this file.
 */
export function createWatcher(dir: string): FlowWatcher {
  return new Watcher(dir);
}
