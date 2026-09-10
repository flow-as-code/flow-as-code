/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Escaping is the correctness-critical part of this emitter: caller text that
// happens to contain `${` or `%{` must survive `templatefile` byte for byte,
// and the reference interpolations the emitter introduces must not.
//
// These tests render with a reference implementation of the HCL template
// grammar written from the specification, so they are an independent check of
// the escaper rather than a restatement of it. src/validate.test.ts renders the
// same fixtures with a real `tofu` and asserts the two agree, which is what
// keeps the reference implementation honest.

import { readFileSync } from "node:fs";
import type { FlowDoc } from "@flow-as-code/core";
import { materializeWithMap, serializeContent } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./__fixtures__/cases.js";
import { renderHclTemplate } from "./__fixtures__/hcl-template.js";
import { escapeTemplateText, renderTemplate, sentinelPrefix } from "./template.js";

describe("escapeTemplateText", () => {
  it.each([
    ["pay ${amount} now", "pay $${amount} now"],
    ["%{ if open }", "%%{ if open }"],
    ["already $${escaped}", "already $$${escaped}"],
    ["already %%{escaped}", "already %%%{escaped}"],
    ["${${", "$${$${"],
    ["no template syntax", "no template syntax"],
  ])("escapes %j", (input, expected) => {
    expect(escapeTemplateText(input)).toBe(expected);
  });

  it("round-trips any text through the template grammar", () => {
    const samples = [
      "pay ${amount} now",
      "%{ for x in y }${x}%{ endfor }",
      "$${literal} and %%{literal}",
      "$ % { } ${} %{}",
      'quotes "and" \\backslashes\\',
    ];
    for (const sample of samples) {
      expect(renderHclTemplate(escapeTemplateText(sample), {})).toBe(sample);
    }
  });
});

describe("sentinelPrefix", () => {
  it("returns the base prefix when the document cannot collide", () => {
    expect(sentinelPrefix("nothing to see")).toBe("CDREF_TF_SENTINEL_");
  });

  it("grows past caller text that looks like a sentinel", () => {
    expect(sentinelPrefix("CDREF_TF_SENTINEL_0_")).toBe("CDREF_TF_SENTINELX_");
    expect(sentinelPrefix("CDREF_TF_SENTINEL_0_ CDREF_TF_SENTINELX_0_")).toBe(
      "CDREF_TF_SENTINELXX_",
    );
  });
});

const hostile = JSON.parse(
  readFileSync(
    new URL("conformance/emit-tf/hostile-text/hostile-text.flowdoc.json", REPO_ROOT),
    "utf8",
  ),
) as FlowDoc;

describe("renderTemplate", () => {
  const variables = new Map([["${cdref:queue:appointments}", "queue_appointments_arn"]]);

  it("renders back to the materialized content, hostile text included", () => {
    const template = renderTemplate(hostile, variables);
    const address = "aws_connect_queue.appointments.arn";
    const rendered = renderHclTemplate(template, { queue_appointments_arn: address });
    const expected = serializeContent(
      materializeWithMap(hostile, { "${cdref:queue:appointments}": address }),
    );
    expect(rendered).toBe(expected);
  });

  it("leaves caller text that looks like an interpolation alone", () => {
    const rendered = renderHclTemplate(renderTemplate(hostile, variables), {
      queue_appointments_arn: "x",
    });
    expect(rendered).toContain("Your balance is ${amount}");
    expect(rendered).toContain("%{ if open }");
    expect(rendered).toContain("Doubled already: $${literal} and %%{directive}");
    expect(rendered).toContain("CDREF_TF_SENTINEL_0_ and CDREF_TF_SENTINELX_0_");
  });

  it("substitutes only the reference token, into a whole field value", () => {
    const template = renderTemplate(hostile, variables);
    expect(template).toContain('"QueueId": "${queue_appointments_arn}"');
    expect(template).not.toContain("cdref:");
    expect(template).not.toContain("CDREF_TF_SENTINELXX");
  });

  it("reports an unmapped token rather than emitting one", () => {
    expect(() => renderTemplate(hostile, new Map())).toThrow(/unmapped token/);
  });
});
