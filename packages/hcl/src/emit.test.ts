/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// emitFlowascode against conformance/hcl/emit: each case's files byte for
// byte (UPDATE_GOLDENS=1 rewrites them), each document's resource in
// flows.tf read back to the document, and the refusals emitTf makes.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { slugIdentifier, type FlowDoc } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { bytes, viewed } from "./__fixtures__/view.js";
import type { Block } from "./ast.js";
import { FLOWASCODE_PROVIDER_CONSTRAINT, FLOW_RESOURCE, MODULE_RESOURCE } from "./contract.js";
import { EmitFlowascodeError, emitFlowascode } from "./emit.js";
import { format } from "./format.js";
import { parse } from "./parser.js";
import { sourceOf } from "./print.js";
import { toFlowDoc } from "./read.js";

const EMIT = join(import.meta.dirname, "..", "..", "..", "conformance", "hcl", "emit");
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const read = (...p: string[]): string => readFileSync(join(...p), "utf8");

interface EmitCase {
  docs: string[];
  options?: { instanceIdExpression?: string };
  validate?: string;
}

function filesUnder(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(dir, join(prefix, e.name)) : [join(prefix, e.name)],
  );
}

const cases = readdirSync(EMIT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

describe("conformance/hcl/emit", () => {
  it("mirrors every emit-tf case", () => {
    const tf = readdirSync(join(EMIT, "..", "..", "emit-tf"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(cases).toEqual(tf);
  });

  for (const name of cases) {
    const dir = join(EMIT, name);
    const spec = JSON.parse(read(dir, "case.json")) as EmitCase;
    const docs = spec.docs.map((p) => JSON.parse(read(dir, p)) as FlowDoc);
    const addressMap = JSON.parse(read(dir, "address-map.json")) as Record<string, string>;
    const { files } = emitFlowascode(docs, { addressMap, ...spec.options });

    it(`${name}: writes the expected files byte for byte`, () => {
      const expected = join(dir, "expected");
      if (UPDATE) {
        rmSync(expected, { recursive: true, force: true });
        for (const [path, text] of Object.entries(files)) {
          mkdirSync(dirname(join(expected, path)), { recursive: true });
          writeFileSync(join(expected, path), text);
        }
      }
      expect(Object.keys(files)).toEqual(filesUnder(expected).sort());
      for (const [path, text] of Object.entries(files)) {
        expect(text, path).toBe(read(expected, path));
        expect(format(text), `${path} is not a fmt fixed point`).toBe(text);
      }
      expect(spec.validate).toBe("skip");
    });

    it(`${name}: each resource in flows.tf reads back to its document`, () => {
      const file = parse(files["flows.tf"]!, "flows.tf");
      const resources = file.body.items.filter(
        (i): i is Block =>
          i.kind === "block" && (i.labels[0] === FLOW_RESOURCE || i.labels[0] === MODULE_RESOURCE),
      );
      expect(resources).toHaveLength(docs.length);
      for (const doc of docs) {
        const type = doc.kind === "module" ? MODULE_RESOURCE : FLOW_RESOURCE;
        const block = resources.find(
          (r) => r.labels[0] === type && r.labels[1] === slugIdentifier(doc.name),
        )!;
        const { doc: back, sidecar } = toFlowDoc(sourceOf(file, block));
        expect(bytes(back)).toBe(bytes(viewed(doc)));
        expect(sidecar.instanceId).toBe(
          spec.options?.instanceIdExpression ?? "var.connect_instance_id",
        );
      }
    });
  }
});

describe("emitFlowascode", () => {
  const demo = JSON.parse(
    read(EMIT, "..", "..", "demo", "appointment-line.flowdoc.json"),
  ) as FlowDoc;

  it("refuses a literal ARN in the address map", () => {
    expect(() =>
      emitFlowascode([demo], {
        addressMap: {
          "queue:appointments": "arn:aws:connect:us-west-2:111122223333:instance/x/queue/y",
        },
      }),
    ).toThrow(EmitFlowascodeError);
  });

  it("refuses two documents emitting one address, and lists every problem", () => {
    let error: unknown;
    try {
      emitFlowascode([demo, demo, { ...demo, name: "Not A Slug" }]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EmitFlowascodeError);
    expect((error as EmitFlowascodeError).problems).toEqual([
      "two documents both emit flowascode_contact_flow.appointment_line",
      'document name "Not A Slug" is not a slug',
    ]);
  });

  it("asks for the provider at the constraint the contract names", () => {
    expect(emitFlowascode([demo]).files["versions.tf.example"]).toContain(
      `version = "${FLOWASCODE_PROVIDER_CONSTRAINT}"`,
    );
  });
});
