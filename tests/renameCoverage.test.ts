/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The npm scope and the schema `$id` host were placeholders until 2026-09-03,
// when they became `@flow-as-code` and `flow-as-code.dev` (tasks/A13-release.md
// records the rename and both retired spellings).
//
// This file used to be the inventory that held that rename to a recipe. It is
// now the guard on what the rename established: no tracked file carries either
// retired spelling. The one exception is tasks/, the record of work done while
// the placeholder was in force, which is not shipped and would be falsified by
// rewriting it.
//
// A repository-wide scan rather than a list of sites, because the failure this
// prevents is the old name arriving somewhere nobody thought to list: a new
// changeset copied from an old one, a README paragraph pasted from elsewhere,
// a schema `$id` typed from memory.
//
// Nothing below writes either spelling as one token, so this file does not
// carry what it bans and is scanned on the same terms as every other file.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/** Both retired spellings, in any casing: the npm scope and the domain. */
const PLACEHOLDER = /critical-?dynamics/i;

/** The retired npm scope: the word `critical` run straight into `dynamics`. */
const RETIRED_SCOPE = `@${"critical"}${"dynamics"}`;

/** The retired schema host: the same two words hyphenated, under `.dev`. */
const RETIRED_HOST = `${"critical"}-${"dynamics"}.dev`;

/** The record of work done under the placeholder, kept verbatim. */
const EXEMPT_PREFIX = "tasks/";

/** Tracked files, so node_modules and build output are out of scope by construction. */
function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
}

function carriesPlaceholder(path: string): boolean {
  // `git ls-files` reads the index, so a file deleted on disk but not yet
  // staged is still listed. `changeset version` consuming .changeset/*.md
  // produces exactly that state, and a missing file carries no placeholder.
  if (!existsSync(path)) return false;
  return PLACEHOLDER.test(readFileSync(path, "utf8"));
}

describe("the retired placeholder name", () => {
  const files = trackedFiles();
  const scratch: string[] = [];
  afterAll(() => {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  });

  it("scans a meaningful set of tracked files", () => {
    // A scan that silently matched nothing would pass forever.
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("package.json");
    expect(files).toContain("README.md");
  });

  it("reads the file through the same detector the rule uses", () => {
    // Self-check on carriesPlaceholder itself, not on the constant, so the
    // rule below cannot pass because the detector never opens anything.
    const dir = mkdtempSync(join(tmpdir(), "flow-rename-"));
    scratch.push(dir);
    const planted = join(dir, "planted.txt");
    const spellings = [
      `${RETIRED_SCOPE}/core`,
      `https://${RETIRED_HOST}/schema/flowdoc-0.1.schema.json`,
      RETIRED_SCOPE.toUpperCase(),
    ];
    for (const spelling of spellings) {
      writeFileSync(planted, `nothing\n${spelling}\nnothing\n`, "utf8");
      expect(carriesPlaceholder(planted), spelling).toBe(true);
    }
    const clean = join(dir, "clean.txt");
    writeFileSync(clean, "@flow-as-code/core\nhttps://flow-as-code.dev/x\n", "utf8");
    expect(carriesPlaceholder(clean)).toBe(false);
  });

  it("appears in no tracked file outside tasks/", () => {
    const offenders = files
      .filter((path) => !path.startsWith(EXEMPT_PREFIX))
      .filter(carriesPlaceholder);
    expect(offenders).toEqual([]);
  });

  it("is still in tasks/, which is why that prefix is exempt", () => {
    // Not decoration: it proves the scan reads content rather than passing on
    // an empty read, and it names the one place the old name is expected.
    const kept = files.filter((path) => path.startsWith(EXEMPT_PREFIX)).filter(carriesPlaceholder);
    expect(kept).toContain("tasks/A13-release.md");
  });
});
