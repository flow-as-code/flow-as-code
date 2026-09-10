/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Identifier rules. The forbidden-character half was tested; the length limit
// and the forbidden-name list were not, so either could be deleted from
// isValidIdentifier with the whole suite green.
//
// "Identifier: unique within the flow, up to 50 characters. Any characters
// including unicode and spaces, except % : ( \ / ) = $ , ; [ ] { }. Also
// forbidden: __proto__, constructor, ... valueOf."
// https://docs.aws.amazon.com/connect/latest/devguide/flow-language-actions.html

import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_IDENTIFIERS,
  GenericBlock,
  MAX_IDENTIFIER_LENGTH,
  isValidIdentifier,
} from "./index.js";

const generic = (id: string): GenericBlock => new GenericBlock({ id, type: "Wait" });

describe("Identifier length", () => {
  it("caps at 50 characters", () => {
    expect(MAX_IDENTIFIER_LENGTH).toBe(50);
  });

  it("accepts an identifier of exactly the limit", () => {
    const id = "a".repeat(MAX_IDENTIFIER_LENGTH);
    expect(isValidIdentifier(id)).toBe(true);
    expect(generic(id).id).toBe(id);
  });

  it("rejects one character over the limit", () => {
    const id = "a".repeat(MAX_IDENTIFIER_LENGTH + 1);
    expect(isValidIdentifier(id)).toBe(false);
    expect(() => generic(id)).toThrow(/Invalid Identifier/);
  });

  it("rejects the empty identifier", () => {
    expect(isValidIdentifier("")).toBe(false);
    expect(() => generic("")).toThrow(/Invalid Identifier/);
  });
});

describe("forbidden Identifier names", () => {
  // Spelled out rather than derived from the constant: a test that iterates
  // FORBIDDEN_IDENTIFIERS passes vacuously once the list is emptied.
  const forbidden = [
    "__proto__",
    "constructor",
    "__defineGetter__",
    "__defineSetter__",
    "toString",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "valueOf",
  ];

  it("is exactly the documented list", () => {
    expect([...FORBIDDEN_IDENTIFIERS]).toEqual(forbidden);
  });

  it.each(forbidden)("rejects a block with id %s", (id) => {
    expect(isValidIdentifier(id)).toBe(false);
    expect(() => generic(id)).toThrow(/Invalid Identifier/);
  });

  it("still accepts an ordinary name that merely contains one", () => {
    expect(isValidIdentifier("check-constructor-status")).toBe(true);
  });
});

describe("forbidden Identifier characters", () => {
  it.each(["a/b", "a:b", "a$b", "a{b}", "a[b]", "a(b)", "a=b", "a,b", "a;b", "a%b", "a\\b"])(
    "rejects %s",
    (id) => {
      expect(isValidIdentifier(id)).toBe(false);
    },
  );

  it("accepts spaces and unicode", () => {
    expect(isValidIdentifier("play welcome prompt é")).toBe(true);
  });
});
