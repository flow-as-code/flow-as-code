/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The agent skills under plugins/flow-as-code/skills/ and the Claude Code
// plugin that installs them (docs/07-agent-skills.md).
//
// A skill is instructions an agent follows without a reviewer reading them
// first, so what one says has to be true of the tools. Held here:
//
// - the marketplace names the plugin and the plugin directory exists;
// - every SKILL.md uses only the portable Agent Skills frontmatter fields,
//   with a name that matches its directory and a description within limits,
//   so any agent that reads SKILL.md folders loads it;
// - every relative link in a skill resolves;
// - every `flow-cli <command>` a skill names is a command the CLI has;
// - every complete flow a skill shows reads back and lints clean;
// - the action reference is what scripts/build-skill-reference.mjs writes
//   from the catalog, so it cannot drift from what lint enforces;
// - the site publishes each skill file unchanged (when the site is built).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { lint } from "@flow-as-code/core";
import { parse, toFlowDoc } from "@flow-as-code/hcl";
import { describe, expect, it } from "vitest";

import { constraintSentence, render } from "../scripts/build-skill-reference.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLUGIN = join(ROOT, "plugins", "flow-as-code");
const SKILLS = join(PLUGIN, "skills");
const SITE = join(ROOT, "dist-site", "skills");
const read = (path: string): string => readFileSync(path, "utf8");

/** Portable Agent Skills fields: what every SKILL.md reader accepts. */
const PORTABLE = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "allowed-tools",
  "metadata",
]);

const skills = readdirSync(SKILLS)
  .filter((entry) => statSync(join(SKILLS, entry)).isDirectory())
  .sort();

function frontmatter(text: string): { fields: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (match === null) throw new Error("no frontmatter");
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const field = /^([a-z-]+): (.*)$/.exec(line);
    if (field === null) throw new Error(`unreadable frontmatter line: ${line}`);
    fields[field[1]!] = field[2]!;
  }
  return { fields, body: match[2]! };
}

function allFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) allFiles(full, found);
    else found.push(full);
  }
  return found;
}

/** The commands packages/cli/README.md's usage block lists (held to --help). */
function cliCommands(): string[] {
  const readme = read(join(ROOT, "packages", "cli", "README.md"));
  const usage = /^```\n([\s\S]*?)^```$/m.exec(readme)?.[1];
  if (usage === undefined) throw new Error("packages/cli/README.md has no usage block");
  return usage.split("\n").flatMap((line) => /^flow-cli (\S+)/.exec(line)?.[1] ?? []);
}

describe("the Claude Code plugin", () => {
  it("is the one plugin the marketplace lists, from this repository", () => {
    const marketplace = JSON.parse(read(join(ROOT, ".claude-plugin", "marketplace.json")));
    expect(marketplace.name).toBe("flow-as-code");
    expect(marketplace.owner.name).toBe("The flow-as-code Authors");
    expect(marketplace.plugins).toHaveLength(1);
    const [entry] = marketplace.plugins;
    expect(entry.name).toBe("flow-as-code");
    expect(entry.source).toBe("./plugins/flow-as-code");
    const plugin = JSON.parse(read(join(PLUGIN, ".claude-plugin", "plugin.json")));
    expect(plugin.name).toBe(entry.name);
    expect(plugin.license).toBe("Apache-2.0");
    // No version on purpose: an install follows the repository, so a skill
    // fix reaches users when it merges (docs/07-agent-skills.md).
    expect(plugin.version).toBeUndefined();
    expect(entry.version).toBeUndefined();
  });

  it("has the four skills the docs describe", () => {
    expect(skills).toEqual([
      "adopt-connect-flows",
      "author-connect-flows-hcl",
      "flow-cli",
      "promote-connect-flows",
    ]);
    const page = read(join(ROOT, "docs", "07-agent-skills.md"));
    for (const skill of skills) expect(page, skill).toContain(`\`${skill}\``);
  });
});

describe.each(skills)("the %s skill", (skill) => {
  const path = join(SKILLS, skill, "SKILL.md");
  const text = read(path);
  const { fields, body } = frontmatter(text);

  it("uses only portable frontmatter, named after its directory", () => {
    for (const key of Object.keys(fields)) expect(PORTABLE, key).toContain(key);
    expect(fields.name).toBe(skill);
    expect(fields.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(fields.name!.length).toBeLessThanOrEqual(64);
    expect(fields.description!.length).toBeGreaterThan(80);
    expect(fields.description!.length).toBeLessThanOrEqual(1024);
    expect(fields.license).toBe("Apache-2.0");
  });

  it("keeps its body short enough to load whole", () => {
    expect(body.split("\n").length).toBeLessThanOrEqual(500);
  });

  it("links only to files that exist", () => {
    for (const [, target] of body.matchAll(/\]\(([^)#]+)\)/g)) {
      if (/^https?:/.test(target!)) continue;
      expect(existsSync(join(dirname(path), target!)), target).toBe(true);
    }
  });

  it("names only flow-cli commands the CLI has", () => {
    const commands = cliCommands();
    for (const [, command] of body.matchAll(/flow-cli ([a-z][a-z-]*)/g)) {
      expect(commands, `flow-cli ${command!}`).toContain(command);
    }
  });

  it("shows HCL that parses, and flows that lint clean", () => {
    for (const block of [...body.matchAll(/^```hcl\n([\s\S]*?)^```$/gm)].map((m) => m[1]!)) {
      if (block.includes("...") || /<[a-z][a-z -]*>/.test(block)) continue;
      if (/^\s/.test(block)) continue; // a fragment of a resource, not a file
      expect(() => parse(block, "skill.tf"), block.slice(0, 60)).not.toThrow();
      if (/^resource "flowascode_contact_flow(_module)?" /m.test(block)) {
        const { doc } = toFlowDoc(block, { fileName: `${skill}.tf` });
        expect(lint([doc])).toEqual([]);
      }
    }
  });
});

describe("the action reference", () => {
  it("is what the generator writes from the catalog", async () => {
    const path = join(SKILLS, "author-connect-flows-hcl", "references", "actions.md");
    expect(read(path)).toBe(await render());
  });

  // A constraint carries `keys` or, since D01's vocabulary, `groups`
  // (packages/core/src/catalog.ts, CatalogConstraint). No entry carries
  // groups until D03 models GetCustomerProfile, so this holds the rendering
  // ahead of the first one rather than letting it throw on `keys.map`.
  it("renders a constraint in either form", () => {
    expect(constraintSentence({ rule: "exactlyOne", keys: ["ProfileId", "CustomerId"] })).toBe(
      "exactly one of `ProfileId`, `CustomerId`",
    );
    expect(
      constraintSentence({
        rule: "atMostOne",
        groups: [["ProfileRequestData", "ProfileSearchKey"], ["ProfileId"]],
      }),
    ).toBe("at most one of (`ProfileRequestData` and `ProfileSearchKey`), `ProfileId`");
  });
});

describe.runIf(existsSync(SITE))("the published skills", () => {
  it("are the plugin's skill files, unchanged", () => {
    const source = allFiles(SKILLS).map((f) => relative(SKILLS, f));
    const published = allFiles(SITE).map((f) => relative(SITE, f));
    expect(published).toEqual(source);
    for (const file of source) expect(read(join(SITE, file)), file).toBe(read(join(SKILLS, file)));
  });
});
