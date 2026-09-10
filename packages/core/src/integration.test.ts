/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Live Amazon Connect tests. SKIPPED unless the environment names a sandbox
// instance, so `npm test` never touches an AWS account: `skipIf` on a missing
// OR empty variable means an exported-but-blank value skips too.
//
// Export half, which is read-only against the instance (List* and Describe*):
//   FLOW_TEST_INSTANCE_ARN   instance id or ARN, plus ambient AWS credentials
//
// `npm run test:integration` runs every integration.test.ts in the workspace,
// @flow-as-code/cdk's live deploy included. That one writes, so it takes its own
// FLOW_TEST_DEPLOY=1 on top of the instance ARN and skips without it.
// Simulate half, additionally:
//   FLOW_TEST_SIMULATE=1     explicit opt-in. The runner CREATES AND DELETES
//                            test cases on the instance, and AWS documents that
//                            a simulated contact can reach a live agent if a
//                            scenario transfers to a queue without ending the
//                            test. Run it against an empty sandbox only.
//   FLOW_TEST_RESOURCE_MAP   path to a token -> ARN JSON map for the scenarios
//   FLOW_TEST_JUNIT_OUT      optional path to write the JUnit report to
//
// The 3-scenario suite in conformance/simulate/ is the suite task A06's
// acceptance criterion asks an operator to run. The same two variables gate
// the lossless export of the deployed demo flow, because both need the demo
// stack up: tasks/A06-export-and-simulate.md records the exact run.

import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FlowDoc, Scenario } from "./index.js";
import {
  buildReverseMap,
  createConnectInventoryClient,
  createConnectTestClient,
  exportFlow,
  exportInstance,
  junitReport,
  materializeWithMap,
  serialize,
} from "./index.js";
import { maskArns } from "./__fixtures__/mask-arns.js";

const instanceArn = process.env.FLOW_TEST_INSTANCE_ARN;
const simulateEnabled = process.env.FLOW_TEST_SIMULATE;
const resourceMapPath = process.env.FLOW_TEST_RESOURCE_MAP;

const root = new URL("../../../", import.meta.url);
const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), "utf8")) as T;

async function connectClient(): Promise<{ send: (command: any) => Promise<any> }> {
  const { ConnectClient } = (await import("@aws-sdk/client-connect")) as unknown as {
    ConnectClient: new (config: Record<string, unknown>) => { send: (c: any) => Promise<any> };
  };
  return new ConnectClient({});
}

describe.skipIf(!instanceArn)("live export", () => {
  it(
    "exports every flow in the instance and re-synthesizes each one losslessly",
    { timeout: 600_000 },
    async () => {
      const connect = await connectClient();
      const client = createConnectInventoryClient({ connect, instanceId: instanceArn! });
      const result = await exportInstance(client, { onError: "collect", codegen: true });

      expect(result.flows.length).toBeGreaterThan(0);

      // A fresh instance carries two stock flows that fail by design on an
      // unknown ARN (SPEC.md, Export, verified 2026-09-01): "Sample Lambda
      // integration" calls a Lambda in an AWS-owned account that
      // ListLambdaFunctions cannot return, and "Sample after contact work
      // flow" shows an AWS-managed view whose ARN carries `aws` as its account.
      // Both ARNs sit outside the instance's account, and that is the whole
      // tolerance: an unknown ARN in the instance's own account is a resource
      // the inventory should have mapped, so it fails the test like any other
      // reason would.
      const accountOf = (arn: string) => arn.split(":")[4];
      const byDesign = result.failures.filter((f) => {
        const unknown = f.unknownArns ?? [];
        return unknown.length > 0 && unknown.every((arn) => accountOf(arn) !== accountOf(f.arn));
      });
      const unexpected = result.failures.filter((f) => !byDesign.includes(f));
      // `reason` lists every unknown ARN, account id and all, and this message
      // is what a failure prints into the CI job's log. GitHub masks only
      // values that came from the `secrets` context, so mask it here.
      expect(
        unexpected.map((f) => maskArns(`${f.name}: ${f.reason}`)),
        "flows failed to export for a reason other than an ARN outside the instance's account",
      ).toEqual([]);
      if (byDesign.length > 0) {
        console.warn(
          `Flows skipped for ARNs outside the instance's account (expected for the stock Lambda and view samples): ${byDesign
            .map((f) => f.name)
            .join(", ")}`,
        );
      }

      for (const flow of result.flows) {
        // No authored FlowDoc may carry a literal ARN.
        expect(serialize(flow.doc)).not.toContain("arn:aws:");
        expect(flow.code).toBeDefined();

        // Materialize with the same map the reverse map came from, export the
        // result again, and the document must come back unchanged.
        const map = Object.fromEntries(
          [...buildReverseMap(result.inventory).byArn].map(([arn, entry]) => [entry.token, arn]),
        );
        const content = materializeWithMap(flow.doc, map);
        const again = exportFlow(content, result.reverseMap, {
          name: flow.doc.name,
          connectType: flow.doc.connectType,
          includeMeta: false,
        });
        expect(serialize(again)).toBe(serialize({ ...flow.doc, meta: undefined }));
      }
    },
  );
});

// Gated like the simulate half: it needs the demo flow deployed to the
// instance with its hours, queue, and Lambda named so the reverse map slugs
// them back to the demo document's own refs (the @flow-as-code/cdk FlowSet stack the
// A06 task describes).
describe.skipIf(!instanceArn || !simulateEnabled || !resourceMapPath)(
  "live export of the demo",
  () => {
    it(
      "exports the deployed demo flow as the demo document, modulo meta",
      { timeout: 600_000 },
      async () => {
        const demo = readJson<FlowDoc>("conformance/demo/appointment-line.flowdoc.json");
        const resourceMap = JSON.parse(readFileSync(resourceMapPath!, "utf8")) as Record<
          string,
          string
        >;
        const flowArn = resourceMap["${cdref:flow:appointment-line}"];
        expect(flowArn, "the resource map must name the deployed demo flow").toBeDefined();

        const connect = await connectClient();
        const client = createConnectInventoryClient({ connect, instanceId: instanceArn! });
        const result = await exportInstance(client, { onError: "collect" });
        const exported = result.flows.find((f) => f.arn === flowArn);
        expect(exported, "the deployed demo flow was not exported").toBeDefined();

        // Layout is compared too: DescribeContactFlow returns the Metadata block
        // (EntryPointPosition and ActionMetadata positions) exactly as the
        // CloudFormation deploy wrote it, so positions survive the round trip.
        expect(serialize({ ...exported!.doc, meta: undefined })).toBe(
          serialize({ ...demo, meta: undefined }),
        );
      },
    );
  },
);

describe.skipIf(!instanceArn || !simulateEnabled || !resourceMapPath)("live simulate", () => {
  it(
    "runs the three-scenario suite and produces a JUnit report",
    { timeout: 1_200_000 },
    async () => {
      const scenarios: Scenario[] = [
        "after-hours-message",
        "appointment-lookup-transfer",
        "chat-greeting",
      ].map((name) => readJson<Scenario>(`conformance/simulate/${name}/scenario.json`));
      const resourceMap = JSON.parse(readFileSync(resourceMapPath!, "utf8")) as Record<
        string,
        string
      >;

      const connect = await connectClient();
      const client = createConnectTestClient({ connect, instanceId: instanceArn! });
      const run = await runSuite(scenarios, client, resourceMap);

      expect(run.results).toHaveLength(3);

      // The report is written before any verdict is checked, so a failing run
      // leaves the per-scenario record behind for the operator to read.
      const report = junitReport(run);
      expect(report).toContain('tests="3"');
      // The report must be well-formed even when Connect returns opaque records.
      expect(report.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      if (process.env.FLOW_TEST_JUNIT_OUT !== undefined) {
        writeFileSync(process.env.FLOW_TEST_JUNIT_OUT, report);
      }

      // This assertion must be able to FAIL. Accepting the whole ScenarioStatus
      // union made the suite unfalsifiable: a run where every scenario ERRORED
      // (which is exactly what a wrong test-case Content shape produces) passed
      // it. ERRORED means the run never reached Connect's evaluator at all, so
      // it is always a defect on our side, and the message is reported.
      const errored = run.results.filter((r) => r.status === "ERRORED");
      expect(
        errored.map((r) => maskArns(`${r.name}: ${r.message ?? "no message"}`)),
        "scenarios failed to execute at all",
      ).toEqual([]);

      // A FAILED execution with zero observations never reached the evaluator
      // either: Connect accepted the start and then reported
      // INITIALIZATION_FAILURE ("limit reached", seen live 2026-09-01). The
      // runner retries those; one that is still not started after the retries
      // is not a verdict on the scenario and must not pass as one. It is
      // checked first so the message names the cause; the PASSED assertion
      // below would catch it too.
      const notStarted = run.results.filter(
        (r) => r.status === "FAILED" && (r.observations?.total ?? 0) === 0,
      );
      expect(
        notStarted.map((r) => maskArns(`${r.name}: ${r.message ?? "no message"}`)),
        "executions that Connect never started",
      ).toEqual([]);

      // Every scenario must PASS. The suite's verdict does not depend on the
      // sandbox's data: the hours and queue are substituted, the Lambda's
      // answer is fixed by the demo stack, and after-hours-message enters over
      // chat so the voice MessageReceived race recorded in
      // tasks/A06-export-and-simulate.md does not apply. Five consecutive live
      // runs passed 3 of 3 before this became fatal (2026-09-01, runs 6 to
      // 10), five more with it in place (2026-09-02), and one run with a
      // closed-message text the flow never sends failed here, naming the
      // scenario; that record is in the same document.
      const notPassed = run.results.filter((r) => r.status !== "PASSED");
      expect(
        notPassed.map((r) => maskArns(`${r.name}: ${r.status} (${r.message ?? "no message"})`)),
        "scenarios that did not pass",
      ).toEqual([]);
    },
  );
});

// Imported lazily so the module graph of a skipped suite stays trivial.
async function runSuite(
  scenarios: Scenario[],
  client: Parameters<typeof import("./simulate.js").runScenarios>[1],
  resourceMap: Record<string, string>,
) {
  const { runScenarios } = await import("./simulate.js");
  return runScenarios(scenarios, client, { resourceMap });
}
