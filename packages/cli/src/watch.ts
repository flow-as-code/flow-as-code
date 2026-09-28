/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Watch engine: keeps each <name>.flowdoc.json in sync with its companion,
// <name>.flow.ts or <name>.flow.tf, inside one directory. A library, not a
// command: the studio server (A11) consumes these events, and `flow-cli
// studio` sits on top.
//
// Sync direction here is companion -> doc only. On a change a .flow.ts is
// re-synthed in the same sandboxed child process `flow-cli synth` uses, and a
// .flow.tf is parsed in this process (HCL is read, never run), and the FlowDoc
// is rewritten UNLESS the doc on disk was edited by someone else since this
// watcher last wrote or observed it AND that edit does not carry the
// sourceHash of the previous companion content. That state is dirty-both: the
// watcher emits "conflict" and writes nothing. Never silently overwrite
// (docs/01-flowdoc-spec.md, invariants 3 and the sourceHash dirty guard). A
// name with both a .flow.ts and a .flow.tf is ambiguous: an "error", and no
// write, until one of them goes.
//
// One event is emitted for a change that alters nothing: a companion edited
// back to the exact bytes of the last successful sync, after a failed one.
// Consumers latch "error" (the studio keeps a badge up until the document syncs
// again), so a state that ends by being undone has to end with a "synced" or
// the badge outlives the condition it reports.

import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { watch as chokidarWatch, type FSWatcher } from "chokidar";

import type { FlowDoc, SourceKind } from "@flow-as-code/core";
import { TF_SUFFIX, TS_SUFFIX, kindOfPath, readTfCompanion, suffixOf } from "./companion.js";
import { serializeWithMeta, synthFile } from "./synth.js";

const DOC_SUFFIX = ".flowdoc.json";

export interface SyncedEvent {
  /** The companion the document was synced from. */
  sourcePath: string;
  sourceKind: SourceKind;
  docPath: string;
  name: string;
  /**
   * What reading a .flow.tf noticed without refusing it: a refs key no action
   * uses, a resource address read as its key. Absent when there is nothing.
   */
  warnings?: string[];
}

export interface ConflictEvent {
  sourcePath: string;
  sourceKind: SourceKind;
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
   * saves: the FlowDoc and the regenerated companion. Without this the
   * watcher would see a companion change whose doc "changed externally" and
   * emit a conflict for an edit the same process just made.
   *
   * Pass the exact bytes written. Call it AFTER both files are on disk:
   * chokidar's awaitWriteFinish window (50 ms) is orders of magnitude longer
   * than the gap between the writes and this call, so no event can be routed
   * against a half-updated ledger. Contents that are not passed leave that
   * half of the ledger alone.
   */
  noteWrite(name: string, contents: { sourceContent?: string; docContent?: string }): void;
  close(): Promise<void>;
}

/** Per-pair sync ledger. Hashes are hex sha256 of file bytes. */
interface LedgerEntry {
  /** Bytes of the doc as last written by us or observed in a clean state. */
  lastDocHash?: string;
  /** Bytes of the companion those doc bytes were synced from / seen with. */
  lastSourceHash?: string;
  /**
   * The last change to this pair's companion ended in an `error` event, so
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
    // Removing one of two companions ends an ambiguity; the one that remains
    // is then the document's source and is read as if it had just changed.
    this.fsWatcher.on("unlink", (path) => this.routeRemoval(path));
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

  noteWrite(name: string, contents: { sourceContent?: string; docContent?: string }): void {
    const entry = this.entry(name);
    if (contents.sourceContent !== undefined) {
      entry.lastSourceHash = hashHex(contents.sourceContent);
    }
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
    const kind = kindOfPath(file);
    let name: string | undefined;
    if (kind !== undefined) name = file.slice(0, -suffixOf(kind).length);
    else if (file.endsWith(DOC_SUFFIX)) name = file.slice(0, -DOC_SUFFIX.length);
    if (name === undefined || name === "") return;
    this.enqueue(name, kind);
  }

  private routeRemoval(path: string): void {
    const file = basename(path);
    const kind = kindOfPath(file);
    if (kind === undefined) return;
    const name = file.slice(0, -suffixOf(kind).length);
    if (name === "") return;
    const other: SourceKind = kind === "ts" ? "tf" : "ts";
    void exists(join(this.dir, name + suffixOf(other))).then((survives) => {
      if (survives && !this.closed) this.enqueue(name, other);
    });
  }

  private enqueue(name: string, kind: SourceKind | undefined): void {
    const prev = this.chains.get(name) ?? Promise.resolve();
    const next = prev.then(() =>
      kind !== undefined ? this.handleSourceChange(name, kind) : this.handleDocChange(name),
    );
    // Keep the chain alive even if a handler slips an exception through.
    this.chains.set(
      name,
      next.catch((e: unknown) => {
        this.emit("error", {
          path: join(this.dir, name + suffixOf(kind ?? "ts")),
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
      return; // deleted between event and read; the next companion change re-creates it
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

  /** The FlowDoc a companion reads to, and what reading it noticed. */
  private async read(
    name: string,
    kind: SourceKind,
    sourcePath: string,
    bytes: Buffer,
  ): Promise<{ doc: FlowDoc; warnings: string[] } | { error: string }> {
    if (kind === "tf") {
      const { doc, warnings } = readTfCompanion(bytes.toString("utf8"), sourcePath);
      if (doc.name !== name) {
        return {
          error:
            `${basename(sourcePath)} holds "${doc.name}"; the watcher pairs ` +
            `${name}${TF_SUFFIX} with ${name}${DOC_SUFFIX} by name`,
        };
      }
      return { doc, warnings };
    }
    const { flows } = await synthFile(sourcePath);
    const doc = pickDoc(flows, name);
    if (doc === undefined) {
      return {
        error:
          `${basename(sourcePath)} exports ${flows.length} flows and none is named "${name}"; ` +
          `the watcher pairs ${name}${TS_SUFFIX} with ${name}${DOC_SUFFIX} by name`,
      };
    }
    return { doc, warnings: [] };
  }

  private async handleSourceChange(name: string, kind: SourceKind): Promise<void> {
    if (this.closed) return;
    const entry = this.entry(name);
    const sourcePath = join(this.dir, name + suffixOf(kind));
    const docPath = join(this.dir, name + DOC_SUFFIX);

    let sourceBytes: Buffer;
    try {
      sourceBytes = await readFile(sourcePath);
    } catch {
      return; // deleted between event and read
    }
    const other: SourceKind = kind === "ts" ? "tf" : "ts";
    const otherPath = join(this.dir, name + suffixOf(other));
    if (await exists(otherPath)) {
      // One companion per document. Syncing from either would let whichever
      // was saved last decide the document, so neither does.
      entry.errored = true;
      this.emit("error", {
        path: sourcePath,
        message:
          `both ${name}${TS_SUFFIX} and ${name}${TF_SUFFIX} exist; a document has one ` +
          "companion, so neither is synced until one of them is removed",
      });
      return;
    }
    const sourceHash = hashHex(sourceBytes);
    if (sourceHash === entry.lastSourceHash) {
      // Normally an echo of our own write, or a touch: nothing to say. But it
      // is also how a broken edit gets undone. Ctrl+Z back to the bytes we last
      // synced from produces no sync and no event, so a consumer that latched
      // the preceding `error` (the studio's "Code out of sync" badge) kept
      // showing it until some unrelated edit happened. The doc on disk is still
      // the one these bytes produced, so the pair IS in sync: say so.
      if (entry.errored === true) {
        entry.errored = false;
        this.emit("synced", { sourcePath, sourceKind: kind, docPath, name });
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

      if (entry.lastSourceHash === undefined) {
        // First look at this companion while a doc already exists (startup
        // scan, or a pair dirty since startup). If the doc carries this
        // content's hash the pair is in sync: baseline it without a sync.
        // Anything else is dirty in an unknowable direction, so surface it
        // instead of overwriting. Deliberately independent of lastDocHash:
        // chokidar's initial add order (companion before doc or doc before
        // companion) must not change the outcome.
        if (docSourceHash === `sha256:${sourceHash}`) {
          entry.lastDocHash = docHash;
          entry.lastSourceHash = sourceHash;
          return;
        }
        this.emit("conflict", {
          sourcePath,
          sourceKind: kind,
          docPath,
          name,
          reason:
            "doc exists but its meta.sourceHash does not match the companion's content, and " +
            "this watcher has not seen the pair in sync; run `flow-cli synth` explicitly or " +
            "remove the stale side",
        });
        return;
      }

      if (docSourceHash === `sha256:${sourceHash}`) {
        // The document already describes exactly this companion content: a
        // tool that wrote both (flow-cli convert or codegen) got here first.
        // Nothing to write, but the document may be new to consumers.
        entry.lastDocHash = docHash;
        entry.lastSourceHash = sourceHash;
        entry.errored = false;
        this.emit("synced", { sourcePath, sourceKind: kind, docPath, name });
        return;
      }

      const docChangedExternally = entry.lastDocHash !== undefined && docHash !== entry.lastDocHash;
      if (docChangedExternally && docSourceHash !== `sha256:${entry.lastSourceHash}`) {
        // Dirty-both: the doc was edited externally (studio or hand edit)
        // AND the companion changed. Never silently overwrite either side.
        this.emit("conflict", {
          sourcePath,
          sourceKind: kind,
          docPath,
          name,
          reason:
            "both sides changed: the flowdoc was edited since the last sync " +
            `and ${basename(sourcePath)} changed too; resolve manually and re-save one side`,
        });
        return;
      }
    }

    // Clean (or doc missing): read the companion and write the doc.
    try {
      const read = await this.read(name, kind, sourcePath, sourceBytes);
      if ("error" in read) {
        entry.errored = true;
        this.emit("error", { path: sourcePath, message: read.error });
        return;
      }
      const outBytes = serializeWithMeta(read.doc, `sha256:${sourceHash}`, kind);
      await writeFile(docPath, outBytes, "utf8");
      entry.lastDocHash = hashHex(outBytes);
      entry.lastSourceHash = sourceHash;
      entry.errored = false;
      this.emit("synced", {
        sourcePath,
        sourceKind: kind,
        docPath,
        name,
        ...(read.warnings.length > 0 ? { warnings: read.warnings } : {}),
      });
    } catch (e) {
      entry.errored = true;
      this.emit("error", { path: sourcePath, message: e instanceof Error ? e.message : String(e) });
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
 * Watches `dir` (non-recursive) and keeps every <name>.flowdoc.json in sync
 * with its <name>.flow.ts or <name>.flow.tf, companion -> doc, with the
 * sourceHash dirty guard described at the top of this file.
 */
export function createWatcher(dir: string): FlowWatcher {
  return new Watcher(dir);
}
