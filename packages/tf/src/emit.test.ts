/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Unit tests for the emitter's rules. The shape of the output is pinned by the
// goldens in conformance/emit-tf (src/conformance.test.ts); these cover the
// decisions and the refusals, which are cheaper to state here than as a fixture
// per case.

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FlowDoc } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { loadCases } from "./__fixtures__/cases.js";
import { EmitTfError, emitTf } from "./emit.js";
import { writeTf } from "./write.js";

const cases = loadCases();
const caseNamed = (name: string): (typeof cases)[number] => {
  const found = cases.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no conformance case ${name}`);
  return found;
};

const flow = (name: string, parameters: Record<string, unknown> = {}): FlowDoc => ({
  flowdoc: "0.1",
  kind: "flow",
  name,
  connectType: "CONTACT_FLOW",
  content: {
    Version: "2019-10-30",
    StartAction: "only",
    Actions: [
      {
        Identifier: "only",
        Type: "DisconnectParticipant",
        Parameters: parameters,
        Transitions: {},
      },
    ],
  },
  layout: { only: { x: 20, y: 20 } },
});

const module = (name: string, parameters: Record<string, unknown> = {}): FlowDoc => ({
  ...flow(name, parameters),
  kind: "module",
  connectType: "MODULE",
});

const problems = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (error) {
    if (error instanceof EmitTfError) return [...error.problems];
    throw error;
  }
  throw new Error("expected EmitTfError");
};

describe("emitTf file set", () => {
  it("emits variables.tf only when the instance id is not supplied", () => {
    expect(Object.keys(emitTf([flow("a")]).files)).toEqual([
      "flow_refs.tf",
      "flows.tf",
      "flows/a.flow.tftpl",
      "variables.tf",
      "versions.tf.example",
    ]);
    expect(
      Object.keys(emitTf([flow("a")], { instanceIdExpression: "aws_connect_instance.x.id" }).files),
    ).not.toContain("variables.tf");
  });

  it("requires awscc only when the set has a module", () => {
    expect(emitTf([flow("a")]).files["versions.tf.example"]).not.toContain("awscc");
    expect(emitTf([module("a")]).files["versions.tf.example"]).toContain("hashicorp/awscc");
  });

  it("emits the type argument for flows and none for modules", () => {
    const flows = emitTf([flow("a")]).files["flows.tf"] ?? "";
    expect(flows).toContain('resource "aws_connect_contact_flow" "a"');
    expect(flows).toContain('type        = "CONTACT_FLOW"');

    const modules = emitTf([module("a")]).files["flows.tf"] ?? "";
    expect(modules).toContain('resource "aws_connect_contact_flow_module" "a"');
    expect(modules).not.toMatch(/^\s+type\s+=/m);
  });

  it("orders documents by name, whatever order they arrive in", () => {
    const forward = emitTf([flow("a"), flow("b"), flow("c")]).files;
    const shuffled = emitTf([flow("c"), flow("a"), flow("b")]).files;
    expect(shuffled).toEqual(forward);
  });

  it("orders a flow and a module of the same name the same way every time", () => {
    expect(emitTf([module("a"), flow("a")]).files).toEqual(emitTf([flow("a"), module("a")]).files);
  });

  it("points templatefile at path.module so the output works as a module", () => {
    expect(emitTf([flow("a")]).files["flows.tf"]).toContain(
      'templatefile("${path.module}/flows/a.flow.tftpl", local.flow_refs)',
    );
  });
});

describe("reference resolution", () => {
  const queueFlow = flow("a", { QueueId: "${cdref:queue:front-desk}" });

  it("names a variable <type>_<name>_arn", () => {
    expect(emitTf([queueFlow]).files["flow_refs.tf"]).toContain("queue_front_desk_arn");
  });

  it("accepts a token, a ref key, or a variable name as the map key", () => {
    const address = "aws_connect_queue.front_desk.arn";
    for (const key of ["${cdref:queue:front-desk}", "queue:front-desk", "queue_front_desk_arn"]) {
      expect(
        emitTf([queueFlow], { addressMap: { [key]: address } }).files["flow_refs.tf"],
      ).toContain(`queue_front_desk_arn = ${address}`);
    }
  });

  it("ignores address map entries for references the set does not have", () => {
    const withExtra = emitTf([queueFlow], {
      addressMap: { "queue:front-desk": "x.y.z", "queue:unused": "a.b.c" },
    });
    expect(withExtra.files["flow_refs.tf"]).not.toContain("unused");
  });

  it("resolves a module reference to the alias resource this set emits", () => {
    const files = emitTf([
      flow("caller", { FlowModuleId: "${cdref:module:survey@prod}" }),
      module("survey"),
    ]).files;
    expect(files["flow_refs.tf"]).toContain(
      "module_survey_prod_arn = awscc_connect_contact_flow_module_alias.survey_prod.contact_flow_module_alias_arn",
    );
    expect(files["flows.tf"]).toContain(
      'resource "awscc_connect_contact_flow_module_alias" "survey_prod"',
    );
  });

  it("emits one alias resource per referenced alias, sorted", () => {
    const files = emitTf([
      flow("caller", { FlowModuleId: "${cdref:module:survey@prod}" }),
      flow("other", { FlowModuleId: "${cdref:module:survey@canary}" }),
      module("survey"),
    ]).files;
    const aliases = [...(files["flows.tf"] ?? "").matchAll(/module_alias" "(\w+)"/g)].map(
      (m) => m[1],
    );
    expect(aliases).toEqual(["survey_canary", "survey_prod"]);
  });

  it("says so in the file when an in-set resource shadows a map entry", () => {
    const files = emitTf(
      [flow("caller", { FlowModuleId: "${cdref:module:survey@prod}" }), module("survey")],
      { addressMap: { "module:survey@prod": "somewhere.else.arn" } },
    ).files;
    expect(files["flow_refs.tf"]).toContain('Address map entry "module:survey@prod" ignored');
    expect(files["flow_refs.tf"]).not.toContain("somewhere.else.arn");
  });

  it("resolves a flow reference to the flow this set emits", () => {
    const files = emitTf([
      flow("caller", { ContactFlowId: "${cdref:flow:target}" }),
      flow("target"),
    ]).files;
    expect(files["flow_refs.tf"]).toContain(
      "flow_target_arn = aws_connect_contact_flow.target.arn",
    );
  });

  it("falls back to the address map for a module outside the set", () => {
    const files = emitTf([flow("caller", { FlowModuleId: "${cdref:module:survey@prod}" })], {
      addressMap: { "module:survey@prod": "data.aws_ssm_parameter.survey.value" },
    }).files;
    expect(files["flow_refs.tf"]).toContain(
      "module_survey_prod_arn = data.aws_ssm_parameter.survey.value",
    );
  });

  it("emits a placeholder and a TODO naming the reference when no address is known", () => {
    const refs = emitTf([queueFlow]).files["flow_refs.tf"] ?? "";
    expect(refs).toContain("TODO: no terraform address for ${cdref:queue:front-desk}");
    expect(refs).toContain('under key "queue:front-desk"');
    expect(refs).toContain("queue_front_desk_arn = TODO_MISSING_ADDRESS_queue_front_desk");
  });

  it("says so rather than emitting an empty map for a set with no references", () => {
    expect(emitTf([flow("a")]).files["flow_refs.tf"]).toContain("No reference resolves");
  });

  // A shared map holding the addresses of resources whose content is rendered
  // from that same map is a dependency cycle; both tools refuse to plan it.
  // The module-set case in src/validate.test.ts proves the fix on real tooling.
  it("keeps in-set addresses out of the shared map, in a local of their own", () => {
    const files = emitTf([
      flow("caller", { FlowModuleId: "${cdref:module:survey@prod}" }),
      module("survey"),
    ]).files;
    const refs = files["flow_refs.tf"] ?? "";
    const shared = refs.slice(refs.indexOf("flow_refs = {"), refs.indexOf("flow_refs_caller"));

    expect(shared).not.toContain("module_survey_prod_arn");
    expect(refs).toContain("flow_refs_caller = merge(local.flow_refs, {");
    expect(files["flows.tf"]).toContain(
      'templatefile("${path.module}/flows/caller.flow.tftpl", local.flow_refs_caller)',
    );
    // The module has no references of its own, so it stays on the shared map.
    expect(files["flows.tf"]).toContain(
      'templatefile("${path.module}/flows/survey.flow.tftpl", local.flow_refs)',
    );
  });
});

describe("emitTf refusals", () => {
  it("refuses an empty document set", () => {
    expect(problems(() => emitTf([]))).toEqual(["no documents to emit"]);
  });

  it("refuses two documents that would emit the same resource", () => {
    expect(problems(() => emitTf([flow("a"), flow("a")]))).toEqual([
      "two documents both emit aws_connect_contact_flow.a",
    ]);
  });

  it("allows a flow and a module of the same name: different resource types", () => {
    expect(Object.keys(emitTf([flow("a"), module("a")]).files)).toContain("flows/a.flow.tftpl");
  });

  it("refuses a kind and connectType that disagree", () => {
    expect(problems(() => emitTf([{ ...flow("a"), kind: "module" }]))).toEqual([
      'module "a" has connectType CONTACT_FLOW, expected MODULE',
    ]);
    expect(problems(() => emitTf([{ ...module("a"), kind: "flow" }]))).toEqual([
      'flow "a" has connectType MODULE; emit it as kind "module"',
    ]);
  });

  it("refuses a name that is not a slug", () => {
    expect(problems(() => emitTf([{ ...flow("a"), name: "Not A Slug" }]))).toEqual([
      'document name "Not A Slug" is not a slug',
    ]);
  });

  it("refuses a literal ARN as an address, whatever the reference", () => {
    const arn = "arn:aws:connect:us-east-1:111122223333:instance/i/queue/q";
    expect(
      problems(() =>
        emitTf([flow("a", { QueueId: "${cdref:queue:front-desk}" })], {
          addressMap: { "queue:front-desk": arn },
        }),
      ),
    ).toEqual([
      `address for \${cdref:queue:front-desk} is a literal ARN (${arn}); ` +
        "map to a terraform address instead",
    ]);
  });

  it("refuses an address that would comment out or overrun its line", () => {
    const bad = (value: string): string[] =>
      problems(() =>
        emitTf([flow("a", { QueueId: "${cdref:queue:front-desk}" })], {
          addressMap: { "queue:front-desk": value },
        }),
      );
    expect(bad("")).toEqual(["address for ${cdref:queue:front-desk} is empty"]);
    expect(bad("x.y # gone")[0]).toContain("comment marker");
    expect(bad("x.y\nrogue = 1")[0]).toContain("multiple lines");
  });

  it("refuses an instance id expression with the same defects", () => {
    expect(problems(() => emitTf([flow("a")], { instanceIdExpression: "" }))).toEqual([
      "instanceIdExpression is empty",
    ]);
  });

  it("refuses a map key that looks like a token but is not one", () => {
    expect(
      problems(() => emitTf([flow("a")], { addressMap: { "${cdref:queue:Nope}": "x.y" } })),
    ).toEqual([
      'address map key "${cdref:queue:Nope}" looks like a token but does not parse as one',
    ]);
  });

  it("reports every problem at once, not just the first", () => {
    expect(
      problems(() =>
        emitTf([flow("a", { QueueId: "${cdref:queue:front-desk}" })], {
          instanceIdExpression: "",
          addressMap: { "queue:front-desk": "" },
        }),
      ),
    ).toHaveLength(2);
  });
});

describe("writeTf", () => {
  it("writes the emitted files, directories included", () => {
    const dir = mkdtempSync(join(tmpdir(), "flow-tf-"));
    const result = writeTf(caseNamed("demo-complete-map").docs, dir, {
      ...caseNamed("demo-complete-map").options,
    });
    for (const [relative, content] of Object.entries(result.files)) {
      expect(readFileSync(join(dir, relative), "utf8"), relative).toBe(content);
    }
    expect(Object.keys(result.files)).toContain("flows/appointment-line.flow.tftpl");
  });
});

describe("terraform identifiers", () => {
  // Slugs may begin with a digit; Terraform identifiers may not. OpenTofu
  // rejects a leading-digit resource label with "Invalid resource name".
  it("prefixes a name that would start with a digit", () => {
    const doc: FlowDoc = {
      flowdoc: "0.1",
      kind: "flow",
      name: "2fa-line",
      connectType: "CONTACT_FLOW",
      content: {
        Version: "2019-10-30",
        StartAction: "only",
        Actions: [
          { Identifier: "only", Type: "DisconnectParticipant", Parameters: {}, Transitions: {} },
        ],
      },
      layout: { only: { x: 0, y: 0 } },
      refs: [],
    };
    const { files } = emitTf([doc], {});
    expect(files["flows.tf"]).toContain('resource "aws_connect_contact_flow" "_2fa_line"');
    expect(files["flows.tf"]).not.toMatch(/resource "[^"]+" "[0-9]/);
  });

  it("prefixes a reference variable that would start with a digit", () => {
    const doc: FlowDoc = {
      flowdoc: "0.1",
      kind: "flow",
      name: "line",
      connectType: "CONTACT_FLOW",
      content: {
        Version: "2019-10-30",
        StartAction: "q",
        Actions: [
          {
            Identifier: "q",
            Type: "UpdateContactTargetQueue",
            Parameters: { QueueId: "${cdref:queue:2nd-tier}" },
            Transitions: { NextAction: "q", Errors: [], Conditions: [] },
          },
        ],
      },
      layout: { q: { x: 0, y: 0 } },
      refs: [{ token: "${cdref:queue:2nd-tier}", type: "queue", name: "2nd-tier" }],
    };
    const { files } = emitTf([doc], {});
    expect(files["flow_refs.tf"]).toContain("queue__2nd_tier_arn");
  });
});
