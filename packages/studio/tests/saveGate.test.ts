/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The save gate, pinned where the bytes are written.
//
// docs/02-studio-design.md: "The studio can never save a doc that fails
// no-literal-arn or no-unresolved-token." Every test here calls a write
// function directly, with no UI involved, so deleting the guard in
// validate.ts, memoryStore.ts, directoryStore.ts, or exportDoc.ts fails a
// test rather than merely changing a button's disabled attribute.

import type { FlowDoc } from "@flow-as-code/core";
import { serialize } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { setMessageBody, setParam } from "../src/model/mutations.js";
import {
  SaveRefusedError,
  assertSaveable,
  parseFlowDoc,
  validateDoc,
} from "../src/model/validate.js";
import { DirectoryStore } from "../src/store/directoryStore.js";
import { exportBlob } from "../src/store/exportDoc.js";
import { MemoryStore } from "../src/store/memoryStore.js";
import { demoDoc } from "./helpers.js";

const ARN = "arn:aws:lambda:us-east-1:123456789012:function:lookup";

/**
 * Both fixtures below edit the document directly rather than going through a
 * mutation, because the mutation layer refuses to author either one now (a
 * literal ARN and a missing body both cost the block its typed builder form;
 * see model/mutations.ts). The save gate still has to refuse them: a document
 * can reach a write path from a file, from an older tool, or from a bug, and
 * the gate is the last thing between it and the bytes on disk.
 */
function withLiteralArn(): FlowDoc {
  const doc = demoDoc();
  doc.content.Actions = doc.content.Actions.map((a) =>
    a.Identifier === "look-up-appointment"
      ? { ...a, Parameters: { ...a.Parameters, LambdaFunctionARN: ARN } }
      : a,
  );
  return doc;
}

/** Schema-invalid but lint-clean: a MessageParticipant with no body at all. */
function withNoMessageBody(): FlowDoc {
  const doc = demoDoc();
  doc.content.Actions = doc.content.Actions.map((a) =>
    a.Identifier === "welcome" ? { ...a, Parameters: {} } : a,
  );
  return doc;
}

/** Minimal in-memory stand-in for the File System Access API handles. */
class FakeDirectory {
  readonly files = new Map<string, string>();
  readonly kind = "directory";
  readonly name = "fake";

  getFileHandle(name: string, options?: { create?: boolean }) {
    const files = this.files;
    if (!files.has(name) && options?.create !== true) {
      return Promise.reject(new Error(`NotFoundError: ${name}`));
    }
    return Promise.resolve({
      getFile: () => Promise.resolve({ text: () => Promise.resolve(files.get(name) ?? "") }),
      createWritable: () =>
        Promise.resolve({
          write: (text: string) => {
            files.set(name, text);
            return Promise.resolve();
          },
          close: () => Promise.resolve(),
        }),
    });
  }

  values() {
    throw new Error("not used");
  }
}

function directoryStore(): { store: DirectoryStore; dir: FakeDirectory } {
  const dir = new FakeDirectory();
  // The store only uses getFileHandle and values; the cast keeps the test
  // free of the WICG DOM types.
  const store = new DirectoryStore("fake", dir as unknown as never);
  return { store, dir };
}

describe("assertSaveable", () => {
  it("accepts the demo doc", () => {
    expect(() => assertSaveable(demoDoc())).not.toThrow();
    expect(validateDoc(demoDoc()).ok).toBe(true);
  });

  it("refuses a literal ARN (no-literal-arn)", () => {
    expect(() => assertSaveable(withLiteralArn())).toThrow(SaveRefusedError);
    const validation = validateDoc(withLiteralArn());
    expect(validation.ok).toBe(false);
    expect(validation.blockers.map((f) => f.rule)).toContain("no-literal-arn");
  });

  it("refuses an unresolved token (no-unresolved-token)", () => {
    const doc = setParam(demoDoc(), "welcome", "Text", "Call ${cdref:queue:appointments} now");
    expect(() => assertSaveable(doc)).toThrow(SaveRefusedError);
    expect(validateDoc(doc).blockers.map((f) => f.rule)).toContain("no-unresolved-token");
  });

  it("refuses a schema-invalid doc even when lint is clean", () => {
    const doc = withNoMessageBody();
    const validation = validateDoc(doc);
    expect(validation.blockers).toEqual([]);
    expect(validation.schemaErrors.length).toBeGreaterThan(0);
    expect(() => assertSaveable(doc)).toThrow(SaveRefusedError);
  });
});

describe("MemoryStore.write refuses invalid docs", () => {
  it("rejects a literal ARN and leaves the stored bytes untouched", async () => {
    const store = new MemoryStore("test", [demoDoc()]);
    const before = (await store.read("appointment-line")).text;
    await expect(store.write("appointment-line", withLiteralArn())).rejects.toThrow(
      /no-literal-arn/,
    );
    expect((await store.read("appointment-line")).text).toBe(before);
    expect((await store.read("appointment-line")).text).not.toContain(ARN);
  });

  it("rejects a schema-invalid doc", async () => {
    const store = new MemoryStore("test", [demoDoc()]);
    await expect(store.write("appointment-line", withNoMessageBody())).rejects.toThrow(/schema/);
  });

  it("still writes a valid doc", async () => {
    const store = new MemoryStore("test", [demoDoc()]);
    const doc = setMessageBody(demoDoc(), "welcome", "SSML", "<speak>Hi</speak>");
    await store.write("appointment-line", doc);
    expect((await store.read("appointment-line")).text).toBe(serialize(doc));
  });
});

describe("DirectoryStore.write refuses invalid docs", () => {
  it("rejects a literal ARN and writes no file", async () => {
    const { store, dir } = directoryStore();
    await expect(store.write("appointment-line", withLiteralArn())).rejects.toThrow(
      /no-literal-arn/,
    );
    expect(dir.files.size).toBe(0);
  });

  it("writes a valid doc and reads it back", async () => {
    const { store, dir } = directoryStore();
    await store.write("appointment-line", demoDoc());
    expect(dir.files.get("appointment-line.flowdoc.json")).toBe(serialize(demoDoc()));
    expect((await store.read("appointment-line")).doc.name).toBe("appointment-line");
  });

  it("refuses to read a file that is not a FlowDoc 0.1", async () => {
    const { store, dir } = directoryStore();
    dir.files.set("bogus.flowdoc.json", JSON.stringify({ flowdoc: "0.2", name: "bogus" }));
    await expect(store.read("bogus")).rejects.toThrow(/FlowDoc 0\.1/);
  });

  it("refuses to read a schema-invalid FlowDoc", async () => {
    const { store, dir } = directoryStore();
    const doc = demoDoc() as unknown as Record<string, unknown>;
    delete doc.content;
    dir.files.set("broken.flowdoc.json", JSON.stringify(doc));
    await expect(store.read("broken")).rejects.toThrow(/not a valid FlowDoc|Not a valid FlowDoc/);
  });
});

describe("Export-as-download refuses invalid docs", () => {
  // Without the File System Access API this is the only way edits leave the
  // studio, so it is gated exactly like a store write.
  it("refuses a literal ARN", () => {
    expect(() => exportBlob(withLiteralArn())).toThrow(SaveRefusedError);
  });

  it("refuses a schema-invalid doc", () => {
    expect(() => exportBlob(withNoMessageBody())).toThrow(SaveRefusedError);
  });

  it("produces the byte-stable serialization for a valid doc", async () => {
    const blob = exportBlob(demoDoc());
    expect(await blob.text()).toBe(serialize(demoDoc()));
  });
});

describe("parseFlowDoc guards every read path", () => {
  it("accepts the demo doc's own serialization", () => {
    expect(parseFlowDoc(serialize(demoDoc())).name).toBe("appointment-line");
  });

  it("rejects non-JSON, the wrong version, and schema violations", () => {
    expect(() => parseFlowDoc("{not json")).toThrow(/Not JSON/);
    expect(() => parseFlowDoc(JSON.stringify({ flowdoc: "0.2" }))).toThrow(/FlowDoc 0\.1/);
    expect(() => parseFlowDoc(JSON.stringify({ flowdoc: "0.1", name: "x" }))).toThrow(
      /valid FlowDoc/,
    );
  });
});
