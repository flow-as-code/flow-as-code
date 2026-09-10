/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A08 acceptance. Every assertion here runs the BUILT CLI as a subprocess
// (`node dist/bin.js`), because exit codes and stderr are the contract this
// task promises and neither exists when the command bodies are called in
// process. `npm run build` therefore has to precede `npm test`, which is the
// order CI already uses.
//
// Temp directories live under packages/cli/.vitest (gitignored), the same
// convention synth.test.ts uses: module resolution from a file in there walks
// up into the workspace, so generated source resolves @flow-as-code/* and
// inherits `"type": "module"` exactly as a real ESM project would. `flow-cli
// synth` on generated source and `tsc` on the cdk scaffold both need that.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { canonicalize, type FlowDoc } from "@flow-as-code/core";
import { emitTf } from "@flow-as-code/tf";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * The commands packages/cli/README.md lists: one `flow-cli <name> ...`
 * line per command in the usage block that opens the file. Read from the
 * README rather than copied here, so a command added to one and not the other
 * fails below instead of going unnoticed.
 */
function readmeCommands(): string[] {
  const readme = readFileSync(join(REPO, "packages", "cli", "README.md"), "utf8");
  const usage = /^```\n([\s\S]*?)^```$/m.exec(readme)?.[1];
  if (usage === undefined) throw new Error("README.md has no usage block");
  return usage
    .split("\n")
    .map((line) => /^flow-cli (\S+)/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
}

/** The commands `flow-cli --help` lists, without commander's own `help`. */
function helpCommands(stdout: string): string[] {
  const listing = stdout.split("\nCommands:\n")[1] ?? "";
  return listing
    .split("\n")
    .map((line) => /^ {2}(\S+) /.exec(line)?.[1])
    .filter((name): name is string => name !== undefined && name !== "help");
}

const COMMANDS = readmeCommands();
const CLI = join(REPO, "packages", "cli", "dist", "bin.js");
const DEMO = join(REPO, "conformance", "demo", "appointment-line.flowdoc.json");
const MATERIALIZE = join(REPO, "conformance", "materialize", "demo-with-map");
const EMIT_TF_CASE = join(REPO, "conformance", "emit-tf", "demo-complete-map");

const SCRATCH_BASE = join(REPO, "packages", "cli", ".vitest");
const scratch: string[] = [];

/** A temp directory that resolves the workspace packages, like a real project. */
function workspace(): string {
  mkdirSync(SCRATCH_BASE, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_BASE, "a08-"));
  scratch.push(dir);
  return dir;
}

/** A workspace holding a copy of the demo FlowDoc, and nothing else. */
function demoWorkspace(): { dir: string; doc: string } {
  const dir = workspace();
  const doc = join(dir, "appointment-line.flowdoc.json");
  cpSync(DEMO, doc);
  return { dir, doc };
}

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function cli(...args: string[]): Run {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: REPO });
  if (result.error !== undefined) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

const readDoc = (path: string): FlowDoc => JSON.parse(readFileSync(path, "utf8")) as FlowDoc;

beforeAll(() => {
  if (!existsSync(CLI)) {
    throw new Error(`${CLI} is missing. Run \`npm run build\` before \`npm test\`.`);
  }
});

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe("--help", () => {
  it("lists exactly the commands the README usage block lists", () => {
    const run = cli("--help");
    expect(run.status).toBe(0);
    expect(COMMANDS.length).toBeGreaterThan(0);
    expect([...helpCommands(run.stdout)].sort()).toEqual([...COMMANDS].sort());
  });

  for (const name of COMMANDS) {
    it(`${name} --help exits 0 with a description and its flags`, () => {
      const run = cli(name, "--help");
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("Usage: flow-cli " + name);
      expect(run.stdout).toContain("-h, --help");
    });
  }

  it("documents --format on lint, --resources on render, --target on emit", () => {
    expect(cli("lint", "--help").stdout).toContain("--format");
    expect(cli("render", "--help").stdout).toContain("--resources");
    const emit = cli("emit", "--help").stdout;
    expect(emit).toContain("--target");
    expect(emit).toContain("--address-map");
  });
});

describe("init", () => {
  it("scaffolds a directory the next command can open", () => {
    // The whole point of the command: install, init, studio, with nothing in
    // between. `studio` is a server, so `lint` stands in for "the next command
    // reads what init wrote without complaint".
    const dir = join(workspace(), "flows");

    const run = cli("init", dir);
    expect(run.status).toBe(0);
    const written = run.stdout.trim().split("\n");
    expect(written).toEqual([
      join(dir, "appointment-line.flow.ts"),
      join(dir, "appointment-line.flowdoc.json"),
      // No package.json: the scratch directory sits inside this repository.
    ]);

    const lint = cli("lint", dir);
    expect(lint.status).toBe(0);
    expect(lint.stdout).toContain("No findings.");

    const synth = cli("synth", join(dir, "appointment-line.flow.ts"));
    expect(synth.status).toBe(0);
  });

  it("exits 1 without writing when a file is already there", () => {
    const dir = workspace();
    writeFileSync(join(dir, "appointment-line.flowdoc.json"), "{ mine }\n");

    const run = cli("init", dir);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Refusing to overwrite");
    expect(readFileSync(join(dir, "appointment-line.flowdoc.json"), "utf8")).toBe("{ mine }\n");
    expect(existsSync(join(dir, "appointment-line.flow.ts"))).toBe(false);
  });
});

describe("lint", () => {
  it("exits 0 on the demo document", () => {
    const { dir } = demoWorkspace();
    const run = cli("lint", dir);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("No findings.");
  });

  it("--format json prints the machine-readable report", () => {
    const { dir } = demoWorkspace();
    const run = cli("lint", dir, "--format", "json");
    expect(run.status).toBe(0);
    const report = JSON.parse(run.stdout) as { summary: { errors: number; total: number } };
    expect(report.summary.errors).toBe(0);
  });

  it("lints the whole set in one call so cross-document rules see every doc", () => {
    // module-depth-5 is only computable across a set: a document alone cannot
    // know what the modules it invokes go on to invoke
    // (packages/core/src/lint/rules/module-depth-5.ts). The conformance
    // fixture is one flow plus six modules; splitting it into one file per
    // document and linting the directory has to report the same violation.
    const dir = workspace();
    const fixture = JSON.parse(
      readFileSync(
        join(REPO, "conformance", "lint", "module-depth-5", "fail-depth-six.json"),
        "utf8",
      ),
    ) as { docs: FlowDoc[] };
    for (const doc of fixture.docs) {
      writeFileSync(join(dir, `${doc.name}.flowdoc.json`), JSON.stringify(doc, null, 2) + "\n");
    }

    const whole = cli("lint", dir, "--format", "json");
    const report = JSON.parse(whole.stdout) as { findings: { rule: string; message: string }[] };
    expect(report.findings.map((f) => f.rule)).toContain("module-depth-5");
    expect(report.findings.map((f) => f.message).join("\n")).toContain("reaches depth 6");

    // The same document on its own reports nothing: proof the pass above came
    // from linting the set together rather than from the entry document alone.
    const alone = cli("lint", join(dir, "entry.flowdoc.json"), "--format", "json");
    const solo = JSON.parse(alone.stdout) as { findings: { rule: string }[] };
    expect(solo.findings.map((f) => f.rule)).not.toContain("module-depth-5");
  });

  it("exits 1 when a finding has error severity", () => {
    const dir = workspace();
    const doc = readDoc(DEMO);
    // A transition to an action that does not exist is error severity in
    // reachable-blocks, and Connect rejects such a flow outright.
    doc.content.Actions.push({
      Identifier: "orphan",
      Type: "DisconnectParticipant",
      Parameters: {},
      Transitions: { NextAction: "ghost", Errors: [], Conditions: [] },
    });
    delete doc.layout;
    writeFileSync(join(dir, "appointment-line.flowdoc.json"), JSON.stringify(doc, null, 2) + "\n");

    const run = cli("lint", dir);
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("ghost");
  });

  it("names no-literal-arn once per field instead of repeating the schema pattern", () => {
    // The schema rejects a literal ARN four ways over (token pattern, the `$.`
    // alternative, their oneOf, the enclosing if/then), none of which say
    // "literal ARN", and that rejection happens before lint's rules ever run.
    // One line per offending field, naming the rule, is the report.
    const dir = workspace();
    const doc = readDoc(DEMO);
    const arn = "arn:aws:connect:us-east-1:111122223333:instance/EXAMPLE/queue/EXAMPLE";
    const transfer = doc.content.Actions.find((a) => a.Type === "TransferContactToQueue")!;
    transfer.Parameters.QueueId = arn;
    doc.refs = (doc.refs ?? []).map((ref) => (ref.type === "queue" ? { ...ref, token: arn } : ref));
    writeFileSync(join(dir, "appointment-line.flowdoc.json"), JSON.stringify(doc, null, 2) + "\n");

    const run = cli("lint", dir);
    expect(run.status).toBe(1);
    const lines = run.stderr.split("\n").filter((l) => l.trim().startsWith("- "));
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).toContain("no-literal-arn: ");
    expect(lines.join("\n")).toContain('.Parameters.QueueId" contains a literal ARN');
    expect(lines.join("\n")).toContain('"refs[2].token"');
    // The schema stays the backstop; its restatements of the same mistake go.
    expect(run.stderr).not.toContain("must match pattern");
    expect(run.stderr).not.toContain("must match exactly one schema in oneOf");
  });

  it("exits 0 when the findings are warnings only", () => {
    const dir = workspace();
    const doc = readDoc(DEMO);
    // Unreachable is a warning: the action is kept, never dropped.
    doc.content.Actions.push({
      Identifier: "orphan",
      Type: "DisconnectParticipant",
      Parameters: {},
      Transitions: {},
    });
    delete doc.layout;
    writeFileSync(join(dir, "appointment-line.flowdoc.json"), JSON.stringify(doc, null, 2) + "\n");

    const run = cli("lint", dir);
    expect(run.stdout).toContain("warning");
    expect(run.stdout).toContain("orphan");
    expect(run.status).toBe(0);
  });
});

describe("render", () => {
  it("exits 0 and reproduces the conformance golden", () => {
    const { dir } = demoWorkspace();
    const out = join(dir, "content");
    const run = cli("render", dir, "--resources", join(MATERIALIZE, "map.json"), "--out", out);
    expect(run.status).toBe(0);
    expect(readFileSync(join(out, "appointment-line.json"), "utf8")).toBe(
      readFileSync(join(MATERIALIZE, "expected.content.json"), "utf8"),
    );
  });

  it("defaults --out to the input directory", () => {
    const { dir } = demoWorkspace();
    expect(cli("render", dir, "--resources", join(MATERIALIZE, "map.json")).status).toBe(0);
    expect(existsSync(join(dir, "appointment-line.json"))).toBe(true);
  });

  it("names every missing token, not just the first, and exits 1", () => {
    const { dir } = demoWorkspace();
    const map = join(dir, "partial.json");
    writeFileSync(
      map,
      JSON.stringify({
        "${cdref:hours:main-line}":
          "arn:aws:connect:us-east-1:111122223333:instance/E/operating-hours/E",
      }),
    );

    const run = cli("render", dir, "--resources", map);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("${cdref:lambda:appointment-lookup}");
    expect(run.stderr).toContain("${cdref:queue:appointments}");
    expect(run.stderr).toContain(map);
  });

  it("takes the emit --address-map file, keys and all", () => {
    // The map emit --target tf reads, handed to render unchanged. It is keyed
    // `type:name`, the form the emitter's own TODO comment teaches, and render
    // used to reject it with an error that read like a tool bug. One file, both
    // commands, is the whole point.
    const { dir } = demoWorkspace();
    const shared = join(EMIT_TF_CASE, "address-map.json");
    expect(Object.keys(JSON.parse(readFileSync(shared, "utf8")) as object)).toContain(
      "queue:appointments",
    );

    const run = cli("render", dir, "--resources", shared, "--out", join(dir, "content"));
    expect(run.status).toBe(0);
    expect(readFileSync(join(dir, "content", "appointment-line.json"), "utf8")).not.toContain(
      "${cdref:",
    );

    expect(cli("emit", dir, "--target", "tf", "--address-map", shared).status).toBe(0);
  });

  it("takes a map keyed by the variable the terraform emitter writes", () => {
    const { dir } = demoWorkspace();
    const map = join(dir, "by-variable.json");
    writeFileSync(
      map,
      JSON.stringify({
        hours_main_line_arn: "aws_connect_hours_of_operation.main_line.arn",
        lambda_appointment_lookup_arn: "aws_lambda_function.appointment_lookup.arn",
        queue_appointments_arn: "aws_connect_queue.appointments.arn",
      }),
    );

    expect(cli("render", dir, "--resources", map).status).toBe(0);
  });

  it("says which key forms it wants when one is genuinely missing", () => {
    const { dir } = demoWorkspace();
    const map = join(dir, "one-short.json");
    writeFileSync(
      map,
      JSON.stringify({
        "hours:main-line": "aws_connect_hours_of_operation.main_line.arn",
        "lambda:appointment-lookup": "aws_lambda_function.appointment_lookup.arn",
      }),
    );

    const run = cli("render", dir, "--resources", map);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("${cdref:queue:appointments}");
    expect(run.stderr).toContain("queue:appointments");
    expect(run.stderr).toContain("queue_appointments_arn");
  });
});

describe("simulate --resource-map", () => {
  const SCENARIO = join(REPO, "conformance", "simulate", "appointment-lookup-transfer");
  const INSTANCE =
    "arn:aws:connect:us-east-1:111122223333:instance/11111111-2222-3333-4444-555555555555";

  it("says which key forms it wants before it touches the network", () => {
    // The resolution check runs before any client exists, so this never calls
    // AWS. The message has to name the forms for the same reason render's does:
    // a map keyed `type:name` was silently the wrong shape here too.
    const map = join(workspace(), "empty.json");
    writeFileSync(map, "{}\n");

    const run = cli("simulate", SCENARIO, "--instance", INSTANCE, "--resource-map", map);
    expect(run.status).toBe(1);
    // Every unmapped token, then the three forms worked through the first of
    // them, which is enough to write the rest.
    expect(run.stderr).toContain("${cdref:queue:appointments}");
    expect(run.stderr).toContain('by type and name ("flow:appointment-line")');
    expect(run.stderr).toContain('writes ("flow_appointment_line_arn")');
  });
});

describe("codegen", () => {
  it("exits 0 and writes <doc name>.flow.ts beside the input", () => {
    const { dir, doc } = demoWorkspace();
    const run = cli("codegen", doc);
    expect(run.status).toBe(0);
    const generated = join(dir, "appointment-line.flow.ts");
    expect(run.stdout.trim()).toBe(generated);
    expect(readFileSync(generated, "utf8")).toContain("export function appointmentLine()");
  });

  it("carries @keep comments through a regeneration", () => {
    const { dir, doc } = demoWorkspace();
    const generated = join(dir, "appointment-line.flow.ts");
    cli("codegen", doc);

    const marked = readFileSync(generated, "utf8").replace(
      "export function appointmentLine()",
      "// @keep this note survives\nexport function appointmentLine()",
    );
    writeFileSync(generated, marked);

    expect(cli("codegen", doc).status).toBe(0);
    expect(readFileSync(generated, "utf8")).toContain("// @keep this note survives");
  });

  it("is byte-stable across runs", () => {
    const { doc } = demoWorkspace();
    const out = join(workspace(), "one.ts");
    cli("codegen", doc, "--out", out);
    const first = readFileSync(out, "utf8");
    // The second run reads `first` back as options.previous, which is exactly
    // the case where a non-idempotent keep-comment merge would show up.
    cli("codegen", doc, "--out", out);
    expect(readFileSync(out, "utf8")).toBe(first);
  });

  it("refuses a directory and names it", () => {
    const { dir } = demoWorkspace();
    const run = cli("codegen", dir);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(dir);
  });
});

describe("emit --target tf", () => {
  it("writes exactly what the @flow-as-code/tf emitter returns", () => {
    const { dir } = demoWorkspace();
    const out = join(dir, "infra");
    const addressMapPath = join(EMIT_TF_CASE, "address-map.json");
    const run = cli("emit", dir, "--target", "tf", "--address-map", addressMapPath, "--out", out);
    expect(run.status).toBe(0);

    const addressMap = JSON.parse(readFileSync(addressMapPath, "utf8")) as Record<string, string>;
    const expected = emitTf([readDoc(DEMO)], { addressMap }).files;
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    for (const [relative, content] of Object.entries(expected)) {
      expect(readFileSync(join(out, relative), "utf8")).toBe(content);
    }
    expect(run.stdout.trim().split("\n").sort()).toEqual(
      Object.keys(expected)
        .map((relative) => join(out, relative))
        .sort(),
    );
  });

  it("exits 0 without an address map, leaving loud TODO placeholders", () => {
    const { dir } = demoWorkspace();
    const out = join(dir, "infra");
    expect(cli("emit", dir, "--target", "tf", "--out", out).status).toBe(0);
    expect(readFileSync(join(out, "flow_refs.tf"), "utf8")).toContain("TODO_MISSING_ADDRESS_");
  });

  it("rejects an address map that is not JSON, naming the file", () => {
    const { dir } = demoWorkspace();
    const map = join(dir, "broken.json");
    writeFileSync(map, '{"queue:appointments":');
    const run = cli("emit", dir, "--target", "tf", "--address-map", map);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(map);
  });
});

describe("emit --target cdk", () => {
  it("writes a scaffold that typechecks against the workspace packages", () => {
    const { dir } = demoWorkspace();
    const out = join(dir, "cdk");
    const run = cli("emit", dir, "--target", "cdk", "--out", out);
    expect(run.status).toBe(0);

    const scaffold = readFileSync(join(out, "flow-stack.ts"), "utf8");
    expect(scaffold).toContain('from "@flow-as-code/cdk"');
    expect(scaffold).toContain("new FlowSet(this");
    // One TODO per reference type the demo actually uses, and none for the rest.
    for (const type of ["hours", "lambda", "queue"]) {
      expect(scaffold).toContain(`TODO: bind ${type}`);
    }
    for (const type of ["lex", "prompt"]) {
      expect(scaffold).not.toContain(`TODO: bind ${type}`);
      expect(scaffold).toContain(`${type}: (name) => {`);
    }
    expect(scaffold).not.toContain("arn:aws:");

    writeFileSync(
      join(out, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            skipLibCheck: true,
            noEmit: true,
            types: ["node"],
          },
          include: ["flow-stack.ts"],
        },
        null,
        2,
      ),
    );
    // No module path is configured: the scaffold resolves aws-cdk-lib,
    // constructs, and @flow-as-code/cdk by walking up into the
    // workspace, the way a user's project resolves its own dependencies.
    const tsc = spawnSync(
      process.execPath,
      [
        join(REPO, "node_modules", "typescript", "bin", "tsc"),
        "--noEmit",
        "-p",
        join(out, "tsconfig.json"),
      ],
      { encoding: "utf8" },
    );
    expect(tsc.stdout + tsc.stderr).toBe("");
    expect(tsc.status).toBe(0);
  }, 120_000);
});

describe("broken input", () => {
  it("names a path that does not exist", () => {
    const missing = join(workspace(), "nope");
    const run = cli("lint", missing);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(missing);
  });

  it("names the file holding truncated JSON", () => {
    const dir = workspace();
    const broken = join(dir, "broken.flowdoc.json");
    writeFileSync(broken, readFileSync(DEMO, "utf8").slice(0, 400));
    const run = cli("lint", dir);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(broken);
    expect(run.stderr).toContain("invalid JSON");
  });

  it("names a document that fails the FlowDoc schema", () => {
    const dir = workspace();
    const invalid = join(dir, "invalid.flowdoc.json");
    const doc = readDoc(DEMO) as unknown as Record<string, unknown>;
    doc.name = "Not A Slug";
    writeFileSync(invalid, JSON.stringify(doc, null, 2) + "\n");
    const run = cli("lint", dir);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(invalid);
    expect(run.stderr).toContain("not a valid FlowDoc");
  });

  it("names an unknown --target", () => {
    const { dir } = demoWorkspace();
    const run = cli("emit", dir, "--target", "pulumi");
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("pulumi");
  });

  it("names an unknown --format", () => {
    const { dir } = demoWorkspace();
    const run = cli("lint", dir, "--format", "yaml");
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("yaml");
  });

  it("reports a directory with no FlowDocs", () => {
    const dir = workspace();
    const run = cli("lint", dir);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(dir);
  });
});

describe("round trip", () => {
  it("codegen then synth reproduces the document modulo meta", () => {
    const { dir, doc } = demoWorkspace();
    expect(cli("codegen", doc).status).toBe(0);

    const out = join(dir, "resynth");
    mkdirSync(out, { recursive: true });
    const synth = cli("synth", join(dir, "appointment-line.flow.ts"), "--out", out);
    expect(synth.stderr).toBe("");
    expect(synth.status).toBe(0);

    const round = readDoc(join(out, "appointment-line.flowdoc.json"));
    expect(round.meta?.generator).toContain("cli@");
    delete round.meta;

    const original = readDoc(DEMO);
    delete original.meta;
    expect(canonicalize(round)).toEqual(canonicalize(original));
  }, 120_000);
});
