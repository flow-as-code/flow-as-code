#!/usr/bin/env node
/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Writes the action reference the agent skills load, from the action catalog.
//
//   node scripts/build-skill-reference.mjs           write it
//   node scripts/build-skill-reference.mjs --check   exit 1 if it is stale
//
// The reference is plugins/flow-as-code/skills/author-connect-flows-hcl/
// references/actions.md: one section per modeled action type, with its HCL
// block, its attributes, the error branches and conditions it takes, and the
// flow types it is legal in. Everything is read from conformance/flow-language/
// catalog.json, the file lint and the provider read, so what an agent is told
// cannot drift from what a plan enforces. tests/skills.test.ts runs --check.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const CATALOG = join(ROOT, "conformance", "flow-language", "catalog.json");
const OUT = join(
  ROOT,
  "plugins",
  "flow-as-code",
  "skills",
  "author-connect-flows-hcl",
  "references",
  "actions.md",
);

/** How a parameter kind is written in HCL. */
const KIND = {
  string: "string",
  integer: "number",
  integerString: "number",
  enum: "one of the values listed",
  ref: "reference key",
  jsonPath: 'JSONPath ("$.…")',
  stringOrJsonPath: "string or JSONPath",
  map: "map of strings",
  list: "list",
  object: "object",
  json: "jsonencode(...)",
};

const CONDITIONS = {
  none: "none",
  fixed: "exactly the Equals conditions listed",
  dtmf: "Equals on one key each (0 to 9, * or #)",
  enum: "Equals on values the action defines",
  numeric: "Number* operators on the value the action produces",
  custom: "any operator, any operand",
};

function kindOf(p) {
  if (p.kind === "ref") return `reference key (\`${p.ref}:<name>\`)`;
  if (p.kind === "enum") return p.values.map((v) => `\`"${v}"\``).join(", ");
  return KIND[p.kind] ?? p.kind;
}

/**
 * The catalog's next rule, in words. `required` and `mirrors:*` both mean the
 * tooling writes a `next`; Connect refused every such type probed without one,
 * and for the types rule 38 lists as unprobed the refusal is assumed. `none`
 * on a non-terminal type (MessageParticipantIteratively) means it may be left
 * out (conformance/flow-language/actions.md, rule 38).
 */
function nextOf(rule, shapes) {
  if (rule === "required") return "required";
  const error = "mirrors:error:";
  const condition = "mirrors:condition:";
  if (rule.startsWith(error)) {
    const branch = rule.slice(error.length);
    const text = `required; write the \`${branch}\` branch's target, as the console does`;
    // A shape that forbids the mirrored branch (GetParticipantInput with
    // StoreInput "True") has no target to copy.
    const without = (shapes ?? []).filter((s) => s.forbids?.errors?.includes(branch));
    if (without.length === 0) return text;
    const where = without.map((s) => whenOf(s.when)).join(" or ");
    return `${text}; ${where}, which has no \`${branch}\` branch, name the action that should follow`;
  }
  if (rule.startsWith(condition)) {
    return `required; write the \`${rule.slice(condition.length)}\` condition's target, as the console does`;
  }
  return "optional; the console leaves it out";
}

function whenOf(when) {
  return when.equals !== undefined
    ? `with \`${when.key}\` "${when.equals}"`
    : `with \`${when.key}\` not "${when.notEquals}"`;
}

function rows(params, depth = 0) {
  const out = [];
  for (const p of params ?? []) {
    const indent = depth === 0 ? "" : `${"  ".repeat(depth)}.`;
    out.push(
      `| ${indent}\`${p.attr}\` | \`${p.key}\` | ${kindOf(p)} | ${p.required ? "yes" : "no"} |`,
    );
    out.push(...rows(p.fields, depth + 1));
    if (p.of !== undefined && typeof p.of === "object") out.push(...rows(p.of.fields, depth + 1));
  }
  return out;
}

function section(type, a) {
  const t = a.transitions;
  const lines = [`## ${type}`, ""];
  lines.push(`Block \`${a.block}\`. [Action page](${a.doc}).`);
  const where = Array.isArray(a.flowTypes) ? a.flowTypes.join(", ") : "every flow type";
  lines.push("", `- Legal in: ${where}.`);
  if (a.terminal) {
    lines.push("- Terminal: no `next`, no branches.");
  } else {
    lines.push(`- \`next\`: ${nextOf(t.next, a.shapes)}.`);
    const errors = t.errors.map(
      (e) => `\`${e.type}\`${e.required ? " (required)" : ""}${e.when ? `: ${e.when}` : ""}`,
    );
    lines.push(
      `- Error branches: ${errors.length === 0 ? "none; the service refuses any" : errors.join("; ")}.`,
    );
    lines.push(
      `- Conditions: ${CONDITIONS[t.conditions] ?? t.conditions}${t.minConditions ? `; at least ${t.minConditions}` : ""}.`,
    );
  }
  for (const c of a.constraints ?? []) {
    const rule = {
      exactlyOne: "exactly one of",
      atMostOne: "at most one of",
      neverBoth: "never both of",
    }[c.rule];
    lines.push(`- Parameters: ${rule ?? c.rule} ${c.keys.map((k) => `\`${k}\``).join(", ")}.`);
  }
  for (const s of a.shapes ?? []) {
    const when = whenOf(s.when);
    const parts = [];
    if (s.requires?.parameters)
      parts.push(`needs ${s.requires.parameters.map((k) => `\`${k}\``).join(", ")}`);
    if (s.requires?.errors)
      parts.push(`needs branches ${s.requires.errors.map((k) => `\`${k}\``).join(", ")}`);
    if (s.forbids?.parameters)
      parts.push(`must not carry ${s.forbids.parameters.map((k) => `\`${k}\``).join(", ")}`);
    if (s.forbids?.errors)
      parts.push(`must not wire ${s.forbids.errors.map((k) => `\`${k}\``).join(", ")}`);
    if (s.forbids?.conditions) parts.push("takes no conditions");
    lines.push(`- Shape ${when}: ${parts.join("; ")}.`);
  }
  if (a.parameters.length === 0) {
    lines.push("", `No parameters: \`${a.block} {}\`.`);
  } else {
    lines.push("", "| HCL attribute | Flow language key | Value | Required |", "|---|---|---|---|");
    lines.push(...rows(a.parameters));
  }
  return lines.join("\n");
}

/** The reference as Prettier writes it, so `npm run lint` and --check agree. */
export async function render() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
  const modeled = Object.entries(catalog.actions).filter(([, a]) => a.modeled);
  const unmodeled = Object.entries(catalog.actions)
    .filter(([, a]) => !a.modeled)
    .map(([type]) => `\`${type}\``);
  const head = `<!-- Generated by scripts/build-skill-reference.mjs from conformance/flow-language/catalog.json. Do not edit. -->

# Action reference

Every Amazon Connect action type the flow-as-code tooling models, as the
\`flowascode_contact_flow\` resource writes it. An action is

\`\`\`hcl
action {
  id   = "<identifier>"
  next = "<identifier>"   # omitted on terminal actions
  <block> {
    <attribute> = <value>
  }
  condition {             # where the type takes conditions
    operator = "Equals"
    operands = ["True"]
    next     = "<identifier>"
  }
  error {                 # one per branch
    type = "<ErrorType>"
    next = "<identifier>"
  }
}
\`\`\`

Values: a reference key is \`"<type>:<name>"\` (\`"queue:support"\`), bound once
in the resource's \`refs\` map; never an ARN. A "number" is an HCL number even
where Connect's JSON holds a string. An object is written \`attr = { ... }\`
with the nested attributes listed under it; a map is \`attr = { key = "value" }\`.

"Required" error branches are the ones lint reports missing and the service
refuses a flow without; they were checked against the service on 2026-09-29.
Where a branch depends on a parameter, the shape says so.

${modeled.length} modeled types follow. Any other type (${unmodeled.length}: ${unmodeled.join(", ")}) is written as a \`generic\` block:

\`\`\`hcl
generic {
  type       = "<Type>"
  parameters = jsonencode({ ... })
}
\`\`\`
`;
  const text = `${head}\n${modeled.map(([type, a]) => section(type, a)).join("\n\n")}\n`;
  const options = (await prettier.resolveConfig(OUT)) ?? {};
  return prettier.format(text, { ...options, filepath: OUT });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = await render();
  if (process.argv.includes("--check")) {
    let current;
    try {
      current = readFileSync(OUT, "utf8");
    } catch {
      current = undefined; // missing counts as stale
    }
    if (current !== text) {
      console.error(`${OUT} is stale: run node scripts/build-skill-reference.mjs`);
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, text);
    console.log(OUT);
  }
}
