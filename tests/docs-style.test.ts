/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The documentation style rule from CLAUDE.md, as a test: no em-dashes.
//
// The rule is stated in CLAUDE.md and CONTRIBUTING.md and was enforced by
// reading, which is how U+2014 keeps arriving in otherwise reviewed prose. This
// walks every markdown file the repository ships or reads (root, docs/, tasks/,
// conformance/, packages/*/, .changeset/, .github/) and names each offending
// line. Generated and vendored trees are skipped, as the license-header check
// skips them.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
// `.terraform` joins the list for the same reason `.tofu-cache` is on it: `tofu
// init` unpacks provider distributions there, CHANGELOG.md included, and those
// are vendored third-party bytes this rule has no business editing. It is
// gitignored, and examples/promote-across-environments/README.md walks a reader
// through running `tofu init` inside the repository, so it is not hypothetical.
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".claude",
  ".tofu-cache",
  ".terraform",
]);
const EM_DASH = "\u2014";

function markdownFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) markdownFiles(path, out);
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(path);
  }
  return out;
}

/** `path:line` for every line containing an em-dash. */
function emDashLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, i) =>
      line.includes(EM_DASH) ? [`${relative(ROOT, path)}:${String(i + 1)}`] : [],
    );
}

describe("documentation style", () => {
  const files = markdownFiles(ROOT);
  const scratch: string[] = [];
  afterAll(() => {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  });

  it("finds the markdown it is meant to check", () => {
    // A walker that silently matched nothing would pass forever.
    const names = files.map((f) => relative(ROOT, f));
    expect(names).toContain("README.md");
    expect(names).toContain("CLAUDE.md");
    expect(names.some((n) => n.startsWith("docs/"))).toBe(true);
    expect(names.some((n) => n.startsWith("tasks/"))).toBe(true);
    expect(names.some((n) => n.startsWith("packages/"))).toBe(true);
    expect(names.some((n) => n.startsWith("conformance/"))).toBe(true);
    expect(statSync(files[0] as string).isFile()).toBe(true);
  });

  it("reports the line of an em-dash through the same detector the rule uses", () => {
    // Self-check on emDashLines itself, not on the character constant, so the
    // rule below cannot pass because the detector drops or mislabels matches.
    const dir = mkdtempSync(join(tmpdir(), "flow-docs-style-"));
    scratch.push(dir);
    const planted = join(dir, "planted.md");
    writeFileSync(planted, "clean line\nan \u2014 here\nclean again\n", "utf8");
    expect(emDashLines(planted)).toEqual([`${relative(ROOT, planted)}:2`]);

    const clean = join(dir, "clean.md");
    writeFileSync(clean, "a - b\na -- b\n", "utf8");
    expect(emDashLines(clean)).toEqual([]);
  });

  it("contains no em-dash in any markdown file", () => {
    const offenders = files.flatMap(emDashLines);
    expect(offenders).toEqual([]);
  });
});
