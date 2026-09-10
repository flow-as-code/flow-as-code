/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A11 acceptance for the studio bridge. The server runs IN PROCESS (no
// subprocess): the assertions here are about routes, files, and events, none
// of which need a terminal.
//
// The studio's own BridgeStore is imported across the package boundary on
// purpose. "The bridge round-trips the document" is a claim about the pair of
// them, and testing the server against a hand-rolled client would leave the
// half the app actually uses untested.
//
// Every wait is event-driven except the one wall-clock assertion the task
// names: a builder-file edit reaches the studio in under a second.

import { request } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { codegen, serialize, type FlowAction, type FlowDoc } from "@flow-as-code/core";
import { afterEach, describe, expect, it } from "vitest";

import { BridgeStore, BridgeConflictError } from "../../../studio/src/store/bridgeStore.js";
import { sha256Hex, synthFile } from "../synth.js";
import { assetPathFor, hostHeaderAllowed, injectBoot, startStudioServer } from "./server.js";
import { writeExport } from "./exportFiles.js";
import type { BridgeConflict, BridgeEvent, BridgeInfo } from "./protocol.js";
import { BRIDGE_PROTOCOL, EXPORT_MAX_BYTES, EXPORT_MAX_FILES, TOKEN_HEADER } from "./protocol.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const pkgRoot = resolve(here, "../..");
const repoRoot = resolve(pkgRoot, "../..");
const DEMO = join(repoRoot, "conformance/demo/appointment-line.flowdoc.json");
const NAME = "appointment-line";

const dirs: string[] = [];
const servers: { close(): Promise<void> }[] = [];

/**
 * A request as the studio makes it. Bridge routes require the session token
 * (see forgery.test.ts), so a bare fetch would be refused with 403.
 */
async function asStudio(
  started: { base: string; server: { token: string } },
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${started.base}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), [TOKEN_HEADER]: started.server.token },
  });
}

async function tempDir(): Promise<string> {
  // Under the package so a builder file written here resolves the workspace's
  // @flow-as-code/core, exactly as a real project would.
  const base = join(pkgRoot, ".vitest");
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, "bridge-"));
  dirs.push(dir);
  return dir;
}

async function demoDir(): Promise<string> {
  const dir = await tempDir();
  await writeFile(join(dir, `${NAME}.flowdoc.json`), await readFile(DEMO, "utf8"), "utf8");
  return dir;
}

async function demoDoc(): Promise<FlowDoc> {
  return JSON.parse(await readFile(DEMO, "utf8")) as FlowDoc;
}

/** Waits out the watcher's awaitWriteFinish window (50 ms) and its chain. */
function settle(ms = 400): Promise<void> {
  return new Promise((resolveP) => setTimeout(resolveP, ms));
}

/**
 * A chain of `messages` MessageParticipant blocks ending in a disconnect, so
 * the document has `messages + 1` actions. Used to cross the schema's
 * maxItems: 250 on content.Actions with a document codegen is perfectly happy
 * to generate, which is the only shape that tells the two gates apart.
 */
function chainDoc(name: string, messages: number): FlowDoc {
  const actions: FlowAction[] = [];
  for (let i = 0; i < messages; i++) {
    actions.push({
      Identifier: `say-${String(i)}`,
      Type: "MessageParticipant",
      Parameters: { Text: `Message ${String(i)}.` },
      Transitions: {
        NextAction: i + 1 < messages ? `say-${String(i + 1)}` : "hang-up",
        Errors: [],
        Conditions: [],
      },
    });
  }
  actions.push({
    Identifier: "hang-up",
    Type: "DisconnectParticipant",
    Parameters: {},
    Transitions: { Errors: [], Conditions: [] },
  });
  return {
    flowdoc: "0.1",
    kind: "flow",
    name,
    connectType: "CONTACT_FLOW",
    content: { Version: "2019-10-30", StartAction: "say-0", Actions: actions },
  };
}

interface Started {
  url: string;
  base: string;
  store: BridgeStore;
  server: Awaited<ReturnType<typeof startStudioServer>>;
}

async function start(dir: string, options: { watch?: boolean; assetsDir?: string } = {}) {
  const server = await startStudioServer({
    dir,
    watch: options.watch ?? false,
    assetsDir: options.assetsDir,
    // Short enough that a test never waits on a parked poll, long enough that
    // the poll is a real long poll rather than a busy loop.
    pollTimeoutMs: 500,
  });
  servers.push(server);
  // The printed URL carries the session token; strip the query for the base.
  const base = new URL(server.url).origin;
  const info: BridgeInfo = { protocol: BRIDGE_PROTOCOL, dir, label: "test", token: server.token };
  return { url: server.url, base, server, store: new BridgeStore(info, { base }) } as Started;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A synced event carrying `text` in the document. */
function syncedWith(text: string): (event: BridgeEvent) => boolean {
  return (event) => event.kind === "synced" && event.text.includes(text);
}

/**
 * Collects events from the store's own subscription until `match` is seen.
 * A fresh subscription replays the backlog from seq 0, exactly as a browser
 * tab opened late would, so predicates have to name the event they want
 * rather than its kind alone.
 */
function waitForEvent(
  store: BridgeStore,
  match: (event: BridgeEvent) => boolean,
  timeoutMs = 20_000,
): { seen: BridgeEvent[]; done: Promise<BridgeEvent>; stop: () => void } {
  const seen: BridgeEvent[] = [];
  let stop = () => {};
  const done = new Promise<BridgeEvent>((resolveP, rejectP) => {
    const timer = setTimeout(
      () => rejectP(new Error(`timed out waiting for an event after ${String(timeoutMs)}ms`)),
      timeoutMs,
    );
    const unsubscribe = store.subscribe((event) => {
      seen.push(event);
      if (match(event)) {
        clearTimeout(timer);
        resolveP(event);
      }
    });
    stop = () => {
      clearTimeout(timer);
      unsubscribe();
    };
  });
  return { seen, done, stop };
}

describe("studio bridge: binding and path safety", () => {
  it("binds 127.0.0.1 and nothing else", async () => {
    const { server } = await start(await demoDir());
    const address = server.server.address();
    expect(typeof address === "object" && address !== null ? address.address : "").toBe(
      "127.0.0.1",
    );
    expect(server.url.startsWith("http://127.0.0.1:")).toBe(true);
    expect(server.port).toBeGreaterThan(0);
  });

  it("refuses a request whose Host header is not this machine", async () => {
    const { server } = await start(await demoDir());
    // Raw http: fetch refuses to set Host, and Host is exactly what a DNS
    // rebinding attack controls.
    const status = await new Promise<number>((resolveP, rejectP) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: server.port,
          path: "/bridge/info",
          headers: { host: "studio.attacker.example" },
        },
        (res) => {
          res.resume();
          resolveP(res.statusCode ?? 0);
        },
      );
      req.on("error", rejectP);
      req.end();
    });
    expect(status).toBe(403);
  });

  it("serves no file outside the assets directory", async () => {
    const dir = await demoDir();
    const assets = join(dir, "assets");
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, "index.html"), "<html><head></head></html>", "utf8");
    // A file next to the assets root, i.e. what traversal would be after.
    await writeFile(join(dir, "secret.txt"), "TOP SECRET", "utf8");
    const started = await start(dir, { assetsDir: assets });
    const { base } = started;

    for (const path of [
      "/../secret.txt",
      "/..%2fsecret.txt",
      "/%2e%2e%2fsecret.txt",
      "/../../../../../../etc/passwd",
      "/%2e%2e/%2e%2e/%2e%2e/etc/passwd",
    ]) {
      const response = await fetch(`${base}${path}`);
      const body = await response.text();
      expect([403, 404], `${path} was served ${String(response.status)}`).toContain(
        response.status,
      );
      expect(body).not.toContain("TOP SECRET");
      expect(body).not.toContain("root:");
    }
    // The one file inside the root is served, to a request carrying the token
    // (the document embeds the bridge description; see forgery.test.ts).
    expect((await asStudio(started, "/index.html")).status).toBe(200);
  });

  it("refuses a document name that is not a slug", async () => {
    const started = await start(await demoDir());
    const response = await asStudio(started, `/bridge/docs/..%2f..%2fetc%2fpasswd`);
    expect(response.status).toBe(400);
    expect((await response.text()).toLowerCase()).toContain("not a document name");
  });

  it("assetPathFor and hostHeaderAllowed are the two guards, in isolation", () => {
    expect(assetPathFor("/srv/app", "/index.html")).toEqual({
      ok: true,
      path: resolve("/srv/app/index.html"),
    });
    expect(assetPathFor("/srv/app", "/../secret").ok).toBe(false);
    expect(assetPathFor("/srv/app", "/%2e%2e/secret")).toMatchObject({ ok: false, status: 403 });
    // Malformed escaping is the client's mistake, not an escape attempt, and
    // not ours: unguarded, decodeURIComponent throws and the router answers
    // 500 "URI malformed".
    expect(assetPathFor("/srv/app", "/%E0%A4%A")).toMatchObject({ ok: false, status: 400 });
    expect(assetPathFor("/srv/app", "/a\0b")).toMatchObject({ ok: false, status: 400 });
    expect(hostHeaderAllowed("127.0.0.1:5173")).toBe(true);
    expect(hostHeaderAllowed("localhost:5173")).toBe(true);
    expect(hostHeaderAllowed("[::1]:5173")).toBe(true);
    expect(hostHeaderAllowed("studio.attacker.example")).toBe(false);
    expect(hostHeaderAllowed(undefined)).toBe(false);
  });

  it("tells the page it was served by a bridge, escaping the description", () => {
    const info: BridgeInfo = {
      protocol: 1,
      dir: "</script><script>alert(1)",
      label: "x",
      token: "test-token",
    };
    const html = injectBoot("<html><head><script src=/app.js></script></head></html>", info);
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html.indexOf("__FLOW_STUDIO_BRIDGE__")).toBeLessThan(html.indexOf("/app.js"));
  });
});

// Three guards the A11 review found removable with the suite green: the body
// cap, the asset method check, and the percent-decoding that answered 500.
// Each test here fails if its guard is taken out, which is the only sense in
// which any of them is enforced.
describe("studio bridge: request hardening", () => {
  /** A dir with a one-file asset root, so asset routes have something to serve. */
  async function withAssets(): Promise<Started & { dir: string; assets: string }> {
    const dir = await demoDir();
    const assets = join(dir, "assets");
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, "index.html"), "<html><head></head></html>", "utf8");
    const started = await start(dir, { assetsDir: assets });
    return { ...started, dir, assets };
  }

  it("refuses a body past the cap with 413, before parsing it", async () => {
    const started = await start(await demoDir());
    // Valid JSON and nothing else wrong with it: the size is the only reason
    // to refuse, so a missing cap answers 400 (not an object) or 200, never
    // 413. 9 MiB against a cap of 8.
    const body = JSON.stringify("a".repeat(9 * 1024 * 1024));
    const response = await asStudio(started, `/bridge/docs/${NAME}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(response.status).toBe(413);
    expect(await response.text()).toContain("too large");
  }, 60_000);

  it("answers a malformed percent-escape with 400 rather than 500", async () => {
    const started = await withAssets();
    // decodeURIComponent throws URIError on a truncated escape. Unguarded that
    // reached the router and came back as 500 "URI malformed": our fault for
    // the client's mistake.
    const asset = await fetch(`${started.base}/%E0%A4%A`);
    expect(asset.status).toBe(400);
    const doc = await asStudio(started, `/bridge/docs/%E0%A4%A`);
    expect(doc.status).toBe(400);
  });

  it("allows only GET and HEAD on assets", async () => {
    const started = await withAssets();
    expect((await asStudio(started, "/index.html")).status).toBe(200);
    expect((await asStudio(started, "/index.html", { method: "HEAD" })).status).toBe(200);
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await asStudio(started, "/index.html", { method, body: "x" });
      expect(response.status, `${method} was answered ${String(response.status)}`).toBe(405);
      // Without the check these fall through to the file reader and serve it.
      expect(await response.text()).not.toContain("<html>");
    }
  });
});

describe("studio bridge: documents", () => {
  it("lists and reads the demo document, byte-identically through BridgeStore", async () => {
    const dir = await demoDir();
    const { store } = await start(dir);
    expect(await store.list()).toEqual([{ name: NAME }]);

    const onDisk = await readFile(join(dir, `${NAME}.flowdoc.json`), "utf8");
    const read = await store.read(NAME);
    expect(read.text).toBe(onDisk);
    expect(read.doc).toEqual(await demoDoc());
  });

  it("404s a document that is not there", async () => {
    const { store } = await start(await demoDir());
    await expect(store.read("missing-flow")).rejects.toThrow(/No document named/);
  });

  it("writes both halves of the pair and synths back to the same document", async () => {
    const dir = await demoDir();
    const { store } = await start(dir);
    const { doc } = await store.read(NAME);

    // A canvas-shaped mutation: move a block and change a prompt.
    const edited: FlowDoc = structuredClone(doc);
    edited.layout = { ...edited.layout, [edited.content.StartAction]: { x: 42, y: 84 } };
    const first = edited.content.Actions.find((a) => a.Parameters.Text !== undefined);
    expect(first).toBeDefined();
    first!.Parameters.Text = "Thanks for calling the appointment line.";

    await store.write(NAME, edited);

    const docPath = join(dir, `${NAME}.flowdoc.json`);
    const tsPath = join(dir, `${NAME}.flow.ts`);
    const writtenDoc = JSON.parse(await readFile(docPath, "utf8")) as FlowDoc;
    const writtenTs = await readFile(tsPath, "utf8");
    expect(writtenTs).toBe(codegen(edited));
    expect(writtenDoc.layout?.[edited.content.StartAction]).toEqual({ x: 42, y: 84 });
    expect(JSON.stringify(writtenDoc.content)).toContain(
      "Thanks for calling the appointment line.",
    );

    // The pair is in sync: the doc carries the hash of the source beside it,
    // which is what keeps the watcher from reporting it as dirty.
    expect(writtenDoc.meta?.sourceHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    // And synth of that source reproduces the document, modulo meta.
    const { flows } = await synthFile(tsPath);
    const synthed = flows.find((f) => f.name === NAME)?.doc;
    expect(synthed).toBeDefined();
    expect(serialize({ ...synthed!, meta: undefined })).toBe(
      serialize({ ...writtenDoc, meta: undefined }),
    );
  }, 60_000);

  it("keeps @keep comments in the generated source across a canvas save", async () => {
    const dir = await demoDir();
    const { store } = await start(dir);
    const { doc } = await store.read(NAME);

    // Seed a generated file a human has annotated.
    const tsPath = join(dir, `${NAME}.flow.ts`);
    const generated = codegen(doc);
    const annotated = generated.replace(
      /^export function /m,
      "// The number the clinic prints on appointment cards. @keep\nexport function ",
    );
    expect(annotated).not.toBe(generated);
    await writeFile(tsPath, annotated, "utf8");

    const edited: FlowDoc = structuredClone(doc);
    edited.meta = { ...edited.meta, sourceHash: undefined } as FlowDoc["meta"];
    const first = edited.content.Actions.find((a) => a.Parameters.Text !== undefined);
    first!.Parameters.Text = "Welcome back.";
    await store.write(NAME, edited);

    const after = await readFile(tsPath, "utf8");
    expect(after).toContain("appointment cards. @keep");
    expect(after).toContain("Welcome back.");
  }, 60_000);

  it("refuses a document whose name is not the file's, and one the schema rejects", async () => {
    const dir = await demoDir();
    const started = await start(dir);
    const { store } = started;
    const { doc } = await store.read(NAME);

    const renamed = { ...doc, name: "other-flow" };
    await expect(store.write(NAME, renamed)).rejects.toThrow(/the two must agree/);

    // Straight past the client-side gate, as a hostile or buggy client would.
    const broken = { ...doc, content: { ...doc.content, Actions: [] } };
    const response = await asStudio(started, `/bridge/docs/${NAME}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doc: broken }),
    });
    expect(response.status).toBe(422);
    // Nothing was written: no builder file appeared.
    await expect(readFile(join(dir, `${NAME}.flow.ts`), "utf8")).rejects.toThrow();
  });

  it("refuses a document only the schema rejects, which codegen would accept", async () => {
    // The schema gate in writePair is only enforced where it is the ONLY thing
    // that refuses. A document that codegen also rejects proves nothing: the
    // 422 comes back either way. content.Actions has maxItems: 250
    // (conformance/schema/flowdoc-0.1.schema.json), and codegen generates a
    // 301-action chain without complaint, so this is the difference.
    const dir = await demoDir();
    const started = await start(dir);
    const put = (doc: FlowDoc) =>
      asStudio(started, `/bridge/docs/${doc.name}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc }),
      });

    const oversized = chainDoc("big-flow", 300);
    expect(oversized.content.Actions).toHaveLength(301);
    // Codegen is happy with it, so nothing but the schema can refuse it.
    expect(() => codegen(oversized)).not.toThrow();

    const refused = await put(oversized);
    expect(refused.status).toBe(422);
    expect(await refused.text()).toContain("must NOT have more than 250 items");
    expect(existsSync(join(dir, "big-flow.flow.ts"))).toBe(false);
    expect(existsSync(join(dir, "big-flow.flowdoc.json"))).toBe(false);

    // The same document at the limit is written, so the refusal above is the
    // cap and not some other thing this shape does.
    const allowed = chainDoc("big-flow", 249);
    expect(allowed.content.Actions).toHaveLength(250);
    expect((await put(allowed)).status).toBe(200);
    expect(existsSync(join(dir, "big-flow.flow.ts"))).toBe(true);
  }, 60_000);

  it("refuses over HTTP a document carrying a literal ARN the schema accepts", async () => {
    // no-literal-arn is a hard rule, and the browser is not where it can be
    // enforced: a tampered tab, curl, or any other client reaches PUT
    // directly. Only ref-shaped fields carry the ${cdref:...} pattern, so an
    // ARN in Parameters.Text is schema-valid and the rule is the ONLY thing
    // that can refuse it. Asserting through the store instead would test the
    // client-side gate and pass while the server wrote the file.
    const dir = await demoDir();
    const started = await start(dir);
    const docPath = join(dir, `${NAME}.flowdoc.json`);
    const tsPath = join(dir, `${NAME}.flow.ts`);
    const put = (doc: unknown, force = false) =>
      asStudio(started, `/bridge/docs/${NAME}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc, force }),
      });

    // Materialize both halves first, so the refusal is shown to leave existing
    // files alone rather than merely to create none.
    const { doc } = await started.store.read(NAME);
    expect((await put(doc)).status).toBe(200);
    const before = {
      doc: await readFile(docPath, "utf8"),
      ts: await readFile(tsPath, "utf8"),
      docMtime: (await stat(docPath)).mtimeMs,
      tsMtime: (await stat(tsPath)).mtimeMs,
    };

    const withArn = JSON.parse(before.doc) as FlowDoc;
    const target = withArn.content.Actions.find((a) => a.Parameters.Text !== undefined)!;
    target.Parameters.Text = "arn:aws:connect:us-east-1:123456789012:instance/abc";

    // force is the conflict override, not a lint override.
    for (const force of [false, true]) {
      const refused = await put(withArn, force);
      expect(refused.status).toBe(422);
      expect(await refused.text()).toContain("no-literal-arn");
    }

    expect(await readFile(docPath, "utf8")).toBe(before.doc);
    expect(await readFile(tsPath, "utf8")).toBe(before.ts);
    expect((await stat(docPath)).mtimeMs).toBe(before.docMtime);
    expect((await stat(tsPath)).mtimeMs).toBe(before.tsMtime);

    // The studio's own gate refuses it too, so the two agree.
    await expect(started.store.write(NAME, withArn)).rejects.toThrow(/no-literal-arn/);
  }, 60_000);
});

// A12: the studio emits the export, the bridge writes it, because the browser
// cannot and this process is the only thing here that touches disk.
describe("studio bridge: exports", () => {
  const FILES = {
    "flows.tf": 'resource "aws_connect_contact_flow" "x" {}\n',
    "flows/appointment-line.flow.tftpl": '{"Version":"2019-10-30"}\n',
  };

  it("writes the file map the studio posted, under the served directory", async () => {
    const dir = await demoDir();
    const { store } = await start(dir);

    const result = await store.postExport({ target: "tf", files: FILES });
    expect(result.target).toBe("tf");
    expect(result.paths).toEqual([
      join(dir, "flow_refs.tf").replace("flow_refs.tf", "flows.tf"),
      join(dir, "flows", "appointment-line.flow.tftpl"),
    ]);
    expect(await readFile(join(dir, "flows.tf"), "utf8")).toBe(FILES["flows.tf"]);
    expect(await readFile(join(dir, "flows/appointment-line.flow.tftpl"), "utf8")).toBe(
      FILES["flows/appointment-line.flow.tftpl"],
    );
  });

  it("writes into a subdirectory when the studio asks for one", async () => {
    const dir = await demoDir();
    const { store } = await start(dir);
    await store.postExport({
      target: "cdk",
      files: { "flow-stack.ts": "// scaffold\n" },
      subdir: "infra",
    });
    expect(await readFile(join(dir, "infra", "flow-stack.ts"), "utf8")).toBe("// scaffold\n");
  });

  it("overwrites its own output and leaves everything else alone", async () => {
    const dir = await demoDir();
    const { store } = await start(dir);
    await writeFile(join(dir, "notes.txt"), "mine", "utf8");
    await store.postExport({ target: "tf", files: { "flows.tf": "one\n" } });
    await store.postExport({ target: "tf", files: { "flows.tf": "two\n" } });
    expect(await readFile(join(dir, "flows.tf"), "utf8")).toBe("two\n");
    expect(await readFile(join(dir, "notes.txt"), "utf8")).toBe("mine");
    // The documents are untouched: an export is not a document write.
    expect(await readFile(join(dir, `${NAME}.flowdoc.json`), "utf8")).toBe(
      await readFile(DEMO, "utf8"),
    );
  });

  it("writes no file outside the served directory, whatever the path says", async () => {
    const dir = await demoDir();
    const started = await start(dir);
    for (const path of [
      "../escaped.tf",
      "a/../../escaped.tf",
      "/etc/passwd",
      "..\\escaped.tf",
      "flows/../../escaped.tf",
      ".hidden",
      "a/b/c/d/e/deep.tf",
    ]) {
      const response = await asStudio(started, `/bridge/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: "tf", files: { [path]: "x" } }),
      });
      expect(response.status, `${path} was accepted`).toBe(400);
    }
    expect(existsSync(join(dir, "..", "escaped.tf"))).toBe(false);
  });

  it("refuses a subdirectory that climbs out, and an unknown target", async () => {
    const dir = await demoDir();
    const started = await start(dir);
    const post = (body: unknown) =>
      asStudio(started, `/bridge/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    expect((await post({ target: "tf", files: FILES, subdir: "../out" })).status).toBe(400);
    expect((await post({ target: "sql", files: FILES })).status).toBe(400);
    expect((await post({ target: "tf", files: {} })).status).toBe(400);
    expect((await post({ target: "tf", files: { "a.tf": 12 } })).status).toBe(400);
    expect((await post({ target: "tf" })).status).toBe(400);
    expect(existsSync(join(dir, "out"))).toBe(false);
  });

  it("refuses an export carrying more files than the cap", async () => {
    const dir = await demoDir();
    const started = await start(dir);
    const files: Record<string, string> = {};
    for (let i = 0; i <= EXPORT_MAX_FILES; i++) files[`f${String(i).padStart(3, "0")}.tf`] = "x\n";
    expect(Object.keys(files)).toHaveLength(EXPORT_MAX_FILES + 1);

    const response = await asStudio(started, `/bridge/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "tf", files }),
    });
    expect(response.status).toBe(413);
    // Refused as a whole: not one file of the batch was written.
    expect(existsSync(join(dir, "f000.tf"))).toBe(false);
  });

  it("refuses an export carrying more bytes than the cap", async () => {
    const dir = await demoDir();
    const started = await start(dir);
    // Five files of 1 MiB against a 4 MiB cap, and well inside the 8 MiB body
    // cap, so this is the export cap answering and not the body cap.
    const chunk = "x".repeat(1024 * 1024);
    const files: Record<string, string> = {};
    for (let i = 0; i < 5; i++) files[`big${String(i)}.tf`] = chunk;
    expect(chunk.length * 5).toBeGreaterThan(EXPORT_MAX_BYTES);

    const response = await asStudio(started, `/bridge/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "tf", files }),
    });
    expect(response.status).toBe(413);
    expect(await response.text()).toContain("bytes");
    expect(existsSync(join(dir, "big0.tf"))).toBe(false);
  }, 60_000);

  it("writeExport contains its own paths, for a caller that did not check them", async () => {
    // Through the route this is unreachable: checkExportRequest refuses every
    // path the containment check would catch. It is kept because writeExport
    // is exported and writes files the user owns, so "everything it writes is
    // under dir" is its contract rather than the route's, and this is the test
    // that holds it to that.
    const dir = await demoDir();
    await expect(
      writeExport(dir, { target: "tf", files: { "../escaped.tf": "x" } }),
    ).rejects.toThrow(/outside the served directory/);
    await expect(
      writeExport(dir, { target: "tf", files: { "out.tf": "x" }, subdir: "../elsewhere" }),
    ).rejects.toThrow(/outside the served directory/);
    expect(existsSync(join(dir, "..", "escaped.tf"))).toBe(false);
    expect(existsSync(join(dir, "..", "elsewhere"))).toBe(false);
  });

  it("answers POST only", async () => {
    // The Host check is router-wide and is asserted once, above; what is
    // specific to this route is that it is not a GET.
    const started = await start(await demoDir());
    expect((await asStudio(started, `/bridge/export`)).status).toBe(404);
    expect((await asStudio(started, `/bridge/export`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("studio bridge: live round trip", () => {
  it("pushes the new document within a second of a builder-file edit", async () => {
    const dir = await tempDir();
    const doc = await demoDoc();
    const tsPath = join(dir, `${NAME}.flow.ts`);
    await writeFile(tsPath, codegen(doc), "utf8");

    const { store } = await start(dir, { watch: true });
    // Startup synth: the pair is created from the builder file.
    const first = waitForEvent(store, (e) => e.kind === "synced");
    await first.done;
    first.stop();

    const source = await readFile(tsPath, "utf8");
    const edited = source.replace("Thanks for calling", "Thanks so much for calling");
    expect(edited).not.toBe(source);

    const watch = waitForEvent(store, syncedWith("Thanks so much for calling"));
    const started = Date.now();
    await writeFile(tsPath, edited, "utf8");
    const event = await watch.done;
    const elapsed = Date.now() - started;
    watch.stop();

    expect(event.kind).toBe("synced");
    if (event.kind !== "synced") throw new Error("unreachable");
    expect(JSON.stringify(event.doc.content)).toContain("Thanks so much for calling");
    expect(event.text).toBe(await readFile(join(dir, `${NAME}.flowdoc.json`), "utf8"));
    expect(elapsed).toBeLessThan(1000);
  }, 60_000);

  it("reports the builder file's error instead of a document", async () => {
    const dir = await tempDir();
    const tsPath = join(dir, `${NAME}.flow.ts`);
    await writeFile(tsPath, codegen(await demoDoc()), "utf8");
    const { store } = await start(dir, { watch: true });
    const ready = waitForEvent(store, (e) => e.kind === "synced");
    await ready.done;
    ready.stop();

    const failure = waitForEvent(store, (e) => e.kind === "error");
    await writeFile(tsPath, 'throw new Error("bad edit");\n', "utf8");
    const event = await failure.done;
    failure.stop();
    expect(event.kind).toBe("error");
    if (event.kind !== "error") throw new Error("unreachable");
    expect(event.message).toContain("bad edit");
  }, 60_000);
});

describe("studio bridge: repeated canvas saves under the watcher", () => {
  it("recognizes its own writes, so three saves in a row stay in sync", async () => {
    // The bridge writes both halves of the pair and then tells the watcher
    // those exact bytes are its own (watch.ts, noteWrite). Without that the
    // watcher reads the second save as "the doc was edited externally AND the
    // ts changed" and raises a dirty-both conflict for an edit this process
    // just made, which then freezes every later save.
    const dir = await demoDir();
    const started = await start(dir, { watch: true });
    const { store } = started;
    // Let the startup scan of the document that is already there finish.
    await settle();

    const conflicts: BridgeEvent[] = [];
    const stop = store.subscribe((event) => {
      if (event.kind === "conflict") conflicts.push(event);
    });

    for (const text of ["First save.", "Second save.", "Third save."]) {
      const edited = structuredClone((await store.read(NAME)).doc);
      edited.content.Actions.find((a) => a.Parameters.Text !== undefined)!.Parameters.Text = text;
      // Throws BridgeConflictError if the pair froze on an earlier save.
      await store.write(NAME, edited);
      // Each save has to be seen by the watcher before the next one starts:
      // three writes inside one awaitWriteFinish window coalesce into a single
      // change event, which no ledger bug can survive to be caught by.
      await settle();
    }
    stop();

    expect(conflicts).toEqual([]);
    const tsText = await readFile(join(dir, `${NAME}.flow.ts`), "utf8");
    const written = JSON.parse(
      await readFile(join(dir, `${NAME}.flowdoc.json`), "utf8"),
    ) as FlowDoc;
    expect(tsText).toContain("Third save.");
    expect(JSON.stringify(written.content)).toContain("Third save.");
    // And the pair is in sync: the doc carries the hash of the source next to it.
    expect(written.meta?.sourceHash).toBe(`sha256:${sha256Hex(tsText)}`);
  }, 90_000);
});

describe("studio bridge: conflicts", () => {
  it("refuses a save whose builder file moved, and offers both sides", async () => {
    const dir = await demoDir();
    const { store } = await start(dir);
    const { doc } = await store.read(NAME);
    await store.write(NAME, doc);
    // The studio now holds the document the bridge wrote, provenance and all.
    const synced = await store.read(NAME);

    // Someone edits the builder file in their editor.
    const tsPath = join(dir, `${NAME}.flow.ts`);
    const source = await readFile(tsPath, "utf8");
    const edited = source.replace("Thanks for calling", "Hello and thanks for calling");
    expect(edited).not.toBe(source);
    await writeFile(tsPath, edited, "utf8");

    // The canvas saves its own edit. Both sides have moved.
    const canvasSide = structuredClone(synced.doc);
    canvasSide.content.Actions.find((a) => a.Parameters.Text !== undefined)!.Parameters.Text =
      "Canvas wrote this.";

    let conflict: BridgeConflict | undefined;
    await expect(
      store.write(NAME, canvasSide).catch((err: unknown) => {
        if (err instanceof BridgeConflictError) conflict = err.conflict;
        throw err;
      }),
    ).rejects.toBeInstanceOf(BridgeConflictError);

    expect(conflict).toBeDefined();
    expect(conflict!.origin).toBe("canvas");
    expect(JSON.stringify(conflict!.docSide?.content)).toContain("Canvas wrote this.");
    expect(JSON.stringify(conflict!.codeSide?.content)).toContain("Hello and thanks for calling");

    // Nothing was overwritten.
    expect(await readFile(tsPath, "utf8")).toBe(edited);
    expect((await store.read(NAME)).text).toBe(synced.text);

    // And the pair stays frozen: a second save is refused too.
    await expect(store.write(NAME, canvasSide)).rejects.toBeInstanceOf(BridgeConflictError);
  }, 60_000);

  it("applies the code side when the user picks it", async () => {
    const dir = await demoDir();
    const { store } = await start(dir);
    const { doc } = await store.read(NAME);
    await store.write(NAME, doc);
    const tsPath = join(dir, `${NAME}.flow.ts`);
    const source = await readFile(tsPath, "utf8");
    await writeFile(tsPath, source.replace("Thanks for calling", "Code side wins"), "utf8");

    const canvasSide = structuredClone((await store.read(NAME)).doc);
    canvasSide.content.Actions.find((a) => a.Parameters.Text !== undefined)!.Parameters.Text =
      "Canvas side.";
    await expect(store.write(NAME, canvasSide)).rejects.toBeInstanceOf(BridgeConflictError);

    const resolved = await store.resolve(NAME, "code");
    expect(JSON.stringify(resolved.doc.content)).toContain("Code side wins");
    // The builder file is untouched by a code-side resolution.
    expect(await readFile(tsPath, "utf8")).toContain("Code side wins");
    // And the pair is unfrozen.
    await store.write(NAME, (await store.read(NAME)).doc);
  }, 90_000);

  it("applies the canvas side when the user forces it, regenerating the source", async () => {
    const dir = await demoDir();
    const { store } = await start(dir);
    const { doc } = await store.read(NAME);
    await store.write(NAME, doc);
    const tsPath = join(dir, `${NAME}.flow.ts`);
    await writeFile(
      tsPath,
      (await readFile(tsPath, "utf8")).replace("Thanks for calling", "Editor side"),
      "utf8",
    );

    const canvasSide = structuredClone((await store.read(NAME)).doc);
    canvasSide.content.Actions.find((a) => a.Parameters.Text !== undefined)!.Parameters.Text =
      "Canvas side wins.";
    await expect(store.write(NAME, canvasSide)).rejects.toBeInstanceOf(BridgeConflictError);

    await store.write(NAME, canvasSide, { force: true });
    expect(await readFile(tsPath, "utf8")).toContain("Canvas side wins.");
    expect(JSON.stringify((await store.read(NAME)).doc.content)).toContain("Canvas side wins.");
  }, 90_000);

  /**
   * A pair frozen by a refused canvas save, plus the document that would slip
   * past writePair's own dirty guard: it carries no meta.sourceHash, so there
   * is no provenance to check and writePair alone would write it. Only the
   * freeze in the route refuses it, which is what makes these two tests able
   * to fail.
   */
  async function frozenPair(): Promise<{
    started: Started;
    dir: string;
    tsPath: string;
    editedSource: string;
    docText: string;
    unprovenanced: FlowDoc;
  }> {
    const dir = await demoDir();
    const started = await start(dir);
    const { store } = started;
    await store.write(NAME, (await store.read(NAME)).doc);
    const synced = await store.read(NAME);

    // Someone edits the builder file; the canvas then saves its own edit.
    const tsPath = join(dir, `${NAME}.flow.ts`);
    const editedSource = (await readFile(tsPath, "utf8")).replace(
      "Thanks for calling",
      "Editor wrote this",
    );
    await writeFile(tsPath, editedSource, "utf8");

    const canvasSide = structuredClone(synced.doc);
    canvasSide.content.Actions.find((a) => a.Parameters.Text !== undefined)!.Parameters.Text =
      "Canvas wrote this.";
    await expect(store.write(NAME, canvasSide)).rejects.toBeInstanceOf(BridgeConflictError);

    const unprovenanced = structuredClone(canvasSide);
    delete unprovenanced.meta?.sourceHash;
    return {
      started,
      dir,
      tsPath,
      editedSource,
      docText: synced.text,
      unprovenanced,
    };
  }

  const putDoc = (started: Started, doc: FlowDoc, force?: true) =>
    asStudio(started, `/bridge/docs/${NAME}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(force === true ? { doc, force: true } : { doc }),
    });

  it("freezes every write on a conflicted pair, including one writePair would take", async () => {
    const { started, tsPath, editedSource, docText, unprovenanced } = await frozenPair();

    const refused = await putDoc(started, unprovenanced);
    expect(refused.status).toBe(409);
    // Nothing moved: neither half of the pair was touched.
    expect(await readFile(tsPath, "utf8")).toBe(editedSource);
    expect((await started.store.read(NAME)).text).toBe(docText);

    // force IS the user answering the dialog, so it is the one write that
    // passes, and it regenerates the source from the canvas document.
    const forced = await putDoc(started, unprovenanced, true);
    expect(forced.status).toBe(200);
    expect(await readFile(tsPath, "utf8")).toContain("Canvas wrote this.");
  }, 90_000);

  it("thaws the pair once a write goes through, so the next save is not refused", async () => {
    const { started, unprovenanced } = await frozenPair();
    const { store } = started;
    expect((await putDoc(started, unprovenanced, true)).status).toBe(200);

    // The pair is in sync again, so an ordinary save must be accepted. If the
    // resolved conflict is still on the books, this comes back 409.
    const current = await store.read(NAME);
    const next = structuredClone(current.doc);
    next.content.Actions.find((a) => a.Parameters.Text !== undefined)!.Parameters.Text =
      "And again.";
    const response = await putDoc(started, next);
    expect(response.status).toBe(200);
    expect(JSON.stringify((await store.read(NAME)).doc.content)).toContain("And again.");
  }, 90_000);

  it("relays the watcher's dirty-both conflict without touching either file", async () => {
    const dir = await tempDir();
    const tsPath = join(dir, `${NAME}.flow.ts`);
    const docPath = join(dir, `${NAME}.flowdoc.json`);
    await writeFile(tsPath, codegen(await demoDoc()), "utf8");

    const { store } = await start(dir, { watch: true });
    const ready = waitForEvent(store, (e) => e.kind === "synced");
    await ready.done;
    ready.stop();

    // An external doc edit with no matching provenance, then a source edit.
    const onDisk = JSON.parse(await readFile(docPath, "utf8")) as FlowDoc;
    onDisk.meta = { ...onDisk.meta, sourceHash: `sha256:${"0".repeat(64)}` };
    const tampered = `${JSON.stringify(onDisk, null, 2)}\n`;
    await writeFile(docPath, tampered, "utf8");

    const conflicted = waitForEvent(store, (e) => e.kind === "conflict");
    const source = await readFile(tsPath, "utf8");
    const edited = source.replace("Thanks for calling", "Editor changed this");
    await writeFile(tsPath, edited, "utf8");
    const event = await conflicted.done;
    conflicted.stop();

    expect(event.kind).toBe("conflict");
    if (event.kind !== "conflict") throw new Error("unreachable");
    expect(event.origin).toBe("disk");
    expect(event.reason).toContain("both sides changed");
    expect(JSON.stringify(event.codeSide?.content)).toContain("Editor changed this");

    // Neither file moved.
    expect(await readFile(docPath, "utf8")).toBe(tampered);
    expect(await readFile(tsPath, "utf8")).toBe(edited);

    // And writes are frozen until the user chooses.
    await expect(store.write(NAME, onDisk)).rejects.toBeInstanceOf(BridgeConflictError);
  }, 90_000);
});
