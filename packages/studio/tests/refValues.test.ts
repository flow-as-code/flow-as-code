/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Token construction for the picker: a view may pin a version in the alias
// slot, the way a module names its alias, and nothing else takes one.

import { describe, expect, it } from "vitest";
import { makeToken } from "../src/model/refValues.js";

describe("makeToken", () => {
  it("pins a view version in the alias slot, or none", () => {
    expect(makeToken("view", "form", "1")).toEqual({ ok: true, value: "${cdref:view:form@1}" });
    expect(makeToken("view", "form")).toEqual({ ok: true, value: "${cdref:view:form}" });
    expect(makeToken("view", "form", "")).toEqual({ ok: true, value: "${cdref:view:form}" });
    expect(makeToken("view", "form", "v 1").ok).toBe(false);
  });

  it("still requires a module alias and ignores one on other types", () => {
    expect(makeToken("module", "survey").ok).toBe(false);
    expect(makeToken("module", "survey", "prod")).toEqual({
      ok: true,
      value: "${cdref:module:survey@prod}",
    });
    expect(makeToken("queue", "front-desk", "x")).toEqual({
      ok: true,
      value: "${cdref:queue:front-desk}",
    });
  });
});
