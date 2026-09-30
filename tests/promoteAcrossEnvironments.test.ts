/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// examples/promote-across-environments, run rather than described.
//
// The repository claims that one FlowDoc reaches two environments without a
// per-environment ARN table (README.md). Nothing proved it: every FlowSet test built
// exactly one stack, and the two emit-tf fixtures each emit one tree. This runs
// the example's own inputs, on both paths, and holds the claim to what the
// tools actually produce.
//
// The load-bearing assertion is that the two Terraform trees differ in exactly
// one file. Mutation-verified in both directions: emitting the prod tree with
// the dev address map makes the difference set empty and turns it red, and
// giving one tree a different `instanceIdExpression` adds flows.tf and drops
// variables.tf from the other tree and turns it red too.
//
// The flowascode path (examples/promote-across-environments/flowascode/) is held
// the same way: its two trees differ in exactly flows.tf, and only inside the
// refs block. Mutation-verified: emitting the prod tree with the dev map turns
// the difference set empty and red. Its `tofu validate` half runs against the
// published provider (B03e), from OpenTofu 1.10.
//
// The `tofu validate` half is gated on RUN_TOFU_VALIDATE=1 like every other
// test that runs the real tool, and it uses the same harness and provider
// cache. The emit-tf CI job is what sets that variable, so this file also holds
// the job to still naming the `repo` project, the way packages/tf and
// packages/studio hold it to naming theirs.
import { readFileSync } from "node:fs";

import { collectRefs, type FlowDoc } from "@flow-as-code/core";
import { emitFlowascode } from "@flow-as-code/hcl";
import { emitTf } from "@flow-as-code/tf";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";

import {
  TOFU_ENABLED,
  flowascodeSupported,
  emitTfCiJob,
  materializeFiles,
  providerSites,
  providersForMode,
  tofu,
} from "../packages/tf/src/__fixtures__/tofu.js";
import { buildApp } from "../examples/promote-across-environments/cdk/app.js";

const EXAMPLE = new URL("../examples/promote-across-environments/", import.meta.url);

const readExample = (path: string): string => readFileSync(new URL(path, EXAMPLE), "utf8");
const readJson = (path: string): Record<string, string> =>
  JSON.parse(readExample(path)) as Record<string, string>;

const doc = JSON.parse(readExample("flows/appointment-line.flowdoc.json")) as FlowDoc;
const maps = {
  dev: readJson("refs.dev.tfmap.json"),
  prod: readJson("refs.prod.tfmap.json"),
};

const emit = (addressMap: Record<string, string>): Record<string, string> =>
  emitTf([doc], { addressMap }).files;

describe("the example's inputs", () => {
  it("is one document with three references and no literal ARN", () => {
    expect(doc.name).toBe("appointment-line");
    expect(collectRefs(doc.content).map((r) => r.token)).toEqual([
      "${cdref:hours:main-line}",
      "${cdref:lambda:appointment-lookup}",
      "${cdref:queue:appointments}",
    ]);
    expect(JSON.stringify(doc)).not.toMatch(/arn:aws/i);
  });

  it("is the conformance demo document, not a fork of it", () => {
    // The example's copy exists because prettier formats examples/ and ignores
    // conformance/, so the two files are not byte-identical and cannot be a
    // symlink or a re-read. They are the same document, though, and the
    // repository says so in several places. Without this, a change to the demo
    // leaves the example quietly describing a flow nothing else has.
    const demo = JSON.parse(
      readFileSync(
        new URL("../conformance/demo/appointment-line.flowdoc.json", import.meta.url),
        "utf8",
      ),
    ) as FlowDoc;
    expect(doc).toEqual(demo);
  });

  it("has two address maps covering the same references with different addresses", () => {
    // Without this the one-file-differs assertion below could pass on two maps
    // that happen to be the same file twice.
    expect(Object.keys(maps.prod).sort()).toEqual(Object.keys(maps.dev).sort());
    for (const [key, dev] of Object.entries(maps.dev)) {
      expect(maps.prod[key], key).toBeDefined();
      expect(maps.prod[key], key).not.toBe(dev);
    }
    for (const value of [...Object.values(maps.dev), ...Object.values(maps.prod)]) {
      expect(value).not.toMatch(/arn:aws/i);
    }
  });
});

describe("one FlowDoc, two Terraform trees", () => {
  const dev = emit(maps.dev);
  const prod = emit(maps.prod);

  it("emits the same set of files for both environments", () => {
    const names = Object.keys(dev).sort();
    expect(Object.keys(prod).sort()).toEqual(names);
    // Named rather than counted, so a tree that lost a file still fails.
    expect(names).toEqual([
      "flow_refs.tf",
      "flows.tf",
      "flows/appointment-line.flow.tftpl",
      "variables.tf",
      "versions.tf.example",
    ]);
  });

  it("differs in exactly one file, flow_refs.tf", () => {
    const differing = Object.keys(dev)
      .filter((name) => dev[name] !== prod[name])
      .sort();
    expect(differing).toEqual(["flow_refs.tf"]);
  });

  it("renders the flow template and flows.tf independently of the map", () => {
    // The reason the trees can differ in one file: the template refers to
    // local.flow_refs by variable name, and the variable names come from the
    // tokens, not from what the map resolves them to.
    const template = dev["flows/appointment-line.flow.tftpl"] ?? "";
    expect(template).toContain("${queue_appointments_arn}");
    expect(template).not.toContain("cdref:");
    for (const address of [...Object.values(maps.dev), ...Object.values(maps.prod)]) {
      expect(template).not.toContain(address);
      expect(dev["flows.tf"]).not.toContain(address);
    }
  });

  it.each([
    ["dev", maps.dev, maps.prod],
    ["prod", maps.prod, maps.dev],
  ])("gives %s a flow_refs.tf holding its own addresses and no ARN", (name, own, other) => {
    const refs = (name === "dev" ? dev : prod)["flow_refs.tf"] ?? "";
    for (const address of Object.values(own)) expect(refs).toContain(address);
    for (const address of Object.values(other)) expect(refs).not.toContain(address);
    expect(refs).not.toMatch(/arn:aws/i);
    expect(refs).not.toContain("TODO_MISSING_ADDRESS");
  });

  it("writes no literal ARN into either tree", () => {
    for (const files of [dev, prod]) {
      for (const [path, content] of Object.entries(files)) {
        expect(content, path).not.toMatch(/arn:aws/i);
      }
    }
  });

  describe("the tofu gate", () => {
    // Same reasoning as packages/tf/src/validate.test.ts: gating is a tradeoff,
    // not a way to stop running these, so the job that sets the variable is
    // held to still running this project.
    it("runs the repo project in the emit-tf job in CI", () => {
      const job = emitTfCiJob();
      expect(job).toContain('RUN_TOFU_VALIDATE: "1"');
      expect(job).toContain("--project repo");
    });

    // The gated case below reads two providers.tf out of the example and hands
    // them to `tofu init`. The prewarm has to have fetched what they resolve to
    // before any worker starts, and it works from providerSites(), so the two
    // have to be talking about the same files. Asserted by path rather than
    // trusted: this file reading one path while the registry scans another is
    // precisely the shape of the miss being fixed.
    it.each(["dev", "prod"] as const)(
      "has %s's providers.tf named by the harness's provider registry",
      (name) => {
        const path = `examples/promote-across-environments/terraform/${name}/providers.tf`;
        const site = providerSites().find((candidate) => candidate.path === path);
        expect(site, path).toBeDefined();
        expect(site?.surface).toBe("example");
        expect(site?.committed).toBe(readExample(`terraform/${name}/providers.tf`));
      },
    );
  });

  describe.skipIf(!TOFU_ENABLED)("tofu (RUN_TOFU_VALIDATE=1)", () => {
    // The README's own step 2: emit the tree, drop the environment's own
    // configuration beside it, and let the real tool judge the result. The
    // addresses in flow_refs.tf have to resolve against that configuration,
    // which is the half a byte comparison cannot check.
    it.each(["dev", "prod"] as const)(
      "validates the %s tree against that environment's own configuration",
      (name) => {
        // providers.tf goes through the TOFU_PROVIDER_MODE seam like every
        // other gated init. It was the one site fc369c5 missed: this file names
        // none of the seam's exports, so `~> 6.0` reached tofu unchanged and
        // resolved whatever was newest that morning, cold, beside a suite that
        // had just been pinned to stop doing exactly that. In `pinned` the seam
        // narrows it to the version the conformance fixtures adopted; in
        // `float` it leaves it alone, because unlike a fixture this file is the
        // advice the repository publishes and `~> 6.0` is what a reader copies.
        const support = {
          "providers.tf": providersForMode(
            readExample(`terraform/${name}/providers.tf`),
            "example",
          ),
          "resources.tf": readExample(`terraform/${name}/resources.tf`),
        };
        const workspace = materializeFiles({ ...(name === "dev" ? dev : prod), ...support });

        const init = tofu(["init", "-backend=false", "-input=false", "-no-color"], workspace);
        expect(init.output).toContain("initialized");
        expect(init.status).toBe(0);

        const validate = tofu(["validate", "-no-color"], workspace);
        expect(validate.output).toContain("The configuration is valid");
        expect(validate.status).toBe(0);
      },
      600_000,
    );
  });
});

describe("one FlowDoc, two flowascode trees", () => {
  const emitNative = (addressMap: Record<string, string>): Record<string, string> =>
    emitFlowascode([doc], { addressMap }).files;
  const dev = emitNative(maps.dev);
  const prod = emitNative(maps.prod);

  /** The resource's refs block, and flows.tf with that block removed. */
  const REFS_BLOCK = /^ {2}refs = \{\n(?: {4}.*\n)*? {2}\}\n/m;
  const split = (flows: string): { refs: string; rest: string } => {
    const refs = REFS_BLOCK.exec(flows)?.[0] ?? "";
    return { refs, rest: flows.replace(REFS_BLOCK, "") };
  };

  it("emits the same set of files for both environments", () => {
    const names = Object.keys(dev).sort();
    expect(Object.keys(prod).sort()).toEqual(names);
    expect(names).toEqual(["flows.tf", "variables.tf", "versions.tf.example"]);
  });

  it("differs in exactly one file, flows.tf", () => {
    const differing = Object.keys(dev)
      .filter((name) => dev[name] !== prod[name])
      .sort();
    expect(differing).toEqual(["flows.tf"]);
  });

  it("differs only inside the refs block", () => {
    const devFlows = split(dev["flows.tf"] ?? "");
    const prodFlows = split(prod["flows.tf"] ?? "");
    // A pattern that matched nothing would make the two rests equal for the
    // wrong reason: the whole files, which differ.
    expect(devFlows.refs).toContain('"queue:appointments"');
    expect(prodFlows.refs).toContain('"queue:appointments"');
    expect(devFlows.rest).toBe(prodFlows.rest);
    expect(devFlows.rest).toContain('queue_id = "queue:appointments"');
  });

  it.each([
    ["dev", maps.dev, maps.prod],
    ["prod", maps.prod, maps.dev],
  ])("gives %s a refs block holding its own addresses and no ARN", (name, own, other) => {
    const flows = (name === "dev" ? dev : prod)["flows.tf"] ?? "";
    const { refs } = split(flows);
    for (const address of Object.values(own)) expect(refs).toContain(address);
    for (const address of Object.values(other)) expect(flows).not.toContain(address);
    expect(flows).not.toContain("TODO: no terraform address");
  });

  it("writes no literal ARN into either tree", () => {
    for (const files of [dev, prod]) {
      for (const [path, content] of Object.entries(files)) {
        expect(content, path).not.toMatch(/arn:aws/i);
      }
    }
  });

  it.each(["dev", "prod"] as const)(
    "gives %s the same resources as the Terraform path, and the flowascode provider",
    (name) => {
      // The two paths deploy the same flow against the same supporting
      // resources, so the environment halves are copies, held equal here.
      expect(readExample(`flowascode/${name}/resources.tf`)).toBe(
        readExample(`terraform/${name}/resources.tf`),
      );
      const providers = readExample(`flowascode/${name}/providers.tf`);
      expect(providers).toContain('source  = "flow-as-code/flowascode"');
      expect(providers).toContain('version = "~> 0.1"');
      expect(providers).toContain('provider "flowascode"');
    },
  );

  // Step 2b's validation: the emitted tree beside the environment's own
  // configuration, against the published provider (B03e). The provider's
  // OpenTofu floor is 1.10, so the emit-tf job's 1.7.0 lane skips it.
  describe.skipIf(!flowascodeSupported())("tofu (RUN_TOFU_VALIDATE=1)", () => {
    it.each(["dev", "prod"] as const)(
      "validates the %s flowascode tree against that environment's own configuration",
      (name) => {
        const { "versions.tf.example": _example, ...tree } = name === "dev" ? dev : prod;
        const workspace = materializeFiles({
          ...tree,
          "providers.tf": providersForMode(
            readExample(`flowascode/${name}/providers.tf`),
            "example",
          ),
          "resources.tf": readExample(`flowascode/${name}/resources.tf`),
        });

        const init = tofu(["init", "-backend=false", "-input=false", "-no-color"], workspace);
        expect(init.output).toContain("initialized");
        expect(init.status).toBe(0);

        const validate = tofu(["validate", "-no-color"], workspace);
        expect(validate.output).toContain("The configuration is valid");
        expect(validate.status).toBe(0);
      },
      600_000,
    );
  });
});

/** The Content property is a plain string or an `Fn::Join` of strings and intrinsics. */
function contentParts(content: unknown): unknown[] {
  if (typeof content === "string") return [content];
  const join = (content as { "Fn::Join"?: [string, unknown[]] })["Fn::Join"];
  if (join === undefined) throw new Error(`Content is neither a string nor an Fn::Join`);
  expect(join[0]).toBe("");
  return join[1];
}

/** The flow's literal text with each bound reference blanked, and those bindings. */
function splitFlow(template: Template): { skeleton: string; bindings: unknown[] } {
  const flows = Object.values(template.findResources("AWS::Connect::ContactFlow"));
  expect(flows).toHaveLength(1);
  const parts = contentParts((flows[0] as { Properties: { Content: unknown } }).Properties.Content);
  return {
    skeleton: parts.map((part) => (typeof part === "string" ? part : " ")).join(""),
    bindings: parts.filter((part) => typeof part !== "string"),
  };
}

describe("one FlowDoc, two CDK stacks", () => {
  const app = buildApp();
  const dev = Template.fromStack(app.node.findChild("AppointmentLine-dev") as never);
  const prod = Template.fromStack(app.node.findChild("AppointmentLine-prod") as never);

  it("carries the same flow content in both stacks", () => {
    const { skeleton: devSkeleton } = splitFlow(dev);
    const { skeleton: prodSkeleton } = splitFlow(prod);
    expect(devSkeleton).toBe(prodSkeleton);
    // A skeleton of nothing but blanks would compare equal for the wrong reason.
    expect(devSkeleton).toContain('"StartAction": "enable-logging"');
    expect(devSkeleton).not.toContain("cdref:");
  });

  it("binds the references to different resources in each stack", () => {
    const devBindings = splitFlow(dev).bindings;
    const prodBindings = splitFlow(prod).bindings;
    expect(devBindings).toHaveLength(collectRefs(doc.content).length);
    expect(prodBindings).toHaveLength(devBindings.length);
    expect(prodBindings).not.toEqual(devBindings);

    // Dev owns its resources, so every binding is a GetAtt at a resource in the
    // dev template. Prod does not, so every binding is a cross-stack import.
    const devResources = Object.keys(dev.toJSON().Resources as Record<string, unknown>);
    for (const binding of devBindings) {
      const [logicalId] = (binding as { "Fn::GetAtt": [string, string] })["Fn::GetAtt"];
      expect(devResources).toContain(logicalId);
    }
    for (const binding of prodBindings) {
      expect(binding).toHaveProperty("Fn::ImportValue");
    }
  });

  it("takes each environment's instance ARN from that environment, not from the repository", () => {
    const instanceArn = (template: Template): string => {
      const [flow] = Object.values(template.findResources("AWS::Connect::ContactFlow"));
      return JSON.stringify(
        (flow as { Properties: { InstanceArn: unknown } }).Properties.InstanceArn,
      );
    };
    expect(instanceArn(dev)).not.toBe(instanceArn(prod));
    expect(JSON.stringify(dev.toJSON())).not.toMatch(/arn:aws:connect/i);
    expect(JSON.stringify(prod.toJSON())).not.toMatch(/arn:aws:connect/i);
  });
});
