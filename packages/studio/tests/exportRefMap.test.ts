/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The model behind the address-map editor: what it lists, what it refuses, and
// what it calls missing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FlowDoc } from "@flow-as-code/core";
import {
  addressPlaceholder,
  checkAddress,
  checkResourceValue,
  compactMap,
  exportRefs,
  refKey,
  unmappedTokens,
} from "../src/export/refMap.js";
import { demoDoc } from "./helpers.js";

const MODULE_CASE = new URL("../../../conformance/emit-tf/module-set/", import.meta.url);
const readDoc = (name: string): FlowDoc =>
  JSON.parse(readFileSync(new URL(name, MODULE_CASE), "utf8")) as FlowDoc;

describe("exportRefs", () => {
  it("lists every reference in the set once, sorted, with the documents using it", () => {
    const refs = exportRefs([demoDoc(), { ...demoDoc(), name: "second-line" }]);
    expect(refs.map((r) => r.token)).toEqual([
      "${cdref:hours:main-line}",
      "${cdref:lambda:appointment-lookup}",
      "${cdref:queue:appointments}",
    ]);
    expect(refs.map((r) => r.key)).toEqual([
      "hours:main-line",
      "lambda:appointment-lookup",
      "queue:appointments",
    ]);
    expect(refs[0]?.docs).toEqual(["appointment-line", "second-line"]);
  });

  it("keys a module reference by name and alias, the way @flow-as-code/tf does", () => {
    expect(refKey({ token: "x", type: "module", name: "survey", alias: "prod" })).toBe(
      "module:survey@prod",
    );
  });
});

describe("addressPlaceholder", () => {
  it("names the resource type the reference actually needs", () => {
    // Every row used to suggest aws_connect_queue.front_desk.arn, so an hours
    // or lambda row named the wrong resource type and the wrong name.
    expect(addressPlaceholder({ token: "x", type: "hours", name: "main-line" })).toBe(
      "aws_connect_hours_of_operation.main_line.arn",
    );
    expect(addressPlaceholder({ token: "x", type: "lambda", name: "appointment-lookup" })).toBe(
      "aws_lambda_function.appointment_lookup.arn",
    );
    expect(addressPlaceholder({ token: "x", type: "queue", name: "appointments" })).toBe(
      "aws_connect_queue.appointments.arn",
    );
    // Prompts are uploaded rather than declared, so the provider has a data
    // source and no resource.
    expect(addressPlaceholder({ token: "x", type: "prompt", name: "hold-music" })).toBe(
      "data.aws_connect_prompt.hold_music.arn",
    );
  });

  it("folds a module alias into the name and keeps the identifier legal", () => {
    expect(addressPlaceholder({ token: "x", type: "module", name: "survey", alias: "prod" })).toBe(
      "aws_connect_contact_flow_module.survey_prod.arn",
    );
    // Terraform identifiers may not begin with a digit (docs/03-tf-emitter.md).
    expect(addressPlaceholder({ token: "x", type: "flow", name: "2fa-line" })).toBe(
      "aws_connect_contact_flow._2fa_line.arn",
    );
  });

  it("suggests an address the address checker would accept", () => {
    for (const type of ["queue", "hours", "lambda", "lex", "prompt", "flow", "module"] as const) {
      const suggestion = addressPlaceholder({ token: "x", type, name: "a-name" });
      expect(checkAddress(suggestion), suggestion).toEqual({ ok: true, value: suggestion });
    }
  });
});

describe("checkAddress", () => {
  it("rejects a literal ARN the way the ref pickers reject one", () => {
    const result = checkAddress("arn:aws:connect:us-east-1:123456789012:instance/i/queue/q");
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("no-literal-arn");
  });

  it("rejects the partition variants and a bare arn:aws too", () => {
    for (const value of [
      "arn:aws-us-gov:lambda:us-gov-west-1:1:function:f",
      "arn:aws-cn:connect:cn-north-1:1:instance/i",
      "ARN:AWS:lambda:us-east-1:1:function:f",
      "concat(arn:aws, x)",
    ]) {
      expect(checkAddress(value).ok, value).toBe(false);
    }
  });

  it("rejects empty, multi-line, and comment-bearing expressions", () => {
    expect(checkAddress("  ").ok).toBe(false);
    expect(checkAddress("a.b\nc.d").ok).toBe(false);
    expect(checkAddress("a.b # sneaky").ok).toBe(false);
    expect(checkAddress("a.b // sneaky").ok).toBe(false);
  });

  it("accepts a terraform address and trims it", () => {
    const result = checkAddress("  aws_connect_queue.front_desk.arn  ");
    expect(result).toEqual({ ok: true, value: "aws_connect_queue.front_desk.arn" });
  });

  it("agrees with the emitter: what it accepts, @flow-as-code/tf emits", () => {
    // The emitter is the authority (it re-checks and throws EmitTfError); this
    // is the inline half. They have to agree on the demo's own addresses.
    const address = "aws_connect_queue.appointments.arn";
    expect(checkAddress(address).ok).toBe(true);
    expect(unmappedTokens([demoDoc()], { "queue:appointments": address })).not.toContain(
      "${cdref:queue:appointments}",
    );
  });
});

describe("checkResourceValue", () => {
  it("accepts an ARN, because raw export is where ARNs belong", () => {
    expect(checkResourceValue("arn:aws:lambda:us-east-1:1:function:f")).toEqual({
      ok: true,
      value: "arn:aws:lambda:us-east-1:1:function:f",
    });
  });

  it("refuses an empty value", () => {
    expect(checkResourceValue("   ").ok).toBe(false);
  });
});

describe("unmappedTokens", () => {
  it("lists every reference with no address", () => {
    expect(unmappedTokens([demoDoc()], {})).toEqual([
      "${cdref:hours:main-line}",
      "${cdref:lambda:appointment-lookup}",
      "${cdref:queue:appointments}",
    ]);
  });

  it("shrinks as addresses are supplied and empties on a complete map", () => {
    expect(
      unmappedTokens([demoDoc()], { "hours:main-line": "aws_connect_hours_of_operation.h.arn" }),
    ).toEqual(["${cdref:lambda:appointment-lookup}", "${cdref:queue:appointments}"]);
    expect(
      unmappedTokens([demoDoc()], {
        "hours:main-line": "aws_connect_hours_of_operation.h.arn",
        "lambda:appointment-lookup": "data.aws_lambda_function.l.arn",
        "queue:appointments": "aws_connect_queue.q.arn",
      }),
    ).toEqual([]);
  });

  it("asks the emitter, so a reference the set resolves itself is not missing", () => {
    // support-line references ${cdref:module:after-call-survey@prod}. On its
    // own that module is elsewhere and needs an address; with the module in
    // the set @flow-as-code/tf points the reference at the alias resource it emits, so
    // no map entry is wanted at all. A studio that restated the resolution
    // rules rather than asking the emitter would demand one in both cases.
    const alone = readDoc("support-line.flowdoc.json");
    expect(unmappedTokens([alone], {})).toContain("${cdref:module:after-call-survey@prod}");

    const set = [alone, readDoc("../../roundtrip/after-call-survey/doc.flowdoc.json")];
    const missing = unmappedTokens(set, {});
    expect(missing).not.toContain("${cdref:module:after-call-survey@prod}");
    expect(missing).toContain("${cdref:queue:appointments}");
  });
});

describe("compactMap", () => {
  it("drops blank entries and trims the rest, sorted", () => {
    expect(compactMap({ b: " y ", a: "", c: "z" })).toEqual({ b: "y", c: "z" });
  });
});
