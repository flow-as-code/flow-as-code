/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Delivery: the bridge writes the files when there is one, the browser
// downloads them when there is not, and both get the same bytes.
//
// The last part is the acceptance criterion worth a test of its own. The
// bundle is built once, by `runExport`, and handed to a sink that cannot
// change it, so the two destinations cannot drift into different output; a
// refactor that gave either sink its own emit path fails "both destinations
// receive identical bytes" below.

import { describe, expect, it, vi } from "vitest";
import type { BridgeInfo } from "../src/store/bridgeProtocol.js";
import { BRIDGE_PROTOCOL } from "../src/store/bridgeProtocol.js";
import { BridgeStore, type BridgeFetch } from "../src/store/bridgeStore.js";
import { MemoryStore } from "../src/store/memoryStore.js";
import { readOnly } from "../src/store/readOnlyStore.js";
import {
  BridgeExportSink,
  DownloadExportSink,
  PreviewExportSink,
  runExport,
  sinkFor,
  type ExportSink,
} from "../src/export/deliver.js";
import { buildExport, type ExportBundle, type ExportInput } from "../src/export/targets.js";
import { demoDoc } from "./helpers.js";

const INFO: BridgeInfo = {
  protocol: BRIDGE_PROTOCOL,
  dir: "/tmp/flows",
  label: "flows",
  token: "test-token",
};

const ADDRESS_MAP = {
  "hours:main-line": "aws_connect_hours_of_operation.main_line.arn",
  "lambda:appointment-lookup": "data.aws_lambda_function.appointment_lookup.arn",
  "queue:appointments": "aws_connect_queue.appointments.arn",
};

const TF_EXPORT: ExportInput = { target: "tf", docs: [demoDoc()], addressMap: ADDRESS_MAP };

interface Posted {
  url: string;
  body: unknown;
}

/** A BridgeStore whose fetch records the export POST and answers like the server. */
function bridgeStore(): { store: BridgeStore; posts: Posted[] } {
  const posts: Posted[] = [];
  const fetchImpl: BridgeFetch = (url, init) => {
    const body = JSON.parse(init?.body ?? "{}") as { files?: Record<string, string> };
    posts.push({ url, body });
    const paths = Object.keys(body.files ?? {})
      .sort()
      .map((p) => `${INFO.dir}/${p}`);
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ target: "tf", paths })),
    });
  };
  return { store: new BridgeStore(INFO, { base: "", fetch: fetchImpl }), posts };
}

/** A sink that keeps the bundle it was given, for comparing the two paths. */
class CapturingSink implements ExportSink {
  readonly kind = "download";
  bundle: ExportBundle | null = null;
  destination(): string {
    return "capture";
  }
  deliver(bundle: ExportBundle): Promise<never> {
    this.bundle = bundle;
    return Promise.reject(new Error("capture only"));
  }
}

describe("bridge delivery", () => {
  it("posts the file map to the bridge and reports the paths it wrote", async () => {
    const { store, posts } = bridgeStore();
    const delivery = await runExport(
      { ...TF_EXPORT, subdir: "infra" },
      new BridgeExportSink(store),
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toBe("/bridge/export");
    const body = posts[0]?.body as {
      target: string;
      subdir: string;
      files: Record<string, string>;
    };
    expect(body.target).toBe("tf");
    expect(body.subdir).toBe("infra");
    expect(Object.keys(body.files).sort()).toEqual([
      "flow_refs.tf",
      "flows.tf",
      "flows/appointment-line.flow.tftpl",
      "variables.tf",
      "versions.tf.example",
    ]);

    expect(delivery.kind).toBe("bridge");
    expect(delivery.destination).toBe("/tmp/flows/infra");
    expect(delivery.files.map((f) => f.wrote)).toContain("/tmp/flows/flows.tf");
  });

  it("sends exactly the emitter's bytes, not a re-serialization", async () => {
    const { store, posts } = bridgeStore();
    await runExport(TF_EXPORT, new BridgeExportSink(store));
    const body = posts[0]?.body as { files: Record<string, string> };
    expect(body.files).toEqual(buildExport(TF_EXPORT).files);
  });

  it("refuses to post anything for a document that fails the save gate", async () => {
    const { store, posts } = bridgeStore();
    const broken = demoDoc();
    broken.content.Actions = broken.content.Actions.map((a) =>
      a.Identifier === "look-up-appointment"
        ? { ...a, Parameters: { ...a.Parameters, LambdaFunctionARN: "arn:aws:lambda:x:1:f:y" } }
        : a,
    );
    await expect(
      runExport({ target: "cdk", docs: [broken] }, new BridgeExportSink(store)),
    ).rejects.toThrow(/no-literal-arn/);
    expect(posts).toEqual([]);
  });
});

describe("download delivery", () => {
  it("hands every file to the browser, folding the directory into the name", async () => {
    const saved: { name: string; type: string }[] = [];
    const anchors: { download: string }[] = [];
    // happy-dom is not loaded for this file: stub the two DOM pieces the
    // download path touches, which is exactly what it may touch.
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.stubGlobal(
      "Blob",
      class {
        constructor(parts: string[], options: { type: string }) {
          saved.push({ name: "", type: options.type });
          void parts;
        }
      },
    );
    const anchor = { href: "", download: "", style: {}, click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("document", {
      createElement: () => {
        const a = { ...anchor };
        anchors.push(a as unknown as { download: string });
        return a;
      },
      body: { appendChild: vi.fn() },
    });

    try {
      const delivery = await runExport(TF_EXPORT, new DownloadExportSink());
      expect(delivery.kind).toBe("download");
      expect(delivery.files.map((f) => f.wrote)).toEqual([
        "flow_refs.tf",
        "flows.tf",
        "flows-appointment-line.flow.tftpl",
        "variables.tf",
        "versions.tf.example",
      ]);
      // The intended path is kept beside the flattened name, so the dialog can
      // tell the user where each file belongs.
      expect(delivery.files.map((f) => f.path)).toContain("flows/appointment-line.flow.tftpl");
      expect(anchors).toHaveLength(5);
      expect(createObjectURL).toHaveBeenCalledTimes(5);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("the two destinations cannot drift", () => {
  it("receive identical bytes for the same export", async () => {
    const a = new CapturingSink();
    const b = new CapturingSink();
    await expect(runExport(TF_EXPORT, a)).rejects.toThrow();
    await expect(runExport(TF_EXPORT, b)).rejects.toThrow();
    expect(a.bundle?.files).toEqual(b.bundle?.files);
    expect(a.bundle?.files).toEqual(buildExport(TF_EXPORT).files);
  });

  it("picks the sink from the store: a bridge writes, read-only previews, anything else downloads", () => {
    expect(sinkFor(bridgeStore().store).kind).toBe("bridge");
    expect(sinkFor(new MemoryStore("demo", [demoDoc()])).kind).toBe("download");
    expect(sinkFor(new MemoryStore("demo", [demoDoc()])).destination("infra")).toContain(
      "downloads",
    );
    expect(sinkFor(readOnly(new MemoryStore("demo", [demoDoc()]))).kind).toBe("preview");
  });
});

describe("preview delivery", () => {
  it("returns the emitter's bytes as text and touches nothing outside the page", async () => {
    // No DOM at all in this file: a preview that reached for document, URL,
    // or Blob would throw here, which is the point.
    const delivery = await runExport(TF_EXPORT, new PreviewExportSink());
    expect(delivery.kind).toBe("preview");
    expect(delivery.destination).toMatch(/read-only demo/);
    expect(delivery.files.map((f) => f.path)).toEqual([
      "flow_refs.tf",
      "flows.tf",
      "flows/appointment-line.flow.tftpl",
      "variables.tf",
      "versions.tf.example",
    ]);
    expect(delivery.contents).toEqual(buildExport(TF_EXPORT).files);
  });

  it("previews the CDK scaffold and raw JSON the same way", async () => {
    const cdk = await runExport({ target: "cdk", docs: [demoDoc()] }, new PreviewExportSink());
    expect(cdk.contents?.["flow-stack.ts"]).toContain("FlowSet");
    const raw = await runExport(
      {
        target: "raw",
        docs: [demoDoc()],
        resourceMap: Object.fromEntries(
          (demoDoc().refs ?? []).map((r) => [r.token, `arn:aws:connect:us-east-1:1:x/${r.name}`]),
        ),
      },
      new PreviewExportSink(),
    );
    expect(Object.keys(raw.contents ?? {})).toEqual(["appointment-line.json"]);
  });

  it("runs the save gate like every other sink", async () => {
    const broken = demoDoc();
    broken.content.Actions = broken.content.Actions.map((a) =>
      a.Identifier === "look-up-appointment"
        ? { ...a, Parameters: { ...a.Parameters, LambdaFunctionARN: "arn:aws:lambda:x:1:f:y" } }
        : a,
    );
    await expect(
      runExport({ target: "cdk", docs: [broken] }, new PreviewExportSink()),
    ).rejects.toThrow(/no-literal-arn/);
  });
});
