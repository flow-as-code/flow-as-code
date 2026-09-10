/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The DocStore over the `flow-cli studio` bridge (src/store/bridgeProtocol.ts).
//
// This is the store the app uses when it was served by `flow-cli studio`: the
// browser cannot write files, so every write is a PUT and the CLI does the
// writing, generating the paired <name>.flow.ts from the same FlowDoc. Reads
// and writes are same-origin requests to that local process and nothing else;
// the studio still makes no outbound network calls (CLAUDE.md, local-first).
//
// Two rules this file has to keep:
//
//   1. assertSaveable runs here, before the request, exactly as it runs in
//      MemoryStore.write and DirectoryStore.write. The gate belongs to the
//      write path, and a store that skipped it would be a hole in it. The
//      server validates independently, because a gate that only exists in one
//      process is a gate an attacker (or a bug) walks around.
//   2. A conflict is not an error to swallow. A write refused with 409 throws
//      BridgeConflictError carrying both sides, which is what the studio turns
//      into the "which side wins" dialog. Never merge, never retry, never pick.

import type { FlowDoc } from "@flow-as-code/core";
import { assertSaveable, parseFlowDoc } from "../model/validate.js";
import {
  TOKEN_HEADER,
  docUrl,
  docsUrl,
  eventsUrl,
  exportUrl,
  infoUrl,
  readBridgeInfo,
  resolveUrl,
  BRIDGE_GLOBAL,
  type BridgeConflict,
  type BridgeDocList,
  type BridgeDocPayload,
  type BridgeErrorBody,
  type BridgeEvent,
  type BridgeEventBatch,
  type BridgeExportRequest,
  type BridgeExportResult,
  type BridgeInfo,
  type ConflictSide,
} from "./bridgeProtocol.js";
import type { DocRef, DocStore } from "./types.js";

/** The slice of Response this store uses; both DOM and node fetch satisfy it. */
export interface BridgeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export interface BridgeRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type BridgeFetch = (url: string, init?: BridgeRequestInit) => Promise<BridgeResponse>;

/** Thrown by write() when the bridge refuses because the pair is dirty both sides. */
export class BridgeConflictError extends Error {
  readonly conflict: BridgeConflict;

  constructor(conflict: BridgeConflict, message: string) {
    super(message);
    this.name = "BridgeConflictError";
    this.conflict = conflict;
  }
}

export interface BridgeStoreOptions {
  /** Origin prefix. Empty (the default) means same-origin relative URLs. */
  base?: string;
  fetch?: BridgeFetch;
  /** Backoff after a failed poll; shortened in tests. */
  retryMs?: number;
  /**
   * Pause after a poll that returned nothing. The server parks a poll for
   * about 25 seconds, so this normally costs nothing; it exists so a server
   * that answers empty immediately (one that is restarting, or a stub) cannot
   * turn the loop into a busy wait.
   */
  idleMs?: number;
}

function defaultFetch(): BridgeFetch {
  if (typeof fetch !== "function") {
    throw new Error("This environment has no fetch; the studio bridge needs one.");
  }
  // Called through a wrapper, never stored bare: the store invokes it as
  // `this.fetch(...)`, and a browser's fetch is a WebIDL operation that checks
  // its receiver. With a BridgeStore as `this`, Firefox throws "'fetch' called
  // on an object that does not implement interface Window" and Chrome throws
  // "Illegal invocation". Node's fetch does not check, so only a browser saw
  // it. https://webidl.spec.whatwg.org/#dfn-create-operation-function
  return (url, init) => fetch(url, init);
}

export class BridgeStore implements DocStore {
  readonly persistent = true;
  readonly readOnly = false;
  readonly label: string;
  readonly info: BridgeInfo;
  private readonly base: string;
  private readonly fetch: BridgeFetch;
  private readonly retryMs: number;
  private readonly idleMs: number;

  constructor(info: BridgeInfo, options: BridgeStoreOptions = {}) {
    this.info = info;
    this.label = info.label;
    this.base = options.base ?? "";
    this.fetch = options.fetch ?? defaultFetch();
    this.retryMs = options.retryMs ?? 1000;
    this.idleMs = options.idleMs ?? 25;
  }

  private async request<T>(url: string, init?: BridgeRequestInit): Promise<T> {
    // Every bridge call carries the session token. It goes in a header rather
    // than the query string so it stays out of any log or Referer, and because
    // a custom header is not a CORS-simple request: a cross-origin page cannot
    // send one without a preflight, which this server never approves.
    const response = await this.fetch(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), [TOKEN_HEADER]: this.info.token },
    });
    const text = await response.text();
    if (!response.ok) throw this.failure(response.status, text);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`The studio bridge answered ${url} with something that is not JSON.`);
    }
  }

  /** Turns an error response into the most specific error we can raise. */
  private failure(status: number, text: string): Error {
    let body: BridgeErrorBody | undefined;
    try {
      body = JSON.parse(text) as BridgeErrorBody;
    } catch {
      body = undefined;
    }
    const message = body?.error ?? `The studio bridge answered ${String(status)}.`;
    if (status === 409 && body?.conflict !== undefined) {
      return new BridgeConflictError(body.conflict, message);
    }
    return new Error(message);
  }

  async list(): Promise<DocRef[]> {
    const body = await this.request<BridgeDocList>(docsUrl(this.base));
    return body.docs.map((d) => ({ name: d.name }));
  }

  async read(name: string): Promise<{ doc: FlowDoc; text: string }> {
    const payload = await this.request<BridgeDocPayload>(docUrl(this.base, name));
    // Parsed from the file text, not from the pre-parsed doc, so the studio
    // holds exactly what is on disk and applies the same schema check every
    // other read path applies.
    return { doc: parseFlowDoc(payload.text), text: payload.text };
  }

  /**
   * `force` is the user answering the conflict dialog with "keep the canvas
   * version"; without it the bridge refuses a write whose builder file has
   * moved. It is optional here rather than in DocStore because only the bridge
   * has a second side that can move.
   */
  async write(name: string, doc: FlowDoc, options: { force?: boolean } = {}): Promise<void> {
    assertSaveable(doc);
    await this.request<BridgeDocPayload>(docUrl(this.base, name), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(options.force === true ? { doc, force: true } : { doc }),
    });
  }

  /**
   * Writes an export target's file map through the bridge, which is the only
   * thing that touches disk. The bytes are already gated: they come from
   * src/export/targets.ts, which runs assertSaveable on every document before
   * emitting anything, and the server checks every path again on its side.
   */
  async postExport(request: BridgeExportRequest): Promise<BridgeExportResult> {
    return this.request<BridgeExportResult>(exportUrl(this.base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  /** Ends a conflict by choosing the FlowDoc side or the builder-code side. */
  async resolve(name: string, side: ConflictSide): Promise<BridgeDocPayload> {
    const payload = await this.request<BridgeDocPayload>(resolveUrl(this.base, name), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ side }),
    });
    return { ...payload, doc: parseFlowDoc(payload.text) };
  }

  /**
   * Long-polls the event stream until the returned function is called. One
   * request is in flight at a time and the next starts from the cursor the
   * last one returned, so an event published between two polls is still
   * delivered rather than missed.
   */
  subscribe(
    onEvent: (event: BridgeEvent) => void,
    onError?: (message: string) => void,
  ): () => void {
    const controller = new AbortController();
    let cursor = 0;

    const loop = async (): Promise<void> => {
      while (!controller.signal.aborted) {
        try {
          const batch = await this.request<BridgeEventBatch>(eventsUrl(this.base, cursor), {
            signal: controller.signal,
          });
          cursor = batch.cursor;
          for (const event of batch.events) {
            if (controller.signal.aborted) return;
            onEvent(event);
          }
          // A batch with events is drained immediately; an empty one means the
          // poll timed out (or the server answered early), and re-issuing it
          // with no pause at all would be a busy loop.
          if (batch.events.length === 0) await this.pause(this.idleMs, controller.signal);
        } catch (err) {
          if (controller.signal.aborted) return;
          onError?.(err instanceof Error ? err.message : String(err));
          // The server may be restarting; keep trying rather than going quiet.
          await this.pause(this.retryMs, controller.signal);
        }
      }
    };
    void loop();
    return () => controller.abort();
  }

  /** setTimeout that gives up as soon as the subscription is cancelled. */
  private pause(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolveP) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolveP();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolveP();
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

/**
 * The bridge that served this page, or undefined when the app is a plain
 * static build. The server injects the description into index.html, so this is
 * a synchronous read of a global rather than a speculative request to a server
 * that may not exist (bridgeProtocol.ts, BRIDGE_GLOBAL).
 */
export function servedByBridge(scope: unknown = globalThis): BridgeInfo | undefined {
  return readBridgeInfo(scope);
}

/** The store for the serving bridge, or undefined when there is none. */
export function createBridgeStore(
  scope: unknown = globalThis,
  options: BridgeStoreOptions = {},
): BridgeStore | undefined {
  const info = servedByBridge(scope);
  return info === undefined ? undefined : new BridgeStore(info, options);
}

/** Asks a bridge to describe itself. Used by tests and by manual diagnosis. */
export async function fetchBridgeInfo(base: string, fetchImpl?: BridgeFetch): Promise<BridgeInfo> {
  const impl = fetchImpl ?? defaultFetch();
  const response = await impl(infoUrl(base));
  if (!response.ok) throw new Error(`No studio bridge at ${base}.`);
  const info = readBridgeInfo({ [BRIDGE_GLOBAL]: JSON.parse(await response.text()) });
  if (info === undefined) throw new Error(`${base} answered, but not with a bridge description.`);
  return info;
}
