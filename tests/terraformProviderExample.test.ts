/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// examples/terraform-provider and the tutorials that walk through it.
//
// Every flow in the example was applied to a live Amazon Connect instance
// (2026-09-29, Terraform 1.8.5, provider v0.1.0). What that run showed and
// no test here can, a deploy, is recorded in the example's README. What can be
// held without an AWS account is held here, on every push:
//
// - every .tf file is already `terraform fmt` output (through @flow-as-code/hcl's
//   formatter, which reproduces hclwrite's);
// - every flow and module resource reads back through the HCL reader and lints
//   with no findings at all, so no recipe teaches a shape Connect refuses;
// - the flows module's companion is what codegen writes for its FlowDoc,
//   byte for byte, and is the promotion example's flow;
// - the environments call the module with the same arguments and differ only
//   in the values, and no file holds an ARN;
// - the cookbook page shows each recipe exactly as its file holds it;
// - the pipeline pins every action to a commit;
// - every complete HCL snippet in the tutorials parses, and every resource in
//   one reads.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { lint, type FlowDoc } from "@flow-as-code/core";
import { format, fromFlowDoc, parse, toFlowDoc } from "@flow-as-code/hcl";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXAMPLE = join(ROOT, "examples", "terraform-provider");
const TUTORIALS = join(ROOT, "docs", "tutorials");

function files(dir: string, suffix: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files(full, suffix, found);
    else if (entry.endsWith(suffix)) found.push(full);
  }
  return found;
}

const read = (path: string): string => readFileSync(path, "utf8");
const name = (path: string): string => relative(ROOT, path);
const FLOW_RESOURCE = /^resource "flowascode_contact_flow(_module)?" /m;

/** The fenced blocks of one language in a markdown file. */
function fenced(markdown: string, language: string): string[] {
  const re = new RegExp("^```" + language + "\\n([\\s\\S]*?)^```$", "gm");
  return [...markdown.matchAll(re)].map((m) => m[1]!);
}

const withoutMeta = (doc: FlowDoc): FlowDoc => {
  const { meta: _meta, ...rest } = doc as FlowDoc & { meta?: unknown };
  return rest as FlowDoc;
};

describe("examples/terraform-provider", () => {
  const tfFiles = files(EXAMPLE, ".tf");

  it("has the files its README maps", () => {
    const names = tfFiles.map(name);
    for (const expected of [
      "examples/terraform-provider/flows/appointment-line.flow.tf",
      "examples/terraform-provider/envs/dev/main.tf",
      "examples/terraform-provider/envs/prod/main.tf",
      "examples/terraform-provider/envs/platform/main.tf",
      "examples/terraform-provider/cookbook/business-hours.tf",
    ]) {
      expect(names).toContain(expected);
    }
    expect(tfFiles.length).toBeGreaterThan(15);
  });

  it.each(tfFiles.map((f) => [name(f), f]))("%s is terraform fmt output", (_n, file) => {
    const text = read(file);
    expect(format(text, file)).toBe(text);
  });

  it("holds no ARN in any file", () => {
    for (const file of [...tfFiles, join(EXAMPLE, "ci", "promote-flows.yml")]) {
      expect(read(file), name(file)).not.toMatch(/arn:aws/i);
    }
  });

  const flowFiles = tfFiles.filter((f) => FLOW_RESOURCE.test(read(f)));

  it("has a flow in every recipe and the flows module", () => {
    expect(flowFiles.map(name)).toEqual(
      expect.arrayContaining([
        "examples/terraform-provider/flows/appointment-line.flow.tf",
        "examples/terraform-provider/cookbook/keypad-menu.tf",
        "examples/terraform-provider/cookbook/greeting-module.tf",
      ]),
    );
    expect(flowFiles).toHaveLength(10);
  });

  it.each(flowFiles.map((f) => [name(f), f]))(
    "%s reads back and lints with no findings",
    (_n, file) => {
      const { doc, warnings } = toFlowDoc(read(file), { fileName: file });
      expect(warnings).toEqual([]);
      expect(lint([doc])).toEqual([]);
    },
  );

  it("keeps the flows module's companion as codegen writes it", () => {
    const tf = read(join(EXAMPLE, "flows", "appointment-line.flow.tf"));
    const json = JSON.parse(
      read(join(EXAMPLE, "flows", "appointment-line.flowdoc.json")),
    ) as FlowDoc;
    // The pair agrees, and regenerating over the file changes nothing: the
    // refs bindings to module variables are carried, which is what lets the
    // directory be a Terraform module and a studio directory at once.
    expect(withoutMeta(toFlowDoc(tf).doc)).toEqual(withoutMeta(json));
    expect(fromFlowDoc(json, { previous: tf })).toBe(tf);
    expect(toFlowDoc(tf).sidecar.refs).toEqual({
      "hours:main-line": "var.main_line_hours_arn",
      "lambda:appointment-lookup": "var.appointment_lookup_arn",
      "queue:appointments": "var.appointments_queue_arn",
    });
  });

  it("is the promotion example's flow", () => {
    const here = JSON.parse(read(join(EXAMPLE, "flows", "appointment-line.flowdoc.json")));
    const there = JSON.parse(
      read(
        join(
          ROOT,
          "examples",
          "promote-across-environments",
          "flows",
          "appointment-line.flowdoc.json",
        ),
      ),
    );
    expect(here).toEqual(there);
  });

  it("calls the flows module with the same arguments in dev and prod", () => {
    const args = (env: string): string[] => {
      const text = read(join(EXAMPLE, "envs", env, "main.tf"));
      const block = /module "flows" \{\n([\s\S]*?)\n\}/.exec(text)?.[1];
      expect(block, env).toBeDefined();
      return block!
        .split("\n")
        .flatMap((line) => /^ {2}([a-z_]+)\s*=/.exec(line)?.[1] ?? [])
        .filter((arg) => arg !== "depends_on")
        .sort();
    };
    expect(args("dev")).toEqual(args("prod"));
    const variables = read(join(EXAMPLE, "flows", "variables.tf"));
    for (const arg of args("dev").filter((a) => a !== "source")) {
      expect(variables, arg).toContain(`variable "${arg}"`);
    }
  });

  it("shows each recipe on the cookbook page exactly as its file holds it", () => {
    const page = read(join(EXAMPLE, "cookbook", "README.md"));
    const shown = [...page.matchAll(/^`([a-z-]+\.tf)`:\n\n```hcl\n([\s\S]*?)^```$/gm)];
    expect(shown.length).toBe(10);
    for (const [, file, body] of shown) {
      expect(body, file).toBe(read(join(EXAMPLE, "cookbook", file!)));
    }
    const recipes = readdirSync(join(EXAMPLE, "cookbook")).filter(
      (f) => f.endsWith(".tf") && !["providers.tf", "supporting.tf"].includes(f),
    );
    expect(shown.map((m) => m[1]).sort()).toEqual(recipes.sort());
  });

  it("pins every action in the pipeline to a commit", () => {
    const text = read(join(EXAMPLE, "ci", "promote-flows.yml"));
    const workflow = parseYaml(text) as { jobs: Record<string, unknown> };
    expect(Object.keys(workflow.jobs)).toEqual(["plan", "dev", "prod"]);
    const uses = [...text.matchAll(/uses: (\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThan(5);
    for (const [, ref, comment] of uses) {
      expect(ref, ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(comment, ref).toMatch(/^ # v\d/);
    }
  });
});

describe("the provider tutorials", () => {
  const pages = files(TUTORIALS, ".md");

  it("are the four the site publishes", () => {
    expect(pages.map(name)).toEqual([
      "docs/tutorials/01-first-flow.md",
      "docs/tutorials/02-promote.md",
      "docs/tutorials/03-adopt.md",
      "docs/tutorials/04-studio.md",
    ]);
  });

  // A snippet with "..." or a <placeholder> is abridged on purpose; the rest
  // is HCL a reader will paste, so it has to parse.
  const snippets = pages.flatMap((page) =>
    fenced(read(page), "hcl")
      .filter((block) => !block.includes("...") && !/<[a-z][a-z -]*>/.test(block))
      .map((block, i) => [`${name(page)} #${String(i + 1)}`, block] as const),
  );

  it("have snippets to check", () => {
    expect(snippets.length).toBeGreaterThan(10);
  });

  it.each(snippets)("%s parses", (_n, block) => {
    expect(() => parse(block, "snippet.tf")).not.toThrow();
  });

  it("quote the pipeline as the example file holds it", () => {
    const pipeline = read(join(EXAMPLE, "ci", "promote-flows.yml")).split("\n");
    const quoted = pages.flatMap((page) => fenced(read(page), "yaml"));
    expect(quoted.length).toBeGreaterThan(0);
    for (const block of quoted) {
      // Prettier dedents a quoted excerpt; the lines must match a run of the
      // file at one constant indentation.
      const lines = block.trimEnd().split("\n");
      const start = pipeline.findIndex((line) => line.trim() === lines[0]!.trim());
      expect(start, lines[0]).toBeGreaterThanOrEqual(0);
      const indent = pipeline[start]!.length - pipeline[start]!.trimStart().length;
      lines.forEach((line, i) => {
        expect(pipeline[start + i], line).toBe(line === "" ? "" : " ".repeat(indent) + line);
      });
    }
  });
});
