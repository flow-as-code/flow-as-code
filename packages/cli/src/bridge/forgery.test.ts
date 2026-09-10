/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Cross-site request forgery against the local bridge.
//
// Binding to 127.0.0.1 keeps the network out. It does not keep the developer's
// own browser out: any page they visit while `flow-cli studio` runs can send
// this server a CORS-simple POST. Refusing to send CORS headers only stops the
// attacker reading the reply, which is no defence against a write, and the
// bridge writes into a directory whose .flow.ts files `flow-cli synth` later
// executes. A review reproduced a cross-origin page writing a file there.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOKEN_HEADER, TOKEN_PARAM } from "./protocol.js";
import { startStudioServer, type StudioServer } from "./server.js";

let server: StudioServer;
let dir: string;
let origin: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "flow-forgery-"));
  await writeFile(join(dir, "secret.txt"), "s3cr3t", "utf8");
  server = await startStudioServer({ dir, pollTimeoutMs: 200, watch: false });
  origin = `http://127.0.0.1:${String(server.port)}`;
});
afterAll(async () => {
  await server.close();
});

const exportBody = JSON.stringify({ target: "raw", files: { "pwned.txt": "written cross-site" } });
const post = (headers: Record<string, string>) =>
  fetch(`${origin}/bridge/export`, { method: "POST", headers, body: exportBody });

// Node's fetch overwrites Sec-Fetch-Mode with the request's own mode ("cors"),
// so a navigation can only be imitated below the fetch layer. The status is
// all these tests read.
function raw(path: string, headers: Record<string, string>, method = "GET", body?: string) {
  return new Promise<number>((resolve, reject) => {
    const req = request(`${origin}${path}`, { method, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.on("error", reject);
    req.end(body);
  });
}

describe("the bridge refuses forged requests", () => {
  it.each([
    ["a CORS-simple POST from another page", { "content-type": "text/plain;charset=UTF-8" }],
    ["no token", { "content-type": "application/json" }],
    ["a wrong token", { "content-type": "application/json", [TOKEN_HEADER]: "nope" }],
  ])("blocks %s", async (_label, headers) => {
    expect((await post(headers)).status).toBe(403);
  });

  it("blocks a cross-site request even when the token leaked", async () => {
    const headers = {
      "content-type": "application/json",
      [TOKEN_HEADER]: server.token,
      "sec-fetch-site": "cross-site",
    };
    expect((await post(headers)).status).toBe(403);
  });

  it("blocks a request whose Origin is not ours even when the token leaked", async () => {
    const headers = {
      "content-type": "application/json",
      [TOKEN_HEADER]: server.token,
      origin: "https://evil.example",
    };
    expect((await post(headers)).status).toBe(403);
  });

  it("wrote nothing to the served directory through any of that", async () => {
    await expect(readFile(join(dir, "pwned.txt"), "utf8")).rejects.toThrow();
  });

  it("allows the studio's own request", async () => {
    const res = await post({
      "content-type": "application/json",
      [TOKEN_HEADER]: server.token,
      origin,
      "sec-fetch-site": "same-origin",
    });
    expect(res.ok).toBe(true);
    expect(await readFile(join(dir, "pwned.txt"), "utf8")).toBe("written cross-site");
  });

  it("accepts the token from the query string, which is how the URL carries it", async () => {
    const res = await fetch(`${origin}/bridge/info?${TOKEN_PARAM}=${server.token}`);
    expect(res.ok).toBe(true);
  });

  it("puts the token in the URL it prints, so the opened page has it", () => {
    expect(server.url).toContain(`${TOKEN_PARAM}=`);
    expect(server.token.length).toBeGreaterThanOrEqual(32);
  });

  it("still serves subresources without a token, so the page can boot", async () => {
    // 404 because this fixture serves no assets; the point is that it is not 403.
    expect((await fetch(`${origin}/assets/app.js`)).status).not.toBe(403);
  });

  it.each(["/", "/index.html"])("refuses the document at %s without the token", async (path) => {
    // index.html carries the bridge description, token included, in its boot
    // script. Serving it bare would hand the token to any page that opened a
    // tab on this port.
    expect((await fetch(`${origin}${path}`)).status).toBe(403);
    const viaHeader = await fetch(`${origin}${path}`, {
      headers: { [TOKEN_HEADER]: server.token },
    });
    expect(viaHeader.status).not.toBe(403);
  });

  // The printed URL gets opened from a terminal, a chat client, a README, or a
  // browser extension. Browsers mark those navigations cross-site (or none),
  // and the studio was answering them with a JSON error.
  const navigation = {
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
  };

  it("serves a cross-site top-level navigation that carries the printed URL", async () => {
    expect(await raw(`/?${TOKEN_PARAM}=${server.token}`, navigation)).not.toBe(403);
  });

  it("still refuses a cross-site navigation without the token", async () => {
    expect(await raw("/", navigation)).toBe(403);
  });

  it("still refuses a cross-site navigation aimed at the API, token or not", async () => {
    const headers = { ...navigation, "content-type": "text/plain", [TOKEN_HEADER]: server.token };
    expect(await raw("/bridge/export", headers, "POST", exportBody)).toBe(403);
    expect(await raw(`/bridge/info?${TOKEN_PARAM}=${server.token}`, navigation)).toBe(403);
    await expect(readFile(join(dir, "pwned.txt"), "utf8")).resolves.toBe("written cross-site");
  });

  it.each([
    ["a subresource load", { "sec-fetch-mode": "no-cors", "sec-fetch-dest": "script" }],
    ["a framed document", { "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" }],
    ["a fetch", { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" }],
  ])("still refuses %s from another site", async (_label, fetchMetadata) => {
    const headers = { ...fetchMetadata, "sec-fetch-site": "cross-site" };
    expect(await raw("/assets/app.js", headers)).toBe(403);
    expect(await raw(`/?${TOKEN_PARAM}=${server.token}`, headers)).toBe(403);
  });
});
