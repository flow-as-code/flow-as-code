#!/usr/bin/env node
/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Command registration only. Every command's behaviour lives in its own module
// so it can be tested without a subprocess; this file wires arguments, options,
// and help text, in the order packages/cli/README.md lists them.

import { PACKAGE_NAMES } from "@flow-as-code/core";
import { Command } from "commander";

import { runCodegen } from "./codegen.js";
import { EXIT_DIFF_ERROR, runDiff } from "./diff.js";
import { runEmit } from "./emit.js";
import { runExport } from "./export.js";
import { runInit } from "./init.js";
import { runLint } from "./lint.js";
import { runRender } from "./render.js";
import { action, usageErrorsExit } from "./run.js";
import { runSimulate } from "./simulate.js";
import { studioCommand, type StudioOptions } from "./studio.js";
import { synthToFiles } from "./synth.js";
import { cliVersion } from "./version.js";

const program = new Command();
program
  .name("flow-cli")
  .description("Typed, IaC-native tooling for Amazon Connect flows")
  // Commander wants the string when the option is registered, so this one call
  // does run while the module loads. That is fine here and nowhere else: this
  // file is the bin, it is not in package.json "exports", and reaching it means
  // the process is already the CLI. The library entries stay import-inert; see
  // ./version.ts.
  .version(cliVersion());

program
  .command("init")
  .description(
    "Scaffold a directory to open: one demo FlowDoc, the .flow.ts paired with it, and " +
      'a package.json declaring "type": "module" when no project above the directory has ' +
      "declared one. Nothing is overwritten; a directory that already holds other files is " +
      "fine. Follow it with `flow-cli studio` on the same directory.",
  )
  .argument("[dir]", "directory to scaffold (default: the working directory)")
  .action(
    action(async (dir: string | undefined) => {
      const { written } = await runInit(dir);
      for (const path of written) console.log(path);
    }),
  );

program
  .command("lint")
  .description(
    `Check every FlowDoc in a directory (or one file) against the ${PACKAGE_NAMES.core} rule set. ` +
      "The whole set is linted in one pass so cross-document rules can follow module " +
      "references. Exits 1 when any finding has error severity; warnings alone exit 0.",
  )
  .argument("<dir-or-file>", "directory of *.flowdoc.json files, or one FlowDoc file")
  .option("--format <format>", "report format: text or json", "text")
  .action(action((target: string, opts: { format?: string }) => runLint(target, opts)));

program
  .command("codegen")
  .description(
    "Generate idiomatic TypeScript builder source from a FlowDoc. Writes " +
      "<doc name>.flow.ts next to the input unless --out says otherwise, and re-reads " +
      "an existing output file first so comments marked @keep survive regeneration.",
  )
  .argument("<file>", "path to a .flowdoc.json file")
  .option("--out <file>", "output file (default: <doc name>.flow.ts beside the input)")
  .action(
    action((file: string, opts: { out?: string }) => {
      console.log(runCodegen(file, opts));
    }),
  );

program
  .command("synth")
  .description(
    "Execute a TypeScript builder file in a sandboxed child process and write one " +
      "<flow.name>.flowdoc.json per exported flow. A flow is any exported Flow instance " +
      "or the result of any exported zero-argument function returning one.",
  )
  .argument("<file>", "path to a .flow.ts builder file")
  .option("--out <dir>", "output directory (default: the source file's directory)")
  .action(
    action(async (file: string, opts: { out?: string }) => {
      // SynthError already carries a terminal-ready message; action() prints it.
      for (const path of await synthToFiles(file, opts.out)) {
        console.log(path);
      }
    }),
  );

program
  .command("render")
  .description(
    "Materialize FlowDocs into deployable Flow language JSON, replacing every " +
      "${cdref:...} token from the resource map. Writes <doc name>.json. A token with " +
      "no entry in the map is fatal, and every missing token is listed at once.",
  )
  .argument("<dir-or-file>", "directory of *.flowdoc.json files, or one FlowDoc file")
  .requiredOption("--resources <map.json>", "JSON object mapping reference tokens to values")
  .option("--out <dir>", "output directory (default: the input directory)")
  .action(
    action((target: string, opts: { resources: string; out?: string }) => {
      for (const path of runRender(target, opts)) console.log(path);
    }),
  );

program
  .command("emit")
  .description(
    "Emit infrastructure as code for a set of FlowDocs. --target tf writes the " +
      `Terraform/OpenTofu files from ${PACKAGE_NAMES.tf}; --target cdk writes a flow-stack.ts ` +
      `scaffold that constructs a ${PACKAGE_NAMES.cdk} FlowSet over the directory.`,
  )
  .argument("<dir-or-file>", "directory of *.flowdoc.json files, or one FlowDoc file")
  .requiredOption("--target <target>", "cdk or tf")
  .option("--address-map <refs.tfmap.json>", "tf only: reference to terraform address expressions")
  .option("--out <dir>", "output directory (default: the input directory)")
  .action(
    action((input: string, opts: { target: string; addressMap?: string; out?: string }) => {
      for (const path of runEmit(input, opts)) console.log(path);
    }),
  );

program
  .command("diff")
  .description(
    "Compare every FlowDoc in a directory against the flow or module of the same name " +
      "in a live Amazon Connect instance. Prints one line per document (unchanged, changed, " +
      "missing-live) and a unified diff of the canonical JSON for each changed one; layout " +
      "and meta are ignored. Exits 0 when nothing differs, 1 when something does, 2 when the " +
      "comparison itself failed.",
  )
  .argument("<dir>", "directory of *.flowdoc.json files")
  .requiredOption("--instance <arn>", "ARN of the Connect instance to compare against")
  // 1 means "differs", so commander's own usage errors take the error code too.
  .exitOverride(usageErrorsExit(EXIT_DIFF_ERROR))
  .action(
    action(async (dir: string, opts: { instance: string }) => {
      await runDiff(dir, opts);
    }),
  );

program
  .command("export")
  .description(
    "Read every flow and module in a live Amazon Connect instance and write " +
      "<name>.flowdoc.json plus <name>.flow.ts for each. References come out as tokens, " +
      "never ARNs. Exits 1 when any flow could not be exported; --on-error collect (the " +
      "default) still writes the rest and reports every failure at once.",
  )
  .requiredOption("--instance <arn>", "ARN of the Connect instance to read")
  .option("--out <dir>", "output directory (default: the working directory)")
  .option("--no-codegen", "write FlowDocs only, no TypeScript")
  .option("--on-error <mode>", "abort on the first failed flow, or collect them all", "collect")
  .action(
    action(async (opts: { instance: string; out?: string; codegen: boolean; onError: string }) => {
      await runExport(opts);
    }),
  );

program
  .command("simulate")
  .description(
    "Run a scenario suite against a live Amazon Connect instance through its TestCase " +
      "operations, within the documented limits (5 concurrent, 100 in flight, 5 minutes " +
      "each), and write a JUnit or JSON report. Exits 0 only when every scenario passed.",
  )
  .argument("<scenarios>", "scenario file, or a directory of scenario.json / *.scenario.json")
  .requiredOption("--instance <arn>", "ARN of the Connect instance to run against")
  .option("--resource-map <map.json>", "JSON object mapping reference tokens to ARNs")
  .option("--format <format>", "report format: junit or json", "junit")
  .option("--out <file>", "report file (default: stdout)")
  .action(
    action(
      async (
        scenarios: string,
        opts: { instance: string; resourceMap?: string; format?: string; out?: string },
      ) => {
        await runSimulate(scenarios, opts);
      },
    ),
  );

program
  .command("studio")
  .description(
    "Serve the local visual editor over a directory. The bridge binds 127.0.0.1 only, " +
      "picks a free port unless --port says otherwise, and keeps every <name>.flowdoc.json " +
      "in sync with its <name>.flow.ts: a canvas save regenerates the builder source, and " +
      "an edit to the source reloads the canvas.",
  )
  .argument("[dir]", "directory to open (default: the working directory)")
  .option("--port <port>", "port to listen on (default: a free port)")
  .action(action((dir: string | undefined, opts: StudioOptions) => studioCommand(dir, opts)));

program.parseAsync(process.argv);
