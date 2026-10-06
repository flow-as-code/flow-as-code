/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { isCatalogPath, readPath } from "./paths.js";

const params = {
  PromptId: "${cdref:prompt:welcome}",
  LexV2Bot: { AliasArn: "${cdref:lex:concierge}" },
  Messages: [{ Text: "one" }, { PromptId: "${cdref:prompt:two}" }, { SSML: "<speak>3</speak>" }],
  EventHooks: { CustomerQueue: "${cdref:flow:queue}", AgentWhisper: "${cdref:flow:whisper}" },
  Empty: [],
};

describe("readPath", () => {
  it("reads a top-level key", () => {
    expect(readPath(params, "PromptId")).toEqual([
      { path: "PromptId", value: "${cdref:prompt:welcome}" },
    ]);
  });

  it("reads a key inside an object", () => {
    expect(readPath(params, "LexV2Bot.AliasArn")).toEqual([
      { path: "LexV2Bot.AliasArn", value: "${cdref:lex:concierge}" },
    ]);
  });

  it("reads a key inside every element of a list, naming each element", () => {
    expect(readPath(params, "Messages[].PromptId")).toEqual([
      { path: "Messages[1].PromptId", value: "${cdref:prompt:two}" },
    ]);
    expect(readPath(params, "Messages[].Text")).toEqual([
      { path: "Messages[0].Text", value: "one" },
    ]);
  });

  it("reads every value of a map, naming each key", () => {
    expect(readPath(params, "EventHooks.*")).toEqual([
      { path: "EventHooks.CustomerQueue", value: "${cdref:flow:queue}" },
      { path: "EventHooks.AgentWhisper", value: "${cdref:flow:whisper}" },
    ]);
  });

  // FlowDoc 0.3 (docs/adr/0008): a Cases field id stands as a map key, so
  // the catalog names the keys of a map, and a hit's value is the key itself.
  it("reads every key of a map, naming each with a trailing tilde", () => {
    expect(readPath(params, "EventHooks.*~")).toEqual([
      { path: "EventHooks.CustomerQueue~", value: "CustomerQueue" },
      { path: "EventHooks.AgentWhisper~", value: "AgentWhisper" },
    ]);
    expect(readPath({ Fields: { "${cdref:casefield:priority}": "high" } }, "Fields.*~")).toEqual([
      { path: "Fields.${cdref:casefield:priority}~", value: "${cdref:casefield:priority}" },
    ]);
    expect(readPath(params, "Messages.*~")).toEqual([]);
    expect(readPath(params, "Missing.*~")).toEqual([]);
  });

  it("yields nothing for a path the value does not have", () => {
    expect(readPath(params, "Missing")).toEqual([]);
    expect(readPath(params, "PromptId.Deeper")).toEqual([]);
    expect(readPath(params, "Empty[].Text")).toEqual([]);
    expect(readPath(params, "PromptId[].Text")).toEqual([]);
    expect(readPath("not an object", "PromptId")).toEqual([]);
  });

  it("refuses a malformed path, which is a catalog error", () => {
    expect(() => readPath(params, "")).toThrow(/not a catalog path/);
    expect(() => readPath(params, "Messages[0].Text")).toThrow(/not a catalog path/);
    expect(() => readPath(params, "A..B")).toThrow(/not a catalog path/);
  });
});

describe("isCatalogPath", () => {
  it.each([
    "PromptId",
    "LexV2Bot.AliasArn",
    "Messages[].PromptId",
    "EventHooks.*",
    "A.B[].C.*",
    "CaseRequestFields.*~",
    "A[].B.*~",
  ])("accepts %s", (path) => {
    expect(isCatalogPath(path)).toBe(true);
  });
  it.each(["", ".", "A.", "A[0]", "A[", "A b", "*.[]", "A~", "*~~", "~", "A.*~.B~"])(
    "rejects %j",
    (path) => {
      expect(isCatalogPath(path)).toBe(false);
    },
  );
});
