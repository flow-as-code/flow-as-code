/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Module-resolution hook for the `flow-cli synth` child process. Three jobs,
// all aimed at the same thing: a `<name>.flow.ts` must synth wherever it sits,
// because that is where `flow-cli codegen` writes it and what `flow-cli studio`
// re-synths on every save.
//
// 1. The builder file the sandbox was asked to evaluate is ES module source,
//    whatever the enclosing package.json says. `flow-cli codegen` writes
//    `import { Flow } from "@flow-as-code/core"` and core is ESM-only, so a
//    builder file compiled as CommonJS turns that import into a `require` of a
//    package with no `require` condition and dies with
//    `No "exports" main defined in .../@flow-as-code/core/package.json`, naming
//    a package.json inside node_modules the user never wrote. `npm init -y`
//    writes `"type": "commonjs"` explicitly, so this was every fresh npm
//    project, not an edge case.
//
//    The override is scoped to the ENTRY file, the one path synth.ts handed the
//    runner. A genuinely CommonJS project keeps CommonJS for its own modules,
//    including any the builder imports: the claim being made here is only that
//    the file flow-cli generated and was asked to evaluate is the module system
//    flow-cli generates. `.flow.ts` has no meaning to the enclosing project's
//    build, so nothing else can be reading it as CommonJS on purpose.
//
// 2. TypeScript elsewhere in the builder graph is ESM when nothing says
//    otherwise. Without a package.json above it, the TypeScript loader compiles
//    the file to CommonJS, and a helper module beside a builder file in a plain
//    folder of FlowDocs is in the same position the builder file is.
//    A directory that does declare a type keeps it: this only fills in a
//    decision nobody made.
//
//    "Nobody made a decision" is read off the filesystem rather than off the
//    resolver's answer, because runtimes have answered differently for the same
//    plain folder: Node 22 and later return a null `format` for the builder
//    file, while Node 20 returned "commonjs". Trusting a nullish `format` alone
//    therefore fixed the plain-folder case on 22 and left it broken on 20.
//    Node 20 is no longer supported, but the answer is not a contract, so the
//    walk stays: a TypeScript file with no package.json anywhere above it is
//    ESM whatever the resolver said, and one with a package.json above it is
//    left exactly as resolved.
//
// 3. @flow-as-code/core resolves from @flow-as-code/cli when it resolves from
//    nowhere else. A folder of FlowDocs has no node_modules, and requiring the
//    user to install @flow-as-code/core beside every such folder to edit a file
//    the CLI generated is not a reasonable price. It is a hard dependency of
//    @flow-as-code/cli, so resolving from the CLI's own module always finds the
//    copy the CLI is running against.
//
// The fallback runs after the default resolver, never before it, so a copy
// installed next to the builder file still wins and version skew stays the
// user's choice. It is scoped to @flow-as-code/core alone: a builder file
// cannot use it to reach the rest of the CLI's dependency tree.
//
// Nothing about the sandbox changes. The child keeps its stripped environment,
// its pinned working directory, and the permission flags synth.ts passes; the
// fallback only reads a file the child could already read under
// `--allow-fs-read=*`. See SECURITY.md.
//
// Loaded on the module-customization hooks thread by `module.register`
// (https://nodejs.org/api/module.html#customization-hooks), which is why the
// fallback target arrives through `initialize` rather than a module-level
// import.

import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Module URL whose resolution scope holds the CLI's own @flow-as-code/core. */
let fallbackParentURL: string | undefined;

/**
 * `file:` URL of the builder file the sandbox was asked to evaluate, in the
 * form the default resolver reports it, or undefined when the parent did not
 * name one. See job 1 in the header comment.
 */
let builderURL: string | undefined;

/**
 * @flow-as-code/core's package name, from PACKAGE_NAMES rather than a literal: the npm
 * scope is written down in exactly one module (packages/core/src/package-names.ts)
 * and this file runs on a thread that should not import it to find out.
 */
let flowCorePackage: string | undefined;

export interface HookData {
  fallbackParentURL?: string;
  flowCorePackage?: string;
  /** `file:` URL of the builder file this synth was asked to evaluate. */
  builderURL?: string;
}

export function initialize(data: HookData | undefined): void {
  fallbackParentURL = data?.fallbackParentURL;
  flowCorePackage = data?.flowCorePackage;
  builderURL = data?.builderURL === undefined ? undefined : canonicalFileURL(data.builderURL);
}

interface ResolveContext {
  parentURL?: string;
  conditions?: readonly string[];
  importAttributes?: Record<string, string>;
}

interface Resolution {
  url: string;
  format?: string | null;
  shortCircuit?: boolean;
}

type NextResolve = (specifier: string, context: ResolveContext) => Promise<Resolution>;

function isFlowCore(specifier: string): boolean {
  if (flowCorePackage === undefined) return false;
  return specifier === flowCorePackage || specifier.startsWith(`${flowCorePackage}/`);
}

function isTypeScript(url: string): boolean {
  return url.startsWith("file:") && (url.endsWith(".ts") || url.endsWith(".tsx"));
}

/**
 * A `file:` URL reduced to one comparable spelling, so "is this the builder
 * file?" survives the ways the same path can be written.
 *
 * The parent passes the path the user typed, made absolute; the resolver
 * reports the path it resolved, and Node resolves symlinks on the way (on
 * macOS `/tmp/x` is really `/private/tmp/x`, which is exactly the shape of a
 * scratch directory). Both sides therefore go through realpath, and a path
 * that does not resolve falls back to itself rather than throwing: an
 * unresolvable path is not the builder file, and comparing the literal text
 * says so without a special case.
 */
function canonicalFileURL(url: string): string {
  let path: string;
  try {
    path = fileURLToPath(url);
  } catch {
    return url;
  }
  try {
    return pathToFileURL(realpathSync(path)).href;
  } catch {
    return pathToFileURL(path).href;
  }
}

/** True when `url` names the builder file the sandbox was asked to evaluate. */
function isBuilderEntry(url: string): boolean {
  if (builderURL === undefined) return false;
  if (url === builderURL) return true;
  return url.startsWith("file:") && canonicalFileURL(url) === builderURL;
}

/**
 * True when no package.json exists in the file's directory or any directory
 * above it, so nothing has declared a module type for it. This is the same walk
 * node itself does to answer that question
 * (https://nodejs.org/api/packages.html#determining-module-system); doing it
 * here is what makes the answer the same whatever the resolver reports.
 */
function nothingDeclaredATypeFor(url: string): boolean {
  let dir: string;
  try {
    dir = dirname(fileURLToPath(url));
  } catch {
    return false;
  }
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return false;
    const parent = dirname(dir);
    if (parent === dir) return true;
    dir = parent;
  }
}

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
): Promise<Resolution> {
  let resolution: Resolution;
  try {
    resolution = await nextResolve(specifier, context);
  } catch (error) {
    // Only a specifier that could not be found at all, and only
    // @flow-as-code/core: an export map violation or a syntax error in the
    // installed copy is the user's problem to see, not something to paper
    // over with a second copy.
    if (fallbackParentURL === undefined) throw error;
    if (!isFlowCore(specifier)) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ERR_MODULE_NOT_FOUND") throw error;
    resolution = await nextResolve(specifier, { ...context, parentURL: fallbackParentURL });
  }

  if (!isTypeScript(resolution.url)) return resolution;

  // Job 1. The entry file is ESM unconditionally, including under an explicit
  // `"type": "commonjs"`, because that declaration is about the project's own
  // modules and a `.flow.ts` is not one of them: flow-cli generated it, flow-cli
  // is the only thing that evaluates it, and flow-cli generates ESM.
  if (isBuilderEntry(resolution.url)) {
    return { ...resolution, format: "module" };
  }

  // Job 2. A nullish `format` (Node 22 and later) or a defaulted "commonjs"
  // (the answer Node 20 gave) on a TypeScript file with no package.json above
  // it is the plain-folder case described above, and nothing else. Any other
  // format is a decision somebody made about their own file and is left alone.
  if (
    (resolution.format === null ||
      resolution.format === undefined ||
      resolution.format === "commonjs") &&
    nothingDeclaredATypeFor(resolution.url)
  ) {
    return { ...resolution, format: "module" };
  }
  return resolution;
}
