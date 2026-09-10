/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A07 acceptance. Everything here runs offline against synthesized
// CloudFormation templates (aws-cdk-lib/assertions); the live-deploy half of
// the acceptance lives in integration.test.ts behind FLOW_TEST_INSTANCE_ARN.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { collectRefs, serialize, type FlowDoc } from "@flow-as-code/core";
import { App, Fn, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { afterEach, describe, expect, it } from "vitest";

import { FlowSet, type TokenBinder } from "./index.js";
import { callbackModule, demoDoc, opaqueBinder, routerFlow } from "./test-helpers.js";

const INSTANCE_ARN_TOKEN = "INSTANCE_ARN_TOKEN";

function synthTemplate(docs: FlowDoc[], binder: TokenBinder = opaqueBinder()): Template {
  const stack = new Stack(new App(), "Test");
  new FlowSet(stack, "Flows", { instanceArn: INSTANCE_ARN_TOKEN, source: docs, binder });
  return Template.fromStack(stack);
}

/** The one resource of `type`, as [logicalId, resource]. */
function only(template: Template, type: string): [string, any] {
  const resources = template.findResources(type);
  const entries = Object.entries(resources);
  expect(entries, `expected exactly one ${type}`).toHaveLength(1);
  return entries[0] as [string, any];
}

/**
 * A Content property is either a plain string or an Fn::Join of strings and
 * intrinsics. Returns the concatenated literal text plus the Fn::GetAtt
 * targets embedded in it.
 */
function splitContent(content: unknown): { text: string; getAtts: string[][] } {
  if (typeof content === "string") return { text: content, getAtts: [] };
  const parts = (content as { "Fn::Join": [string, unknown[]] })["Fn::Join"][1];
  let text = "";
  const getAtts: string[][] = [];
  for (const part of parts) {
    if (typeof part === "string") text += part;
    else getAtts.push((part as { "Fn::GetAtt": string[] })["Fn::GetAtt"]);
  }
  return { text, getAtts };
}

describe("FlowSet over the demo doc", () => {
  it("creates one ContactFlow with binder tokens and no cdref tokens", () => {
    const template = synthTemplate([demoDoc()]);
    template.resourceCountIs("AWS::Connect::ContactFlow", 1);
    template.resourceCountIs("AWS::Connect::ContactFlowModule", 0);

    const [, flow] = only(template, "AWS::Connect::ContactFlow");
    expect(flow.Properties.Name).toBe("appointment-line");
    expect(flow.Properties.Type).toBe("CONTACT_FLOW");
    expect(flow.Properties.InstanceArn).toBe(INSTANCE_ARN_TOKEN);

    const content = flow.Properties.Content as string;
    expect(content).not.toContain("${cdref:");
    expect(content).toContain("QUEUE_TOKEN[appointments]");
    expect(content).toContain("HOURS_TOKEN[main-line]");
    expect(content).toContain("LAMBDA_TOKEN[appointment-lookup]");
    // Materialized content carries the projected console layout.
    expect(JSON.parse(content).Metadata.ActionMetadata).toBeDefined();

    expect(template.toJSON()).toMatchSnapshot();
  });

  it("passes an opaque binder string through byte-exactly", () => {
    // Deliberately hostile: an intrinsic-looking fragment, an ARN, and a
    // stray placeholder. Nothing may rewrite or escape-mangle it.
    const sentinel = '{"Fn::GetAtt":["Q","Arn"]} arn:aws:not-a-real-arn ${odd}';
    const binder = { ...opaqueBinder(), queue: () => sentinel };
    const [, flow] = only(synthTemplate([demoDoc()], binder), "AWS::Connect::ContactFlow");
    const parsed = JSON.parse(flow.Properties.Content as string);
    const action = parsed.Actions.find(
      (a: { Identifier: string }) => a.Identifier === "set-working-queue",
    );
    expect(action.Parameters.QueueId).toBe(sentinel);
  });
});

describe("FlowSet with a module (acceptance stack)", () => {
  const acceptance = () => synthTemplate([routerFlow(), callbackModule()]);

  it("creates flow, module, module version, and module alias", () => {
    const template = acceptance();
    template.resourceCountIs("AWS::Connect::ContactFlow", 1);
    template.resourceCountIs("AWS::Connect::ContactFlowModule", 1);
    template.resourceCountIs("AWS::Connect::ContactFlowModuleVersion", 1);
    template.resourceCountIs("AWS::Connect::ContactFlowModuleAlias", 1);
    expect(template.toJSON()).toMatchSnapshot();
  });

  it("resolves the module ref to a reference to the alias", () => {
    const template = acceptance();
    const [aliasId, alias] = only(template, "AWS::Connect::ContactFlowModuleAlias");
    const [versionId] = only(template, "AWS::Connect::ContactFlowModuleVersion");
    const [flowId, flow] = only(template, "AWS::Connect::ContactFlow");

    const { text, getAtts } = splitContent(flow.Properties.Content);
    expect(text).not.toContain("${cdref:");
    expect(text).toContain("QUEUE_TOKEN[appointments]");
    expect(text).toContain("HOURS_TOKEN[main-line]");
    expect(text).toContain("LAMBDA_TOKEN[appointment-lookup]");
    expect(getAtts).toEqual([[aliasId, "ContactFlowModuleAliasARN"]]);

    expect(alias.Properties.Name).toBe("live");
    expect(alias.Properties.ContactFlowModuleVersion).toEqual({
      "Fn::GetAtt": [versionId, "Version"],
    });

    // Explicit ordering: alias (and transitively version and module) exist
    // before the flow that references it.
    expect(flow.DependsOn).toContain(aliasId);
    expect(template.findResources("AWS::Connect::ContactFlow")[flowId]).toBeDefined();
  });

  it("keeps flow content identical across a module content bump that repoints the alias", () => {
    // The module's text changes; a new immutable version is published (new
    // logical ID) and the alias repoints to it. The referencing flow must be
    // byte-identical, which is the point of routing module refs through the
    // alias ARN.
    const before = synthTemplate([routerFlow(), callbackModule("We can call you back instead.")]);
    const after = synthTemplate([routerFlow(), callbackModule("New copy: expect a call shortly.")]);

    const [beforeVersionId, beforeVersion] = only(before, "AWS::Connect::ContactFlowModuleVersion");
    const [afterVersionId, afterVersion] = only(after, "AWS::Connect::ContactFlowModuleVersion");
    expect(afterVersionId).not.toBe(beforeVersionId);

    const [beforeAliasId] = only(before, "AWS::Connect::ContactFlowModuleAlias");
    const [afterAliasId, afterAlias] = only(after, "AWS::Connect::ContactFlowModuleAlias");
    expect(afterAliasId).toBe(beforeAliasId);
    expect(afterAlias.Properties.ContactFlowModuleVersion).toEqual({
      "Fn::GetAtt": [afterVersionId, "Version"],
    });
    // The new version must still be tied to the same module resource, not to
    // a stray one; asserting only that Properties exists proved nothing.
    expect(afterVersion.Properties.ContactFlowModuleId).toEqual(
      beforeVersion.Properties.ContactFlowModuleId,
    );

    const [beforeFlowId, beforeFlow] = only(before, "AWS::Connect::ContactFlow");
    const [afterFlowId, afterFlow] = only(after, "AWS::Connect::ContactFlow");
    expect(afterFlowId).toBe(beforeFlowId);
    expect(afterFlow).toEqual(beforeFlow);
  });

  /** A module whose first action invokes another module by alias. */
  function wrapperModule(name: string, invokes: string): FlowDoc {
    const doc = callbackModule();
    doc.name = name;
    doc.content.Actions[0]!.Type = "InvokeFlowModule";
    doc.content.Actions[0]!.Parameters = { FlowModuleId: `\${cdref:module:${invokes}@live}` };
    doc.refs = collectRefs(doc.content);
    return doc;
  }

  it("supports modules invoking modules, dependency-ordered", () => {
    const inner = callbackModule();
    const outer = wrapperModule("outer-wrapper", "callback-offer");
    const template = synthTemplate([outer, inner]);
    template.resourceCountIs("AWS::Connect::ContactFlowModule", 2);
    template.resourceCountIs("AWS::Connect::ContactFlowModuleAlias", 2);

    const modules = template.findResources("AWS::Connect::ContactFlowModule");
    const outerModule = Object.values(modules).find(
      (m: any) => m.Properties.Name === "outer-wrapper",
    ) as any;
    const innerId = Object.entries(modules).find(
      ([, m]: [string, any]) => m.Properties.Name === "callback-offer",
    )![0];

    // The alias belonging to the inner module.
    const [innerAliasId] = Object.entries(
      template.findResources("AWS::Connect::ContactFlowModuleAlias"),
    ).find(
      ([, a]: [string, any]) => a.Properties.ContactFlowModuleId["Fn::GetAtt"][0] === innerId,
    )!;

    const { getAtts } = splitContent(outerModule.Properties.Content);
    expect(getAtts).toEqual([[innerAliasId, "ContactFlowModuleAliasARN"]]);
    expect(outerModule.DependsOn).toContain(innerAliasId);
  });

  it("rejects a module reference cycle", () => {
    const a = wrapperModule("mod-a", "mod-b");
    const b = wrapperModule("mod-b", "mod-a");
    expect(() => synthTemplate([a, b])).toThrow(/cycle/);
  });
});

describe("FlowSet validation", () => {
  it("names the token and method when the binder cannot resolve a ref", () => {
    const binder = opaqueBinder() as Partial<TokenBinder>;
    delete binder.hours;
    expect(() => synthTemplate([demoDoc()], binder as TokenBinder)).toThrow(
      /TokenBinder has no hours\(\) method.*\$\{cdref:hours:main-line\}/,
    );
  });

  it("rejects a binder method returning undefined", () => {
    const binder = { ...opaqueBinder(), lambda: () => undefined as unknown as string };
    expect(() => synthTemplate([demoDoc()], binder)).toThrow(
      /TokenBinder\.lambda\("appointment-lookup"\) returned undefined/,
    );
  });

  it("requires flow() only when a doc uses a flow ref", () => {
    const doc = demoDoc();
    const transfer = {
      Identifier: "hand-off",
      Type: "TransferToFlow",
      Parameters: { ContactFlowId: "${cdref:flow:overflow-line}" },
      Transitions: {},
    };
    doc.content.Actions = [...doc.content.Actions, transfer];
    // no-unresolved-token requires a complete refs index; rebuild it the way
    // synth would after an edit.
    doc.refs = collectRefs(doc.content);
    expect(() => synthTemplate([doc])).toThrow(/no flow\(\) method/);
  });

  it("resolves a flow ref through the binder's flow() method", () => {
    // The suite only proved the error path for flow refs; this is the positive
    // case, so a regression that dropped flow-ref resolution would be caught.
    const doc = demoDoc();
    doc.content.Actions = [
      ...doc.content.Actions,
      {
        Identifier: "hand-off",
        Type: "TransferToFlow",
        Parameters: { ContactFlowId: "${cdref:flow:overflow-line}" },
        Transitions: {},
      },
    ];
    doc.refs = collectRefs(doc.content);

    const binder: TokenBinder = { ...opaqueBinder(), flow: (n) => `FLOW_TOKEN[${n}]` };
    const [, flow] = only(synthTemplate([doc], binder), "AWS::Connect::ContactFlow");
    const content = JSON.stringify(flow.Properties.Content);
    expect(content).toContain("FLOW_TOKEN[overflow-line]");
    expect(content).not.toContain("${cdref:");
  });

  it("refuses duplicate document names", () => {
    expect(() => synthTemplate([demoDoc(), demoDoc()])).toThrow(
      /Duplicate document name\(s\) .*appointment-line/,
    );
  });

  it("refuses a doc that references a module not in the set", () => {
    expect(() => synthTemplate([routerFlow()])).toThrow(
      /no module named "callback-offer" is in this FlowSet/,
    );
  });

  it("refuses a doc failing a hard lint rule (literal ARN)", () => {
    const doc = demoDoc();
    const queueAction = doc.content.Actions.find((a) => a.Identifier === "set-working-queue")!;
    queueAction.Parameters = {
      QueueId: "arn:aws:connect:us-east-1:000000000000:instance/i/queue/q",
    };
    expect(() => synthTemplate([doc])).toThrow(/FlowSet refused/);
  });
});

describe("FlowSet sources and determinism", () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("reads a directory of *.flowdoc.json identically to an in-memory array", () => {
    const base = new URL("../.vitest/", import.meta.url).pathname;
    mkdirSync(base, { recursive: true });
    const dir = mkdtempSync(join(base, "flowset-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "appointment-line.flowdoc.json"), serialize(demoDoc()));

    const fromDir = synthTemplate([demoDoc()]);
    const stack = new Stack(new App(), "Test");
    new FlowSet(stack, "Flows", {
      instanceArn: INSTANCE_ARN_TOKEN,
      source: dir,
      binder: opaqueBinder(),
    });
    expect(Template.fromStack(stack).toJSON()).toEqual(fromDir.toJSON());
  });

  it("rejects an empty source directory", () => {
    const base = new URL("../.vitest/", import.meta.url).pathname;
    mkdirSync(base, { recursive: true });
    const dir = mkdtempSync(join(base, "flowset-empty-"));
    tmpDirs.push(dir);
    expect(() => {
      const stack = new Stack(new App(), "Test");
      new FlowSet(stack, "Flows", {
        instanceArn: INSTANCE_ARN_TOKEN,
        source: dir,
        binder: opaqueBinder(),
      });
    }).toThrow(/no \*\.flowdoc\.json files/);
  });

  it("synthesizes byte-identical templates across two apps, CDK tokens included", () => {
    // The binder returns real CDK tokens (Fn.importValue). Their unresolved
    // numbering differs per app, but the resolved template must not.
    const build = (): Record<string, unknown> => {
      const stack = new Stack(new App(), "Test");
      const binder: TokenBinder = {
        ...opaqueBinder(),
        queue: (n) => Fn.importValue(`queue-${n}`),
        hours: (n) => Fn.importValue(`hours-${n}`),
        lambda: (n) => Fn.importValue(`lambda-${n}`),
      };
      new FlowSet(stack, "Flows", {
        instanceArn: INSTANCE_ARN_TOKEN,
        source: [routerFlow(), callbackModule()],
        binder,
      });
      return Template.fromStack(stack).toJSON() as Record<string, unknown>;
    };
    const a = build();
    const b = build();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    // And the import lands in the flow content as an intrinsic.
    const flow = Object.values((a.Resources as Record<string, any>) ?? {}).find(
      (r: any) => r.Type === "AWS::Connect::ContactFlow",
    ) as any;
    expect(JSON.stringify(flow.Properties.Content)).toContain(
      '"Fn::ImportValue":"queue-appointments"',
    );
  });
});
