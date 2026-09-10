/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The `flow-cli studio` local bridge: static studio assets plus the small JSON
// API in ./protocol.ts, over node:http and nothing else.
//
// Local-first is a hard rule (CLAUDE.md), so the shape of this server is
// deliberate:
//
//   - It binds 127.0.0.1 and only 127.0.0.1. Never 0.0.0.0, never a LAN
//     address: this process writes files the user owns, and a bridge reachable
//     from the network is a remote file writer. The bind address is not
//     configurable for that reason.
//   - It also checks the Host header, because binding the loopback interface
//     is not by itself protection against DNS rebinding: a page on the public
//     internet can resolve its own hostname to 127.0.0.1 and post to this
//     port. A request whose Host is not localhost is refused.
//   - Every API request must present the session token, and requests carrying
//     a foreign Origin or Sec-Fetch-Site are refused. Withholding CORS headers
//     is NOT sufficient on its own: it stops a cross-origin page reading the
//     reply, but a write does not need the reply. See forgery.test.ts.
//   - No CORS headers are ever sent, so a cross-origin page cannot read a
//     response even if it manages to send a request.
//   - It serves files from ONE directory (the studio's built dist) and every
//     resolved path is checked to be inside it. Documents are addressed by
//     slug, never by path.
//   - It makes no outbound connections of any kind.
//
// Writes are the reason the bridge exists: the studio is a browser page and
// cannot write files, so a canvas save is a PUT and this process generates the
// paired builder source and writes both halves (./pair.ts). The A04 watch
// engine covers the other direction and its events are relayed to the studio
// on the long-poll stream.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";

import { createWatcher, type FlowWatcher } from "../watch.js";
import type { FlowDoc } from "@flow-as-code/core";

import {
  BRIDGE_PREFIX,
  TOKEN_HEADER,
  TOKEN_PARAM,
  BRIDGE_PROTOCOL,
  TS_SUFFIX,
  bridgeBootScript,
  type BridgeConflict,
  type BridgeDocPayload,
  type BridgeEvent,
  type BridgeEventBatch,
  type BridgeInfo,
  type BridgeResolveRequest,
  type BridgeWriteRequest,
  isBridgeDocName,
} from "./protocol.js";
import { checkExportRequest, writeExport } from "./exportFiles.js";
import {
  BridgeError,
  PairConflict,
  adoptCode,
  ensureBuilderFiles,
  listDocNames,
  pairPaths,
  readPair,
  synthPair,
  writePair,
  type EnsureBuilderFilesResult,
} from "./pair.js";

/**
 * A bridge event before it is published. Distributive by hand: `Omit` over a
 * union keeps only the keys every member shares, which would erase the payload
 * of all three event kinds.
 */
type Unsequenced<T> = T extends { seq: number } ? Omit<T, "seq"> : never;
export type PendingEvent = Unsequenced<BridgeEvent>;

/** The one address this server may bind. See the note at the top of the file. */
export const BRIDGE_HOST = "127.0.0.1";

/** Hosts the Host header may name, port aside. */
const ALLOWED_HOSTS = new Set([BRIDGE_HOST, "localhost", "[::1]", "::1"]);

/** A parked event poll answers with an empty batch after this long. */
const DEFAULT_POLL_TIMEOUT_MS = 25_000;

/** Bodies larger than this are refused unread. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Events kept for clients that are between polls. */
const EVENT_BUFFER = 500;

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export interface StudioServerOptions {
  /** Directory of FlowDocs and builder files to serve. */
  dir: string;
  /**
   * Directory of built studio assets. Omitted, the bridge serves the API only,
   * which is what the tests use and what a `vite dev` session would proxy to.
   */
  assetsDir?: string;
  /** 0 (the default) picks a free port. */
  port?: number;
  /** Watch `dir` for builder-file edits. Default true. */
  watch?: boolean;
  /**
   * Write the missing `<name>.flow.ts` for every document in `dir` before
   * serving it, so a directory of FlowDocs alone can start the edit-the-code
   * loop. Default false; `flow-cli studio` turns it on. See ensureBuilderFiles.
   */
  ensurePairs?: boolean;
  /** Shortened in tests; the default is a normal long-poll timeout. */
  pollTimeoutMs?: number;
  /** Fixed session token. Tests pin it; production generates one per run. */
  token?: string;
  /** Called for every published event, so the command can log a line. */
  onEvent?: (event: BridgeEvent) => void;
}

export interface StudioServer {
  readonly url: string;
  /** Session token embedded in `url`; every bridge API call must present it. */
  readonly token: string;
  readonly host: string;
  readonly port: number;
  readonly dir: string;
  /** What `ensurePairs` wrote and what it could not write. Empty when off. */
  readonly prepared: EnsureBuilderFilesResult;
  /** The underlying server, for tests that assert the bound address. */
  readonly server: Server;
  close(): Promise<void>;
}

interface ParkedPoll {
  cursor: number;
  respond: (batch: BridgeEventBatch) => void;
  timer: NodeJS.Timeout;
}

class Bridge {
  private readonly events: BridgeEvent[] = [];
  private readonly parked = new Set<ParkedPoll>();
  /** Unresolved dirty-both pairs, by document name. Writes are refused here. */
  private readonly conflicts = new Map<string, BridgeConflict>();
  /** Per-name task chain, so two conflicts for one pair never synth at once. */
  private readonly chains = new Map<string, Promise<void>>();
  private seq = 0;
  private closed = false;

  constructor(
    readonly dir: string,
    readonly assetsDir: string | undefined,
    private readonly pollTimeoutMs: number,
    private readonly watcher: FlowWatcher | undefined,
    private readonly onEvent: ((event: BridgeEvent) => void) | undefined,
  ) {
    watcher?.on("synced", ({ name }) => this.enqueue(name, () => this.onSynced(name)));
    watcher?.on("conflict", ({ name, reason }) =>
      this.enqueue(name, () => this.onConflict(name, reason)),
    );
    watcher?.on("error", ({ path, message }) => {
      this.publish({ kind: "error", name: docNameOf(path), path, message });
    });
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /** Adds an event and wakes every parked poll. */
  publish(event: PendingEvent): BridgeEvent {
    const full = { ...event, seq: ++this.seq } as BridgeEvent;
    this.events.push(full);
    if (this.events.length > EVENT_BUFFER) this.events.splice(0, this.events.length - EVENT_BUFFER);
    this.onEvent?.(full);
    for (const poll of [...this.parked]) this.answer(poll);
    return full;
  }

  private since(cursor: number): BridgeEvent[] {
    return this.events.filter((e) => e.seq > cursor);
  }

  private answer(poll: ParkedPoll): void {
    this.parked.delete(poll);
    clearTimeout(poll.timer);
    const events = this.since(poll.cursor);
    poll.respond({ cursor: events.at(-1)?.seq ?? poll.cursor, events });
  }

  poll(cursor: number, respond: (batch: BridgeEventBatch) => void): void {
    const ready = this.since(cursor);
    if (ready.length > 0 || this.closed) {
      respond({ cursor: ready.at(-1)?.seq ?? cursor, events: ready });
      return;
    }
    const poll: ParkedPoll = {
      cursor,
      respond,
      timer: setTimeout(() => this.answer(poll), this.pollTimeoutMs),
    };
    // A parked poll must not keep the process alive on its own.
    poll.timer.unref();
    this.parked.add(poll);
  }

  /** Serializes work per document name, mirroring the watcher's own chain. */
  private enqueue(name: string, work: () => Promise<void>): void {
    const prev = this.chains.get(name) ?? Promise.resolve();
    this.chains.set(
      name,
      prev.then(work).catch((err: unknown) => {
        this.publish({
          kind: "error",
          name,
          path: name,
          message: err instanceof Error ? err.message : String(err),
        });
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Watcher relay
  // -------------------------------------------------------------------------

  private async onSynced(name: string): Promise<void> {
    // A pair that just synced is no longer in conflict, however it got there:
    // the studio resolved it, or the user fixed the files by hand.
    this.conflicts.delete(name);
    const payload = await readPair(this.dir, name);
    this.publish({ kind: "synced", ...payload });
  }

  private async onConflict(name: string, reason: string): Promise<void> {
    await this.raiseConflict(name, reason);
  }

  /**
   * Turns "both sides changed" into something a user can decide: the canvas
   * side beside the FlowDoc the builder file synths to now. Neither file is
   * touched, and the pair is frozen (writes answer 409) until it is resolved.
   *
   * `attempted` is the document a refused write was carrying. When it is
   * given, the canvas side lives in the studio rather than on disk, which is
   * what origin says and what decides how the choice is applied.
   */
  async raiseConflict(name: string, reason: string, attempted?: FlowDoc): Promise<BridgeConflict> {
    const { docPath, tsPath } = pairPaths(this.dir, name);
    const conflict: BridgeConflict = {
      name,
      reason,
      origin: attempted === undefined ? "disk" : "canvas",
      docPath,
      tsPath,
      docSide: attempted ?? null,
      codeSide: null,
    };
    if (attempted === undefined) {
      try {
        conflict.docSide = (await readPair(this.dir, name)).doc;
      } catch (err) {
        conflict.docError = err instanceof Error ? err.message : String(err);
      }
    }
    try {
      conflict.codeSide = await synthPair(this.dir, name);
    } catch (err) {
      conflict.codeError = err instanceof Error ? err.message : String(err);
    }
    this.conflicts.set(name, conflict);
    this.publish({ kind: "conflict", ...conflict });
    return conflict;
  }

  conflictFor(name: string): BridgeConflict | undefined {
    return this.conflicts.get(name);
  }

  clearConflict(name: string): void {
    this.conflicts.delete(name);
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const poll of [...this.parked]) this.answer(poll);
    await this.watcher?.close();
    await Promise.all([...this.chains.values()]);
  }
}

/** The document name a route segment carries. A bad escape is a 400, not a 500. */
function decodeName(segment: string): string {
  const name = decodePathSegment(segment);
  if (name === undefined) {
    throw new BridgeError(400, "That document name is not valid percent-encoding.");
  }
  return name;
}

/** The document name a watcher path belongs to, when it names one. */
function docNameOf(path: string): string | undefined {
  const file = basename(path);
  for (const suffix of [".flow.ts", ".flowdoc.json"]) {
    if (file.endsWith(suffix)) {
      const name = file.slice(0, -suffix.length);
      return isBridgeDocName(name) ? name : undefined;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(text)),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(text);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

/** Reads a JSON request body, refusing anything oversized or malformed. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveP, rejectP) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let refused = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Past the cap nothing more is kept, so memory stays bounded whatever
        // the client sends. The refusal waits for the end of the upload rather
        // than interrupting it: answering mid-body and destroying the request
        // takes the socket down with it, and the client sees a connection
        // reset ("fetch failed") instead of the 413 this is trying to say.
        refused = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", rejectP);
    req.on("end", () => {
      if (refused) {
        rejectP(new BridgeError(413, "Request body is too large."));
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        resolveP(JSON.parse(text));
      } catch (err) {
        rejectP(
          new BridgeError(400, `Body is not JSON: ${err instanceof Error ? err.message : "?"}`),
        );
      }
    });
  });
}

/** True when the Host header names this machine. Anti-DNS-rebinding. */
/** Case-insensitive single header value, or undefined. */
function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** Constant-time compare that does not leak length through early return. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** 256 bits from the CSPRNG. Never logged except as part of the URL. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hostHeaderAllowed(host: string | undefined): boolean {
  if (host === undefined) return false;
  // Strip the port, keeping a bracketed IPv6 literal intact.
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return name !== undefined && ALLOWED_HOSTS.has(name);
}

/**
 * Where an asset request points: the absolute path, or the status the refusal
 * deserves. The two failures are not the same thing and must not answer the
 * same way. A request the client mis-encoded is a 400 (it can be fixed by
 * asking differently); a well-formed path that leaves the asset root is a 403
 * (it cannot). Collapsing them was a real bug: decodeURIComponent throws a
 * URIError on a truncated escape such as "/%E0%A4%A", which left this function
 * uncaught and surfaced as 500 "URI malformed", reporting our own fault for
 * the client's mistake.
 */
export type AssetTarget =
  { ok: true; path: string } | { ok: false; status: 400 | 403; message: string };

/**
 * The URL parser has already collapsed "." and ".." segments, and the
 * containment check below catches whatever survives that (an encoded
 * separator, a symlinked name, a Windows drive letter).
 */
export function assetPathFor(root: string, pathname: string): AssetTarget {
  const decoded = decodePathSegment(pathname);
  if (decoded === undefined) {
    return { ok: false, status: 400, message: "That path is not valid percent-encoding." };
  }
  if (decoded.includes("\0")) {
    return { ok: false, status: 400, message: "That path contains a NUL byte." };
  }
  const target = resolve(root, `.${decoded.startsWith("/") ? decoded : `/${decoded}`}`);
  const base = resolve(root);
  if (target !== base && !target.startsWith(base + sep)) {
    return { ok: false, status: 403, message: "That path is outside the served directory." };
  }
  return { ok: true, path: target };
}

/**
 * Percent-decodes one piece of a request path, or undefined when the escaping
 * is malformed. Every decodeURIComponent in this file goes through here:
 * unguarded it throws a URIError, and a URIError reaching the router is a 500
 * for what is really a bad request.
 */
export function decodePathSegment(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

class Router {
  constructor(
    private readonly bridge: Bridge,
    private readonly info: BridgeInfo,
    private readonly watcher: FlowWatcher | undefined,
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!hostHeaderAllowed(req.headers.host)) {
      sendError(res, 403, "This bridge only answers requests addressed to localhost.");
      return;
    }
    const url = new URL(req.url ?? "/", `http://${BRIDGE_HOST}`);
    const method = req.method ?? "GET";

    // Binding to 127.0.0.1 keeps the network out; it does NOT keep the
    // developer's own browser out. Any page they visit while the studio runs
    // can send a CORS-simple POST here, and this server writes files into a
    // directory whose .flow.ts files `flow-cli synth` later executes. Refusing
    // to send CORS headers only stops the attacker READING the reply, which is
    // no defence at all against a write. See SECURITY.md.
    const denial = this.rejectForgedRequest(req, url);
    if (denial !== undefined) {
      sendError(res, 403, denial);
      return;
    }

    if (url.pathname === BRIDGE_PREFIX || url.pathname.startsWith(`${BRIDGE_PREFIX}/`)) {
      try {
        await this.api(method, url, req, res);
      } catch (err) {
        if (err instanceof BridgeError) sendError(res, err.status, err.message);
        else sendError(res, 500, err instanceof Error ? err.message : String(err));
      }
      return;
    }
    await this.asset(method, url, res);
  }

  /**
   * Why a request is refused, or undefined when it may proceed.
   *
   * Three independent checks, because each covers a case the others miss:
   *  - the session token, which a cross-origin page cannot read because it
   *    cannot read the URL of a document it did not open;
   *  - Sec-Fetch-Site, which browsers set and script cannot forge;
   *  - Origin, which is present on every cross-origin request that matters.
   */
  private rejectForgedRequest(req: IncomingMessage, url: URL): string | undefined {
    const method = req.method ?? "GET";
    const isApi = url.pathname === BRIDGE_PREFIX || url.pathname.startsWith(`${BRIDGE_PREFIX}/`);
    const isDocument = url.pathname === "/" || url.pathname === "/index.html";

    // A top-level navigation is how the studio gets opened: from the terminal
    // (Sec-Fetch-Site: none), from a link in a web page, a chat client, or a
    // browser extension (cross-site), or from a page on another local port
    // (same-site). Refusing those turned the printed URL into a JSON error
    // everywhere but the address bar. A navigation may proceed whatever its
    // site: assets are static, and the page that opened the document cannot
    // read it or script it. The document itself still needs the token, below.
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Dest
    const isNavigation =
      !isApi &&
      (method === "GET" || method === "HEAD") &&
      header(req, "sec-fetch-mode") === "navigate" &&
      header(req, "sec-fetch-dest") === "document";

    const site = header(req, "sec-fetch-site");
    if (site !== undefined && site !== "same-origin" && site !== "none" && !isNavigation) {
      return "This bridge does not answer cross-site requests.";
    }

    const origin = header(req, "origin");
    if (origin !== undefined && !this.isOwnOrigin(origin)) {
      return "This bridge does not answer requests from another origin.";
    }

    // Subresources are readable without a token so the token never has to
    // appear in an asset URL. The document is not: index.html carries the
    // bridge description, token included, in its boot script (injectBoot), so
    // serving it to a bare navigation would hand the token to any page that
    // opened a tab on this port. Neither is the bridge API.
    if (!isApi && !isDocument) return undefined;

    const presented = url.searchParams.get(TOKEN_PARAM) ?? header(req, TOKEN_HEADER);
    if (presented === undefined || presented === null || !safeEqual(presented, this.info.token)) {
      return "Missing or invalid bridge token. Open the URL flow-cli printed.";
    }
    return undefined;
  }

  private isOwnOrigin(origin: string): boolean {
    try {
      const host = new URL(origin).hostname;
      return ALLOWED_HOSTS.has(host);
    } catch {
      return false;
    }
  }

  private async api(
    method: string,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const route = url.pathname.slice(BRIDGE_PREFIX.length);

    if (route === "/info" && method === "GET") {
      sendJson(res, 200, this.info);
      return;
    }

    if (route === "/events" && method === "GET") {
      const cursor = Number(url.searchParams.get("cursor") ?? "0");
      this.bridge.poll(Number.isFinite(cursor) && cursor > 0 ? cursor : 0, (batch) => {
        if (!res.writableEnded) sendJson(res, 200, batch);
      });
      return;
    }

    if (route === "/export" && method === "POST") {
      // The studio emitted the files; this writes them. See ./exportFiles.ts.
      const request = checkExportRequest(await readJsonBody(req));
      sendJson(res, 200, await writeExport(this.bridge.dir, request));
      return;
    }

    if (route === "/docs" && method === "GET") {
      sendJson(res, 200, { docs: (await listDocNames(this.bridge.dir)).map((name) => ({ name })) });
      return;
    }

    const docMatch = /^\/docs\/([^/]+)$/.exec(route);
    if (docMatch !== null) {
      const name = decodeName(docMatch[1]!);
      if (method === "GET") {
        sendJson(res, 200, await readPair(this.bridge.dir, name));
        return;
      }
      if (method === "PUT") {
        await this.write(name, req, res);
        return;
      }
    }

    const resolveMatch = /^\/docs\/([^/]+)\/resolve$/.exec(route);
    if (resolveMatch !== null && method === "POST") {
      await this.resolveConflict(decodeName(resolveMatch[1]!), req, res);
      return;
    }

    sendError(res, 404, `No bridge route for ${method} ${url.pathname}.`);
  }

  private async write(name: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = (await readJsonBody(req)) as BridgeWriteRequest;
    if (body === null || typeof body !== "object" || typeof body.doc !== "object") {
      throw new BridgeError(400, 'The body must be a JSON object with a "doc" property.');
    }
    const conflict = this.bridge.conflictFor(name);
    if (conflict !== undefined && body.force !== true) {
      // Never merge silently: until the user picks a side, this pair is frozen.
      // `force` IS the user picking a side, so it is the one write that passes.
      sendJson(res, 409, {
        error:
          `"${name}" changed on both sides since the last sync. Choose which version wins ` +
          `before saving again.`,
        conflict,
      });
      return;
    }
    let written;
    try {
      written = await writePair(this.bridge.dir, name, body.doc, this.watcher, {
        force: body.force === true,
      });
    } catch (err) {
      if (err instanceof PairConflict) {
        // The builder file moved under this document. Freeze the pair and ask.
        const raised = await this.bridge.raiseConflict(name, err.reason, body.doc);
        sendJson(res, 409, {
          error: `Refusing to overwrite ${name}${TS_SUFFIX}: ${err.reason}.`,
          conflict: raised,
        });
        return;
      }
      throw err;
    }
    // A write that got through leaves the pair in sync, so it is no longer in
    // conflict however it got there (a forced write is the user's answer).
    this.bridge.clearConflict(name);
    // Other viewers (a second tab) learn about the save the same way they
    // learn about a builder-file edit.
    this.bridge.publish({
      kind: "synced",
      name: written.name,
      doc: written.doc,
      text: written.text,
    });
    sendJson(res, 200, written);
  }

  private async resolveConflict(
    name: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = (await readJsonBody(req)) as BridgeResolveRequest;
    if (
      body === null ||
      typeof body !== "object" ||
      (body.side !== "doc" && body.side !== "code")
    ) {
      throw new BridgeError(400, 'The body must be {"side":"doc"} or {"side":"code"}.');
    }
    const payload =
      body.side === "code"
        ? await adoptCode(this.bridge.dir, name, this.watcher)
        : await this.adoptDoc(name);
    this.bridge.clearConflict(name);
    this.bridge.publish({ kind: "synced", ...payload });
    sendJson(res, 200, payload);
  }

  /** The FlowDoc wins: regenerate the builder source from it. */
  private async adoptDoc(name: string): Promise<BridgeDocPayload> {
    const current = await readPair(this.bridge.dir, name);
    const written = await writePair(this.bridge.dir, name, current.doc, this.watcher);
    return { name: written.name, doc: written.doc, text: written.text };
  }

  private async asset(method: string, url: URL, res: ServerResponse): Promise<void> {
    const root = this.bridge.assetsDir;
    if (root === undefined) {
      sendError(res, 404, "This bridge serves the API only; the studio assets are not mounted.");
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      sendError(res, 405, `${method} is not allowed for assets.`);
      return;
    }
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const target = assetPathFor(root, pathname);
    if (!target.ok) {
      sendError(res, target.status, target.message);
      return;
    }
    const file = target.path;
    let body: Buffer;
    try {
      if (!(await stat(file)).isFile()) throw new Error("not a file");
      body = await readFile(file);
    } catch {
      sendError(res, 404, `Not found: ${url.pathname}`);
      return;
    }
    // index.html carries the bridge's own description, so the studio knows at
    // boot that it is served by a bridge without probing for one.
    if (basename(file) === "index.html") {
      body = Buffer.from(injectBoot(body.toString("utf8"), this.info), "utf8");
    }
    res.writeHead(200, {
      "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-length": String(body.length),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(method === "HEAD" ? undefined : body);
  }
}

/** Puts the boot script first in <head>, before the app's module script. */
export function injectBoot(html: string, info: BridgeInfo): string {
  const script = bridgeBootScript(info);
  const head = html.indexOf("<head>");
  if (head < 0) return `${script}${html}`;
  return html.slice(0, head + 6) + script + html.slice(head + 6);
}

/**
 * Starts the bridge on 127.0.0.1. Resolves once it is listening, with the URL
 * to open.
 */
export async function startStudioServer(options: StudioServerOptions): Promise<StudioServer> {
  const dir = resolve(options.dir);
  try {
    if (!(await stat(dir)).isDirectory()) {
      throw new BridgeError(400, `${dir} is not a directory.`);
    }
  } catch (err) {
    if (err instanceof BridgeError) throw err;
    throw new BridgeError(400, `No such directory: ${dir}`);
  }

  // Before the watcher exists, so its initial scan sees complete pairs rather
  // than a document whose builder file appears underneath it.
  const prepared: EnsureBuilderFilesResult =
    options.ensurePairs === true ? await ensureBuilderFiles(dir) : { generated: [], problems: [] };

  const watcher = options.watch === false ? undefined : createWatcher(dir);
  // Seed the ledger with the exact bytes just written. The meta.sourceHash
  // stamp would let the watcher recognize the pair as in sync on its own, but
  // only if the initial scan reaches the file before the user's first edit
  // does; telling it outright removes the race.
  for (const { name, tsText, docText } of prepared.generated) {
    watcher?.noteWrite(name, { tsContent: tsText, docContent: docText });
  }
  const bridge = new Bridge(
    dir,
    options.assetsDir === undefined ? undefined : resolve(options.assetsDir),
    options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS,
    watcher,
    options.onEvent,
  );
  const info: BridgeInfo = {
    protocol: BRIDGE_PROTOCOL,
    dir,
    label: basename(dir),
    token: options.token ?? newSessionToken(),
  };
  const router = new Router(bridge, info, watcher);

  const server = createServer((req, res) => {
    void router.handle(req, res).catch(() => {
      if (!res.headersSent) sendError(res, 500, "Internal bridge error.");
      else res.end();
    });
  });

  await new Promise<void>((resolveP, rejectP) => {
    server.once("error", rejectP);
    // The host is fixed: see the note at the top of this file.
    server.listen({ host: BRIDGE_HOST, port: options.port ?? 0 }, () => {
      server.removeListener("error", rejectP);
      resolveP();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  return {
    // The token rides in the URL, which is what makes the page the developer
    // opens distinguishable from every other tab in their browser.
    url: `http://${BRIDGE_HOST}:${String(port)}/?${TOKEN_PARAM}=${info.token}`,
    host: BRIDGE_HOST,
    port,
    token: info.token,
    dir,
    prepared,
    server,
    async close() {
      // Parked polls are open connections, so they are answered before the
      // server is asked to stop; otherwise close() waits for the poll timeout.
      await bridge.close();
      const stopped = new Promise<void>((resolveP) => server.close(() => resolveP()));
      server.closeIdleConnections();
      server.closeAllConnections();
      await stopped;
    },
  };
}
