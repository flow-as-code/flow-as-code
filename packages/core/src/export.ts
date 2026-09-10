/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Export: a live Amazon Connect instance in, FlowDocs out.
//
// The client is an interface, not the AWS SDK, so every path in this file is
// testable offline against recorded fixtures (conformance/export/). The SDK
// adapter at the bottom is the only code that touches @aws-sdk/client-connect,
// and it loads it with a dynamic import, so importing @flow-as-code/core never requires
// the optional peer dependency.
//
// Operations used. Verified 2026-08-31 against the current API reference and
// against the command classes in @aws-sdk/client-connect 3.1122.0:
//   ListContactFlows           https://docs.aws.amazon.com/connect/latest/APIReference/API_ListContactFlows.html
//   DescribeContactFlow        https://docs.aws.amazon.com/connect/latest/APIReference/API_DescribeContactFlow.html
//   ListContactFlowModules     https://docs.aws.amazon.com/connect/latest/APIReference/API_ListContactFlowModules.html
//   DescribeContactFlowModule  https://docs.aws.amazon.com/connect/latest/APIReference/API_DescribeContactFlowModule.html
//   ListQueues                 https://docs.aws.amazon.com/connect/latest/APIReference/API_ListQueues.html
//   ListHoursOfOperations      https://docs.aws.amazon.com/connect/latest/APIReference/API_ListHoursOfOperations.html
//   ListPrompts                https://docs.aws.amazon.com/connect/latest/APIReference/API_ListPrompts.html
//   ListLambdaFunctions        https://docs.aws.amazon.com/connect/latest/APIReference/API_ListLambdaFunctions.html
//   ListBots                   https://docs.aws.amazon.com/connect/latest/APIReference/API_ListBots.html
//
// SPEC.md used to say Lambda and Lex come from "Lambda/Lex associations", which
// points at ListIntegrationAssociations. That operation cannot discover either:
// its IntegrationType enum has no LAMBDA_FUNCTION and no LEX_BOT member.
// ListLambdaFunctions and ListBots are the operations that do.
// https://docs.aws.amazon.com/connect/latest/APIReference/API_ListIntegrationAssociations.html

import { createRateLimiter, type AwsCommandSender, type RateLimiterOptions } from "./aws.js";
import { codegen, type CodegenOptions } from "./codegen.js";
import type {
  ConnectType,
  FlowAction,
  FlowContent,
  FlowDoc,
  FlowDocMeta,
  Point,
  RefEntry,
  RefType,
} from "./flowdoc.js";
import { FLOW_LANGUAGE_VERSION, FLOWDOC_VERSION, SLUG_PATTERN } from "./flowdoc.js";
import { autoLayout } from "./layout.js";
import { collectRefs, parseToken } from "./refs.js";
import { canonicalize } from "./serialize.js";

// --- ARN parsing -------------------------------------------------------------
// Every Connect resource ARN nests under the instance ARN, so the resource part
// splits on "/" into [instance, {instanceId}, {typeKeyword}, {resourceId}].
// Two type keywords do not match their IAM resource-type names, which is the
// trap this parser exists to avoid: a contact-flow-module is `flow-module` in
// the ARN, and an hours-of-operation is `operating-hours`.
// Machine-readable source for both:
// https://servicereference.us-east-1.amazonaws.com/v1/connect/connect.json
// (the feed behind
// https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonconnect.html)

/** ARN type keyword to FlowDoc ref type, for resources nested under an instance. */
export const CONNECT_ARN_REF_TYPES: Readonly<Record<string, RefType>> = {
  "contact-flow": "flow",
  "flow-module": "module",
  queue: "queue",
  "operating-hours": "hours",
  prompt: "prompt",
};

/** FlowDoc ref type to ARN type keyword. The inverse of CONNECT_ARN_REF_TYPES. */
export const REF_TYPE_ARN_KEYWORDS: Readonly<Record<string, string>> = {
  flow: "contact-flow",
  module: "flow-module",
  queue: "queue",
  hours: "operating-hours",
  prompt: "prompt",
};

export interface ConnectArn {
  partition: string;
  region: string;
  account: string;
  instanceId: string;
  /** ARN type keyword, e.g. `contact-flow`, `flow-module`, `operating-hours`. */
  resourceType?: string;
  resourceId?: string;
  /**
   * Trailing colon qualifier on a flow or module ARN: `$SAVED` or a version
   * number. Documented on DescribeContactFlow, which spells the alias form
   * `arn:aws:.../contact-flow/{id}:$SAVED`.
   * https://docs.aws.amazon.com/connect/latest/APIReference/API_DescribeContactFlow.html
   */
  qualifier?: string;
}

/** Parses an Amazon Connect resource ARN. Returns undefined for anything else. */
export function parseConnectArn(arn: string): ConnectArn | undefined {
  const parts = arn.split(":");
  if (parts.length < 6) return undefined;
  if (parts[0] !== "arn" || parts[2] !== "connect") return undefined;
  const segments = (parts[5] ?? "").split("/");
  if (segments[0] !== "instance" || segments.length < 2) return undefined;
  const instanceId = segments[1] ?? "";
  if (instanceId === "") return undefined;
  const parsed: ConnectArn = {
    partition: parts[1] ?? "",
    region: parts[3] ?? "",
    account: parts[4] ?? "",
    instanceId,
  };
  if (segments.length >= 4) {
    parsed.resourceType = segments[2];
    parsed.resourceId = segments.slice(3).join("/");
  }
  if (parts.length > 6) parsed.qualifier = parts.slice(6).join(":");
  return parsed;
}

/**
 * Function name out of a Lambda ARN. Lambda is not a Connect resource type:
 * ListLambdaFunctions returns native Lambda ARNs, so the name is the segment
 * after `function`, with any version or alias qualifier dropped.
 * https://docs.aws.amazon.com/connect/latest/APIReference/API_ListLambdaFunctions.html
 */
export function parseLambdaFunctionArn(arn: string): string | undefined {
  const parts = arn.split(":");
  if (parts.length < 7 || parts[0] !== "arn" || parts[2] !== "lambda") return undefined;
  if (parts[5] !== "function") return undefined;
  const name = parts[6];
  return name === undefined || name === "" ? undefined : name;
}

/**
 * Drops the trailing qualifier a reference may carry, so `:$SAVED` or a version
 * suffix resolves to the same reverse-map entry as the bare resource.
 */
export function normalizeArn(arn: string): string {
  const parts = arn.split(":");
  if (parts.length < 6 || parts[0] !== "arn") return arn;
  if (parts[2] === "connect") return parts.slice(0, 6).join(":");
  if (parts[2] === "lambda" && parts[5] === "function") return parts.slice(0, 7).join(":");
  return arn;
}

// --- Names -------------------------------------------------------------------

/**
 * Connect resource names are free text; FlowDoc names are slugs. Lowercase,
 * runs of anything else collapse to a single hyphen, edges trimmed.
 */
export function slugifyResourceName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Inventory ---------------------------------------------------------------

/** One named Connect resource, as the List* operations return it. */
export interface ResourceSummary {
  arn: string;
  id?: string;
  name: string;
}

export interface ContactFlowSummary extends ResourceSummary {
  /** ListContactFlows names this field ContactFlowType, not Type. */
  contactFlowType?: string;
  contactFlowState?: string;
  contactFlowStatus?: string;
}

export interface ContactFlowModuleSummary extends ResourceSummary {
  state?: string;
}

/**
 * ListBots returns V1 and V2 bots in one list and they are not symmetric: a V2
 * bot yields an alias ARN and no name, a V1 bot yields a name and region and no
 * ARN at all. Only an ARN can be reverse-mapped out of flow content.
 * https://docs.aws.amazon.com/connect/latest/APIReference/API_ListBots.html
 */
export interface LexBotSummary {
  lexVersion: "V1" | "V2";
  name?: string;
  lexRegion?: string;
  aliasArn?: string;
}

export interface InstanceInventory {
  contactFlows: ContactFlowSummary[];
  contactFlowModules: ContactFlowModuleSummary[];
  queues: ResourceSummary[];
  hoursOfOperations: ResourceSummary[];
  prompts: ResourceSummary[];
  /** Bare Lambda function ARNs, which is all ListLambdaFunctions returns. */
  lambdaFunctions: string[];
  lexBots: LexBotSummary[];
}

/** A described flow or module: the operation that carries the Flow language. */
export interface DescribedContactFlow {
  arn: string;
  id: string;
  name: string;
  /** DescribeContactFlow names these Type/State/Status, not ContactFlow*. */
  type?: string;
  state?: string;
  status?: string;
  version?: string;
  /** The Flow language JSON, as a string. */
  content: string;
  contentSha256?: string;
}

export interface DescribedContactFlowModule extends DescribedContactFlow {
  /**
   * Two fields a ContactFlow has no analogue for. An exporter that means to
   * round-trip modules has to carry both or it loses content.
   * https://docs.aws.amazon.com/connect/latest/APIReference/API_DescribeContactFlowModule.html
   */
  settings?: string;
  externalInvocationEnabled?: boolean;
}

/**
 * The narrow seam every export path runs through. Implementations page and rate
 * limit; this interface deals in complete lists.
 */
export interface ConnectInventoryClient {
  listContactFlows(contactFlowTypes?: readonly string[]): Promise<ContactFlowSummary[]>;
  describeContactFlow(contactFlowId: string): Promise<DescribedContactFlow>;
  listContactFlowModules(): Promise<ContactFlowModuleSummary[]>;
  describeContactFlowModule(contactFlowModuleId: string): Promise<DescribedContactFlowModule>;
  listQueues(): Promise<ResourceSummary[]>;
  listHoursOfOperations(): Promise<ResourceSummary[]>;
  listPrompts(): Promise<ResourceSummary[]>;
  listLambdaFunctions(): Promise<string[]>;
  listBots(): Promise<LexBotSummary[]>;
}

export interface CollectInventoryOptions {
  /**
   * ContactFlowTypes filter for ListContactFlows. Omitted means every type.
   * https://docs.aws.amazon.com/connect/latest/APIReference/API_ListContactFlows.html
   */
  flowTypes?: readonly string[];
  /** Set false to skip ListContactFlowModules and DescribeContactFlowModule. */
  includeModules?: boolean;
}

/** Runs the nine list operations and assembles one inventory. */
export async function collectInventory(
  client: ConnectInventoryClient,
  options: CollectInventoryOptions = {},
): Promise<InstanceInventory> {
  const includeModules = options.includeModules !== false;
  const [
    contactFlows,
    contactFlowModules,
    queues,
    hoursOfOperations,
    prompts,
    lambdaFunctions,
    lexBots,
  ] = await Promise.all([
    client.listContactFlows(options.flowTypes),
    includeModules ? client.listContactFlowModules() : Promise.resolve([]),
    client.listQueues(),
    client.listHoursOfOperations(),
    client.listPrompts(),
    client.listLambdaFunctions(),
    client.listBots(),
  ]);
  return {
    contactFlows,
    contactFlowModules,
    queues,
    hoursOfOperations,
    prompts,
    lambdaFunctions,
    lexBots,
  };
}

// --- Reverse map -------------------------------------------------------------

export interface ReverseMap {
  /** Normalized ARN to the ref entry that replaces it. */
  byArn: ReadonlyMap<string, RefEntry>;
  /** Names that collided, bots with no ARN, and anything else lossy. */
  warnings: readonly string[];
}

interface Candidate {
  arn: string;
  type: RefType;
  name: string;
  alias?: string;
}

function makeRefEntry(type: RefType, name: string, alias?: string): RefEntry | undefined {
  const suffix = alias === undefined ? "" : `@${alias}`;
  return parseToken(`\${cdref:${type}:${name}${suffix}}`);
}

/**
 * Assigns one slug per resource, per ref type, deterministically: candidates
 * are sorted by (name, ARN) and a collision takes a numeric suffix. Renaming
 * beats failing an entire instance export over two queues named "Sales" and
 * "sales", and sorting first keeps the assignment stable across runs.
 */
function assignNames(candidates: Candidate[], warnings: string[]): Map<string, RefEntry> {
  const byArn = new Map<string, RefEntry>();
  const taken = new Map<string, Set<string>>();
  const sorted = [...candidates].sort((a, b) =>
    a.type !== b.type
      ? a.type < b.type
        ? -1
        : 1
      : a.name !== b.name
        ? a.name < b.name
          ? -1
          : 1
        : a.arn < b.arn
          ? -1
          : a.arn > b.arn
            ? 1
            : 0,
  );

  for (const candidate of sorted) {
    const arn = normalizeArn(candidate.arn);
    if (byArn.has(arn)) continue;
    const used = taken.get(candidate.type) ?? new Set<string>();
    taken.set(candidate.type, used);

    let name = candidate.name;
    if (used.has(name)) {
      let n = 2;
      while (used.has(`${name}-${String(n)}`)) n += 1;
      const renamed = `${name}-${String(n)}`;
      warnings.push(
        `Two ${candidate.type} resources slug to "${name}"; ${arn} exported as "${renamed}".`,
      );
      name = renamed;
    }

    const entry = makeRefEntry(candidate.type, name, candidate.alias);
    if (entry === undefined) {
      warnings.push(`Cannot name ${candidate.type} ${arn}: "${name}" is not a valid slug.`);
      continue;
    }
    used.add(name);
    byArn.set(arn, entry);
  }
  return byArn;
}

function candidateName(
  raw: string,
  arn: string,
  type: RefType,
  warnings: string[],
): string | undefined {
  const slug = slugifyResourceName(raw);
  if (SLUG_PATTERN.test(slug)) return slug;
  warnings.push(`Skipping ${type} ${arn}: name "${raw}" has no slug form.`);
  return undefined;
}

/**
 * ARN to ref entry for one instance. Every ARN a flow can hold gets an entry,
 * so anything left over after export is genuinely unknown and is reported.
 */
export function buildReverseMap(inventory: InstanceInventory): ReverseMap {
  const warnings: string[] = [];
  const candidates: Candidate[] = [];

  const add = (arn: string | undefined, rawName: string | undefined, type: RefType) => {
    if (arn === undefined || arn === "" || rawName === undefined) return;
    const name = candidateName(rawName, arn, type, warnings);
    if (name === undefined) return;
    candidates.push({ arn, type, name });
  };

  for (const q of inventory.queues) add(q.arn, q.name, "queue");
  for (const h of inventory.hoursOfOperations) add(h.arn, h.name, "hours");
  for (const p of inventory.prompts) add(p.arn, p.name, "prompt");
  for (const f of inventory.contactFlows) add(f.arn, f.name, "flow");
  for (const m of inventory.contactFlowModules) add(m.arn, m.name, "module");

  for (const arn of inventory.lambdaFunctions) {
    const fn = parseLambdaFunctionArn(arn);
    if (fn === undefined) {
      warnings.push(`Skipping Lambda ARN with no function segment: ${arn}`);
      continue;
    }
    add(arn, fn, "lambda");
  }

  for (const bot of inventory.lexBots) {
    if (bot.aliasArn === undefined || bot.aliasArn === "") {
      // A V1 bot has no ARN at all, so nothing in flow content can be matched
      // back to it. Flow content references V1 bots by name and region rather
      // than by ARN, so this costs nothing unless a V1 alias ARN turns up.
      warnings.push(
        `Amazon Lex ${bot.lexVersion} bot "${bot.name ?? "(unnamed)"}" has no ARN and is not reverse-mapped.`,
      );
      continue;
    }
    // ListBots gives a V2 bot an AliasArn and no name, so the slug comes from
    // the ARN's own identifiers unless the entry carries a name.
    const raw = bot.name ?? bot.aliasArn.split(":").slice(5).join("-");
    add(bot.aliasArn, raw, "lex");
  }

  return { byArn: assignNames(candidates, warnings), warnings };
}

/**
 * Reverse map from a materialization resource map (token to value). The
 * offline half of export: it turns the same file that materializes a FlowDoc
 * into the map that exports the result back, which is what makes the
 * round-trip property testable with no instance.
 */
export function reverseMapOfResourceMap(resourceMap: Record<string, string>): ReverseMap {
  const warnings: string[] = [];
  const byArn = new Map<string, RefEntry>();
  for (const [token, value] of Object.entries(resourceMap).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const entry = parseToken(token);
    if (entry === undefined) {
      warnings.push(`Skipping map key that is not a reference token: ${token}`);
      continue;
    }
    const arn = normalizeArn(value);
    const existing = byArn.get(arn);
    if (existing !== undefined) {
      warnings.push(`${arn} is mapped by both ${existing.token} and ${token}; keeping the first.`);
      continue;
    }
    byArn.set(arn, entry);
  }
  return { byArn, warnings };
}

/** Reverse-map lookup, tolerant of a `:$SAVED` or version qualifier. */
export function lookupArn(reverseMap: ReverseMap, arn: string): RefEntry | undefined {
  return reverseMap.byArn.get(arn) ?? reverseMap.byArn.get(normalizeArn(arn));
}

// --- exportFlow --------------------------------------------------------------

/**
 * The account segment of an ARN: digits for a customer resource, the literal
 * `aws` for an AWS-managed one. The stock "Sample after contact work flow" on a
 * fresh instance references the view
 * `arn:aws:connect:<region>:aws:view/after-contact-work:1` (observed live
 * 2026-09-01), and ListViews documents AWS_MANAGED views beside
 * CUSTOMER_MANAGED ones. Digits alone let that ARN through as prose, which put
 * a literal ARN in an exported FlowDoc (FlowDoc invariant 4) and past the lint
 * rule that fails on it. There is no view ref type yet, so it is reported as
 * an unknown ARN instead.
 * https://docs.aws.amazon.com/connect/latest/APIReference/API_ListViews.html
 */
const ARN_ACCOUNT = "(?:[0-9]*|aws)";
/** A whole field value that is an ARN, which is the only replaceable shape. */
const WHOLE_ARN = new RegExp(
  String.raw`^arn:aws[a-z0-9-]*:[a-z0-9-]*:[a-z0-9-]*:${ARN_ACCOUNT}:\S+$`,
);
/** An ARN anywhere inside a longer string, which is never replaceable. */
const ARN_ANYWHERE = new RegExp(
  String.raw`arn:aws[a-z0-9-]*:[a-z0-9-]*:[a-z0-9-]*:${ARN_ACCOUNT}:[^\s"']+`,
  "g",
);

/**
 * Export failed. Both lists are complete and sorted, so a caller fixes the
 * inventory once rather than one ARN per run. Mirrors MaterializeError.
 */
export class ExportError extends Error {
  /** ARNs occupying a whole field with no entry in the reverse map. */
  readonly unknownArns: readonly string[];
  /**
   * ARNs embedded in a longer string. A reference occupies an entire field
   * value (FlowDoc invariant 4), so these cannot become tokens at all.
   */
  readonly interpolatedArns: readonly string[];
  /** ARN to the content paths it was found at, for locating each one. */
  readonly locations: Readonly<Record<string, readonly string[]>>;
  /**
   * The FlowDoc name being exported, when the caller knew it. A whole-instance
   * export reads many flows through one call, so without this the message names
   * an ARN and leaves the operator to find which flow holds it.
   */
  readonly resource?: string;

  constructor(
    unknownArns: readonly string[],
    interpolatedArns: readonly string[],
    locations: Readonly<Record<string, readonly string[]>>,
    resource?: string,
  ) {
    const parts: string[] = [];
    if (unknownArns.length > 0) {
      parts.push(
        `${String(unknownArns.length)} ARN(s) not found in the instance inventory: ` +
          unknownArns.join(", "),
      );
    }
    if (interpolatedArns.length > 0) {
      parts.push(
        `${String(interpolatedArns.length)} ARN(s) embedded in a longer string, which cannot hold a reference: ` +
          interpolatedArns.join(", "),
      );
    }
    super(`Cannot export${resource === undefined ? "" : ` "${resource}"`}: ${parts.join("; ")}`);
    this.name = "ExportError";
    this.unknownArns = unknownArns;
    this.interpolatedArns = interpolatedArns;
    this.locations = locations;
    if (resource !== undefined) this.resource = resource;
  }
}

interface RewriteAccumulator {
  unknown: Map<string, string[]>;
  interpolated: Map<string, string[]>;
}

function record(into: Map<string, string[]>, arn: string, path: string): void {
  const paths = into.get(arn);
  if (paths === undefined) into.set(arn, [path]);
  else paths.push(path);
}

function rewriteArns(
  value: unknown,
  path: string,
  reverseMap: ReverseMap,
  acc: RewriteAccumulator,
): unknown {
  if (typeof value === "string") {
    if (WHOLE_ARN.test(value)) {
      const entry = lookupArn(reverseMap, value);
      if (entry !== undefined) return entry.token;
      record(acc.unknown, value, path);
      return value;
    }
    for (const match of value.match(ARN_ANYWHERE) ?? []) record(acc.interpolated, match, path);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => rewriteArns(v, `${path}[${String(i)}]`, reverseMap, acc));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        rewriteArns(v, path === "" ? k : `${path}.${k}`, reverseMap, acc),
      ]),
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Connect omits `Parameters` from an action that takes none, rather than
 * writing an empty map. Observed live: of the 20 stock sample flows on a fresh
 * instance, 12 actions across 7 flows (`TransferContactToQueue` and
 * `DistributeByPercentage`) came back with no `Parameters` key at all, while 28
 * other parameterless actions in the same flows carried `"Parameters": {}`. So
 * both spellings are live output and mean the same thing.
 *
 * FlowDoc requires the key on every action
 * (conformance/schema/flowdoc-0.1.schema.json, `$defs.action.required`), so
 * passing the omission through produced a schema-invalid document, and codegen
 * read `Object.keys(a.Parameters)` straight off it and threw
 * "Cannot convert undefined or null to object". Filling in the empty map
 * Connect means by the absence is not a content change: materializing the
 * result re-emits `"Parameters": {}`, the form the console itself writes.
 *
 * `Transitions` is normalized the same way. Connect writes `{}` for a terminal
 * action rather than omitting the key, so this half is defensive, but
 * canonicalization reads through `Transitions` unconditionally and an absent
 * one would crash serialization instead of degrading.
 */
function normalizeAction(action: FlowAction): FlowAction {
  if (isRecord(action.Parameters) && isRecord(action.Transitions)) return action;
  return {
    ...action,
    Parameters: isRecord(action.Parameters) ? action.Parameters : {},
    Transitions: isRecord(action.Transitions) ? action.Transitions : {},
  };
}

function isPoint(value: unknown): value is Point {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Point).x === "number" &&
    typeof (value as Point).y === "number"
  );
}

/**
 * Pulls positions out of content.Metadata and into `layout`, which is FlowDoc's
 * single source of truth for position (docs/01-flowdoc-spec.md). Everything
 * else Metadata carries stays in content: materialization preserves it, and
 * dropping it would lose console state we never modeled.
 *
 * The Flow language example writes `Position`; console exports have also been
 * seen writing `position`, so both are lifted and only `Position` is written
 * back by materialization.
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-language-example.html
 */
function liftMetadata(
  metadata: unknown,
  actionIds: ReadonlySet<string>,
): { layout: Record<string, Point>; rest?: Record<string, unknown> } {
  const layout: Record<string, Point> = {};
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { layout };
  }
  const rest: Record<string, unknown> = { ...(metadata as Record<string, unknown>) };
  delete rest.EntryPointPosition;
  delete rest.entryPointPosition;

  const rawActionMetadata = rest.ActionMetadata;
  if (
    rawActionMetadata !== null &&
    typeof rawActionMetadata === "object" &&
    !Array.isArray(rawActionMetadata)
  ) {
    const remaining: Record<string, unknown> = {};
    for (const [id, raw] of Object.entries(rawActionMetadata as Record<string, unknown>)) {
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        remaining[id] = raw;
        continue;
      }
      const entry: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
      const position = entry.Position ?? entry.position;
      if (actionIds.has(id) && isPoint(position)) {
        layout[id] = { x: position.x, y: position.y };
        delete entry.Position;
        delete entry.position;
      }
      if (Object.keys(entry).length > 0) remaining[id] = entry;
    }
    if (Object.keys(remaining).length > 0) rest.ActionMetadata = remaining;
    else delete rest.ActionMetadata;
  }

  return Object.keys(rest).length > 0 ? { layout, rest } : { layout };
}

export interface ExportFlowOptions {
  /** FlowDoc name. Must be a slug; use slugifyResourceName on a console name. */
  name: string;
  connectType: ConnectType;
  /** Defaults to "module" when connectType is MODULE, "flow" otherwise. */
  kind?: "flow" | "module";
  /** Recorded in meta.generator. Defaults to the package identity. */
  generator?: string;
  /** Merged into meta, after generator. */
  meta?: FlowDocMeta;
  /** Set false to emit no `meta` block. */
  includeMeta?: boolean;
}

/**
 * Live Flow language in, FlowDoc out. Every ARN occupying a whole field value
 * becomes its `${cdref:type:name}` token; an ARN with no reverse-map entry is a
 * hard error listing every unknown ARN at once, per SPEC.md.
 */
export function exportFlow(
  content: string | FlowContent | Record<string, unknown>,
  reverseMap: ReverseMap,
  options: ExportFlowOptions,
): FlowDoc {
  const parsed: unknown = typeof content === "string" ? JSON.parse(content) : content;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Cannot export: flow content is not a JSON object.");
  }
  const raw = parsed as Record<string, unknown>;
  if (raw.Version !== FLOW_LANGUAGE_VERSION) {
    throw new Error(
      `Cannot export: flow content Version is ${JSON.stringify(raw.Version)}, expected "${FLOW_LANGUAGE_VERSION}".`,
    );
  }
  if (typeof raw.StartAction !== "string" || raw.StartAction === "") {
    throw new Error("Cannot export: flow content has no StartAction.");
  }
  if (!Array.isArray(raw.Actions) || raw.Actions.length === 0) {
    throw new Error("Cannot export: flow content has no Actions.");
  }
  if (!SLUG_PATTERN.test(options.name)) {
    throw new Error(
      `Cannot export: "${options.name}" is not a valid FlowDoc name. Names are lowercase words separated by single hyphens.`,
    );
  }

  const acc: RewriteAccumulator = { unknown: new Map(), interpolated: new Map() };
  const actions = (
    rewriteArns(raw.Actions, "Actions", reverseMap, acc) as FlowContent["Actions"]
  ).map(normalizeAction);
  const metadata = rewriteArns(raw.Metadata, "Metadata", reverseMap, acc);

  if (acc.unknown.size > 0 || acc.interpolated.size > 0) {
    const sorted = (m: Map<string, string[]>) => [...m.keys()].sort();
    const locations: Record<string, readonly string[]> = {};
    for (const [arn, paths] of [...acc.unknown, ...acc.interpolated]) locations[arn] = paths;
    throw new ExportError(sorted(acc.unknown), sorted(acc.interpolated), locations, options.name);
  }

  const actionIds = new Set(actions.map((a) => a.Identifier));
  const lifted = liftMetadata(metadata, actionIds);

  const flowContent: FlowContent = {
    Version: FLOW_LANGUAGE_VERSION,
    StartAction: raw.StartAction,
    Actions: actions,
  };
  if (lifted.rest !== undefined) flowContent.Metadata = lifted.rest;

  // Actions the instance never gave a position get the same deterministic
  // auto-layout synth would have assigned, so the studio can open the result.
  const auto = Object.values(lifted.layout).length === actions.length ? {} : autoLayout(actions);
  const layout: Record<string, Point> = {};
  for (const action of actions) {
    layout[action.Identifier] = lifted.layout[action.Identifier] ??
      auto[action.Identifier] ?? { x: 0, y: 0 };
  }

  const doc: FlowDoc = {
    flowdoc: FLOWDOC_VERSION,
    kind: options.kind ?? (options.connectType === "MODULE" ? "module" : "flow"),
    name: options.name,
    connectType: options.connectType,
    content: flowContent,
    layout,
    refs: collectRefs(flowContent),
  };

  if (options.includeMeta !== false) {
    doc.meta = {
      generator: options.generator ?? `core@${FLOWDOC_VERSION}`,
      ...options.meta,
    };
  }
  return canonicalize(doc);
}

// --- exportInstance ----------------------------------------------------------

/** ContactFlowType values FlowDoc models. CAMPAIGN has no FlowDoc connectType. */
const EXPORTABLE_FLOW_TYPES: ReadonlySet<string> = new Set<ConnectType>([
  "CONTACT_FLOW",
  "CUSTOMER_QUEUE",
  "CUSTOMER_HOLD",
  "CUSTOMER_WHISPER",
  "AGENT_HOLD",
  "AGENT_WHISPER",
  "OUTBOUND_WHISPER",
  "AGENT_TRANSFER",
  "QUEUE_TRANSFER",
]);

export interface ExportedFlow {
  arn: string;
  id: string;
  /** The name as the instance spells it, before slugging. */
  sourceName: string;
  doc: FlowDoc;
  /** Present when options.codegen is set. */
  code?: string;
  /** Set when the flow was read through the $SAVED alias. */
  saved?: boolean;
}

export interface ExportFailure {
  arn: string;
  name: string;
  reason: string;
  unknownArns?: readonly string[];
}

export interface ExportInstanceResult {
  inventory: InstanceInventory;
  reverseMap: ReverseMap;
  flows: ExportedFlow[];
  warnings: string[];
  failures: ExportFailure[];
}

export interface ExportInstanceOptions extends CollectInventoryOptions {
  /**
   * Read never-published flows through the `$SAVED` alias instead of failing.
   * DescribeContactFlow throws ContactFlowNotPublishedException for a flow that
   * has never been published, and documents `$SAVED` as the way to read the
   * saved content. Default true.
   * https://docs.aws.amazon.com/connect/latest/APIReference/API_DescribeContactFlow.html
   */
  savedFallback?: boolean;
  /**
   * "throw" (default, and what SPEC.md specifies) aborts the export on the
   * first flow that cannot be exported. "collect" records it in `failures` and
   * keeps going, which is what a first look at an unfamiliar instance wants.
   */
  onError?: "throw" | "collect";
  /** Emit TypeScript beside each FlowDoc. `true` uses codegen defaults. */
  codegen?: boolean | CodegenOptions;
  /** Recorded in meta.generator on every exported doc. */
  generator?: string;
  /** Pre-supplied inventory, to export twice without listing twice. */
  inventory?: InstanceInventory;
}

function isNotPublished(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "ContactFlowNotPublishedException"
  );
}

/**
 * Whole-instance export: inventory, reverse map, then every flow and module.
 * Nothing here is Connect-version specific beyond the client interface, so the
 * offline fixtures exercise exactly the code a live run does.
 */
export async function exportInstance(
  client: ConnectInventoryClient,
  options: ExportInstanceOptions = {},
): Promise<ExportInstanceResult> {
  const inventory = options.inventory ?? (await collectInventory(client, options));
  const reverseMap = buildReverseMap(inventory);
  const warnings = [...reverseMap.warnings];
  const failures: ExportFailure[] = [];
  const flows: ExportedFlow[] = [];
  const codegenOptions: CodegenOptions | undefined =
    options.codegen === undefined || options.codegen === false
      ? undefined
      : options.codegen === true
        ? {}
        : options.codegen;

  const fail = (arn: string, name: string, error: unknown): void => {
    if (options.onError !== "collect") throw error;
    const failure: ExportFailure = {
      arn,
      name,
      reason: error instanceof Error ? error.message : String(error),
    };
    if (error instanceof ExportError) failure.unknownArns = error.unknownArns;
    failures.push(failure);
  };

  const describe = async (
    id: string,
    read: (id: string) => Promise<DescribedContactFlow>,
  ): Promise<{ described: DescribedContactFlow; saved: boolean }> => {
    try {
      return { described: await read(id), saved: false };
    } catch (error) {
      if (options.savedFallback === false || !isNotPublished(error)) throw error;
      // "Use the $SAVED alias in the request to describe the SAVED content of a
      // Flow." Never-published flows are otherwise a 404 for the exporter.
      return { described: await read(`${id}:$SAVED`), saved: true };
    }
  };

  const emit = (
    summary: ResourceSummary,
    described: DescribedContactFlow,
    connectType: ConnectType,
    saved: boolean,
  ): void => {
    const entry = lookupArn(reverseMap, summary.arn);
    if (entry === undefined) {
      throw new Error(
        `Cannot export ${summary.arn}: the instance inventory has no entry for it, so it has no name.`,
      );
    }
    const instanceId = parseConnectArn(summary.arn)?.instanceId;
    const doc = exportFlow(described.content, reverseMap, {
      name: entry.name,
      connectType,
      generator: options.generator,
      meta: {
        // Provenance, deliberately without the ARN. An exported FlowDoc is an
        // authored document and gets committed to a repository, so it must not
        // carry a literal ARN anywhere, meta included; that would pin it to one
        // account and leak the account id. The instance id and resource id say
        // where it came from without either.
        source: {
          ...(instanceId === undefined ? {} : { instanceId }),
          id: described.id,
          name: described.name,
          ...(described.version === undefined ? {} : { version: described.version }),
          ...(described.contentSha256 === undefined
            ? {}
            : { contentSha256: described.contentSha256 }),
          ...(saved ? { alias: "$SAVED" } : {}),
        },
      },
    });
    const exported: ExportedFlow = {
      arn: summary.arn,
      id: described.id,
      sourceName: described.name,
      doc,
    };
    if (saved) exported.saved = true;
    if (codegenOptions !== undefined) exported.code = codegen(doc, codegenOptions);
    flows.push(exported);
  };

  for (const summary of [...inventory.contactFlows].sort((a, b) => (a.arn < b.arn ? -1 : 1))) {
    const type = summary.contactFlowType ?? "CONTACT_FLOW";
    if (!EXPORTABLE_FLOW_TYPES.has(type)) {
      warnings.push(`Skipping ${summary.arn}: ContactFlowType ${type} has no FlowDoc connectType.`);
      continue;
    }
    try {
      const { described, saved } = await describe(summary.id ?? summary.arn, (id) =>
        client.describeContactFlow(id),
      );
      emit(summary, described, type as ConnectType, saved);
    } catch (error) {
      fail(summary.arn, summary.name, error);
    }
  }

  for (const summary of [...inventory.contactFlowModules].sort((a, b) =>
    a.arn < b.arn ? -1 : 1,
  )) {
    try {
      const { described, saved } = await describe(summary.id ?? summary.arn, (id) =>
        client.describeContactFlowModule(id),
      );
      const module = described as DescribedContactFlowModule;
      if (module.settings !== undefined || module.externalInvocationEnabled !== undefined) {
        // Neither field has a FlowDoc home yet. Warn rather than drop silently.
        warnings.push(
          `Module ${summary.arn} carries Settings or ExternalInvocationConfiguration, which FlowDoc does not model; they are not exported.`,
        );
      }
      emit(summary, described, "MODULE", saved);
    } catch (error) {
      fail(summary.arn, summary.name, error);
    }
  }

  return { inventory, reverseMap, flows, warnings, failures };
}

// --- AWS SDK adapter ---------------------------------------------------------
// Everything above is SDK-free. This is the only code that loads
// @aws-sdk/client-connect, and it does so with a dynamic import inside a
// function, so the optional peer dependency is required only by a caller that
// actually connects to an instance.

interface ConnectCommands {
  ListContactFlowsCommand: new (input: any) => any;
  DescribeContactFlowCommand: new (input: any) => any;
  ListContactFlowModulesCommand: new (input: any) => any;
  DescribeContactFlowModuleCommand: new (input: any) => any;
  ListQueuesCommand: new (input: any) => any;
  ListHoursOfOperationsCommand: new (input: any) => any;
  ListPromptsCommand: new (input: any) => any;
  ListLambdaFunctionsCommand: new (input: any) => any;
  ListBotsCommand: new (input: any) => any;
}

async function loadConnectCommands(): Promise<ConnectCommands> {
  try {
    return (await import("@aws-sdk/client-connect")) as unknown as ConnectCommands;
  } catch (cause) {
    throw new Error(
      "Connecting to an instance needs the optional peer dependency @aws-sdk/client-connect. Install it, or use the offline paths (exportFlow with reverseMapOfResourceMap).",
      { cause },
    );
  }
}

export interface ConnectClientOptions extends RateLimiterOptions {
  /** An @aws-sdk/client-connect ConnectClient, or anything with `send`. */
  connect: AwsCommandSender;
  /** Instance id or instance ARN; both are accepted by every operation. */
  instanceId: string;
  /** Page size for the Connect resource lists. Their maximum is 1000. */
  maxResults?: number;
}

/**
 * Builds a ConnectInventoryClient over the AWS SDK: pagination, the 2 rps
 * throttle budget, and the response-shape differences between the list and
 * describe operations all live here so nothing above has to know them.
 */
export function createConnectInventoryClient(
  options: ConnectClientOptions,
): ConnectInventoryClient {
  const { connect, instanceId } = options;
  const maxResults = options.maxResults ?? 1000;
  let commands: ConnectCommands | undefined;
  const throttle = createRateLimiter(options);

  const send = async (make: (c: ConnectCommands) => any): Promise<any> => {
    commands ??= await loadConnectCommands();
    await throttle();
    return connect.send(make(commands));
  };

  /** Every list operation here pages the same way: opaque NextToken, query string. */
  const paginate = async <T>(
    make: (c: ConnectCommands, nextToken: string | undefined) => any,
    pick: (response: any) => T[] | undefined,
  ): Promise<T[]> => {
    const out: T[] = [];
    let nextToken: string | undefined;
    do {
      const response = await send((c) => make(c, nextToken));
      out.push(...(pick(response) ?? []));
      nextToken =
        response.NextToken === "" ? undefined : (response.NextToken as string | undefined);
    } while (nextToken !== undefined);
    return out;
  };

  const summary = (s: { Arn?: string; Id?: string; Name?: string }): ResourceSummary => ({
    arn: s.Arn ?? "",
    ...(s.Id === undefined ? {} : { id: s.Id }),
    name: s.Name ?? "",
  });

  const described = (f: any): DescribedContactFlow => ({
    arn: f.Arn ?? "",
    id: f.Id ?? "",
    name: f.Name ?? "",
    type: f.Type,
    state: f.State,
    status: f.Status,
    version: f.Version === undefined ? undefined : String(f.Version),
    content: f.Content ?? "",
    contentSha256: f.FlowContentSha256 ?? f.FlowModuleContentSha256,
  });

  return {
    listContactFlows: (contactFlowTypes) =>
      paginate<ContactFlowSummary>(
        (c, nextToken) =>
          new c.ListContactFlowsCommand({
            InstanceId: instanceId,
            MaxResults: maxResults,
            NextToken: nextToken,
            ...(contactFlowTypes === undefined ? {} : { ContactFlowTypes: [...contactFlowTypes] }),
          }),
        (r) =>
          (r.ContactFlowSummaryList ?? []).map((s: any) => ({
            ...summary(s),
            contactFlowType: s.ContactFlowType,
            contactFlowState: s.ContactFlowState,
            contactFlowStatus: s.ContactFlowStatus,
          })),
      ),

    describeContactFlow: async (contactFlowId) => {
      const response = await send(
        (c) =>
          new c.DescribeContactFlowCommand({
            InstanceId: instanceId,
            ContactFlowId: contactFlowId,
          }),
      );
      return described(response.ContactFlow ?? {});
    },

    listContactFlowModules: () =>
      paginate<ContactFlowModuleSummary>(
        (c, nextToken) =>
          new c.ListContactFlowModulesCommand({
            InstanceId: instanceId,
            MaxResults: maxResults,
            NextToken: nextToken,
          }),
        // Note the plural: ContactFlowModulesSummaryList, not ...ModuleSummaryList.
        (r) =>
          (r.ContactFlowModulesSummaryList ?? []).map((s: any) => ({
            ...summary(s),
            state: s.State,
          })),
      ),

    describeContactFlowModule: async (contactFlowModuleId) => {
      const response = await send(
        (c) =>
          new c.DescribeContactFlowModuleCommand({
            InstanceId: instanceId,
            ContactFlowModuleId: contactFlowModuleId,
          }),
      );
      const module = response.ContactFlowModule ?? {};
      return {
        ...described(module),
        settings: module.Settings,
        externalInvocationEnabled: module.ExternalInvocationConfiguration?.Enabled,
      };
    },

    listQueues: () =>
      paginate<ResourceSummary>(
        (c, nextToken) =>
          // QueueTypes is deliberate: without it agent queues come back too,
          // which are per-user and can truncate the page past 1000 agents.
          new c.ListQueuesCommand({
            InstanceId: instanceId,
            QueueTypes: ["STANDARD"],
            MaxResults: maxResults,
            NextToken: nextToken,
          }),
        (r) => (r.QueueSummaryList ?? []).map(summary),
      ),

    listHoursOfOperations: () =>
      paginate<ResourceSummary>(
        (c, nextToken) =>
          new c.ListHoursOfOperationsCommand({
            InstanceId: instanceId,
            MaxResults: maxResults,
            NextToken: nextToken,
          }),
        (r) => (r.HoursOfOperationSummaryList ?? []).map(summary),
      ),

    listPrompts: () =>
      paginate<ResourceSummary>(
        (c, nextToken) =>
          new c.ListPromptsCommand({
            InstanceId: instanceId,
            MaxResults: maxResults,
            NextToken: nextToken,
          }),
        (r) => (r.PromptSummaryList ?? []).map(summary),
      ),

    // MaxResults maxes out at 25 here, not 1000, and the response is a bare
    // array of Lambda ARNs with no ids or names.
    listLambdaFunctions: () =>
      paginate<string>(
        (c, nextToken) =>
          new c.ListLambdaFunctionsCommand({
            InstanceId: instanceId,
            MaxResults: 25,
            NextToken: nextToken,
          }),
        (r) => r.LambdaFunctions ?? [],
      ),

    // lexVersion is required, so a full inventory is two paginated passes.
    listBots: async () => {
      const out: LexBotSummary[] = [];
      for (const lexVersion of ["V1", "V2"] as const) {
        const configs = await paginate<any>(
          (c, nextToken) =>
            new c.ListBotsCommand({
              InstanceId: instanceId,
              LexVersion: lexVersion,
              MaxResults: 25,
              NextToken: nextToken,
            }),
          (r) => r.LexBots ?? [],
        );
        for (const config of configs) {
          const bot: LexBotSummary = { lexVersion };
          if (config.LexBot?.Name !== undefined) bot.name = config.LexBot.Name;
          if (config.LexBot?.LexRegion !== undefined) bot.lexRegion = config.LexBot.LexRegion;
          if (config.LexV2Bot?.AliasArn !== undefined) bot.aliasArn = config.LexV2Bot.AliasArn;
          out.push(bot);
        }
      }
      return out;
    },
  };
}
