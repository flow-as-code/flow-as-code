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
import { runConvert } from "./convert.js";
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
    "Scaffold a directory to open: one demo FlowDoc and its companion (the .flow.ts " +
      "builder file, or the .flow.tf resource with --author tf), plus, for a .flow.ts, a " +
      'package.json declaring "type": "module" when no project above the directory has ' +
      "declared one. Nothing is overwritten; a directory that already holds other files is " +
      "fine. Follow it with `flow-cli studio` on the same directory.",
  )
  .argument("[dir]", "directory to scaffold (default: the working directory)")
  .option("--author <kind>", "companion to scaffold: ts (builder TypeScript) or tf (HCL)", "ts")
  .action(
    action(async (dir: string | undefined, opts: { author?: string }) => {
      const { written } = await runInit(dir, opts);
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
    "Generate a FlowDoc's companion source: idiomatic TypeScript builder code " +
      "(<doc name>.flow.ts) or a flowascode Terraform resource (<doc name>.flow.tf). " +
      "Writes beside the input unless --out says otherwise, and re-reads an existing " +
      "output file first so comments marked @keep, and a .flow.tf's refs bindings, " +
      "instance_id, tags and lint settings, survive regeneration.",
  )
  .argument("<file>", "path to a .flowdoc.json file")
  .option("--to <kind>", "ts or tf (default: the document's meta.sourceKind, else ts)")
  .option("--out <file>", "output file (default: <doc name>.flow.<kind> beside the input)")
  .action(
    action((file: string, opts: { out?: string; to?: string }) => {
      console.log(runCodegen(file, opts));
    }),
  );

program
  .command("synth")
  .description(
    "Turn a companion source into FlowDoc JSON. A .flow.ts builder file runs in a " +
      "sandboxed child process and writes one <flow.name>.flowdoc.json per exported flow " +
      "(any exported Flow instance, or the result of any exported zero-argument function " +
      "returning one). A .flow.tf is parsed in process, never executed, and writes the " +
      "one document its resource holds.",
  )
  .argument("<file>", "path to a .flow.ts builder file or a .flow.tf resource")
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
      `Terraform/OpenTofu files from ${PACKAGE_NAMES.tf} for hashicorp/aws; --target ` +
      `flowascode writes flowascode provider resources from ${PACKAGE_NAMES.hcl}; ` +
      "--target cdk writes a flow-stack.ts scaffold that constructs a " +
      `${PACKAGE_NAMES.cdk} FlowSet over the directory.`,
  )
  .argument("<dir-or-file>", "directory of *.flowdoc.json files, or one FlowDoc file")
  .requiredOption("--target <target>", "cdk, flowascode or tf")
  .option(
    "--address-map <refs.tfmap.json>",
    "tf and flowascode: reference to terraform address expressions",
  )
  .option("--out <dir>", "output directory (default: the input directory)")
  .option(
    "--allow-unbound",
    "flowascode: write a reference the address map does not cover as null under a TODO " +
      "comment and exit 0, instead of refusing (tf always writes a placeholder that fails validate)",
  )
  .option(
    "--strict",
    "tf and flowascode: an address map key no reference in the set uses is an error, not a warning",
  )
  .option(
    "--module-alias <module:name@alias>",
    "tf and flowascode: an alias a module in the set publishes though no flow in the set " +
      "invokes it (version and alias resources as for an invoked module); repeatable",
    (value: string, previous: string[]) => [...previous, value],
    [] as string[],
  )
  .action(
    action(
      (
        input: string,
        opts: {
          target: string;
          addressMap?: string;
          out?: string;
          allowUnbound?: boolean;
          strict?: boolean;
          moduleAlias?: string[];
        },
      ) => {
        const { written, warnings } = runEmit(input, opts);
        for (const path of written) console.log(path);
        for (const line of warnings) console.error(line);
      },
    ),
  );

program
  .command("convert")
  .description(
    "Switch a FlowDoc's companion between <name>.flow.ts and <name>.flow.tf. Writes the " +
      "new companion from the document, carrying comments marked @keep, restamps the " +
      "document's meta.sourceKind and meta.sourceHash, deletes the old companion unless " +
      "--keep-old, and prints what the new companion does not carry.",
  )
  .argument("<file>", "path to a .flowdoc.json file")
  .requiredOption("--to <kind>", "ts or tf")
  .option("--address-map <refs.tfmap.json>", "--to tf only: reference to terraform addresses")
  .option("--keep-old", "keep the replaced companion")
  .option("--force", "convert even when the old companion holds edits the document does not")
  .action(
    action(
      (
        file: string,
        opts: { to: string; addressMap?: string; keepOld?: boolean; force?: boolean },
      ) => {
        const { written, removed, dropped } = runConvert(file, opts);
        for (const path of written) console.log(path);
        if (removed !== undefined) console.log(`removed ${removed}`);
        for (const note of dropped) console.error(`note: ${note}`);
      },
    ),
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
      "<name>.flowdoc.json plus its companion (<name>.flow.ts, or <name>.flow.tf with " +
      "--author tf) for each. References come out as tokens, " +
      "never ARNs. Exits 1 when any flow could not be exported; --on-error collect (the " +
      "default) still writes the rest and reports every failure at once.",
  )
  .requiredOption("--instance <arn>", "ARN of the Connect instance to read")
  .option("--out <dir>", "output directory (default: the working directory)")
  .option("--author <kind>", "companion to write: ts or tf", "ts")
  .option("--no-codegen", "write FlowDocs only, no companion")
  .option("--on-error <mode>", "abort on the first failed flow, or collect them all", "collect")
  .action(
    action(
      async (opts: {
        instance: string;
        out?: string;
        author?: string;
        codegen: boolean;
        onError: string;
      }) => {
        await runExport(opts);
      },
    ),
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
      "in sync with its companion, <name>.flow.ts or <name>.flow.tf: a canvas save " +
      "regenerates the companion, and an edit to the companion reloads the canvas.",
  )
  .argument("[dir]", "directory to open (default: the working directory)")
  .option("--port <port>", "port to listen on (default: a free port)")
  .action(action((dir: string | undefined, opts: StudioOptions) => studioCommand(dir, opts)));

program.parseAsync(process.argv);
