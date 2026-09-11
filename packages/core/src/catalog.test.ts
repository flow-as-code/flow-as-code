/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// conformance/flow-language/catalog.json is the machine-readable contract for
// every Connect action type; the tables in src/actions.ts are the readable,
// cited copy this package runs on. Neither is generated from the other, so this
// file is what keeps them equal: every fact the tables hold is checked against
// the catalog, and the checks are written as a function that returns problems
// so the same function can be shown to fail on a mutated catalog (CONTRIBUTING:
// a guarantee ships with a test proven able to fail).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ActionType,
  EXTRA_ERRORS,
  FLOW_TYPE_RESTRICTIONS,
  FLOW_TYPE_UNRESTRICTED,
  NO_MATCHING_CONDITION,
  NO_MATCHING_ERROR,
  REFERENCE_FIELDS,
  TERMINAL_ACTIONS,
  WITHOUT_CATCH_ALL,
} from "./actions.js";
import {
  actionCatalog,
  builderErrors,
  modeledTypes,
  requiredErrors,
  type ActionCatalog,
  type CatalogElement,
  type CatalogParameter,
} from "./catalog.js";
import { snakeCaseKey } from "./hcl-names.js";
import { isCatalogPath } from "./paths.js";

const root = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

const DEVGUIDE = "https://docs.aws.amazon.com/connect/latest/devguide/";

const ALL_CONNECT_TYPES = [
  "CONTACT_FLOW",
  "CUSTOMER_QUEUE",
  "CUSTOMER_HOLD",
  "CUSTOMER_WHISPER",
  "AGENT_HOLD",
  "AGENT_WHISPER",
  "OUTBOUND_WHISPER",
  "AGENT_TRANSFER",
  "QUEUE_TRANSFER",
  "MODULE",
].sort();

/** The four category pages and how many types each listed on 2026-09-11. */
const CATEGORY_COUNTS = { contact: 27, participant: 6, flowControl: 15, interaction: 8 };

const KINDS = new Set([
  "string",
  "integer",
  "integerString",
  "enum",
  "ref",
  "jsonPath",
  "stringOrJsonPath",
  "map",
  "list",
  "object",
  "json",
]);

function elementProblems(where: string, e: CatalogElement, refTypes: readonly string[]): string[] {
  const out: string[] = [];
  if (!KINDS.has(e.kind)) out.push(`${where}: unknown kind ${e.kind}`);
  if (e.kind === "enum" && !(Array.isArray(e.values) && e.values.length > 0)) {
    out.push(`${where}: enum without values`);
  }
  if (e.kind === "ref" && !(typeof e.ref === "string" && refTypes.includes(e.ref))) {
    out.push(`${where}: ref kind without a known ref type`);
  }
  if (e.kind === "list" && e.of === undefined) out.push(`${where}: list without of`);
  if (e.kind === "object" && !Array.isArray(e.fields)) out.push(`${where}: object without fields`);
  if (e.min !== undefined && e.max !== undefined && e.min > e.max) {
    out.push(`${where}: min ${String(e.min)} above max ${String(e.max)}`);
  }
  if (e.of !== undefined) out.push(...elementProblems(`${where}[]`, e.of, refTypes));
  for (const f of e.fields ?? []) out.push(...parameterProblems(`${where}.${f.key}`, f, refTypes));
  for (const c of e.constraints ?? []) {
    const keys = new Set((e.fields ?? []).map((f) => f.key));
    for (const k of c.keys) {
      if (!keys.has(k)) out.push(`${where}: constraint names unknown key ${k}`);
    }
  }
  return out;
}

function parameterProblems(
  where: string,
  p: CatalogParameter,
  refTypes: readonly string[],
): string[] {
  const out: string[] = [];
  if (p.attr !== snakeCaseKey(p.key)) {
    out.push(`${where}: attr ${p.attr} is not snakeCaseKey(${p.key}) = ${snakeCaseKey(p.key)}`);
  }
  if (typeof p.required !== "boolean") out.push(`${where}: required is not a boolean`);
  out.push(...elementProblems(where, p, refTypes));
  return out;
}

/** Everything that would make the catalog disagree with the tables in actions.ts. */
export function catalogProblems(catalog: ActionCatalog): string[] {
  const out: string[] = [];
  const actions = catalog.actions;
  const modeled = new Set(Object.values(ActionType) as string[]);

  // The category pages, and the count recorded from each.
  let total = 0;
  for (const [category, expected] of Object.entries(CATEGORY_COUNTS)) {
    const listed = catalog.categories[category as keyof typeof CATEGORY_COUNTS]?.types ?? [];
    total += listed.length;
    if (listed.length !== expected) {
      out.push(
        `category ${category} lists ${String(listed.length)} types, expected ${String(expected)}`,
      );
    }
    for (const type of listed) {
      const entry = actions[type];
      if (entry === undefined) out.push(`category ${category} lists ${type}, which has no entry`);
      else if (entry.category !== category) {
        out.push(`${type} is listed under ${category} but its entry says ${entry.category}`);
      }
    }
  }
  if (Object.keys(actions).length !== total) {
    out.push(
      `${String(Object.keys(actions).length)} entries but the categories list ${String(total)}`,
    );
  }

  // Every entry cites its page; unmodeled entries carry nothing else.
  for (const [type, entry] of Object.entries(actions)) {
    if (!entry.doc.startsWith(DEVGUIDE) || !entry.doc.endsWith(".html")) {
      out.push(`${type}: doc is not a developer guide page`);
    }
    if (!entry.modeled) {
      const keys = Object.keys(entry).sort();
      if (keys.join(",") !== "category,doc,modeled") {
        out.push(`${type}: unmodeled entry carries ${keys.join(",")}`);
      }
    }
  }

  // The modeled set is exactly ActionType.
  const inCatalog = new Set(
    Object.entries(actions)
      .filter(([, a]) => a.modeled)
      .map(([t]) => t),
  );
  for (const type of modeled)
    if (!inCatalog.has(type)) out.push(`${type} is modeled but the catalog says not`);
  for (const type of inCatalog)
    if (!modeled.has(type)) out.push(`${type} is not modeled but the catalog says it is`);

  const groups = Object.values(catalog.flowTypeGroups).flat().sort();
  if (groups.join(",") !== ALL_CONNECT_TYPES.join(",")) {
    out.push(`flowTypeGroups cover ${groups.join(",")}, not every ConnectType`);
  }

  for (const type of modeled) {
    const entry = actions[type];
    if (entry === undefined || !entry.modeled) continue;
    const where = type;

    if (entry.block !== snakeCaseKey(type))
      out.push(`${where}: block ${entry.block} is not snakeCaseKey(${type})`);

    for (const p of entry.parameters)
      out.push(...parameterProblems(`${where}.${p.key}`, p, catalog.refTypes));
    const keys = new Set(entry.parameters.map((p) => p.key));
    for (const c of entry.constraints ?? []) {
      for (const k of c.keys)
        if (!keys.has(k)) out.push(`${where}: constraint names unknown key ${k}`);
    }

    // Reference-bearing paths equal REFERENCE_FIELDS, path by path.
    const refs = Object.fromEntries(entry.refs.map((r) => [r.path, r.ref]));
    const table = REFERENCE_FIELDS[type] ?? {};
    if (JSON.stringify(refs) !== JSON.stringify(table)) {
      out.push(
        `${where}: refs ${JSON.stringify(refs)} differ from REFERENCE_FIELDS ${JSON.stringify(table)}`,
      );
    }
    for (const r of entry.refs) {
      if (!isCatalogPath(r.path)) out.push(`${where}: ref path ${r.path} is malformed`);
      if (!catalog.refTypes.includes(r.ref)) out.push(`${where}: ref type ${r.ref} is unknown`);
    }
    for (const path of [...(entry.textBodies ?? []), ...(entry.announces ?? [])]) {
      if (!isCatalogPath(path)) out.push(`${where}: body path ${path} is malformed`);
    }
    if (entry.recordingEnabler !== undefined && !isCatalogPath(entry.recordingEnabler)) {
      out.push(`${where}: recordingEnabler ${entry.recordingEnabler} is malformed`);
    }

    // Terminal-ness equals TERMINAL_ACTIONS, and a terminal action wires nothing.
    const terminal = TERMINAL_ACTIONS.includes(type);
    if (entry.terminal !== terminal)
      out.push(`${where}: terminal ${String(entry.terminal)}, table says ${String(terminal)}`);
    const t = entry.transitions;
    if (terminal && (t.next !== "none" || t.conditions !== "none" || t.errors.length > 0)) {
      out.push(`${where}: terminal but carries transitions`);
    }

    // Flow types equal FLOW_TYPE_RESTRICTIONS, or the recorded absence of one.
    const restricted = FLOW_TYPE_RESTRICTIONS[type];
    if (entry.flowTypes === "unrestricted") {
      if (restricted !== undefined || !FLOW_TYPE_UNRESTRICTED.includes(type)) {
        out.push(`${where}: unrestricted in the catalog, restricted in the table`);
      }
    } else if (restricted === undefined || restricted.join(",") !== entry.flowTypes.join(",")) {
      out.push(
        `${where}: flowTypes ${entry.flowTypes.join(",")} differ from the table ${(restricted ?? []).join(",")}`,
      );
    }

    // Errors: the branches marked builder are exactly what the block class
    // emits (the extras, then the catch-all), and the catch-all is the branch
    // a document must wire; a type whose page lists no catch-all
    // (WITHOUT_CATCH_ALL) emits its extras alone and must wire each of them.
    // Conditions name a known kind.
    if (!terminal) {
      const catchAll = type === ActionType.Compare ? NO_MATCHING_CONDITION : NO_MATCHING_ERROR;
      const extras = EXTRA_ERRORS[type] ?? [];
      const noCatchAll = WITHOUT_CATCH_ALL.includes(type);
      const emitted = noCatchAll ? extras : [...extras, catchAll];
      const wired = t.errors.filter((e) => e.builder).map((e) => e.type);
      if (wired.join(",") !== emitted.join(",")) {
        out.push(
          `${where}: builder errors ${wired.join(",")} differ from the block's ${emitted.join(",")}`,
        );
      }
      const required = t.errors.filter((e) => e.required).map((e) => e.type);
      const expectedRequired = noCatchAll ? extras : [catchAll];
      if (required.join(",") !== expectedRequired.join(",")) {
        out.push(
          `${where}: required errors ${required.join(",")}, expected ${expectedRequired.join(",")}`,
        );
      }
    }
    if (!["none", "fixed", "dtmf", "enum", "numeric", "custom"].includes(t.conditions)) {
      out.push(`${where}: conditions kind ${t.conditions} is unknown`);
    }
    if (
      t.conditions === "fixed" &&
      !(Array.isArray(t.conditionOperands) && t.conditionOperands.length > 0)
    ) {
      out.push(`${where}: fixed conditions without conditionOperands`);
    }
  }
  return out;
}

describe("the action catalog", () => {
  it("agrees with every table in actions.ts", () => {
    expect(catalogProblems(actionCatalog)).toEqual([]);
  });

  it("is a byte copy of the conformance file", () => {
    expect(read("packages/core/src/catalog/catalog.json")).toBe(
      read("conformance/flow-language/catalog.json"),
    );
  });

  it("records the four category pages and the flow language root", () => {
    expect(actionCatalog.catalog).toBe("0.1");
    expect(actionCatalog.flowLanguage.version).toBe("2019-10-30");
    for (const c of Object.values(actionCatalog.categories))
      expect(c.doc.startsWith(DEVGUIDE)).toBe(true);
    expect(actionCatalog.refTypes).toEqual([
      "queue",
      "hours",
      "lambda",
      "lex",
      "prompt",
      "flow",
      "module",
      "view",
    ]);
  });

  it("models the same set the builder does", () => {
    expect(modeledTypes().sort()).toEqual([...Object.values(ActionType)].sort());
  });

  it("requires the catch-all branch of every type modeled with one", () => {
    expect(requiredErrors("Compare")).toEqual(["NoMatchingCondition"]);
    expect(requiredErrors("GetParticipantInput")).toEqual(["NoMatchingError"]);
    expect(requiredErrors("DequeueContactAndTransferToQueue")).toEqual(["NoMatchingError"]);
    expect(requiredErrors("DisconnectParticipant")).toEqual([]);
    expect(requiredErrors("TransferContactToAgent")).toEqual([]);
    expect(requiredErrors("UpdateContactRoutingBehavior")).toEqual([]);
    expect(builderErrors("UpdateContactRoutingBehavior")).toEqual([]);
    // No catch-all: both named errors are required and both are the builder's.
    expect(requiredErrors("UpdateContactCallbackNumber")).toEqual([
      "InvalidCallbackNumber",
      "CallbackNumberNotDialable",
    ]);
    expect(builderErrors("UpdateContactCallbackNumber")).toEqual([
      "InvalidCallbackNumber",
      "CallbackNumberNotDialable",
    ]);
    expect(requiredErrors("NotAnAction")).toEqual([]);
  });

  it("names the branches the builder wires, in the builder's order", () => {
    expect(builderErrors("GetParticipantInput")).toEqual([
      "InputTimeLimitExceeded",
      "NoMatchingCondition",
      "NoMatchingError",
    ]);
    expect(builderErrors("TransferContactToQueue")).toEqual(["QueueAtCapacity", "NoMatchingError"]);
    expect(builderErrors("DequeueContactAndTransferToQueue")).toEqual([
      "QueueAtCapacity",
      "NoMatchingError",
    ]);
    expect(builderErrors("DisconnectParticipant")).toEqual([]);
  });
});

describe("catalogProblems is proven able to fail", () => {
  const mutate = (edit: (c: ActionCatalog) => void): string[] => {
    const copy = JSON.parse(JSON.stringify(actionCatalog)) as ActionCatalog;
    edit(copy);
    return catalogProblems(copy);
  };
  const modeledAt = (c: ActionCatalog, type: string) => {
    const entry = c.actions[type];
    if (entry === undefined || !entry.modeled) throw new Error(`${type} is not modeled`);
    return entry;
  };

  it("on a modeled type marked unmodeled", () => {
    expect(
      mutate(
        (c) =>
          ((c.actions as Record<string, unknown>).Compare = {
            category: "flowControl",
            doc: `${DEVGUIDE}x.html`,
            modeled: false,
          }),
      ),
    ).toContainEqual(expect.stringContaining("Compare is modeled but the catalog says not"));
  });
  it("on an attribute name that is not the snake_case of its key", () => {
    expect(
      mutate((c) => (modeledAt(c, "MessageParticipant").parameters[0]!.attr = "promptId")),
    ).toContainEqual(expect.stringContaining("attr promptId is not snakeCaseKey"));
  });
  it("on a flipped terminal flag", () => {
    expect(mutate((c) => (modeledAt(c, "DisconnectParticipant").terminal = false))).toContainEqual(
      expect.stringContaining("DisconnectParticipant: terminal false"),
    );
  });
  it("on a widened flow-type restriction", () => {
    expect(
      mutate((c) => (modeledAt(c, "EndFlowModuleExecution").flowTypes = "unrestricted")),
    ).toContainEqual(
      expect.stringContaining("EndFlowModuleExecution: unrestricted in the catalog"),
    );
  });
  it("on a moved reference path", () => {
    expect(mutate((c) => (modeledAt(c, "TransferToFlow").refs[0]!.path = "FlowId"))).toContainEqual(
      expect.stringContaining("TransferToFlow: refs"),
    );
  });
  it("on a required error the builder does not force", () => {
    expect(
      mutate(
        (c) => (modeledAt(c, "TransferContactToQueue").transitions.errors[0]!.required = true),
      ),
    ).toContainEqual(expect.stringContaining("TransferContactToQueue: required errors"));
  });
  it("on a catch-all the page does not list", () => {
    expect(
      mutate(
        (c) =>
          (modeledAt(c, "UpdateContactRoutingBehavior").transitions.errors = [
            { type: "NoMatchingError", required: true, builder: true },
          ]),
      ),
    ).toContainEqual(expect.stringContaining("UpdateContactRoutingBehavior: builder errors"));
  });
  it("on a builder flag the block class does not honour", () => {
    expect(
      mutate((c) => (modeledAt(c, "GetParticipantInput").transitions.errors[3]!.builder = true)),
    ).toContainEqual(expect.stringContaining("GetParticipantInput: builder errors"));
  });
  it("on a category page losing a type", () => {
    expect(
      mutate((c) => (c.categories.interaction.types = c.categories.interaction.types.slice(1))),
    ).toContainEqual(expect.stringContaining("category interaction lists 7 types"));
  });
});
