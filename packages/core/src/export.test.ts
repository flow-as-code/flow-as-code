/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  ConnectInventoryClient,
  ContactFlowModuleSummary,
  ContactFlowSummary,
  DescribedContactFlow,
  DescribedContactFlowModule,
  FlowDoc,
  InstanceInventory,
  LexBotSummary,
  ResourceSummary,
} from "./index.js";
import {
  buildReverseMap,
  codegen,
  createConnectInventoryClient,
  ExportError,
  exportFlow,
  exportInstance,
  lookupArn,
  materializeWithMap,
  normalizeArn,
  parseConnectArn,
  parseLambdaFunctionArn,
  reverseMapOfResourceMap,
  serialize,
  slugifyResourceName,
} from "./index.js";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

const INSTANCE =
  "arn:aws:connect:us-east-1:111122223333:instance/11111111-2222-3333-4444-555555555555";

/**
 * The recorded-fixture client. Everything under conformance/export/<case>/ is
 * what a live instance returned, so the offline suite runs exactly the code a
 * live export runs.
 *
 * `flows/<id>.json` is the published content. `flows/<id>.saved.json` stands in
 * for a flow that has never been published: describing it without the $SAVED
 * alias throws ContactFlowNotPublishedException, as the API does.
 */
class FixtureClient implements ConnectInventoryClient {
  readonly describeCalls: string[] = [];
  private readonly inventory: InstanceInventory;

  constructor(private readonly caseName: string) {
    this.inventory = readJson<InstanceInventory>(`conformance/export/${caseName}/inventory.json`);
  }

  private content(id: string): string {
    this.describeCalls.push(id);
    const saved = id.endsWith(":$SAVED");
    const base = saved ? id.slice(0, -":$SAVED".length) : id;
    const dir = `conformance/export/${this.caseName}/flows/`;
    const published = new URL(`${dir}${base}.json`, root);
    const draft = new URL(`${dir}${base}.saved.json`, root);
    if (saved) {
      if (existsSync(draft)) return readFileSync(draft, "utf8");
      if (existsSync(published)) return readFileSync(published, "utf8");
    } else if (existsSync(published)) {
      return readFileSync(published, "utf8");
    } else if (existsSync(draft)) {
      const error = new Error(`Flow ${base} has not been published.`);
      error.name = "ContactFlowNotPublishedException";
      throw error;
    }
    const error = new Error(`No fixture for ${id}`);
    error.name = "ResourceNotFoundException";
    throw error;
  }

  private summaryOf(id: string): ResourceSummary | undefined {
    return [...this.inventory.contactFlows, ...this.inventory.contactFlowModules].find(
      (s) => s.id === id,
    );
  }

  listContactFlows(contactFlowTypes?: readonly string[]): Promise<ContactFlowSummary[]> {
    const all = this.inventory.contactFlows;
    return Promise.resolve(
      contactFlowTypes === undefined
        ? all
        : all.filter((f) => contactFlowTypes.includes(f.contactFlowType ?? "")),
    );
  }

  describeContactFlow(contactFlowId: string): Promise<DescribedContactFlow> {
    const content = this.content(contactFlowId);
    const base = contactFlowId.replace(":$SAVED", "");
    const summary = this.summaryOf(base);
    return Promise.resolve({
      arn: summary?.arn ?? "",
      id: base,
      name: summary?.name ?? "",
      status: "PUBLISHED",
      content,
    });
  }

  listContactFlowModules(): Promise<ContactFlowModuleSummary[]> {
    return Promise.resolve(this.inventory.contactFlowModules);
  }

  describeContactFlowModule(id: string): Promise<DescribedContactFlowModule> {
    const content = this.content(id);
    const base = id.replace(":$SAVED", "");
    const summary = this.summaryOf(base);
    return Promise.resolve({
      arn: summary?.arn ?? "",
      id: base,
      name: summary?.name ?? "",
      content,
      settings: "{}",
    });
  }

  listQueues(): Promise<ResourceSummary[]> {
    return Promise.resolve(this.inventory.queues);
  }
  listHoursOfOperations(): Promise<ResourceSummary[]> {
    return Promise.resolve(this.inventory.hoursOfOperations);
  }
  listPrompts(): Promise<ResourceSummary[]> {
    return Promise.resolve(this.inventory.prompts);
  }
  listLambdaFunctions(): Promise<string[]> {
    return Promise.resolve(this.inventory.lambdaFunctions);
  }
  listBots(): Promise<LexBotSummary[]> {
    return Promise.resolve(this.inventory.lexBots);
  }
}

describe("ARN parsing", () => {
  it("reads the instance out of every Connect resource ARN", () => {
    const parsed = parseConnectArn(`${INSTANCE}/queue/q1`);
    expect(parsed).toEqual({
      partition: "aws",
      region: "us-east-1",
      account: "111122223333",
      instanceId: "11111111-2222-3333-4444-555555555555",
      resourceType: "queue",
      resourceId: "q1",
    });
  });

  // The two keywords that do not match their IAM resource-type names. A reverse
  // map keyed on the type name silently fails to resolve either.
  it("uses flow-module and operating-hours, not the resource-type names", () => {
    expect(parseConnectArn(`${INSTANCE}/flow-module/m1`)?.resourceType).toBe("flow-module");
    expect(parseConnectArn(`${INSTANCE}/operating-hours/h1`)?.resourceType).toBe("operating-hours");
    expect(parseConnectArn(`${INSTANCE}/contact-flow-module/m1`)?.resourceType).not.toBe(
      "flow-module",
    );
  });

  it("captures a $SAVED or version qualifier instead of gluing it to the id", () => {
    const saved = parseConnectArn(`${INSTANCE}/contact-flow/f1:$SAVED`);
    expect(saved?.resourceId).toBe("f1");
    expect(saved?.qualifier).toBe("$SAVED");
    expect(parseConnectArn(`${INSTANCE}/contact-flow/f1:3`)?.qualifier).toBe("3");
    expect(normalizeArn(`${INSTANCE}/contact-flow/f1:$SAVED`)).toBe(`${INSTANCE}/contact-flow/f1`);
  });

  it("takes a Lambda function name from the Lambda ARN itself", () => {
    expect(
      parseLambdaFunctionArn("arn:aws:lambda:us-east-1:111122223333:function:appointment-lookup"),
    ).toBe("appointment-lookup");
    expect(
      parseLambdaFunctionArn("arn:aws:lambda:us-east-1:111122223333:function:lookup:PROD"),
    ).toBe("lookup");
    expect(parseLambdaFunctionArn(`${INSTANCE}/queue/q1`)).toBeUndefined();
  });

  it("slugs console names", () => {
    expect(slugifyResourceName("Main Line")).toBe("main-line");
    expect(slugifyResourceName("  Front_Desk (US) ")).toBe("front-desk-us");
  });
});

describe("buildReverseMap", () => {
  const inventory = readJson<InstanceInventory>("conformance/export/demo-instance/inventory.json");
  const map = buildReverseMap(inventory);

  it("maps every resource type a flow can reference", () => {
    expect(lookupArn(map, `${INSTANCE}/queue/aaaa1111-0000-4000-8000-000000000001`)?.token).toBe(
      "${cdref:queue:appointments}",
    );
    expect(
      lookupArn(map, `${INSTANCE}/operating-hours/bbbb2222-0000-4000-8000-000000000001`)?.token,
    ).toBe("${cdref:hours:main-line}");
    expect(
      lookupArn(map, `${INSTANCE}/contact-flow/cccc3333-0000-4000-8000-000000000001`)?.token,
    ).toBe("${cdref:flow:appointment-line}");
    expect(
      lookupArn(map, `${INSTANCE}/flow-module/eeee5555-0000-4000-8000-000000000001`)?.token,
    ).toBe("${cdref:module:recording-consent}");
    expect(lookupArn(map, `${INSTANCE}/prompt/dddd4444-0000-4000-8000-000000000001`)?.token).toBe(
      "${cdref:prompt:consent-notice}",
    );
    expect(
      lookupArn(map, "arn:aws:lambda:us-east-1:111122223333:function:appointment-lookup")?.token,
    ).toBe("${cdref:lambda:appointment-lookup}");
  });

  it("resolves a reference that carries a $SAVED or version qualifier", () => {
    expect(
      lookupArn(map, `${INSTANCE}/contact-flow/cccc3333-0000-4000-8000-000000000001:$SAVED`)?.name,
    ).toBe("appointment-line");
  });

  // ListBots gives a V1 bot a name and region and no ARN, so there is nothing
  // in flow content to match it against. Silently omitting it would turn into a
  // spurious unknown-ARN error later, so it is warned about here.
  it("warns about a Lex V1 bot rather than pretending it is mapped", () => {
    expect(map.warnings.join("\n")).toContain("LegacyBot");
  });

  it("renames deterministically when two names slug the same", () => {
    const collided = buildReverseMap({
      ...inventory,
      queues: [
        { arn: `${INSTANCE}/queue/q1`, name: "Front Desk" },
        { arn: `${INSTANCE}/queue/q2`, name: "front_desk" },
      ],
    });
    const names = [`${INSTANCE}/queue/q1`, `${INSTANCE}/queue/q2`].map(
      (arn) => lookupArn(collided, arn)?.name,
    );
    expect(names.sort()).toEqual(["front-desk", "front-desk-2"]);
    expect(collided.warnings.join("\n")).toContain("front-desk");
  });

  it("inverts a materialization resource map", () => {
    const reverse = reverseMapOfResourceMap({
      "${cdref:queue:appointments}": `${INSTANCE}/queue/q1`,
    });
    expect(lookupArn(reverse, `${INSTANCE}/queue/q1`)?.token).toBe("${cdref:queue:appointments}");
  });
});

// The task's "re-synthesizes losslessly" criterion, made offline: materialize
// the demo FlowDoc into deployable content, export that content back, and the
// document must return unchanged apart from meta.
describe("A06 acceptance: materialize then export is lossless", () => {
  const demo = readJson<FlowDoc>("conformance/demo/appointment-line.flowdoc.json");
  const map = readJson<Record<string, string>>("conformance/materialize/demo-with-map/map.json");

  it("reproduces the demo FlowDoc", () => {
    const content = materializeWithMap(demo, map);
    const exported = exportFlow(content, reverseMapOfResourceMap(map), {
      name: demo.name,
      connectType: demo.connectType,
      includeMeta: false,
    });
    expect(serialize(exported)).toBe(serialize(demo));
  });

  it("is byte-stable across runs", () => {
    const content = materializeWithMap(demo, map);
    const reverse = reverseMapOfResourceMap(map);
    const once = exportFlow(content, reverse, { name: demo.name, connectType: demo.connectType });
    const twice = exportFlow(content, reverse, { name: demo.name, connectType: demo.connectType });
    expect(serialize(once)).toBe(serialize(twice));
  });

  it("records meta.generator", () => {
    // The option is an opaque caller-supplied string. flow-cli passes its own
    // `cli@<package version>`; this stands in for it deliberately, so a real
    // package version never has a second home here to drift out of.
    const generator = "test-caller@0.0.0";
    const content = materializeWithMap(demo, map);
    const exported = exportFlow(content, reverseMapOfResourceMap(map), {
      name: demo.name,
      connectType: demo.connectType,
      generator,
    });
    expect(exported.meta?.generator).toBe(generator);
  });
});

describe("exportFlow", () => {
  const inventory = readJson<InstanceInventory>("conformance/export/demo-instance/inventory.json");
  const reverseMap = buildReverseMap(inventory);

  it("lifts Metadata positions into layout and keeps everything else", () => {
    const content = read(
      "conformance/export/demo-instance/flows/eeee5555-0000-4000-8000-000000000001.json",
    );
    const doc = exportFlow(content, reverseMap, {
      name: "recording-consent",
      connectType: "MODULE",
    });
    // The console fixture writes lowercase `position`; both spellings lift.
    expect(doc.layout).toEqual({ notify: { x: 160, y: 40 }, done: { x: 420, y: 40 } });
    expect(doc.content.Metadata).toEqual({ ActionMetadata: { notify: { useDynamic: false } } });
    expect(doc.kind).toBe("module");
  });

  it("auto-lays out a flow the instance gave no positions for", () => {
    const content = read(
      "conformance/export/demo-instance/flows/cccc3333-0000-4000-8000-000000000002.saved.json",
    );
    const doc = exportFlow(content, reverseMap, {
      name: "draft-line",
      connectType: "CONTACT_FLOW",
    });
    expect(Object.keys(doc.layout ?? {}).sort()).toEqual(["greet", "hang-up"]);
    expect(doc.content.Metadata).toBeUndefined();
  });

  it("rejects a name that is not a slug", () => {
    const content = read(
      "conformance/export/demo-instance/flows/cccc3333-0000-4000-8000-000000000002.saved.json",
    );
    expect(() =>
      exportFlow(content, reverseMap, { name: "Draft Line", connectType: "CONTACT_FLOW" }),
    ).toThrow(/not a valid FlowDoc name/);
  });

  // SPEC.md: unknown ARN is a hard error with the ARN listed. All of them, so
  // one run tells the operator everything the inventory is missing.
  it("lists every unknown ARN at once, not just the first", () => {
    const expected = readJson<{ unknownArns: string[]; interpolatedArns: string[] }>(
      "conformance/export/unknown-arns/expected-error.json",
    );
    const emptyInventory = readJson<InstanceInventory>(
      "conformance/export/unknown-arns/inventory.json",
    );
    const content = read(
      "conformance/export/unknown-arns/flows/cccc3333-0000-4000-8000-000000000009.json",
    );

    let thrown: unknown;
    try {
      exportFlow(content, buildReverseMap(emptyInventory), {
        name: "stale-refs",
        connectType: "CONTACT_FLOW",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExportError);
    const error = thrown as ExportError;
    expect([...error.unknownArns]).toEqual(expected.unknownArns);
    for (const arn of expected.unknownArns) expect(error.message).toContain(arn);
    expect([...error.interpolatedArns]).toEqual(expected.interpolatedArns);
    expect(error.locations[expected.unknownArns[0]!]).toEqual([
      "Actions[0].Parameters.HoursOfOperationId",
    ]);
    // An instance export reads many flows through one call, so the message has
    // to say which one holds the ARN, not only that some flow does.
    expect(error.resource).toBe("stale-refs");
    expect(error.message).toContain('Cannot export "stale-refs"');
  });

  // Live shape (2026-09-01): the stock "Sample after contact work flow" shows
  // an AWS-managed view whose ARN carries `aws` where the account id goes.
  // It is a reference, so it must be an unknown ARN, never prose that lands
  // in the FlowDoc as a literal.
  it("treats an AWS-managed ARN with aws for its account as a reference", () => {
    const emptyInventory = readJson<InstanceInventory>(
      "conformance/export/unknown-arns/inventory.json",
    );
    const content = read(
      "conformance/export/unknown-arns/flows/cccc3333-0000-4000-8000-000000000009.json",
    );
    let thrown: unknown;
    try {
      exportFlow(content, buildReverseMap(emptyInventory), {
        name: "stale-refs",
        connectType: "CONTACT_FLOW",
      });
    } catch (error) {
      thrown = error;
    }
    const error = thrown as ExportError;
    const view = "arn:aws:connect:us-east-1:aws:view/after-contact-work:1";
    expect(error.unknownArns).toContain(view);
    expect(error.interpolatedArns).not.toContain(view);
    expect(error.locations[view]).toEqual(["Actions[3].Parameters.ViewResource.Id"]);
  });

  // Live shape. Connect omits Parameters from an action that takes none rather
  // than writing an empty map, which FlowDoc requires on every action.
  // conformance/export/omitted-parameters/ is what the instance returned.
  describe("an action Connect returned with no Parameters key", () => {
    const liveInventory = readJson<InstanceInventory>(
      "conformance/export/omitted-parameters/inventory.json",
    );
    const liveMap = buildReverseMap(liveInventory);
    const raw = read(
      "conformance/export/omitted-parameters/flows/cccc3333-0000-4000-8000-000000000011.json",
    );

    it("is recorded in the fixture, so the case cannot silently stop being tested", () => {
      const content = JSON.parse(raw) as { Actions: Record<string, unknown>[] };
      const bare = content.Actions.filter((a) => !("Parameters" in a));
      expect(bare.map((a) => a.Type)).toEqual(["TransferContactToQueue"]);
    });

    it("gets the empty map Connect means by the absence", () => {
      const doc = exportFlow(raw, liveMap, {
        name: "default-queue-transfer",
        connectType: "QUEUE_TRANSFER",
      });
      const transfer = doc.content.Actions.find((a) => a.Type === "TransferContactToQueue");
      expect(transfer?.Parameters).toEqual({});
      for (const action of doc.content.Actions) {
        expect(action.Parameters, action.Identifier).toBeDefined();
        expect(action.Transitions, action.Identifier).toBeDefined();
      }
    });

    // The absence used to reach codegen, which read Object.keys off it and
    // threw "Cannot convert undefined or null to object". Seven of the twenty
    // stock sample flows on a fresh instance failed this way.
    it("generates code instead of throwing", () => {
      const doc = exportFlow(raw, liveMap, {
        name: "default-queue-transfer",
        connectType: "QUEUE_TRANSFER",
      });
      expect(codegen(doc)).toBe(
        read("conformance/export/omitted-parameters/expected/default-queue-transfer.flow.ts"),
      );
    });

    it("survives materialize and export again, unchanged", () => {
      const doc = exportFlow(raw, liveMap, {
        name: "default-queue-transfer",
        connectType: "QUEUE_TRANSFER",
        includeMeta: false,
      });
      const content = materializeWithMap(doc, {});
      const again = exportFlow(content, liveMap, {
        name: "default-queue-transfer",
        connectType: "QUEUE_TRANSFER",
        includeMeta: false,
      });
      expect(serialize(again)).toBe(serialize(doc));
    });
  });
});

describe("exportInstance", () => {
  const codegenGolden = "conformance/export/demo-instance/expected/appointment-line.flow.ts";

  it("exports every flow and module the instance can represent", async () => {
    const client = new FixtureClient("demo-instance");
    const result = await exportInstance(client, { codegen: true, generator: "core@0.1" });

    expect(result.flows.map((f) => f.doc.name)).toEqual([
      "appointment-line",
      "draft-line",
      "recording-consent",
    ]);

    for (const flow of result.flows) {
      const golden = `conformance/export/demo-instance/expected/${flow.doc.name}.flowdoc.json`;
      expect(serialize(flow.doc), golden).toBe(read(golden));
    }
  });

  // An exported FlowDoc is an authored document: it gets committed, so no part
  // of it may carry a literal ARN, meta included. Provenance keeps the instance
  // id and the resource id, which name the source without pinning an account.
  it("puts no literal ARN anywhere in an exported document", async () => {
    const client = new FixtureClient("demo-instance");
    const result = await exportInstance(client);
    for (const flow of result.flows) {
      expect(serialize(flow.doc), flow.doc.name).not.toContain("arn:aws");
      expect((flow.doc.meta?.source as { instanceId?: string }).instanceId).toBe(
        "11111111-2222-3333-4444-555555555555",
      );
    }
  });

  it("matches the demo FlowDoc apart from meta", async () => {
    const client = new FixtureClient("demo-instance");
    const result = await exportInstance(client);
    const demo = readJson<FlowDoc>("conformance/demo/appointment-line.flowdoc.json");
    const exported = result.flows.find((f) => f.doc.name === "appointment-line")!.doc;
    expect(serialize({ ...exported, meta: undefined })).toBe(serialize(demo));
  });

  // DescribeContactFlow throws ContactFlowNotPublishedException for a flow that
  // has never been published; the saved content is reachable only through the
  // $SAVED alias.
  it("falls back to the $SAVED alias for a never-published flow", async () => {
    const client = new FixtureClient("demo-instance");
    const result = await exportInstance(client);
    expect(client.describeCalls).toContain("cccc3333-0000-4000-8000-000000000002:$SAVED");
    expect(result.flows.find((f) => f.doc.name === "draft-line")?.saved).toBe(true);
  });

  it("refuses the fallback when savedFallback is off", async () => {
    const client = new FixtureClient("demo-instance");
    await expect(exportInstance(client, { savedFallback: false })).rejects.toThrow(
      /has not been published/,
    );
  });

  it("skips a flow type FlowDoc cannot represent and says so", async () => {
    const client = new FixtureClient("demo-instance");
    const result = await exportInstance(client);
    expect(result.flows.map((f) => f.doc.name)).not.toContain("outbound-campaign");
    expect(result.warnings.join("\n")).toContain("CAMPAIGN");
  });

  it("warns that module Settings are not modeled rather than dropping them silently", async () => {
    const client = new FixtureClient("demo-instance");
    const result = await exportInstance(client);
    expect(result.warnings.join("\n")).toContain("ExternalInvocationConfiguration");
  });

  it("emits codegen output beside the FlowDoc", async () => {
    const client = new FixtureClient("demo-instance");
    const result = await exportInstance(client, { codegen: true });
    const flow = result.flows.find((f) => f.doc.name === "appointment-line")!;
    expect(flow.code).toBe(read(codegenGolden));
    // The generated source is exactly what codegen produces for the doc, so the
    // export path adds no drift of its own.
    expect(flow.code).toBe(codegen(flow.doc));
  });

  it("collects failures instead of aborting when asked to", async () => {
    const client = new FixtureClient("unknown-arns");
    const result = await exportInstance(client, { onError: "collect" });
    expect(result.flows).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.unknownArns).toHaveLength(4);
  });

  it("aborts on an unknown ARN by default", async () => {
    const client = new FixtureClient("unknown-arns");
    await expect(exportInstance(client)).rejects.toBeInstanceOf(ExportError);
  });

  // Whole-instance export over content recorded from a live instance, where
  // two of the action types arrive with no Parameters key at all.
  it("exports flows whose actions Connect returned without Parameters", async () => {
    const client = new FixtureClient("omitted-parameters");
    const result = await exportInstance(client, {
      codegen: true,
      generator: "core@0.1",
    });

    expect(result.failures).toEqual([]);
    expect(result.flows.map((f) => f.doc.name)).toEqual([
      "default-queue-transfer",
      "sample-ab-test",
    ]);
    for (const flow of result.flows) {
      const golden = `conformance/export/omitted-parameters/expected/${flow.doc.name}.flowdoc.json`;
      expect(serialize(flow.doc), golden).toBe(read(golden));
      expect(flow.code, flow.doc.name).toBeDefined();
    }
  });
});

// The SDK adapter, offline: commands are inert objects until sent, so a fake
// sender proves the pagination, the filters, and the throttle without an
// account.
describe("createConnectInventoryClient", () => {
  interface SentCommand {
    constructor: { name: string };
    input: Record<string, any>;
  }

  const sender = (responses: Record<string, any[]>) => {
    const sent: SentCommand[] = [];
    const cursors: Record<string, number> = {};
    return {
      sent,
      send: (command: SentCommand) => {
        sent.push(command);
        const name = command.constructor.name;
        const pages = responses[name] ?? [{}];
        const index = cursors[name] ?? 0;
        cursors[name] = index + 1;
        return Promise.resolve(pages[Math.min(index, pages.length - 1)]);
      },
    };
  };

  it("pages until NextToken is exhausted", async () => {
    const fake = sender({
      ListQueuesCommand: [
        { QueueSummaryList: [{ Arn: "a", Id: "1", Name: "One" }], NextToken: "page2" },
        { QueueSummaryList: [{ Arn: "b", Id: "2", Name: "Two" }] },
      ],
    });
    const client = createConnectInventoryClient({
      connect: fake,
      instanceId: INSTANCE,
      sleep: () => Promise.resolve(),
      now: () => 0,
    });
    const queues = await client.listQueues();
    expect(queues.map((q) => q.name)).toEqual(["One", "Two"]);
    expect(fake.sent[1]?.input.NextToken).toBe("page2");
  });

  // Without QueueTypes both standard and agent queues come back, and an
  // instance with more than 1000 agents truncates the page.
  it("asks for standard queues only", async () => {
    const fake = sender({ ListQueuesCommand: [{ QueueSummaryList: [] }] });
    const client = createConnectInventoryClient({
      connect: fake,
      instanceId: INSTANCE,
      sleep: () => Promise.resolve(),
      now: () => 0,
    });
    await client.listQueues();
    expect(fake.sent[0]?.input.QueueTypes).toEqual(["STANDARD"]);
  });

  // lexVersion is required, so a full inventory takes two passes.
  it("lists Lex V1 and V2 bots separately", async () => {
    const fake = sender({
      ListBotsCommand: [
        { LexBots: [{ LexBot: { Name: "Legacy", LexRegion: "us-east-1" } }] },
        { LexBots: [{ LexV2Bot: { AliasArn: "arn:aws:lex:us-east-1:1:bot-alias/A/B" } }] },
      ],
    });
    const client = createConnectInventoryClient({
      connect: fake,
      instanceId: INSTANCE,
      sleep: () => Promise.resolve(),
      now: () => 0,
    });
    const bots = await client.listBots();
    expect(fake.sent.map((c) => c.input.LexVersion)).toEqual(["V1", "V2"]);
    expect(bots).toEqual([
      { lexVersion: "V1", name: "Legacy", lexRegion: "us-east-1" },
      { lexVersion: "V2", aliasArn: "arn:aws:lex:us-east-1:1:bot-alias/A/B" },
    ]);
  });

  it("spaces requests to the documented 2 rps budget", async () => {
    const slept: number[] = [];
    let clock = 0;
    const fake = sender({ ListPromptsCommand: [{ PromptSummaryList: [] }] });
    const client = createConnectInventoryClient({
      connect: fake,
      instanceId: INSTANCE,
      sleep: (ms) => {
        slept.push(ms);
        clock += ms;
        return Promise.resolve();
      },
      now: () => clock,
    });
    await client.listPrompts();
    await client.listPrompts();
    expect(slept).toEqual([500]);
  });

  it("reads the module response key, which is spelled with a plural", async () => {
    const fake = sender({
      ListContactFlowModulesCommand: [
        {
          ContactFlowModulesSummaryList: [{ Arn: "m", Id: "1", Name: "Consent", State: "ACTIVE" }],
        },
      ],
    });
    const client = createConnectInventoryClient({
      connect: fake,
      instanceId: INSTANCE,
      sleep: () => Promise.resolve(),
      now: () => 0,
    });
    expect(await client.listContactFlowModules()).toEqual([
      { arn: "m", id: "1", name: "Consent", state: "ACTIVE" },
    ]);
  });
});
