/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// BridgeStore against a stub bridge. The real server is exercised from
// packages/cli/src/bridge/server.test.ts, which drives THIS class over a
// socket; what is pinned here is the behaviour that must hold whatever the
// server says: the save gate runs before the request, a 409 becomes a
// conflict rather than an error line, and the poll loop advances its cursor.

import { serialize, type FlowDoc } from "@flow-as-code/core";
import { describe, expect, it, vi } from "vitest";
import type { BridgeEvent, BridgeInfo } from "../src/store/bridgeProtocol.js";
import { BRIDGE_PROTOCOL } from "../src/store/bridgeProtocol.js";
import {
  BridgeConflictError,
  BridgeStore,
  fetchBridgeInfo,
  type BridgeFetch,
  type BridgeRequestInit,
} from "../src/store/bridgeStore.js";
import { demoDoc } from "./helpers.js";

const INFO: BridgeInfo = {
  protocol: BRIDGE_PROTOCOL,
  dir: "/tmp/flows",
  label: "flows",
  token: "test-token",
};
const NAME = "appointment-line";

interface Call {
  url: string;
  init?: BridgeRequestInit;
}

interface Reply {
  status?: number;
  body: unknown;
}

/** A fetch that answers from a table and records every call. */
function stub(routes: (call: Call) => Reply | Promise<Reply>): {
  fetch: BridgeFetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl: BridgeFetch = async (url, init) => {
    calls.push({ url, init });
    const reply = await routes({ url, init });
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(reply.body)),
    };
  };
  return { fetch: fetchImpl, calls };
}

function store(routes: (call: Call) => Reply | Promise<Reply>) {
  const s = stub(routes);
  return {
    store: new BridgeStore(INFO, { base: "", fetch: s.fetch, retryMs: 1, idleMs: 1 }),
    calls: s.calls,
  };
}

/**
 * A fetch that behaves like a browser's: a WebIDL operation refuses any
 * receiver other than the global. Node's fetch never checks, so a store that
 * captured the bare function and called it as `this.fetch(...)` passed every
 * test here and failed in every browser (Firefox: "'fetch' called on an object
 * that does not implement interface Window"; Chrome: "Illegal invocation").
 */
function withBrowserLikeFetch<T>(body: unknown, run: () => Promise<T>): Promise<T> {
  const previous = globalThis.fetch;
  const strict = function (this: unknown, ...args: Parameters<typeof fetch>) {
    if (this !== undefined && this !== globalThis) {
      return Promise.reject(
        new TypeError("'fetch' called on an object that does not implement interface Window."),
      );
    }
    void args;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
  globalThis.fetch = strict as unknown as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = previous;
  });
}

describe("BridgeStore", () => {
  it("uses the global fetch without it as the receiver, as a browser requires", async () => {
    await withBrowserLikeFetch({ docs: [{ name: NAME }] }, async () => {
      const s = new BridgeStore(INFO, { base: "", retryMs: 1, idleMs: 1 });
      await expect(s.list()).resolves.toEqual([{ name: NAME }]);
    });
    await withBrowserLikeFetch(INFO, async () => {
      await expect(fetchBridgeInfo("")).resolves.toEqual(INFO);
    });
  });

  it("lists and reads through the bridge, parsing the file text", async () => {
    const text = serialize(demoDoc());
    const { store: s, calls } = store(({ url }) =>
      url.endsWith("/bridge/docs")
        ? { body: { docs: [{ name: NAME }] } }
        : { body: { name: NAME, doc: JSON.parse(text) as FlowDoc, text } },
    );
    expect(await s.list()).toEqual([{ name: NAME }]);
    const read = await s.read(NAME);
    expect(read.text).toBe(text);
    expect(serialize(read.doc)).toBe(text);
    expect(calls.map((c) => c.url)).toEqual(["/bridge/docs", `/bridge/docs/${NAME}`]);
  });

  it("refuses a document that is not a FlowDoc, rather than putting it on the canvas", async () => {
    const { store: s } = store(() => ({ body: { name: NAME, doc: {}, text: '{"nope":true}' } }));
    await expect(s.read(NAME)).rejects.toThrow(/Not a FlowDoc/);
  });

  it("runs the save gate before the request, not after", async () => {
    const { store: s, calls } = store(() => ({ body: {} }));
    const doc = demoDoc();
    doc.content.Actions.find((a) => a.Identifier === "welcome")!.Parameters.Text =
      "arn:aws:connect:us-east-1:123456789012:instance/abc";
    await expect(s.write(NAME, doc)).rejects.toThrow(/no-literal-arn/);
    // The point of the gate is that the bytes never leave.
    expect(calls).toHaveLength(0);
  });

  it("PUTs the document and only sends force when asked", async () => {
    const bodies: unknown[] = [];
    const { store: s } = store(({ init }) => {
      bodies.push(JSON.parse(init?.body ?? "{}"));
      return { body: { name: NAME, doc: demoDoc(), text: serialize(demoDoc()) } };
    });
    await s.write(NAME, demoDoc());
    await s.write(NAME, demoDoc(), { force: true });
    expect((bodies[0] as { force?: boolean }).force).toBeUndefined();
    expect((bodies[1] as { force?: boolean }).force).toBe(true);
  });

  it("turns a 409 into a conflict carrying both sides", async () => {
    const conflict = {
      name: NAME,
      reason: "both sides changed",
      origin: "canvas" as const,
      docSide: demoDoc(),
      codeSide: demoDoc(),
    };
    const { store: s } = store(() => ({
      status: 409,
      body: { error: "changed on both sides", conflict },
    }));
    const error = await s.write(NAME, demoDoc()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BridgeConflictError);
    expect((error as BridgeConflictError).conflict.reason).toBe("both sides changed");
  });

  it("reports a plain failure as its message, not as a conflict", async () => {
    const { store: s } = store(() => ({ status: 422, body: { error: "not a valid FlowDoc" } }));
    const error = await s.write(NAME, demoDoc()).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(BridgeConflictError);
    expect((error as Error).message).toBe("not a valid FlowDoc");
  });

  it("posts the chosen side to resolve", async () => {
    const { store: s, calls } = store(() => ({
      body: { name: NAME, doc: demoDoc(), text: serialize(demoDoc()) },
    }));
    await s.resolve(NAME, "code");
    expect(calls[0]?.url).toBe(`/bridge/docs/${NAME}/resolve`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]?.init?.body ?? "{}")).toEqual({ side: "code" });
  });

  it("polls from the cursor the last batch returned, and stops when unsubscribed", async () => {
    const seen: BridgeEvent[] = [];
    const cursors: string[] = [];
    let batch = 0;
    const { store: s } = store(({ url }) => {
      cursors.push(new URL(url, "http://x").searchParams.get("cursor") ?? "");
      batch += 1;
      if (batch === 1) {
        return {
          body: {
            cursor: 7,
            events: [{ seq: 7, kind: "error", path: "a.flow.ts", message: "boom" }],
          },
        };
      }
      return { body: { cursor: 7, events: [] } };
    });

    const stop = s.subscribe((event) => seen.push(event));
    await vi.waitFor(() => expect(cursors.length).toBeGreaterThan(1));
    stop();
    const after = cursors.length;
    expect(seen).toHaveLength(1);
    // The first poll starts at 0; every later one resumes where it left off,
    // which is what makes an event published between two polls still arrive.
    expect(cursors[0]).toBe("0");
    expect(cursors[1]).toBe("7");
    // Nothing is polled after unsubscribing. One in-flight request may still
    // land, so the tolerance is one, not zero.
    await new Promise((r) => setTimeout(r, 30));
    expect(cursors.length).toBeLessThanOrEqual(after + 1);
  });

  it("reports a failing poll and keeps trying", async () => {
    const problems: string[] = [];
    let attempts = 0;
    const { store: s } = store(() => {
      attempts += 1;
      return attempts < 3
        ? { status: 500, body: { error: "bridge restarting" } }
        : { body: { cursor: 0, events: [] } };
    });
    const stop = s.subscribe(
      () => {},
      (message) => problems.push(message),
    );
    await vi.waitFor(() => expect(attempts).toBeGreaterThanOrEqual(3));
    stop();
    expect(problems[0]).toContain("bridge restarting");
  });
});
