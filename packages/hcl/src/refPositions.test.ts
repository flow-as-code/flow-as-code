/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A reference in key or item position (conformance/hcl/README.md, rules 11
// and 20; docs/adr/0008-case-field-ids.md): which positions the catalog
// names, how the writer spells a string there, and how the reader reads one
// back, on a map key and on a list item alike.
import { modeledEntry } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { refPositions, writeRefOrLiteral } from "./contract.js";
import { HclError } from "./errors.js";
import { toFlowDoc } from "./read.js";

describe("refPositions", () => {
  it("names the Cases keys and items, and nothing else", () => {
    expect(refPositions(modeledEntry("CreateCase")!)).toEqual(
      new Map([["CaseRequestFields", { keys: "casefield" }]]),
    );
    expect(refPositions(modeledEntry("GetCase")!)).toEqual(
      new Map([
        ["CaseRequestFields", { keys: "casefield" }],
        ["CaseResponseFields", { items: "casefield" }],
      ]),
    );
    // A list of objects with a reference inside each (Messages[].PromptId)
    // and a map whose values are references (EventHooks.*) are not positions.
    expect(refPositions(modeledEntry("MessageParticipantIteratively")!).size).toBe(0);
    expect(refPositions(modeledEntry("UpdateContactEventHooks")!).size).toBe(0);
  });
});

describe("writeRefOrLiteral", () => {
  it("writes a token of the type as its key and a plain literal as itself", () => {
    expect(writeRefOrLiteral("${cdref:casefield:priority}", "casefield")).toBe(
      "casefield:priority",
    );
    expect(writeRefOrLiteral("summary", "casefield")).toBe("summary");
    expect(writeRefOrLiteral("12345678-aaaa-bbbb-cccc-123456789012", "casefield")).toBe(
      "12345678-aaaa-bbbb-cccc-123456789012",
    );
  });

  it("writes nothing for a token of another type, a string holding ${, or one that reads as a key", () => {
    expect(writeRefOrLiteral("${cdref:casetemplate:billing-dispute}", "casefield")).toBeUndefined();
    expect(writeRefOrLiteral("${cdref:casefield:priority", "casefield")).toBeUndefined();
    expect(writeRefOrLiteral("Called ${x}", "casefield")).toBeUndefined();
    expect(writeRefOrLiteral("casefield:priority", "casefield")).toBeUndefined();
    expect(writeRefOrLiteral("queue:front-desk", "casefield")).toBeUndefined();
  });
});

describe("reading a reference in key or item position", () => {
  const file = (fields: string, items: string) => `resource "flowascode_contact_flow" "minimal" {
  instance_id = var.connect_instance_id
  name        = "minimal"
  type        = "CONTACT_FLOW"

  action {
    id   = "find-case"
    next = "hang-up"
    get_case {
      case_request_fields   = { ${fields} }
      case_response_fields  = [${items}]
      get_last_updated_case = "true"
      link_contact_to_case  = "false"
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id = "hang-up"
    disconnect_participant {}
  }
}
`;
  const params = (fields: string, items: string) =>
    toFlowDoc(file(fields, items), { fileName: "minimal.flow.tf" }).doc.content.Actions[0]!
      .Parameters;

  it("reads a reference key or the full token as the token, and a literal as itself", () => {
    expect(params(`"casefield:priority" = "high"`, `"casefield:priority", "status"`)).toEqual({
      CaseRequestFields: { "${cdref:casefield:priority}": "high" },
      CaseResponseFields: ["${cdref:casefield:priority}", "status"],
      GetLastUpdatedCase: "true",
      LinkContactToCase: "false",
    });
    const full = toFlowDoc(
      file(`"$\${cdref:casefield:priority}" = "high"`, `"$\${cdref:casefield:a}"`),
      {
        fileName: "minimal.flow.tf",
      },
    );
    expect(full.doc.content.Actions[0]!.Parameters.CaseResponseFields).toEqual([
      "${cdref:casefield:a}",
    ]);
    expect(full.sidecar.normalized.map((n) => n.to)).toEqual(["casefield:priority", "casefield:a"]);
  });

  it.each([
    ["a map key of another type", `"queue:front-desk" = "high"`, `"status"`],
    ["a list item of another type", `summary = "x"`, `"queue:front-desk"`],
    ["a list item that is a token of another type", `summary = "x"`, `"$\${cdref:casetemplate:t}"`],
    ["a malformed token as a key", `"$\${cdref:casefield:p" = "high"`, `"status"`],
  ])("refuses %s (REF_KEY_MALFORMED)", (_label, fields, items) => {
    try {
      params(fields, items);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HclError);
      expect((error as HclError).code).toBe("REF_KEY_MALFORMED");
    }
  });
});
