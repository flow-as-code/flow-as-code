/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A document carrying the five FlowDoc 0.3 reference types (tasks/D01), read
// through the studio's own open, validate, sidebar and address-map paths. The
// bump moved version literals everywhere; this holds that a 0.3 file whose
// tokens are the new types, one of them standing as a map key, opens and is
// listed, hinted and saveable, which no other studio test exercises.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RefType } from "@flow-as-code/core";
import { addressPlaceholder, exportRefs } from "../src/export/refMap.js";
import { REF_TYPE_ORDER, refUsage } from "../src/model/refUsage.js";
import { parseFlowDoc, validateDoc } from "../src/model/validate.js";
import { expectSchemaValid } from "./helpers.js";

const GOLDEN = new URL(
  "../../../conformance/hcl/roundtrip/casefield-key/casefield-key.flowdoc.json",
  import.meta.url,
);
const open = () => parseFlowDoc(readFileSync(GOLDEN, "utf8"));

const NEW_TYPES: readonly RefType[] = [
  "tasktemplate",
  "casetemplate",
  "casefield",
  "assistant",
  "phonenumber",
];

describe("a document carrying the FlowDoc 0.3 reference types", () => {
  it("opens, validates against the 0.3 schema and passes the save gate", () => {
    const doc = open();
    expectSchemaValid(doc);
    const validation = validateDoc(doc);
    expect(validation.schemaErrors).toEqual([]);
    expect(validation.blockers).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it("lists every token in the sidebar, a key token counted where it stands", () => {
    const usage = refUsage(open());
    expect(usage.map((r) => r.token)).toEqual(open().refs?.map((r) => r.token));
    expect(new Set(usage.map((r) => r.type))).toEqual(new Set(["flow", ...NEW_TYPES]));
    // The key of CaseRequestFields in open-case and the item of
    // CaseResponseFields in read-case: both are uses, neither a value.
    expect(usage.find((r) => r.token === "${cdref:casefield:priority}")).toMatchObject({
      count: 2,
      actions: ["open-case", "read-case"],
    });
    for (const entry of usage) expect(entry.alias).toBeUndefined();
  });

  it("orders the five new types after the eight in the sidebar's heading order", () => {
    const ranks = NEW_TYPES.map((t) => REF_TYPE_ORDER.indexOf(t));
    expect(ranks).toEqual([8, 9, 10, 11, 12]);
    expect(REF_TYPE_ORDER).toHaveLength(13);
  });

  it("hints a terraform address per type in the address-map editor", () => {
    const hints = Object.fromEntries(
      exportRefs([open()]).map((r) => [r.key, addressPlaceholder(r)]),
    );
    expect(hints).toEqual({
      "assistant:agent-help": "var.agent_help_assistant_arn",
      "casefield:priority": "var.priority_case_field_id",
      "casefield:summary": "var.summary_case_field_id",
      "casetemplate:billing-dispute": "var.billing_dispute_case_template_id",
      "flow:task-line": "aws_connect_contact_flow.task_line.arn",
      "phonenumber:main-did": "aws_connect_phone_number.main_did.arn",
      "tasktemplate:follow-up": "var.follow_up_task_template_arn",
    });
  });
});
