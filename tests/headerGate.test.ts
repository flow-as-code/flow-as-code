/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The header gate skips `.vitest/` and must keep skipping only that.
//
// `.vitest/` is gitignored scratch: the live-deploy test writes its synthesized
// template there and an operator drops throwaway helper scripts next to it, so
// scanning it turned `npm run lint` red for files git does not track. The skip
// entry that fixed it was verified once, by hand, in a tree that no longer
// exists. Nothing in the repo held it, so widening SKIP_DIRS (or dropping the
// entry again) was a silent change.
//
// Two halves, because neither is enough alone:
//
// - A sandbox: the real script, copied into a temporary root of its own, run
//   against a two-file tree. It asserts both directions by exit code and by the
//   file count the script prints, and it is deterministic because nothing else
//   writes into that root.
// - The real repo root: a headerless probe under the actual `.vitest/`, with
//   the actual `scripts/license-headers.mjs`, asserting the gate never names it.
//   That half does not assert the exit code, because the core roundtrip
//   suite writes headerless generated modules under
//   packages/core/src/__generated__/ for the length of its run and Vitest
//   runs the projects in parallel, so a green exit here is not this test's to
//   claim. What it can claim is that our probe is not in the report.
//
// Mutation-verified in both directions. Removing `".vitest"` from SKIP_DIRS
// turns the sandbox green case and the real-root case red (the probe is
// reported missing a header); making SKIP_DIRS skip every directory name turns
// the sandbox red case red (the headerless file under `src/` is never walked,
// so the gate exits 0).
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const GATE = resolve("scripts/license-headers.mjs");
/** No SPDX tag, so the gate reports it wherever it is willing to look. */
const HEADERLESS = "export const probe = 1;\n";
const WITH_HEADER = `/*\n * Copyright 2026 The flow-as-code Authors\n * SPDX-License-Identifier: Apache-2.0\n */\nexport const clean = 1;\n`;

interface Run {
  status: number;
  output: string;
}

/** Runs the gate at `cwd`'s script copy and captures its exit code and report. */
function runGate(script: string): Run {
  try {
    const stdout = execFileSync(process.execPath, [script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output: stdout };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

describe("the header gate skips .vitest and nothing more", () => {
  // One sandbox root, laid out like the repo the gate expects: the script sits
  // in scripts/ and resolves its root as the parent of that directory. It is
  // built in beforeAll rather than in the describe body so that a run which
  // only collects this file (`vitest list`, or a filter that matches no test
  // here) never creates a directory afterAll will not be there to remove.
  let sandbox = "";
  let sandboxGate = "";
  let scanned = "";

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), "flow-header-gate-"));
    sandboxGate = join(sandbox, "scripts", "license-headers.mjs");
    scanned = join(sandbox, "src", "probe.ts");

    mkdirSync(join(sandbox, "scripts"), { recursive: true });
    mkdirSync(join(sandbox, "src"), { recursive: true });
    mkdirSync(join(sandbox, ".vitest"), { recursive: true });
    copyFileSync(GATE, sandboxGate);
    writeFileSync(join(sandbox, "src", "clean.ts"), WITH_HEADER);
    writeFileSync(join(sandbox, ".vitest", "probe.ts"), HEADERLESS);
  });

  afterAll(() => {
    if (sandbox !== "") rmSync(sandbox, { recursive: true, force: true });
  });

  it("stays green with a headerless file under .vitest", () => {
    const run = runGate(sandboxGate);
    expect(run.output).not.toContain("probe.ts");
    expect(run.status).toBe(0);
    // Exactly the two files outside `.vitest`: the script copy and src/clean.ts.
    // A count of three would mean `.vitest/probe.ts` was walked and merely
    // happened to satisfy hasHeader, which it does not.
    expect(run.output).toContain("All 2 file(s) carry a header.");
  });

  it("goes red for a headerless file in a directory it must scan", () => {
    writeFileSync(scanned, HEADERLESS);
    try {
      const run = runGate(sandboxGate);
      expect(run.status).toBe(1);
      expect(run.output).toContain("Missing Apache-2.0 header in 1 file(s):");
      expect(run.output).toContain(join("src", "probe.ts"));
      // The same run, with the same walk: the `.vitest` copy is still invisible.
      expect(run.output).not.toContain(join(".vitest", "probe.ts"));
    } finally {
      rmSync(scanned, { force: true });
    }
  });
});

describe("the real gate skips the real .vitest", () => {
  // The sandbox above proves the behaviour of the script; this proves it for
  // the path the skip exists for, through `node scripts/license-headers.mjs`
  // at this repo's root.
  const dotVitest = resolve(".vitest");
  const preexisting = existsSync(dotVitest);
  const probeDir = join(dotVitest, `header-gate-probe-${process.pid}`);
  const probe = join(probeDir, "probe.ts");

  afterAll(() => {
    rmSync(probeDir, { recursive: true, force: true });
    // Leave the operator's scratch directory exactly as it was found: remove it
    // only when this test is what created it, and only while it is empty, so a
    // concurrent writer's template is never swept up with the probe.
    if (!preexisting) {
      try {
        rmdirSync(dotVitest);
      } catch {
        // Something else put a file there. Leaving it is the safe outcome.
      }
    }
  });

  it("never reports a file under .vitest/", () => {
    mkdirSync(probeDir, { recursive: true });
    writeFileSync(probe, HEADERLESS);
    const run = runGate(GATE);
    // Deliberately not an assertion on the exit code: a parallel project writes
    // headerless generated modules under packages/core/src/__generated__/
    // while this runs. Whatever the gate reports, our probe is not in it.
    expect(run.output).not.toContain("header-gate-probe");
  });
});
