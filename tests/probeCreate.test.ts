/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// scripts/probe-create.mjs, the create-probe runner behind the numbered rules
// in conformance/flow-language/actions.md, driven here with a stubbed client:
// it never reaches AWS from a test. Also the convention the committed probe
// sets follow (conformance/flow-language/probes/README.md): every input has a
// description, a type and content with placeholders, and no committed probe
// file carries a 12-digit account id or a UUID.
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  LEFTOVER_PREFIXES,
  PROBE_PREFIX,
  RESULTS_FILE,
  fillPlaceholders,
  fillsFor,
  findIds,
  loadProbes,
  placeholdersIn,
  probeName,
  runProbes,
  scrub,
  utc,
} from "../scripts/probe-create.mjs";

const PROBES = join(import.meta.dirname, "..", "conformance", "flow-language", "probes");

const INSTANCE = "11111111-2222-3333-4444-555555555555";
const ACCOUNT = "123456789012";
const QUEUE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("placeholder filling", () => {
  it("lists the placeholders a text uses once each, in order", () => {
    expect(placeholdersIn("{{INSTANCE}} {{QUEUE_ID}} {{INSTANCE}} {{ACCOUNT}}")).toEqual([
      "INSTANCE",
      "QUEUE_ID",
      "ACCOUNT",
    ]);
  });

  it("reads the three well-known names and PROBE_* from the environment", () => {
    const fills = fillsFor(["ACCOUNT", "REGION", "INSTANCE", "QUEUE_ID"], {
      AWS_ACCOUNT_ID: ACCOUNT,
      AWS_DEFAULT_REGION: "us-west-2",
      CONNECT_INSTANCE_ID: INSTANCE,
      PROBE_QUEUE_ID: QUEUE,
    });
    expect(fills).toEqual({
      ACCOUNT: ACCOUNT,
      REGION: "us-west-2",
      INSTANCE: INSTANCE,
      QUEUE_ID: QUEUE,
    });
  });

  it("names every unset variable before anything runs", () => {
    expect(() => fillsFor(["INSTANCE", "QUEUE_ID"], { PROBE_QUEUE_ID: "" })).toThrow(
      "Unset in the environment: CONNECT_INSTANCE_ID (for {{INSTANCE}}), PROBE_QUEUE_ID (for {{QUEUE_ID}}).",
    );
  });

  it("fills an ARN and leaves JSONPaths and tokens alone", () => {
    const text =
      '{"QueueId":"arn:aws:connect:{{REGION}}:{{ACCOUNT}}:instance/{{INSTANCE}}/queue/{{QUEUE_ID}}","X":"$.Attributes.x","Y":"${cdref:queue:a}"}';
    expect(
      fillPlaceholders(text, {
        REGION: "us-west-2",
        ACCOUNT: ACCOUNT,
        INSTANCE: INSTANCE,
        QUEUE_ID: QUEUE,
      }),
    ).toBe(
      `{"QueueId":"arn:aws:connect:us-west-2:${ACCOUNT}:instance/${INSTANCE}/queue/${QUEUE}","X":"$.Attributes.x","Y":"\${cdref:queue:a}"}`,
    );
    expect(() => fillPlaceholders("{{NOPE}}", {})).toThrow("No value for {{NOPE}}.");
  });

  it("scrubs filled values, then any other uuid or account id, and keeps the Region", () => {
    const fills = { REGION: "us-west-2", ACCOUNT: ACCOUNT, INSTANCE: INSTANCE };
    expect(
      scrub(
        `Flow arn:aws:connect:us-west-2:${ACCOUNT}:instance/${INSTANCE}/contact-flow/${QUEUE} and 999999999999`,
        fills,
      ),
    ).toBe(
      "Flow arn:aws:connect:us-west-2:{{ACCOUNT}}:instance/{{INSTANCE}}/contact-flow/<uuid> and <account>",
    );
  });

  it("names a probe flow under a prefix the leftover check keys on", () => {
    expect(probeName("41", "start-stream")).toBe(`${PROBE_PREFIX}41-start-stream`);
    expect(LEFTOVER_PREFIXES).toContain(PROBE_PREFIX);
    expect(LEFTOVER_PREFIXES).toContain("fac-probe-");
    expect(utc(new Date("2026-10-05T16:49:50.123Z"))).toBe("2026-10-05T16:49:50Z");
  });

  it("accepts a results file named for its run, and nothing else as one", () => {
    expect(RESULTS_FILE.test("results.json")).toBe(true);
    expect(RESULTS_FILE.test("results-2026-10-05-us-west-2.json")).toBe(true);
    expect(RESULTS_FILE.test("start-stream.json")).toBe(false);
    expect(RESULTS_FILE.test("results.txt")).toBe(false);
  });
});

describe("committed probe sets", () => {
  const sets = readdirSync(PROBES)
    .filter((entry) => statSync(join(PROBES, entry)).isDirectory())
    .sort();

  it("has at least the first set", () => {
    expect(sets).toContain("d08-voice-id");
  });

  for (const set of sets) {
    describe(set, () => {
      const dir = join(PROBES, set);
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort();

      it("carries no account id or instance uuid in any file", () => {
        for (const file of files) {
          expect(findIds(readFileSync(join(dir, file), "utf8")), file).toEqual([]);
        }
      });

      it("has inputs the runner loads, each a flow with a start action", () => {
        const probes = loadProbes(dir);
        expect(probes.length).toBeGreaterThan(0);
        for (const probe of probes) {
          expect(probe.description, probe.file).toMatch(/\S/);
          const content = probe.content as Record<string, unknown>;
          expect(content.Version, probe.file).toBe("2019-10-30");
          expect(typeof content.StartAction, probe.file).toBe("string");
          expect(Array.isArray(content.Actions), probe.file).toBe(true);
        }
      });

      it("has a results entry per probe with the fields the record needs", () => {
        const resultFiles = files.filter((f) => RESULTS_FILE.test(f));
        expect(resultFiles.length).toBeGreaterThan(0);
        const results = resultFiles.flatMap(
          (f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>[],
        );
        const names = new Set(loadProbes(dir).map((p) => p.name));
        expect(results.length).toBeGreaterThan(0);
        for (const entry of results) {
          expect(names.has(entry.probe as string), String(entry.probe)).toBe(true);
          expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
          expect(typeof entry.region).toBe("string");
          expect(typeof entry.recordedBy).toBe("string");
          expect(typeof entry.flowType).toBe("string");
          if (entry.result === "accepted") {
            expect(typeof entry.cleanup, String(entry.probe)).toBe("string");
          } else {
            expect(entry.result, String(entry.probe)).toBe("refused");
            expect(typeof entry.exception).toBe("string");
            expect(Array.isArray(entry.problems)).toBe(true);
          }
        }
      });
    });
  }
});

/** A command's class name, which is how the stub tells the calls apart. */
const kind = (command: unknown): string => (command as object).constructor.name;

interface Call {
  kind: string;
  input: Record<string, unknown>;
}

/** A Connect client that answers from memory and records every call. */
function stubClient(options: { leftovers?: string[] } = {}) {
  const calls: Call[] = [];
  const problem = (name: string, message: string, problems?: string[]) =>
    Object.assign(new Error(message), {
      name,
      problems: problems?.map((m) => ({ message: m })),
    });
  return {
    calls,
    send(command: { input: Record<string, unknown> }) {
      calls.push({ kind: kind(command), input: command.input });
      switch (kind(command)) {
        case "ListContactFlowsCommand":
          return Promise.resolve({
            ContactFlowSummaryList: (options.leftovers ?? []).map((Name) => ({ Name })),
          });
        case "ListContactFlowModulesCommand":
          return Promise.resolve({ ContactFlowModulesSummaryList: [] });
        case "CreateContactFlowCommand":
          if (String(command.input.Name).endsWith("-refuse")) {
            return Promise.reject(
              problem("InvalidContactFlowException", "The contact flow is not valid.", [
                `Invalid Action property value. Path: Actions[0] on ${INSTANCE}`,
              ]),
            );
          }
          return Promise.resolve({ ContactFlowId: QUEUE });
        case "DeleteContactFlowCommand":
          return Promise.resolve({});
        case "DescribeContactFlowCommand":
          return Promise.reject(problem("ResourceNotFoundException", "not found"));
        default:
          return Promise.reject(new Error(`unexpected ${kind(command)}`));
      }
    },
  };
}

describe("runProbes with a stubbed client", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function probeDir(): string {
    const root = mkdtempSync(join(tmpdir(), "probe-create-"));
    dirs.push(root);
    const dir = join(root, "41");
    const write = (name: string, startType: string) =>
      writeFileSync(
        join(dir, `${name}.json`),
        JSON.stringify({
          description: `${name} probe`,
          type: "CONTACT_FLOW",
          content: {
            Version: "2019-10-30",
            StartAction: "a",
            Actions: [
              {
                Identifier: "a",
                Type: startType,
                Parameters: {
                  QueueId:
                    "arn:aws:connect:{{REGION}}:{{ACCOUNT}}:instance/{{INSTANCE}}/queue/{{QUEUE_ID}}",
                },
                Transitions: { NextAction: "end", Errors: [] },
              },
              { Identifier: "end", Type: "DisconnectParticipant", Parameters: {}, Transitions: {} },
            ],
          },
        }),
      );
    mkdirSync(dir);
    write("accept", "UpdateContactTargetQueue");
    write("refuse", "UpdateContactTargetQueue");
    return dir;
  }

  const env = {
    AWS_ACCOUNT_ID: ACCOUNT,
    AWS_REGION: "us-west-2",
    CONNECT_INSTANCE_ID: INSTANCE,
    PROBE_QUEUE_ID: QUEUE,
  };

  it("creates each probe as PUBLISHED, cleans up, and records scrubbed results", async () => {
    const dir = probeDir();
    const client = stubClient();
    const log: string[] = [];
    const now = () => new Date("2026-10-05T16:49:50Z");
    const { entries, clean } = await runProbes({ dir, env, client, now, log: (l) => log.push(l) });

    expect(clean).toBe(true);
    expect(client.calls.map((c) => c.kind)).toEqual([
      "ListContactFlowsCommand",
      "ListContactFlowModulesCommand",
      "CreateContactFlowCommand",
      "DeleteContactFlowCommand",
      "DescribeContactFlowCommand",
      "CreateContactFlowCommand",
    ]);
    const create = client.calls[2]!.input;
    expect(create.Name).toBe("hh-probe-41-accept");
    expect(create.Type).toBe("CONTACT_FLOW");
    expect(create.Status).toBe("PUBLISHED");
    expect(create.InstanceId).toBe(INSTANCE);
    expect(create.Content).toContain(
      `arn:aws:connect:us-west-2:${ACCOUNT}:instance/${INSTANCE}/queue/${QUEUE}`,
    );
    expect(client.calls[3]!.input).toEqual({ InstanceId: INSTANCE, ContactFlowId: QUEUE });

    const written = JSON.parse(readFileSync(join(dir, "results.json"), "utf8")) as unknown;
    expect(written).toEqual(entries);
    expect(entries).toEqual([
      {
        probe: "accept",
        description: "accept probe",
        flowType: "CONTACT_FLOW",
        region: "us-west-2",
        at: "2026-10-05T16:49:50Z",
        recordedBy: "scripts/probe-create.mjs",
        result: "accepted",
        cleanup: "deleted; DescribeContactFlow returned ResourceNotFoundException",
      },
      {
        probe: "refuse",
        description: "refuse probe",
        flowType: "CONTACT_FLOW",
        region: "us-west-2",
        at: "2026-10-05T16:49:50Z",
        recordedBy: "scripts/probe-create.mjs",
        result: "refused",
        exception: "InvalidContactFlowException",
        problems: ["Invalid Action property value. Path: Actions[0] on {{INSTANCE}}"],
      },
    ]);
    expect(findIds(readFileSync(join(dir, "results.json"), "utf8"))).toEqual([]);
    expect(log.some((l) => l.includes("hh-probe-41-accept (CONTACT_FLOW): accepted"))).toBe(true);
  });

  it("appends to an existing results file", async () => {
    const dir = probeDir();
    await runProbes({ dir, env, client: stubClient(), only: ["accept"] });
    await runProbes({ dir, env, client: stubClient(), only: ["refuse"] });
    const written = JSON.parse(readFileSync(join(dir, "results.json"), "utf8")) as {
      probe: string;
    }[];
    expect(written.map((e) => e.probe)).toEqual(["accept", "refuse"]);
  });

  it("writes to a results file named for the run, which is not then read as a probe", async () => {
    const dir = probeDir();
    const results = "results-2026-10-05-us-west-2.json";
    await runProbes({ dir, env, client: stubClient(), results });
    const written = JSON.parse(readFileSync(join(dir, results), "utf8")) as { probe: string }[];
    expect(written.map((e) => e.probe)).toEqual(["accept", "refuse"]);
    expect(loadProbes(dir).map((p) => p.name)).toEqual(["accept", "refuse"]);
    await expect(
      runProbes({ dir, env, client: stubClient(), results: "log.json" }),
    ).rejects.toThrow("A results file is named results.json or results-<run>.json, not log.json.");
  });

  it("refuses to run while a probe flow is on the instance, before any create", async () => {
    const dir = probeDir();
    const client = stubClient({ leftovers: ["hh-probe-40-old", "fac-probe-x", "unrelated"] });
    await expect(runProbes({ dir, env, client })).rejects.toThrow(
      "Refusing to run: 2 probe name(s) already on the instance (flow hh-probe-40-old, flow fac-probe-x). Delete them first.",
    );
    expect(client.calls.map((c) => c.kind)).not.toContain("CreateContactFlowCommand");
  });

  it("refuses to run with a placeholder unfilled, before any call", async () => {
    const dir = probeDir();
    const client = stubClient();
    await expect(runProbes({ dir, env: { ...env, PROBE_QUEUE_ID: "" }, client })).rejects.toThrow(
      "PROBE_QUEUE_ID (for {{QUEUE_ID}})",
    );
    expect(client.calls).toEqual([]);
  });

  it("prints the filled inputs and calls nothing on a dry run", async () => {
    const dir = probeDir();
    const client = stubClient();
    const log: string[] = [];
    const { entries } = await runProbes({
      dir,
      env,
      client,
      dryRun: true,
      log: (l) => log.push(l),
    });
    expect(entries).toEqual([]);
    expect(client.calls).toEqual([]);
    expect(log).toHaveLength(2);
    expect(log[0]).toContain(`hh-probe-41-accept (CONTACT_FLOW): {"Version":"2019-10-30"`);
    expect(log[0]).toContain(`/queue/${QUEUE}`);
  });
});
