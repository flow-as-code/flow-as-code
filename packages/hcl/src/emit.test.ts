/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// emitFlowascode against conformance/hcl/emit: each case's files byte for
// byte (UPDATE_GOLDENS=1 rewrites them), each document's resource in
// flows.tf read back to the document, and the refusals emitTf makes.

import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
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

const ROOT = join(import.meta.dirname, "..", "..", "..");
const EMIT = join(ROOT, "conformance", "hcl", "emit");
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const read = (...p: string[]): string => readFileSync(join(...p), "utf8");

interface EmitCase {
  docs: string[];
  options?: { instanceIdExpression?: string; moduleAliases?: Record<string, string[]> };
  /** Keys the set resolves nowhere, and map keys no reference uses (task C12). */
  unbound?: string[];
  unusedMapKeys?: string[];
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
    const { files, unbound, unusedMapKeys } = emitFlowascode(docs, { addressMap, ...spec.options });

    it(`${name}: reports what the map leaves unbound and what it holds unused`, () => {
      expect(spec.unbound, "case.json names its unbound keys").toBeDefined();
      expect(spec.unusedMapKeys, "case.json names its unused map keys").toBeDefined();
      expect(unbound.map((u) => u.key)).toEqual(spec.unbound);
      expect(unusedMapKeys).toEqual(spec.unusedMapKeys);
      for (const u of unbound)
        expect(files["flows.tf"]).toContain(`${JSON.stringify(u.key)} = null`);
      for (const key of unusedMapKeys) expect(files["flows.tf"]).not.toContain(key);
    });

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
      // validate.test.ts runs it against the published provider (task B03e).
      expect(spec.validate).toBe("pass");
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

  it("refuses two module aliases that label one alias resource", () => {
    const module = (name: string): FlowDoc => ({
      flowdoc: "0.2",
      kind: "module",
      name,
      connectType: "MODULE",
      content: {
        Version: "2019-10-30",
        StartAction: "end",
        Settings: {},
        Actions: [
          { Identifier: "end", Type: "EndFlowModuleExecution", Parameters: {}, Transitions: {} },
        ],
      },
    });
    const invoker: FlowDoc = {
      ...demo,
      name: "invoker",
      content: {
        Version: "2019-10-30",
        StartAction: "one",
        Actions: [
          {
            Identifier: "one",
            Type: "InvokeFlowModule",
            Parameters: { FlowModuleId: "${cdref:module:a-b@c}" },
            Transitions: { NextAction: "two", Errors: [], Conditions: [] },
          },
          {
            Identifier: "two",
            Type: "InvokeFlowModule",
            Parameters: { FlowModuleId: "${cdref:module:a@b-c}" },
            Transitions: { NextAction: "end", Errors: [], Conditions: [] },
          },
          { Identifier: "end", Type: "DisconnectParticipant", Parameters: {}, Transitions: {} },
        ],
      },
    };
    let error: unknown;
    try {
      emitFlowascode([invoker, module("a-b"), module("a")]);
    } catch (e) {
      error = e;
    }
    expect((error as EmitFlowascodeError).problems).toEqual([
      "module:a@b-c and module:a-b@c both emit flowascode_contact_flow_module_alias.a_b_c",
    ]);
  });

  it("asks for the provider at the constraint the contract names", () => {
    expect(emitFlowascode([demo]).files["versions.tf.example"]).toContain(
      `version = "${FLOWASCODE_PROVIDER_CONSTRAINT}"`,
    );
  });

  // One string in the emitted example, the provider tutorials, the cookbook and
  // every example root (task C12). The emitted `>= 0.1` admitted a 1.0 the
  // tutorials' `~> 0.1` did not, so a reader following the tutorial and a
  // reader copying the example were given different ranges.
  it("asks for the provider at the range the tutorials and examples give", () => {
    const files = (dir: string, suffix: string, found: string[] = []): string[] => {
      for (const entry of readdirSync(dir).sort()) {
        const full = join(dir, entry);
        if (entry === "node_modules") continue;
        if (statSync(full).isDirectory()) files(full, suffix, found);
        else if (entry.endsWith(suffix)) found.push(full);
      }
      return found;
    };
    const sources = [
      ...files(join(ROOT, "docs", "tutorials"), ".md"),
      ...files(join(ROOT, "examples"), ".tf"),
    ];
    const block =
      /flowascode\s*=\s*\{\s*source\s*=\s*"flow-as-code\/flowascode"\s*version\s*=\s*"([^"]*)"/g;
    const seen: string[] = [];
    for (const path of sources) {
      for (const match of read(path).matchAll(block)) {
        seen.push(relative(ROOT, path));
        expect(match[1], relative(ROOT, path)).toBe(FLOWASCODE_PROVIDER_CONSTRAINT);
      }
    }
    expect(seen).toContain("docs/tutorials/01-first-flow.md");
    expect(seen).toContain("examples/terraform-provider/flows/versions.tf");
    expect(seen.length).toBeGreaterThan(5);
  });

  const flow = (name: string, parameters: Record<string, string>): FlowDoc => ({
    ...demo,
    name,
    content: {
      Version: "2019-10-30",
      StartAction: "one",
      Actions: [
        {
          Identifier: "one",
          Type: "UpdateContactTargetQueue",
          Parameters: parameters,
          Transitions: { NextAction: "end", Errors: [], Conditions: [] },
        },
        { Identifier: "end", Type: "DisconnectParticipant", Parameters: {}, Transitions: {} },
      ],
    },
  });

  const moduleDoc = (name: string): FlowDoc => ({
    flowdoc: "0.2",
    kind: "module",
    name,
    connectType: "MODULE",
    content: {
      Version: "2019-10-30",
      StartAction: "end",
      Settings: {},
      Actions: [
        { Identifier: "end", Type: "EndFlowModuleExecution", Parameters: {}, Transitions: {} },
      ],
    },
  });

  // Task C13: a promotion gate reads `terraform output` by FlowDoc name.
  it("writes an ARN and a document hash output per document, named by FlowDoc name", () => {
    const { files } = emitFlowascode([flow("2fa-line", {}), moduleDoc("greeting")]);
    const outputs = files["outputs.tf"]!;
    expect([...outputs.matchAll(/^output "([^"]+)"/gm)].map((m) => m[1])).toEqual([
      "_2fa_line_arn",
      "_2fa_line_document_sha256",
      "greeting_arn",
      "greeting_document_sha256",
    ]);
    expect(outputs).toContain("value       = flowascode_contact_flow._2fa_line.arn");
    expect(outputs).toContain(
      "value       = sha256(flowascode_contact_flow_module.greeting.flowdoc)",
    );
    expect(format(outputs)).toBe(outputs);
  });

  // Task C05: a module released on its own, bound from another root by alias.
  const invoker = (name: string, key: string): FlowDoc => ({
    ...demo,
    name,
    content: {
      Version: "2019-10-30",
      StartAction: "one",
      Actions: [
        {
          Identifier: "one",
          Type: "InvokeFlowModule",
          Parameters: { FlowModuleId: `\${cdref:${key}}` },
          Transitions: { NextAction: "end", Errors: [], Conditions: [] },
        },
        { Identifier: "end", Type: "DisconnectParticipant", Parameters: {}, Transitions: {} },
      ],
    },
  });
  const afterModule = (flows: string, module: string): string =>
    flows.slice(flows.indexOf(`resource "${MODULE_RESOURCE}" "${module}"`));

  it("writes no version and no alias for a module nothing invokes and nothing declares", () => {
    const { files } = emitFlowascode([moduleDoc("greeting")]);
    expect(files["flows.tf"]).toContain(`resource "${MODULE_RESOURCE}" "greeting"`);
    expect(files["flows.tf"]).not.toContain("flowascode_contact_flow_module_version");
    expect(files["flows.tf"]).not.toContain("flowascode_contact_flow_module_alias");
    expect(files["outputs.tf"]).not.toContain("_live_arn");
  });

  it("publishes a declared alias in exactly the shape an invoked alias takes", () => {
    const released = emitFlowascode([moduleDoc("greeting")], {
      moduleAliases: { greeting: ["live"] },
    }).files;
    const invoked = emitFlowascode([
      invoker("caller", "module:greeting@live"),
      moduleDoc("greeting"),
    ]).files;
    // Everything from the module resource on: the module, its version with
    // create_before_destroy, and the alias, byte for byte.
    expect(afterModule(released["flows.tf"]!, "greeting")).toBe(
      afterModule(invoked["flows.tf"]!, "greeting"),
    );
    expect(released["flows.tf"]).toContain("create_before_destroy = true");
    expect(released["flows.tf"]).toContain(
      'resource "flowascode_contact_flow_module_alias" "greeting_live"',
    );
    expect(released["outputs.tf"]).toContain('output "greeting_live_arn"');
    expect(released["outputs.tf"]).toContain(
      "value       = flowascode_contact_flow_module_alias.greeting_live.arn",
    );
  });

  it("unions declared aliases with invoked ones, sorted and once each", () => {
    const { files } = emitFlowascode(
      [invoker("caller", "module:greeting@prod"), moduleDoc("greeting")],
      { moduleAliases: { greeting: ["prod", "live"] } },
    );
    const labels = [
      ...files["flows.tf"]!.matchAll(
        /^resource "flowascode_contact_flow_module_alias" "([^"]+)"/gm,
      ),
    ].map((m) => m[1]);
    expect(labels).toEqual(["greeting_live", "greeting_prod"]);
    expect(files["flows.tf"]!.match(/flowascode_contact_flow_module_version" /g)).toHaveLength(1);
  });

  it("refuses a declared alias for a module the set does not emit, or that is not a slug", () => {
    let error: unknown;
    try {
      emitFlowascode([moduleDoc("greeting"), flow("farewell", {})], {
        moduleAliases: { farewell: ["live"], greeting: ["Live Now"] },
      });
    } catch (e) {
      error = e;
    }
    expect((error as EmitFlowascodeError).problems).toEqual([
      'moduleAliases names module "farewell", which this set does not emit',
      'moduleAliases alias "Live Now" for module "greeting" is not a slug',
    ]);
  });

  it("refuses a flow and a module that share a name, since they would share an output", () => {
    let error: unknown;
    try {
      emitFlowascode([flow("greeting", {}), moduleDoc("greeting")]);
    } catch (e) {
      error = e;
    }
    expect((error as EmitFlowascodeError).problems).toEqual([
      "flow greeting and module greeting both emit output greeting_arn",
      "flow greeting and module greeting both emit output greeting_document_sha256",
    ]);
  });

  it("reports each unbound key once, with every document that makes it", () => {
    const { files, unbound } = emitFlowascode(
      [
        flow("second", { QueueId: "${cdref:queue:shared}" }),
        flow("first", { QueueId: "${cdref:queue:shared}" }),
        flow("other", { QueueId: "${cdref:queue:bound}" }),
      ],
      { addressMap: { "queue:bound": "aws_connect_queue.bound.arn" } },
    );
    expect(unbound).toEqual([{ key: "queue:shared", documents: ["first", "second"] }]);
    expect(files["flows.tf"]).toContain('"queue:shared" = null');
  });

  it("binds nothing unbound when the map covers the set, in any of the three key forms", () => {
    const docs = [flow("a", { QueueId: "${cdref:queue:front-desk}" })];
    for (const key of ["${cdref:queue:front-desk}", "queue:front-desk", "queue_front_desk_arn"]) {
      const { unbound, unusedMapKeys } = emitFlowascode(docs, {
        addressMap: { [key]: "aws_connect_queue.front_desk.arn" },
      });
      expect(unbound, key).toEqual([]);
      expect(unusedMapKeys, key).toEqual([]);
    }
  });

  it("reports a map key no reference uses, and not one the set resolves itself", () => {
    const { unusedMapKeys, files } = emitFlowascode(
      [
        flow("caller", { QueueId: "${cdref:queue:q}", FlowId: "${cdref:flow:callee}" }),
        flow("callee", { QueueId: "${cdref:queue:q}" }),
      ],
      {
        addressMap: {
          "queue:q": "aws_connect_queue.q.arn",
          // Shadowed by the flow this set emits: reached, so not unused.
          "flow:callee": "aws_connect_contact_flow.elsewhere.arn",
          "queue:typo": "aws_connect_queue.typo.arn",
          queue_left_behind_arn: "aws_connect_queue.left_behind.arn",
        },
      },
    );
    expect(unusedMapKeys).toEqual(["queue:typo", "queue_left_behind_arn"]);
    expect(files["flows.tf"]).not.toContain("typo");
    expect(files["flows.tf"]).not.toContain("left_behind");
    expect(files["flows.tf"]).toContain("flowascode_contact_flow.callee.arn");
  });
});
