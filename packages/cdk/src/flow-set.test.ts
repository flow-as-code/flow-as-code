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
import { App, Fn, Lazy, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { afterEach, describe, expect, it } from "vitest";

import { FlowSet, type TokenBinder } from "./index.js";
import {
  callbackModule,
  demoDoc,
  hookedFlow,
  messageFlow,
  opaqueBinder,
  routerFlow,
  transferFlow,
} from "./test-helpers.js";

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

  it("names the token and both remedies when a module is neither in the set nor bound", () => {
    // C06: an out-of-set module is a binder gap, not a refusal. The message
    // has to say which token, and that the caller can add the module's
    // document or bind it, because either is a reasonable layout.
    expect(() => synthTemplate([routerFlow()])).toThrow(
      /TokenBinder has no module\(\) method, but "callback-router" contains \$\{cdref:module:callback-offer@live\} and no module named "callback-offer" is in this FlowSet\. Add the module's document to the set, or implement module\(name, alias\) on the binder/,
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

describe("FlowSet with flows referencing flows in the set (C06, shape 1)", () => {
  /** The ContactFlow whose Name is `name`, as [logicalId, resource]. */
  function flowNamed(template: Template, name: string): [string, any] {
    const entry = Object.entries(template.findResources("AWS::Connect::ContactFlow")).find(
      ([, r]: [string, any]) => r.Properties.Name === name,
    );
    expect(entry, `expected a ContactFlow named ${name}`).toBeDefined();
    return entry as [string, any];
  }

  it("resolves an event hook's flow reference to the flow's resource, with a dependency", () => {
    // The binder has no flow(): the set resolves its own flows, as the tf and
    // flowascode emitters do, so a binder is not consulted for them.
    const template = synthTemplate([
      hookedFlow("main-line", { CustomerWhisper: "whisper-line", CustomerHold: "hold-line" }),
      messageFlow("whisper-line"),
      messageFlow("hold-line"),
    ]);
    template.resourceCountIs("AWS::Connect::ContactFlow", 3);

    const [mainId, main] = flowNamed(template, "main-line");
    const [whisperId] = flowNamed(template, "whisper-line");
    const [holdId] = flowNamed(template, "hold-line");

    const { text, getAtts } = splitContent(main.Properties.Content);
    expect(text).not.toContain("${cdref:");
    expect(text).not.toMatch(/arn:aws/i);
    expect(getAtts).toEqual([
      [whisperId, "ContactFlowArn"],
      [holdId, "ContactFlowArn"],
    ]);
    expect(main.DependsOn).toEqual(expect.arrayContaining([whisperId, holdId]));
    expect(mainId).not.toBe(whisperId);
    expect(template.toJSON()).toMatchSnapshot();
  });

  it("does not consult the binder's flow() for a flow in the set", () => {
    const binder: TokenBinder = {
      ...opaqueBinder(),
      flow: (name) => {
        throw new Error(`binder asked for ${name}`);
      },
    };
    const template = synthTemplate(
      [hookedFlow("main-line", { AgentWhisper: "whisper-line" }), messageFlow("whisper-line")],
      binder,
    );
    const [whisperId] = flowNamed(template, "whisper-line");
    const [, main] = flowNamed(template, "main-line");
    expect(splitContent(main.Properties.Content).getAtts).toEqual([[whisperId, "ContactFlowArn"]]);
  });

  it("still binds a flow outside the set through flow(), which may return a Lazy", () => {
    // The dead-line pattern across two sets in one stack: the binder of one
    // set points at a flow the other set manages, and Lazy defers the lookup
    // until synth, after both constructs exist.
    const stack = new Stack(new App(), "Test");
    const whispers = new FlowSet(stack, "Whispers", {
      instanceArn: INSTANCE_ARN_TOKEN,
      source: [messageFlow("whisper-line")],
      binder: opaqueBinder(),
    });
    new FlowSet(stack, "Lines", {
      instanceArn: INSTANCE_ARN_TOKEN,
      source: [hookedFlow("main-line", { CustomerWhisper: "whisper-line" })],
      binder: {
        ...opaqueBinder(),
        flow: (name) =>
          Lazy.string({
            produce: () => {
              const flow = whispers.flows.get(name);
              if (flow === undefined) throw new Error(`no whisper flow "${name}"`);
              return flow.attrContactFlowArn;
            },
          }),
      },
    });
    const template = Template.fromStack(stack);
    const [whisperId] = flowNamed(template, "whisper-line");
    const [, main] = flowNamed(template, "main-line");
    expect(splitContent(main.Properties.Content).getAtts).toEqual([[whisperId, "ContactFlowArn"]]);
  });

  it("orders flows so a referenced flow is created first, and the template is stable", () => {
    // Names sort the referrer before its target; creation order must not.
    const a = synthTemplate([
      hookedFlow("a-main", { CustomerQueue: "z-queue" }),
      messageFlow("z-queue"),
    ]);
    const b = synthTemplate([
      messageFlow("z-queue"),
      hookedFlow("a-main", { CustomerQueue: "z-queue" }),
    ]);
    expect(JSON.stringify(a.toJSON())).toBe(JSON.stringify(b.toJSON()));
    const ids = Object.keys(a.findResources("AWS::Connect::ContactFlow"));
    expect(ids[0]).toContain("zqueue");
    expect(ids[1]).toContain("amain");
  });

  it("fails at synth naming the cycle when flow references form one", () => {
    // Two flows transferring to each other is something the console can build
    // in two saves and CloudFormation cannot create in one template. Synth is
    // where to say so, with the cycle spelled out.
    expect(() =>
      synthTemplate([
        transferFlow("day-line", "night-line"),
        transferFlow("night-line", "day-line"),
      ]),
    ).toThrow(/Flow reference cycle: day-line -> night-line -> day-line\./);
    expect(() => synthTemplate([transferFlow("loop-line", "loop-line")])).toThrow(
      /Flow reference cycle: loop-line -> loop-line\./,
    );
  });
});

describe("FlowSet with modules outside the set (C06, shape 2)", () => {
  it("binds an out-of-set module through the binder's module(), with the alias the token pins", () => {
    const binder: TokenBinder = {
      ...opaqueBinder(),
      module: (name, alias) => `MODULE_TOKEN[${name}@${alias}]`,
    };
    const template = synthTemplate([routerFlow()], binder);
    template.resourceCountIs("AWS::Connect::ContactFlow", 1);
    template.resourceCountIs("AWS::Connect::ContactFlowModule", 0);
    template.resourceCountIs("AWS::Connect::ContactFlowModuleAlias", 0);
    const [, flow] = only(template, "AWS::Connect::ContactFlow");
    const content = flow.Properties.Content as string;
    expect(content).toContain("MODULE_TOKEN[callback-offer@live]");
    expect(content).not.toContain("${cdref:");
  });

  it("passes the default alias to module() when the token pins none", () => {
    const doc = routerFlow();
    const invoke = doc.content.Actions.find((a) => a.Identifier === "offer")!;
    invoke.Parameters = { FlowModuleId: "${cdref:module:callback-offer}" };
    doc.refs = collectRefs(doc.content);
    const seen: [string, string | undefined][] = [];
    const binder: TokenBinder = {
      ...opaqueBinder(),
      module: (name, alias) => {
        seen.push([name, alias]);
        return `MODULE_TOKEN[${name}@${alias}]`;
      },
    };
    synthTemplate([doc], binder);
    expect(seen).toEqual([["callback-offer", "live"]]);
  });

  it("resolves a module in the set itself even when the binder has module()", () => {
    // In-set wins, as the emitters' "shadowed" rule has it: the alias this
    // construct manages is the one the flow must invoke.
    const binder: TokenBinder = {
      ...opaqueBinder(),
      module: (name) => {
        throw new Error(`binder asked for ${name}`);
      },
    };
    const template = synthTemplate([routerFlow(), callbackModule()], binder);
    const [aliasId] = only(template, "AWS::Connect::ContactFlowModuleAlias");
    const [, flow] = only(template, "AWS::Connect::ContactFlow");
    expect(splitContent(flow.Properties.Content).getAtts).toEqual([
      [aliasId, "ContactFlowModuleAliasARN"],
    ]);
  });

  it("rejects a module() returning a non-string, naming the call", () => {
    const binder = { ...opaqueBinder(), module: () => undefined as unknown as string };
    expect(() => synthTemplate([routerFlow()], binder)).toThrow(
      /TokenBinder\.module\("callback-offer"\) returned undefined/,
    );
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

describe("the name Connect shows", () => {
  it("is a document's displayName when it has one, and the construct id stays the slug", () => {
    const doc = { ...demoDoc(), displayName: "Appointment Line" };
    const template = synthTemplate([doc]);
    const [logicalId, flow] = only(template, "AWS::Connect::ContactFlow");
    expect(flow.Properties.Name).toBe("Appointment Line");
    expect(logicalId).toContain("appointmentline");
  });
});
