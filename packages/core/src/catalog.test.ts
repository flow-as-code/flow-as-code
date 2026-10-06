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

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ActionType,
  CALLBACK_ATTEMPTS_MIN,
  CALLBACK_DELAY_MAX,
  CALLBACK_DELAY_MIN,
  CHANNEL_RESTRICTIONS,
  CONDITION_CATCH_ALL,
  EXTRA_ERRORS,
  EVENT_HOOKS,
  INPUT_MENU_ERRORS,
  INPUT_STORED_ERRORS,
  INPUT_TIMEOUT_MAX,
  INPUT_TIMEOUT_MIN,
  INTERDIGIT_TIMEOUT_MAX,
  INTERDIGIT_TIMEOUT_MIN,
  LAMBDA_TIMEOUT_MAX,
  LAMBDA_TIMEOUT_MIN,
  LEX_TIMEOUT_MAX,
  LEX_TIMEOUT_MIN,
  LOOP_COUNT_MAX,
  LOOP_COUNT_MIN,
  OPTIONAL_CATCH_ALL,
  QUEUE_PRIORITY_MIN,
  REQUIRED_EXTRAS,
  TAG_LIMIT,
  VOICE_ID_RESPONSE_TIME_MAX,
  VOICE_ID_RESPONSE_TIME_MIN,
  VOICE_ID_THRESHOLD_MAX,
  VOICE_ID_THRESHOLD_MIN,
  WAIT_TIMEOUT_MAX,
  WAIT_TIMEOUT_MIN,
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
  builderErrorsFor,
  constraintViolations,
  modeledTypes,
  requiredErrors,
  requiredErrorsFor,
  requiredErrorsOf,
  type ActionCatalog,
  type CatalogConstraint,
  type CatalogElement,
  type CatalogError,
  type CatalogParameter,
} from "./catalog.js";
import { snakeCaseKey } from "./hcl-names.js";
import { isCatalogPath } from "./paths.js";

const root = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

const DEVGUIDE = "https://docs.aws.amazon.com/connect/latest/devguide/";
const ADMINGUIDE = "https://docs.aws.amazon.com/connect/latest/adminguide/";
const APIREFERENCE = "https://docs.aws.amazon.com/connect/latest/APIReference/";

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

/**
 * The four category pages and how many types each listed on 2026-09-11
 * (rechecked 2026-10-05, matching), and `other`: the types no category page
 * lists, known from an admin-guide block page or a console export
 * (conformance/flow-language/actions.md, "Unmodeled actions", 2026-10-05).
 */
const CATEGORY_COUNTS = { contact: 27, participant: 6, flowControl: 15, interaction: 8, other: 5 };

/** The categories whose entries come from the Developer Guide (source absent or `devguide`). */
const DEVGUIDE_CATEGORIES = new Set(["contact", "participant", "flowControl", "interaction"]);

/**
 * Where an entry's `doc` must point, by its source: a Developer Guide page,
 * an Administrator Guide page, or (for a Type no page documents) the API
 * Reference page or the repository path of the console export that names it.
 */
function docProblem(type: string, doc: string, source: string): string | undefined {
  const page = (prefix: string) => doc.startsWith(prefix) && doc.endsWith(".html");
  switch (source) {
    case "devguide":
      return page(DEVGUIDE) ? undefined : `${type}: doc is not a developer guide page`;
    case "adminguide":
      return page(ADMINGUIDE) ? undefined : `${type}: doc is not an admin guide page`;
    case "console-export":
      if (page(APIREFERENCE)) return undefined;
      if (doc.startsWith("conformance/") && existsSync(new URL(doc, root))) return undefined;
      return `${type}: doc is neither an API Reference page nor a kept console export`;
    default:
      return `${type}: source ${source} is unknown`;
  }
}

/**
 * The bounds actions.ts carries as constants, by type and top-level key, and
 * the entry-count bounds of lists and maps. The catalog, the schema and the
 * block constructors each spell them; this table holds the catalog to the
 * constants: a bound present on one side and absent on the other fails, and
 * so does a catalog bound with no row here.
 */
const BOUNDS: Record<string, Record<string, { min?: number; max?: number }>> = {
  UpdateContactRoutingBehavior: { QueuePriority: { min: QUEUE_PRIORITY_MIN } },
  CreateCallbackContact: {
    InitialCallDelaySeconds: { min: CALLBACK_DELAY_MIN, max: CALLBACK_DELAY_MAX },
    MaximumConnectionAttempts: { min: CALLBACK_ATTEMPTS_MIN },
    RetryDelaySeconds: { min: CALLBACK_DELAY_MIN, max: CALLBACK_DELAY_MAX },
  },
  InvokeLambdaFunction: {
    InvocationTimeLimitSeconds: { min: LAMBDA_TIMEOUT_MIN, max: LAMBDA_TIMEOUT_MAX },
  },
  GetParticipantInput: {
    InputTimeLimitSeconds: { min: INPUT_TIMEOUT_MIN, max: INPUT_TIMEOUT_MAX },
    "DTMFConfiguration.InterdigitTimeLimitSeconds": {
      min: INTERDIGIT_TIMEOUT_MIN,
      max: INTERDIGIT_TIMEOUT_MAX,
    },
  },
  Loop: { LoopCount: { min: LOOP_COUNT_MIN, max: LOOP_COUNT_MAX } },
  Wait: { TimeLimitSeconds: { min: WAIT_TIMEOUT_MIN, max: WAIT_TIMEOUT_MAX } },
  TagContact: { Tags: { max: TAG_LIMIT } },
  // The service refuses an empty key list (live check, tasks/B01).
  UntagContact: { TagKeys: { min: 1 } },
  // A nested field, keyed by its dotted path.
  ConnectParticipantWithLexBot: {
    "LexTimeoutSeconds.Text": { min: LEX_TIMEOUT_MIN, max: LEX_TIMEOUT_MAX },
  },
  UpdateContactEventHooks: { EventHooks: { min: 1, max: 1 } },
  MessageParticipantIteratively: { Messages: { min: 1 }, InterruptFrequencySeconds: { min: 1 } },
  ShowView: { InvocationTimeLimitSeconds: { min: 1 } },
  UpdateContactData: {
    VoiceAuthenticationThreshold: { min: VOICE_ID_THRESHOLD_MIN, max: VOICE_ID_THRESHOLD_MAX },
    VoiceAuthenticationResponseTime: {
      min: VOICE_ID_RESPONSE_TIME_MIN,
      max: VOICE_ID_RESPONSE_TIME_MAX,
    },
    FraudDetectionThreshold: { min: VOICE_ID_THRESHOLD_MIN, max: VOICE_ID_THRESHOLD_MAX },
  },
};

/** Every parameter and object field, with its dotted path from the Parameters root. */
function boundedParameters(
  params: readonly CatalogParameter[],
  prefix = "",
): [string, CatalogParameter][] {
  return params.flatMap((p): [string, CatalogParameter][] => [
    [`${prefix}${p.key}`, p],
    ...(p.kind === "object" ? boundedParameters(p.fields ?? [], `${prefix}${p.key}.`) : []),
  ]);
}

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

/** The service's Channel enum, which `channels` is spelled in. */
const CHANNELS = new Set(["VOICE", "CHAT", "TASK", "EMAIL"]);

/**
 * Kinds a `dynamic` flag may sit on: a scalar the page lets a JSONPath stand
 * in for, and since FlowDoc 0.3 a `list` (docs/adr/0009). An `object`, `map`
 * or `json` is never dynamic: the provider's attribute for one has no
 * JSONPath form.
 */
const DYNAMIC_KINDS = new Set(["string", "integer", "integerString", "enum", "list"]);

/** A constraint names known keys, in one of its two forms (catalog.ts, CatalogConstraint). */
function constraintProblems(
  where: string,
  c: CatalogConstraint,
  known: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  if ((c.keys === undefined) === (c.groups === undefined)) {
    out.push(
      `${where}: constraint carries ${c.keys === undefined ? "neither" : "both"} keys and groups`,
    );
  }
  for (const k of c.keys ?? []) {
    if (!known.has(k)) out.push(`${where}: constraint names unknown key ${k}`);
  }
  const seen = new Set<string>();
  if (c.groups !== undefined && c.groups.length < 2) {
    out.push(`${where}: constraint groups need at least two alternatives`);
  }
  for (const group of c.groups ?? []) {
    if (group.length === 0) out.push(`${where}: constraint has an empty group`);
    for (const k of group) {
      if (!known.has(k)) out.push(`${where}: constraint group names unknown key ${k}`);
      if (seen.has(k)) out.push(`${where}: constraint names ${k} in two groups`);
      seen.add(k);
    }
  }
  return out;
}

function elementProblems(where: string, e: CatalogElement, refTypes: readonly string[]): string[] {
  const out: string[] = [];
  if (!KINDS.has(e.kind)) out.push(`${where}: unknown kind ${e.kind}`);
  if (e.dynamic === true && !DYNAMIC_KINDS.has(e.kind)) {
    out.push(`${where}: dynamic on a ${e.kind}, which has no JSONPath form`);
  }
  if (e.keyPatterns !== undefined) {
    if (e.kind !== "map") out.push(`${where}: keyPatterns on a ${e.kind}, not a map`);
    for (const pattern of e.keyPatterns) {
      if (!pattern.startsWith("^") || !pattern.endsWith("$")) {
        out.push(`${where}: key pattern ${pattern} is not anchored`);
      }
      try {
        new RegExp(pattern);
      } catch {
        out.push(`${where}: key pattern ${pattern} is not a regular expression`);
      }
    }
  }
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
  const fieldKeys = new Set((e.fields ?? []).map((f) => f.key));
  for (const c of e.constraints ?? []) out.push(...constraintProblems(where, c, fieldKeys));
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
  // The reverse: every entry is listed by the category it names.
  for (const [type, entry] of Object.entries(actions)) {
    const listed = catalog.categories[entry.category]?.types ?? [];
    if (!listed.includes(type))
      out.push(`${type} has an entry but category ${entry.category} does not list it`);
  }

  // Every entry cites its page, where its source says the page is: a
  // Developer Guide entry (source absent) on that guide, an `other` entry on
  // the admin guide or in a kept console export. Unmodeled entries carry
  // nothing else.
  for (const [type, entry] of Object.entries(actions)) {
    const source = entry.source ?? "devguide";
    if (DEVGUIDE_CATEGORIES.has(entry.category) && source !== "devguide") {
      out.push(`${type}: listed on a developer guide category page but its source is ${source}`);
    }
    if (!DEVGUIDE_CATEGORIES.has(entry.category) && source === "devguide") {
      out.push(`${type}: in category ${entry.category} with no source outside the developer guide`);
    }
    const problem = docProblem(type, entry.doc, source);
    if (problem !== undefined) out.push(problem);
    if (!entry.modeled) {
      const keys = Object.keys(entry).filter((k) => k !== "source" && k !== "channels");
      if (keys.sort().join(",") !== "category,doc,modeled") {
        out.push(`${type}: unmodeled entry carries ${Object.keys(entry).sort().join(",")}`);
      }
    }
    // Channels, on either kind of entry, are the service's vocabulary and
    // never an empty list (absent is the recorded absence of a restriction).
    if (entry.channels !== undefined) {
      if (entry.channels.length === 0) out.push(`${type}: channels is empty`);
      for (const channel of entry.channels) {
        if (!CHANNELS.has(channel)) out.push(`${type}: channel ${channel} is unknown`);
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
    // Bounds on parameters and on the fields of object parameters, keyed by
    // dotted path, so a nested bound (the Lex timer) is held like a top-level
    // one.
    const bounded = boundedParameters(entry.parameters);
    for (const [key, p] of bounded) {
      const b = BOUNDS[type]?.[key];
      if (b === undefined) {
        if (p.min !== undefined || p.max !== undefined) {
          out.push(`${where}.${key}: bounds in the catalog with no constant in actions.ts`);
        }
        continue;
      }
      if (p.min !== b.min || p.max !== b.max) {
        out.push(
          `${where}.${key}: bounds ${String(p.min)}..${String(p.max)} differ from the constants ${String(b.min)}..${String(b.max)}`,
        );
      }
    }
    for (const [key] of Object.entries(BOUNDS[type] ?? {})) {
      if (!bounded.some(([k]) => k === key)) {
        out.push(`${where}: BOUNDS names ${key}, which the catalog does not list`);
      }
    }
    // An action that holds the participant has no NextAction of its own.
    if (entry.transitions.waits === true && entry.transitions.next !== "none") {
      out.push(`${where}: waits, but next is ${entry.transitions.next}`);
    }
    const keys = new Set(entry.parameters.map((p) => p.key));
    for (const c of entry.constraints ?? []) out.push(...constraintProblems(where, c, keys));

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
    // A conditional requirement names a top-level parameter and is not also
    // unconditional; a value-dependent one names a value the parameter can
    // hold and is not also presence-dependent.
    const parameterKeys = new Set(entry.parameters.map((p) => p.key));
    for (const e of entry.transitions.errors) {
      if (e.requiredWhenKey !== undefined) {
        if (!parameterKeys.has(e.requiredWhenKey)) {
          out.push(`${where}: ${e.type} requiredWhenKey ${e.requiredWhenKey} is not a parameter`);
        }
        if (e.required) out.push(`${where}: ${e.type} is both required and requiredWhenKey`);
      }
      if (e.requiredWhenValue !== undefined) {
        const { key, equals } = e.requiredWhenValue;
        const parameter = entry.parameters.find((p) => p.key === key);
        if (parameter === undefined) {
          out.push(`${where}: ${e.type} requiredWhenValue ${key} is not a parameter`);
        } else if (typeof equals !== "string") {
          out.push(`${where}: ${e.type} requiredWhenValue ${key} equals is not a string`);
        } else if (parameter.kind === "enum" && !(parameter.values ?? []).includes(equals)) {
          out.push(
            `${where}: ${e.type} requiredWhenValue ${key} equals ${equals}, which the enum lacks`,
          );
        }
        if (e.required) out.push(`${where}: ${e.type} is both required and requiredWhenValue`);
        if (e.requiredWhenKey !== undefined) {
          out.push(`${where}: ${e.type} is both requiredWhenKey and requiredWhenValue`);
        }
      }
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

    // Channels equal CHANNEL_RESTRICTIONS: present on both sides and equal,
    // or absent on both (absent is the recorded absence of a restriction).
    const channels = CHANNEL_RESTRICTIONS[type];
    if (entry.channels === undefined) {
      if (channels !== undefined) {
        out.push(
          `${where}: no channels in the catalog, restricted to ${channels.join(",")} in the table`,
        );
      }
    } else if (channels === undefined || channels.join(",") !== entry.channels.join(",")) {
      out.push(
        `${where}: channels ${entry.channels.join(",")} differ from the table ${(channels ?? []).join(",")}`,
      );
    }

    // Errors: the branches marked builder are exactly what the block class
    // emits (the extras, then the catch-all), and the catch-all is the branch
    // a document must wire; a type whose page lists no catch-all
    // (WITHOUT_CATCH_ALL) emits its extras alone and must wire each of them.
    // Conditions name a known kind.
    if (!terminal) {
      const catchAll = CONDITION_CATCH_ALL.includes(type)
        ? NO_MATCHING_CONDITION
        : NO_MATCHING_ERROR;
      const extras = EXTRA_ERRORS[type] ?? [];
      const noCatchAll = WITHOUT_CATCH_ALL.includes(type);
      const emitted = noCatchAll || extras.includes(catchAll) ? extras : [...extras, catchAll];
      const wired = t.errors.filter((e) => e.builder).map((e) => e.type);
      if (wired.join(",") !== emitted.join(",")) {
        out.push(
          `${where}: builder errors ${wired.join(",")} differ from the block's ${emitted.join(",")}`,
        );
      }
      const required = t.errors.filter((e) => e.required).map((e) => e.type);
      const alwaysRequired = new Set(REQUIRED_EXTRAS[type] ?? []);
      const expectedRequired = noCatchAll
        ? extras
        : emitted.filter((e) =>
            e === catchAll ? !OPTIONAL_CATCH_ALL.includes(type) : alwaysRequired.has(e),
          );
      // A conditional error (Wait's ParticipantNotFound) is the builder's but
      // not required; a required flag on one is caught here as on any extra,
      // and an extra the page always requires (REQUIRED_EXTRAS) must carry
      // the flag.
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

describe("the event hook names", () => {
  // Three hand copies of the page's list: EVENT_HOOKS, the catalog entry's
  // `keys`, and the schema clause's propertyNames enum.
  const schema = JSON.parse(
    readFileSync(
      new URL("../../../conformance/schema/flowdoc-0.3.schema.json", import.meta.url),
      "utf8",
    ),
  ) as {
    $defs: {
      action: { allOf: { if: { properties: { Type: { const: string } } }; then: unknown }[] };
    };
  };
  it("agree across actions.ts, the catalog and the schema", () => {
    const entry = actionCatalog.actions.UpdateContactEventHooks as unknown as {
      parameters: { key: string; keys?: string[] }[];
    };
    const keys = entry.parameters.find((p) => p.key === "EventHooks")!.keys;
    expect(keys).toEqual([...EVENT_HOOKS]);
    const clause = schema.$defs.action.allOf.find(
      (x) => x.if.properties.Type.const === "UpdateContactEventHooks",
    )!.then as {
      properties: {
        Parameters: { properties: { EventHooks: { propertyNames: { enum: string[] } } } };
      };
    };
    expect(clause.properties.Parameters.properties.EventHooks.propertyNames.enum).toEqual([
      ...EVENT_HOOKS,
    ]);
  });
});

describe("the action catalog", () => {
  it("agrees with every table in actions.ts", () => {
    expect(catalogProblems(actionCatalog)).toEqual([]);
  });

  it("is a byte copy of the conformance file", () => {
    expect(read("packages/core/src/catalog/catalog.json")).toBe(
      read("conformance/flow-language/catalog.json"),
    );
  });

  it("records the four category pages, the block list for the rest, and the flow language root", () => {
    expect(actionCatalog.catalog).toBe("0.1");
    expect(actionCatalog.flowLanguage.version).toBe("2019-10-30");
    for (const [name, c] of Object.entries(actionCatalog.categories)) {
      expect(c.doc.startsWith(name === "other" ? ADMINGUIDE : DEVGUIDE)).toBe(true);
    }
    // The five types no category page lists (2026-10-05), and where each is documented.
    expect(actionCatalog.categories.other.types).toEqual([
      "RouteContactToAgent",
      "LoadContactContent",
      "AuthenticateParticipant",
      "CheckSegmentMembership",
      "TransferParticipantToThirdParty",
    ]);
    for (const type of actionCatalog.categories.other.types) {
      const entry = actionCatalog.actions[type]!;
      expect(entry.modeled).toBe(false);
      expect(entry.source).toBe(
        type === "TransferParticipantToThirdParty" ? "console-export" : "adminguide",
      );
    }
    for (const type of Object.keys(actionCatalog.actions)) {
      if (!actionCatalog.categories.other.types.includes(type)) {
        expect(actionCatalog.actions[type]!.source).toBeUndefined();
      }
    }
    expect(actionCatalog.refTypes).toEqual([
      "queue",
      "hours",
      "lambda",
      "lex",
      "prompt",
      "flow",
      "module",
      "view",
      "tasktemplate",
      "casetemplate",
      "casefield",
      "assistant",
      "phonenumber",
    ]);
  });

  it("models the same set the builder does", () => {
    expect(modeledTypes().sort()).toEqual([...Object.values(ActionType)].sort());
  });

  it("requires the catch-all branch of every type modeled with one", () => {
    expect(requiredErrors("Compare")).toEqual(["NoMatchingCondition"]);
    expect(requiredErrors("GetParticipantInput")).toEqual(["NoMatchingError"]);
    // QueueAtCapacity, CheckMetricData's NoMatchingCondition and the empty
    // recording set are what the service enforces (2026-09-29), not what the
    // pages say.
    expect(requiredErrors("DequeueContactAndTransferToQueue")).toEqual([
      "QueueAtCapacity",
      "NoMatchingError",
    ]);
    expect(requiredErrors("TransferContactToQueue")).toEqual([
      "QueueAtCapacity",
      "NoMatchingError",
    ]);
    expect(requiredErrors("CheckMetricData")).toEqual(["NoMatchingError", "NoMatchingCondition"]);
    expect(requiredErrors("UpdateContactRecordingBehavior")).toEqual([]);
    expect(builderErrors("UpdateContactRecordingBehavior")).toEqual([]);
    expect(requiredErrors("DisconnectParticipant")).toEqual([]);
    expect(requiredErrors("TransferContactToAgent")).toEqual([]);
    expect(requiredErrors("UpdateContactRoutingBehavior")).toEqual([]);
    expect(builderErrors("UpdateContactRoutingBehavior")).toEqual([]);
    expect(requiredErrors("UpdateFlowLoggingBehavior")).toEqual([]);
    expect(builderErrors("UpdateFlowLoggingBehavior")).toEqual([]);
    // Listed as "None" on the page, carried by some published console exports.
    expect(requiredErrors("Loop")).toEqual([]);
    expect(builderErrors("Loop")).toEqual(["NoMatchingError"]);
    expect(requiredErrors("UpdateFlowAttributes")).toEqual(["NoMatchingError"]);
    // Both "Must always be defined"; the chat form's third error is
    // conditional, and the builder never writes that form.
    expect(requiredErrors("UpdateContactRecordingAndAnalyticsBehavior")).toEqual([
      "NoMatchingError",
      "ChannelMismatch",
    ]);
    expect(builderErrors("UpdateContactRecordingAndAnalyticsBehavior")).toEqual([
      "NoMatchingError",
      "ChannelMismatch",
    ]);
    expect(requiredErrors("Wait")).toEqual(["NoMatchingError"]);
    expect(requiredErrors("DistributeByPercentage")).toEqual(["NoMatchingCondition"]);
    expect(builderErrors("GetMetricData")).toEqual(["NoMatchingError"]);
    // The page lists none; the service refuses the block without it.
    expect(requiredErrors("TagContact")).toEqual(["NoMatchingError"]);
    expect(requiredErrors("UntagContact")).toEqual(["NoMatchingError"]);
    // The page requires it; the service and the console's exports do not.
    expect(requiredErrors("UpdateContactTextToSpeechVoice")).toEqual([]);
    expect(builderErrors("UpdateContactTextToSpeechVoice")).toEqual(["NoMatchingError"]);
    expect(requiredErrors("UpdateContactData")).toEqual(["NoMatchingError"]);
    expect(requiredErrors("UpdateContactEventHooks")).toEqual(["NoMatchingError"]);
    // Listed but optional on the page, and absent from the console's hold flows.
    expect(requiredErrors("MessageParticipantIteratively")).toEqual([]);
    expect(builderErrors("MessageParticipantIteratively")).toEqual(["NoMatchingError"]);
    // The page's Action syntax order, catch-all in the middle.
    expect(builderErrors("ConnectParticipantWithLexBot")).toEqual([
      "InputTimeLimitExceeded",
      "NoMatchingError",
      "NoMatchingCondition",
    ]);
    expect(requiredErrors("ConnectParticipantWithLexBot")).toEqual(["NoMatchingError"]);
    // The admin guide's order; the service requires all three.
    expect(builderErrors("ShowView")).toEqual([
      "NoMatchingCondition",
      "NoMatchingError",
      "TimeLimitExceeded",
    ]);
    expect(requiredErrors("ShowView")).toEqual([
      "NoMatchingCondition",
      "NoMatchingError",
      "TimeLimitExceeded",
    ]);
    // Required by the chat form's presence, which the builder never writes.
    expect(requiredErrorsFor("UpdateContactRecordingAndAnalyticsBehavior", {})).toEqual([
      "NoMatchingError",
      "ChannelMismatch",
    ]);
    expect(
      requiredErrorsFor("UpdateContactRecordingAndAnalyticsBehavior", { ChatBehavior: {} }),
    ).toEqual(["NoMatchingError", "ChannelMismatch", "InFlightRedactionConfigurationFailed"]);
    expect(builderErrors("CheckMetricData")).toEqual(["NoMatchingError", "NoMatchingCondition"]);
    expect(builderErrors("DistributeByPercentage")).toEqual(["NoMatchingCondition"]);
    expect(builderErrors("Wait")).toEqual(["NoMatchingError", "ParticipantNotFound"]);
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
    // Both forms' branches; builderErrorsFor narrows them to one form.
    expect(builderErrors("GetParticipantInput")).toEqual([
      "InputTimeLimitExceeded",
      "NoMatchingCondition",
      "InvalidPhoneNumber",
      "NoMatchingError",
    ]);
    const menu = { Type: "GetParticipantInput", Parameters: { StoreInput: "False" } };
    expect(builderErrorsFor(menu)).toEqual([...INPUT_MENU_ERRORS]);
    expect(builderErrorsFor({ ...menu, Parameters: {} })).toEqual([...INPUT_MENU_ERRORS]);
    const stored = (validation: unknown) => ({
      Type: "GetParticipantInput",
      Parameters: { StoreInput: "True", InputValidation: validation },
    });
    expect(builderErrorsFor(stored({ CustomValidation: { MaximumLength: "5" } }))).toEqual([
      "NoMatchingError",
    ]);
    expect(builderErrorsFor(stored({ PhoneNumberValidation: { NumberFormat: "E164" } }))).toEqual([
      ...INPUT_STORED_ERRORS,
    ]);
    expect(builderErrorsFor(stored(undefined))).toEqual(["NoMatchingError"]);
    // Every other type is its builderErrors.
    expect(builderErrorsFor({ Type: "Wait", Parameters: {} })).toEqual(builderErrors("Wait"));
    expect(builderErrorsFor({ Type: "NotAnAction", Parameters: {} })).toEqual([]);
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
  it("on a dropped channel restriction", () => {
    expect(mutate((c) => delete modeledAt(c, "Wait").channels)).toContainEqual(
      expect.stringContaining("Wait: no channels in the catalog, restricted to CHAT"),
    );
  });
  it("on a widened channel restriction", () => {
    expect(mutate((c) => (modeledAt(c, "ShowView").channels = ["CHAT", "VOICE"]))).toContainEqual(
      expect.stringContaining("ShowView: channels CHAT,VOICE differ from the table CHAT"),
    );
  });
  it("on a channel restriction the table does not carry", () => {
    expect(mutate((c) => (modeledAt(c, "Compare").channels = ["VOICE"]))).toContainEqual(
      expect.stringContaining("Compare: channels VOICE differ from the table"),
    );
  });
  it("on a moved reference path", () => {
    expect(mutate((c) => (modeledAt(c, "TransferToFlow").refs[0]!.path = "FlowId"))).toContainEqual(
      expect.stringContaining("TransferToFlow: refs"),
    );
  });
  it("on a required error the builder does not force", () => {
    expect(
      mutate((c) => (modeledAt(c, "GetParticipantInput").transitions.errors[0]!.required = true)),
    ).toContainEqual(expect.stringContaining("GetParticipantInput: required errors"));
  });
  it("on an extra the service requires and the catalog does not", () => {
    expect(
      mutate(
        (c) => (modeledAt(c, "TransferContactToQueue").transitions.errors[0]!.required = false),
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
      mutate((c) => (modeledAt(c, "GetParticipantInput").transitions.errors[2]!.builder = false)),
    ).toContainEqual(expect.stringContaining("GetParticipantInput: builder errors"));
  });
  it("on a catch-all the page leaves optional being marked required", () => {
    expect(
      mutate(
        (c) =>
          (modeledAt(c, "MessageParticipantIteratively").transitions.errors[0]!.required = true),
      ),
    ).toContainEqual(expect.stringContaining("MessageParticipantIteratively: required errors"));
  });
  it("on a bound that drifts from the actions.ts constant", () => {
    expect(
      mutate((c) => {
        const p = modeledAt(c, "CreateCallbackContact").parameters.find(
          (x) => x.key === "RetryDelaySeconds",
        )!;
        (p as { max?: number }).max = 259_201;
      }),
    ).toContainEqual(expect.stringContaining("CreateCallbackContact.RetryDelaySeconds: bounds"));
  });
  it("on a required extra losing its flag, or a conditional one gaining it", () => {
    expect(
      mutate((c) => {
        modeledAt(c, "UpdateContactRecordingAndAnalyticsBehavior").transitions.errors[1]!.required =
          false;
      }),
    ).toContainEqual(
      expect.stringContaining("UpdateContactRecordingAndAnalyticsBehavior: required errors"),
    );
    expect(
      mutate((c) => {
        modeledAt(c, "Wait").transitions.errors[1]!.required = true;
      }),
    ).toContainEqual(expect.stringContaining("Wait: required errors"));
  });
  it("on a conditional requirement naming no parameter, or doubled with required", () => {
    expect(
      mutate((c) => {
        modeledAt(
          c,
          "UpdateContactRecordingAndAnalyticsBehavior",
        ).transitions.errors[2]!.requiredWhenKey = "Nope";
      }),
    ).toContainEqual(expect.stringContaining("requiredWhenKey Nope is not a parameter"));
    expect(
      mutate((c) => {
        modeledAt(c, "UpdateContactRecordingAndAnalyticsBehavior").transitions.errors[2]!.required =
          true;
      }),
    ).toContainEqual(expect.stringContaining("both required and requiredWhenKey"));
  });
  it("on a nested bound that drifts from its constant", () => {
    expect(
      mutate((c) => {
        const timer = modeledAt(c, "ConnectParticipantWithLexBot").parameters.find(
          (p) => p.key === "LexTimeoutSeconds",
        )!;
        (timer.fields![0] as { min?: number }).min = 1;
      }),
    ).toContainEqual(expect.stringContaining("LexTimeoutSeconds.Text: bounds 1..604800"));
  });
  it("on waits given to a type with a next action of its own", () => {
    expect(
      mutate((c) => {
        (modeledAt(c, "MessageParticipant").transitions as { waits?: boolean }).waits = true;
      }),
    ).toContainEqual(expect.stringContaining("MessageParticipant: waits, but next is required"));
  });
  it("on a catalog bound with no constant behind it", () => {
    expect(
      mutate((c) => {
        const p = modeledAt(c, "GetMetricData").parameters.find((x) => x.key === "QueueChannel")!;
        (p as { min?: number }).min = 1;
      }),
    ).toContainEqual(expect.stringContaining("GetMetricData.QueueChannel: bounds in the catalog"));
  });
  it("on a category page losing a type", () => {
    expect(
      mutate((c) => (c.categories.interaction.types = c.categories.interaction.types.slice(1))),
    ).toContainEqual(expect.stringContaining("category interaction lists 7 types"));
  });
  it("on the fifth category's count off by one, either way", () => {
    expect(
      mutate((c) => (c.categories.other.types = c.categories.other.types.slice(1))),
    ).toContainEqual(expect.stringContaining("category other lists 4 types, expected 5"));
    expect(
      mutate((c) => {
        c.categories.other.types = [...c.categories.other.types, "Compare"];
      }),
    ).toContainEqual(expect.stringContaining("category other lists 6 types, expected 5"));
  });
  it("on a type listed in a category without an entry, and an entry no category lists", () => {
    expect(
      mutate((c) => {
        c.categories.other.types = [...c.categories.other.types.slice(1), "NotAType"];
      }),
    ).toContainEqual(expect.stringContaining("category other lists NotAType, which has no entry"));
    expect(
      mutate((c) => {
        c.categories.other.types = [
          ...c.categories.other.types.filter((t) => t !== "LoadContactContent"),
          "Compare",
        ];
      }),
    ).toContainEqual(
      expect.stringContaining(
        "LoadContactContent has an entry but category other does not list it",
      ),
    );
  });
  it("on a developer guide entry pointing at an admin guide page, or carrying a source", () => {
    expect(
      mutate((c) => {
        (c.actions as Record<string, { doc: string }>).CreateCase!.doc =
          `${ADMINGUIDE}cases-block.html`;
      }),
    ).toContainEqual(expect.stringContaining("CreateCase: doc is not a developer guide page"));
    expect(
      mutate((c) => {
        (c.actions as Record<string, { source?: string }>).CreateCase!.source = "adminguide";
      }),
    ).toContainEqual(
      expect.stringContaining(
        "CreateCase: listed on a developer guide category page but its source is adminguide",
      ),
    );
  });
  it("on an entry outside the developer guide with the wrong page, no source, or an unknown one", () => {
    const at = (c: ActionCatalog, type: string) =>
      (c.actions as Record<string, { doc: string; source?: string }>)[type]!;
    expect(mutate((c) => (at(c, "LoadContactContent").doc = `${DEVGUIDE}x.html`))).toContainEqual(
      expect.stringContaining("LoadContactContent: doc is not an admin guide page"),
    );
    expect(mutate((c) => delete at(c, "LoadContactContent").source)).toContainEqual(
      expect.stringContaining("LoadContactContent: in category other with no source"),
    );
    expect(mutate((c) => (at(c, "LoadContactContent").source = "blog"))).toContainEqual(
      expect.stringContaining("LoadContactContent: source blog is unknown"),
    );
    expect(
      mutate(
        (c) => (at(c, "TransferParticipantToThirdParty").doc = "conformance/roundtrip/nope.json"),
      ),
    ).toContainEqual(
      expect.stringContaining(
        "TransferParticipantToThirdParty: doc is neither an API Reference page nor a kept console export",
      ),
    );
  });
  it("on an unmodeled entry carrying a key outside the whitelist", () => {
    expect(
      mutate((c) => {
        (c.actions as Record<string, { block?: string }>).CreateCase!.block = "create_case";
      }),
    ).toContainEqual(
      expect.stringContaining("CreateCase: unmodeled entry carries block,category,doc,modeled"),
    );
    // channels is whitelisted on an unmodeled entry (FlowDoc 0.3 vocabulary).
    expect(
      mutate((c) => {
        (c.actions as Record<string, { channels?: string[] }>).CreateCase!.channels = ["VOICE"];
      }),
    ).toEqual([]);
  });

  // The FlowDoc 0.3 vocabulary (tasks/D01, "Catalog vocabulary"), each item
  // shown to fail a check before any entry uses it.
  it("on channels naming an unknown channel or none, on either kind of entry", () => {
    expect(
      mutate((c) => {
        (c.actions as Record<string, { channels?: string[] }>).CreateCase!.channels = ["SMS"];
      }),
    ).toContainEqual(expect.stringContaining("CreateCase: channel SMS is unknown"));
    expect(
      mutate((c) => {
        (c.actions as Record<string, { channels?: string[] }>).CreateCase!.channels = [];
      }),
    ).toContainEqual(expect.stringContaining("CreateCase: channels is empty"));
    expect(
      mutate((c) => {
        (modeledAt(c, "Wait") as { channels?: string[] }).channels = ["CHAT", "SMS"];
      }),
    ).toContainEqual(expect.stringContaining("Wait: channel SMS is unknown"));
  });
  it("on a value-dependent requirement naming no parameter, a value the enum lacks, or doubled", () => {
    const withValue = (c: ActionCatalog, key: string, equals: string, extra = {}) => {
      (modeledAt(c, "UpdateContactTextToSpeechVoice").transitions.errors as CatalogError[]).push({
        type: "Extra",
        required: false,
        builder: false,
        requiredWhenValue: { key, equals },
        ...extra,
      });
    };
    expect(mutate((c) => withValue(c, "Nope", "x"))).toContainEqual(
      expect.stringContaining("Extra requiredWhenValue Nope is not a parameter"),
    );
    expect(mutate((c) => withValue(c, "TextToSpeechEngine", "Nope"))).toContainEqual(
      expect.stringContaining(
        "requiredWhenValue TextToSpeechEngine equals Nope, which the enum lacks",
      ),
    );
    expect(
      mutate((c) => withValue(c, "TextToSpeechEngine", "Neural", { required: true })),
    ).toContainEqual(expect.stringContaining("Extra is both required and requiredWhenValue"));
    expect(
      mutate((c) =>
        withValue(c, "TextToSpeechEngine", "Neural", { requiredWhenKey: "TextToSpeechEngine" }),
      ),
    ).toContainEqual(
      expect.stringContaining("Extra is both requiredWhenKey and requiredWhenValue"),
    );
    // The well-formed case passes every check.
    expect(mutate((c) => withValue(c, "TextToSpeechEngine", "Neural"))).toEqual([]);
  });
  it("on key patterns on a parameter that is not a map, or that are not anchored regular expressions", () => {
    const eventHooks = (c: ActionCatalog) =>
      modeledAt(c, "UpdateContactEventHooks").parameters.find((p) => p.key === "EventHooks")!;
    expect(
      mutate((c) => {
        (
          modeledAt(c, "MessageParticipant").parameters[0] as { keyPatterns?: string[] }
        ).keyPatterns = ["^x$"];
      }),
    ).toContainEqual(expect.stringContaining("keyPatterns on a ref, not a map"));
    expect(
      mutate((c) => {
        (eventHooks(c) as { keyPatterns?: string[] }).keyPatterns = ["Attributes\\..+"];
      }),
    ).toContainEqual(expect.stringContaining("is not anchored"));
    expect(
      mutate((c) => {
        (eventHooks(c) as { keyPatterns?: string[] }).keyPatterns = ["^(.+$"];
      }),
    ).toContainEqual(expect.stringContaining("is not a regular expression"));
    expect(
      mutate((c) => {
        (eventHooks(c) as { keyPatterns?: string[] }).keyPatterns = ["^Attributes\\.[^.]+$"];
      }),
    ).toEqual([]);
  });
  it("on a constraint carrying both forms or neither, a group with an unknown key, one key in two groups, or one group", () => {
    const first = (c: ActionCatalog) => modeledAt(c, "GetMetricData").constraints![0]!;
    expect(
      mutate((c) => {
        (first(c) as { groups?: string[][] }).groups = [["QueueId"], ["AgentId"]];
      }),
    ).toContainEqual(
      expect.stringContaining("GetMetricData: constraint carries both keys and groups"),
    );
    expect(
      mutate((c) => {
        delete (first(c) as { keys?: string[] }).keys;
      }),
    ).toContainEqual(expect.stringContaining("constraint carries neither keys and groups"));
    const grouped = (c: ActionCatalog, groups: string[][]) => {
      const constraint = first(c) as { keys?: string[]; groups?: string[][] };
      delete constraint.keys;
      constraint.groups = groups;
    };
    expect(mutate((c) => grouped(c, [["QueueId"], ["AgentId", "Nope"]]))).toContainEqual(
      expect.stringContaining("constraint group names unknown key Nope"),
    );
    expect(mutate((c) => grouped(c, [["QueueId"], ["AgentId", "QueueId"]]))).toContainEqual(
      expect.stringContaining("constraint names QueueId in two groups"),
    );
    expect(mutate((c) => grouped(c, [["QueueId", "AgentId"]]))).toContainEqual(
      expect.stringContaining("constraint groups need at least two alternatives"),
    );
    expect(mutate((c) => grouped(c, [["QueueId"], []]))).toContainEqual(
      expect.stringContaining("constraint has an empty group"),
    );
    expect(mutate((c) => grouped(c, [["QueueId"], ["AgentId"]]))).toEqual([]);
  });
  it("on dynamic on an object, a map or a json value, and not on a list", () => {
    expect(
      mutate((c) => {
        const bot = modeledAt(c, "ConnectParticipantWithLexBot").parameters.find(
          (p) => p.key === "LexV2Bot",
        )!;
        (bot as { dynamic?: boolean }).dynamic = true;
      }),
    ).toContainEqual(expect.stringContaining("LexV2Bot: dynamic on a object"));
    expect(
      mutate((c) => {
        const hooks = modeledAt(c, "UpdateContactEventHooks").parameters.find(
          (p) => p.key === "EventHooks",
        )!;
        (hooks as { dynamic?: boolean }).dynamic = true;
      }),
    ).toContainEqual(expect.stringContaining("EventHooks: dynamic on a map"));
    expect(
      mutate((c) => {
        const tags = modeledAt(c, "UntagContact").parameters.find((p) => p.key === "TagKeys")!;
        (tags as { dynamic?: boolean }).dynamic = true;
      }),
    ).toEqual([]);
  });
  it("on a reference path with a tilde on a named segment, and not on the map-key form", () => {
    expect(
      mutate((c) => {
        modeledAt(c, "MessageParticipant").refs[0]!.path = "PromptId~";
      }),
    ).toContainEqual(expect.stringContaining("ref path PromptId~ is malformed"));
    expect(
      mutate((c) => {
        modeledAt(c, "UpdateContactEventHooks").refs[0]!.path = "EventHooks.*~";
      }),
    ).not.toContainEqual(expect.stringContaining("is malformed"));
  });
});

// The readings of the FlowDoc 0.3 vocabulary, on entries the catalog does
// not hold yet: the first type to carry each lands with its lint fixture
// (CreateCase for requiredWhenValue, GetCustomerProfile for groups).
describe("requiredErrorsOf", () => {
  const errors: CatalogError[] = [
    { type: "Always", required: true, builder: true },
    { type: "WhenKey", required: false, builder: true, requiredWhenKey: "ChatBehavior" },
    {
      type: "WhenValue",
      required: false,
      builder: true,
      requiredWhenValue: { key: "LinkContactToCase", equals: "true" },
    },
    { type: "Never", required: false, builder: true },
  ];

  it("requires a branch by a parameter's value, in the catalog's order", () => {
    expect(requiredErrorsOf(errors, { LinkContactToCase: "true", ChatBehavior: {} })).toEqual([
      "Always",
      "WhenKey",
      "WhenValue",
    ]);
    expect(requiredErrorsOf(errors, { LinkContactToCase: "false" })).toEqual(["Always"]);
    expect(requiredErrorsOf(errors, { LinkContactToCase: "$.Attributes.link" })).toEqual([
      "Always",
    ]);
    expect(requiredErrorsOf(errors, {})).toEqual(["Always"]);
    expect(requiredErrorsOf(errors, { ChatBehavior: null })).toEqual(["Always", "WhenKey"]);
  });

  it("is what requiredErrorsFor reads for a catalog type", () => {
    const recording = actionCatalog.actions.UpdateContactRecordingAndAnalyticsBehavior;
    const catalogErrors = recording?.modeled === true ? recording.transitions.errors : [];
    expect(catalogErrors.length).toBeGreaterThan(0);
    expect(
      requiredErrorsFor("UpdateContactRecordingAndAnalyticsBehavior", { ChatBehavior: {} }),
    ).toEqual(requiredErrorsOf(catalogErrors, { ChatBehavior: {} }));
    expect(requiredErrorsFor("CreateCase", { LinkContactToCase: "true" })).toEqual([]);
  });
});

describe("constraintViolations", () => {
  const pair: CatalogConstraint[] = [{ rule: "atMostOne", keys: ["QueueId", "AgentId"] }];
  const alternatives: CatalogConstraint[] = [
    { rule: "exactlyOne", groups: [["IdentifierName", "IdentifierValue"], ["SearchCriteria"]] },
  ];

  it("reads keys as it always has", () => {
    expect(constraintViolations(pair, { QueueId: "q" })).toEqual([]);
    expect(constraintViolations(pair, {})).toEqual([]);
    expect(constraintViolations(pair, { QueueId: "q", AgentId: "a" })).toEqual([
      "at most one of QueueId, AgentId may be present; 2 present.",
    ]);
    expect(constraintViolations([{ rule: "exactlyOne", keys: ["A", "B"] }], {})).toEqual([
      "exactly one of A, B is required; 0 present.",
    ]);
  });

  it("reads a group as present only when every key in it is", () => {
    expect(
      constraintViolations(alternatives, { IdentifierName: "phone", IdentifierValue: "+1" }),
    ).toEqual([]);
    expect(constraintViolations(alternatives, { SearchCriteria: [] })).toEqual([]);
    expect(constraintViolations(alternatives, { IdentifierName: "phone" })).toEqual([
      "(IdentifierName and IdentifierValue) is incomplete: a group is present only with every key in it.",
      "exactly one of (IdentifierName and IdentifierValue), SearchCriteria is required; 0 present.",
    ]);
    expect(
      constraintViolations(alternatives, {
        IdentifierName: "phone",
        IdentifierValue: "+1",
        SearchCriteria: [],
      }),
    ).toEqual([
      "exactly one of (IdentifierName and IdentifierValue), SearchCriteria is required; 2 present.",
    ]);
    expect(constraintViolations(alternatives, {})).toEqual([
      "exactly one of (IdentifierName and IdentifierValue), SearchCriteria is required; 0 present.",
    ]);
  });
});
