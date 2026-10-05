#!/usr/bin/env node
/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Runs a set of create probes against an Amazon Connect instance and records
// what the service said, the method actions.md rules 37 and 38 used by hand.
//
//   node scripts/probe-create.mjs conformance/flow-language/probes/<rule> [--only <name>]... [--results <file>] [--dry-run]
//
// A probe is `<name>.json` in the rule's directory: `{ description, type,
// content }`, where `type` is a Connect flow type (`CONTACT_FLOW`,
// `CUSTOMER_QUEUE`, ...) or `MODULE`, and `content` is the Flow language
// content with every account, instance and resource id replaced by a
// `{{NAME}}` placeholder (conformance/flow-language/probes/README.md). The
// placeholders are filled from the environment at run time and never from a
// file: `{{ACCOUNT}}` from AWS_ACCOUNT_ID, `{{REGION}}` from AWS_REGION (or
// AWS_DEFAULT_REGION), `{{INSTANCE}}` from CONNECT_INSTANCE_ID, and any other
// `{{NAME}}` from PROBE_NAME. Credentials come from the SDK's default chain,
// so AWS_PROFILE selects the account.
//
// For each probe, in name order: CreateContactFlow with Status PUBLISHED (or
// CreateContactFlowModule), named `hh-probe-<rule>-<name>`; an accepted flow
// is deleted at once and the deletion confirmed by a describe call that must
// return ResourceNotFoundException; a refusal is recorded with the exception
// and its problem messages. Each outcome is printed with its UTC time and
// appended to a results file beside the inputs (`results.json`, or the
// `--results` name, which may carry the UTC date and the Region:
// `results-2026-10-05-us-west-2.json`), with the account id, the instance id
// and every filled value scrubbed back to its placeholder, and any other
// UUID or 12-digit number replaced too, so the file can be committed. The
// run refuses to start while any flow or module named `hh-probe-*` or
// `fac-probe-*` exists on the instance, so a leftover from an interrupted
// run, by this runner or by hand, is noticed rather than mistaken for this
// run's. A probe that creates nothing (a refusal) leaves nothing to clean up.
//
// Never run by `npm test` or `npm run build`; tests/probeCreate.test.ts
// drives `runProbes` with a stubbed client. The SDK is resolved through the
// workspace (`@flow-as-code/core` depends on it); nothing is added for this.
//
// https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateContactFlow.html
// https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateContactFlowModule.html
// https://docs.aws.amazon.com/connect/latest/APIReference/API_DeleteContactFlow.html
// https://docs.aws.amazon.com/connect/latest/APIReference/API_DescribeContactFlow.html
// https://docs.aws.amazon.com/connect/latest/APIReference/API_InvalidContactFlowException.html

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ConnectClient,
  CreateContactFlowCommand,
  CreateContactFlowModuleCommand,
  DeleteContactFlowCommand,
  DeleteContactFlowModuleCommand,
  DescribeContactFlowCommand,
  DescribeContactFlowModuleCommand,
  ListContactFlowModulesCommand,
  ListContactFlowsCommand,
} from "@aws-sdk/client-connect";

/** The name prefix every probe flow or module this runner creates carries. */
export const PROBE_PREFIX = "hh-probe-";

/** The prefixes the leftover check keys on: this runner's, and the one hand-run probes used. */
export const LEFTOVER_PREFIXES = ["hh-probe-", "fac-probe-"];

/** A results file: `results.json`, or one named for its run (`results-2026-10-05-us-west-2.json`). */
export const RESULTS_FILE = /^results(-[A-Za-z0-9-]+)?\.json$/;

/** A placeholder in a probe input: `{{ACCOUNT}}`, `{{INSTANCE}}`, `{{QUEUE_ID}}`. */
export const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

/** What a committed probe file must never carry: a 12-digit account id or a UUID. */
const ACCOUNT_ID = /\b\d{12}\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Exceptions that mean the service judged the content, so the probe has an answer. */
const REFUSALS = new Set([
  "InvalidContactFlowException",
  "InvalidContactFlowModuleException",
  "InvalidParameterException",
  "InvalidRequestException",
]);

/** The environment variable a placeholder is filled from. */
export function envNameFor(placeholder) {
  switch (placeholder) {
    case "ACCOUNT":
      return "AWS_ACCOUNT_ID";
    case "REGION":
      return "AWS_REGION";
    case "INSTANCE":
      return "CONNECT_INSTANCE_ID";
    default:
      return `PROBE_${placeholder}`;
  }
}

/** The placeholder names a text uses, in first-seen order. */
export function placeholdersIn(text) {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/**
 * The value for each placeholder in `names`, read from `env`. Throws naming
 * every variable that is unset, so a run fails before any call rather than
 * on the third probe.
 */
export function fillsFor(names, env) {
  const fills = {};
  const missing = [];
  for (const name of names) {
    const variable = envNameFor(name);
    const value = env[variable] ?? (variable === "AWS_REGION" ? env.AWS_DEFAULT_REGION : undefined);
    if (value === undefined || value === "") missing.push(`${variable} (for {{${name}}})`);
    else fills[name] = value;
  }
  if (missing.length > 0) {
    throw new Error(`Unset in the environment: ${missing.join(", ")}.`);
  }
  return fills;
}

/** `text` with every `{{NAME}}` replaced by its fill; throws on one with no fill. */
export function fillPlaceholders(text, fills) {
  return text.replace(PLACEHOLDER, (whole, name) => {
    if (!(name in fills)) throw new Error(`No value for ${whole}.`);
    return fills[name];
  });
}

/**
 * `text` with every filled value turned back into its placeholder, then any
 * UUID or 12-digit number that is left replaced, so a service message can be
 * committed. The Region is not scrubbed: the records keep it.
 */
export function scrub(text, fills) {
  let out = text;
  for (const [name, value] of Object.entries(fills)) {
    if (name === "REGION" || value === "") continue;
    out = out.split(value).join(`{{${name}}}`);
  }
  return out.replace(UUID, "<uuid>").replace(ACCOUNT_ID, "<account>");
}

/** The ids a committed probe file must not carry, as `kind: match` lines. */
export function findIds(text) {
  return [
    ...[...text.matchAll(ACCOUNT_ID)].map((m) => `account id: ${m[0]}`),
    ...[...text.matchAll(UUID)].map((m) => `uuid: ${m[0]}`),
  ];
}

/** The flow or module name a probe is created under. */
export function probeName(rule, name) {
  return `${PROBE_PREFIX}${rule}-${name}`;
}

/** An ISO-8601 UTC time to the second, the precision the records use. */
export function utc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * The probes in a rule directory, in name order: every `*.json` except a
 * results file, each holding `description`, `type` and `content`.
 */
export function loadProbes(dir) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !RESULTS_FILE.test(f))
    .sort();
  return files.map((file) => {
    const text = readFileSync(join(dir, file), "utf8");
    const parsed = JSON.parse(text);
    const name = file.slice(0, -".json".length);
    for (const key of ["description", "type", "content"]) {
      if (!(key in parsed)) throw new Error(`${file}: missing "${key}".`);
    }
    if (typeof parsed.type !== "string" || parsed.type === "") {
      throw new Error(`${file}: "type" must be a flow type or MODULE.`);
    }
    return {
      name,
      file,
      description: parsed.description,
      type: parsed.type,
      content: parsed.content,
    };
  });
}

/** The problem messages of a refusal, or the exception's own message when it lists none. */
function problemsOf(error) {
  const list = error.problems ?? error.Problems ?? [];
  const messages = list.map((p) => p?.message).filter((m) => typeof m === "string" && m !== "");
  return messages.length > 0 ? messages : [String(error.message ?? error)];
}

/** Every page of a List call, followed by NextToken; the SDK's paginators insist on a real client, a stub cannot drive them. */
async function pages(client, make, listKey) {
  const out = [];
  let NextToken;
  do {
    const page = await client.send(make(NextToken));
    out.push(...(page[listKey] ?? []));
    NextToken = page.NextToken;
  } while (NextToken !== undefined);
  return out;
}

/** Whether a flow or module name is a probe's, by any prefix a probe has been given. */
const isProbeName = (name) => LEFTOVER_PREFIXES.some((prefix) => name?.startsWith(prefix));

/** Names on the instance that carry a probe prefix, flows then modules. */
async function leftovers(client, instanceId) {
  const flows = await pages(
    client,
    (NextToken) => new ListContactFlowsCommand({ InstanceId: instanceId, NextToken }),
    "ContactFlowSummaryList",
  );
  const modules = await pages(
    client,
    (NextToken) => new ListContactFlowModulesCommand({ InstanceId: instanceId, NextToken }),
    "ContactFlowModulesSummaryList",
  );
  return [
    ...flows.filter((f) => isProbeName(f.Name)).map((f) => `flow ${f.Name}`),
    ...modules.filter((m) => isProbeName(m.Name)).map((m) => `module ${m.Name}`),
  ];
}

/** Creates one probe; returns `{ id }` on acceptance or `{ refusal }` on a refusal. */
async function create(client, instanceId, name, probe, content) {
  try {
    if (probe.type === "MODULE") {
      const out = await client.send(
        new CreateContactFlowModuleCommand({
          InstanceId: instanceId,
          Name: name,
          Content: content,
        }),
      );
      return { id: out.Id };
    }
    const out = await client.send(
      new CreateContactFlowCommand({
        InstanceId: instanceId,
        Name: name,
        Type: probe.type,
        Content: content,
        Status: "PUBLISHED",
      }),
    );
    return { id: out.ContactFlowId };
  } catch (error) {
    if (REFUSALS.has(error?.name)) return { refusal: error };
    throw error;
  }
}

/** Deletes a created probe and confirms with a describe; the record's `cleanup` line. */
async function cleanUp(client, instanceId, id, probe) {
  const isModule = probe.type === "MODULE";
  await client.send(
    isModule
      ? new DeleteContactFlowModuleCommand({ InstanceId: instanceId, ContactFlowModuleId: id })
      : new DeleteContactFlowCommand({ InstanceId: instanceId, ContactFlowId: id }),
  );
  const describe = isModule ? "DescribeContactFlowModule" : "DescribeContactFlow";
  try {
    await client.send(
      isModule
        ? new DescribeContactFlowModuleCommand({ InstanceId: instanceId, ContactFlowModuleId: id })
        : new DescribeContactFlowCommand({ InstanceId: instanceId, ContactFlowId: id }),
    );
    return { cleanup: `deleted; ${describe} still returned it`, confirmed: false };
  } catch (error) {
    if (error?.name === "ResourceNotFoundException") {
      return {
        cleanup: `deleted; ${describe} returned ResourceNotFoundException`,
        confirmed: true,
      };
    }
    return {
      cleanup: `deleted; ${describe} failed: ${error?.name ?? String(error)}`,
      confirmed: false,
    };
  }
}

/** Appends entries to the results file in `dir`, creating it as an array. */
function appendResults(dir, results, entries) {
  if (!RESULTS_FILE.test(results)) {
    throw new Error(`A results file is named results.json or results-<run>.json, not ${results}.`);
  }
  const path = join(dir, results);
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  if (!Array.isArray(existing)) throw new Error(`${path} is not a JSON array.`);
  writeFileSync(path, `${JSON.stringify([...existing, ...entries], null, 2)}\n`);
  return path;
}

/**
 * Runs every probe in `dir` (or those in `only`) against the instance the
 * environment names, through `client` (anything with `send(command)`), and
 * appends the records to `results` (`results.json` by default). Returns `{ entries, clean }`, where
 * `clean` is false when a deletion could not be confirmed. Throws before any
 * create when a placeholder has no value or a probe flow is already on the
 * instance; throws on an error that is not a refusal, after recording the
 * probes that ran.
 */
export async function runProbes({
  dir,
  env,
  client,
  now = () => new Date(),
  log = () => {},
  only = [],
  results = "results.json",
  dryRun = false,
}) {
  const rule = basename(resolve(dir));
  let probes = loadProbes(dir);
  if (only.length > 0) probes = probes.filter((p) => only.includes(p.name));
  if (probes.length === 0) throw new Error(`No probe inputs in ${dir}.`);

  const names = placeholdersIn(probes.map((p) => JSON.stringify(p.content)).join("\n"));
  const fills = fillsFor(["INSTANCE", "REGION", ...names], env);
  const instanceId = fills.INSTANCE;
  const region = fills.REGION;

  const filled = probes.map((probe) => ({
    probe,
    content: fillPlaceholders(JSON.stringify(probe.content), fills),
  }));

  if (dryRun) {
    for (const { probe, content } of filled) {
      log(`${probeName(rule, probe.name)} (${probe.type}): ${content}`);
    }
    return { entries: [], clean: true };
  }

  const found = await leftovers(client, instanceId);
  if (found.length > 0) {
    throw new Error(
      `Refusing to run: ${String(found.length)} probe name(s) already on the instance (${found.join(", ")}). Delete them first.`,
    );
  }

  const entries = [];
  let clean = true;
  try {
    for (const { probe, content } of filled) {
      const name = probeName(rule, probe.name);
      const entry = {
        probe: probe.name,
        description: probe.description,
        flowType: probe.type,
        region,
        at: utc(now()),
        recordedBy: "scripts/probe-create.mjs",
      };
      const outcome = await create(client, instanceId, name, probe, content);
      if (outcome.refusal !== undefined) {
        entry.result = "refused";
        entry.exception = outcome.refusal.name;
        entry.problems = problemsOf(outcome.refusal).map((m) => scrub(m, fills));
        log(
          `${entry.at} ${name} (${probe.type}): refused, ${entry.exception}: ${entry.problems.join(" | ")}`,
        );
      } else {
        entry.result = "accepted";
        const { cleanup, confirmed } = await cleanUp(client, instanceId, outcome.id, probe);
        entry.cleanup = scrub(cleanup, fills);
        if (!confirmed) clean = false;
        log(`${entry.at} ${name} (${probe.type}): accepted; ${entry.cleanup}`);
      }
      entries.push(entry);
    }
  } finally {
    if (entries.length > 0) log(`wrote ${appendResults(dir, results, entries)}`);
  }
  return { entries, clean };
}

function parseArgs(argv) {
  const only = [];
  let dir;
  let results = "results.json";
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--only") only.push(argv[++i]);
    else if (arg === "--results") results = argv[++i];
    else if (arg === "--dry-run") dryRun = true;
    else if (dir === undefined) dir = arg;
    else throw new Error(`Unexpected argument ${arg}.`);
  }
  if (dir === undefined) {
    throw new Error(
      "Usage: node scripts/probe-create.mjs conformance/flow-language/probes/<rule> [--only <name>]... [--results <file>] [--dry-run]",
    );
  }
  return { dir, only, results, dryRun };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { dir, only, results, dryRun } = parseArgs(process.argv.slice(2));
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  const client = dryRun ? undefined : new ConnectClient({ region });
  console.log(
    `probe-create: ${dir}, profile ${process.env.AWS_PROFILE ?? "(default chain)"}, region ${region ?? "(unset)"}${dryRun ? ", dry run" : ""}`,
  );
  const { clean } = await runProbes({
    dir,
    env: process.env,
    client,
    only,
    results,
    dryRun,
    log: console.log,
  });
  if (!clean) {
    console.error("A deletion could not be confirmed; check the instance for hh-probe-* flows.");
    process.exit(1);
  }
}
