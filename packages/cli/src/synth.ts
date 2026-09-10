/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// `flow-cli synth`: execute a TypeScript builder file in a sandboxed child
// process and turn its exported flows into FlowDoc JSON.
//
// The builder file NEVER runs in the CLI process. It runs in a spawned node
// with tsx registered via --import, a stripped environment, cwd set to the
// source file's directory, and (where the runtime supports it) Node's
// permission model enabled.
//
// What the sandbox does and does not enforce, verified on node 25.9.0
// (https://nodejs.org/api/permissions.html):
//
// - File WRITES are denied everywhere except a private temp directory the
//   parent creates for tsx's own cache/pipe files (tsx honors TMPDIR). The
//   child never writes FlowDocs; it prints them on stdout and the parent
//   writes the files.
// - child_process and cluster are denied (--allow-child-process not passed).
// - Worker threads ARE allowed (--allow-worker): tsx registers its module
//   hooks on a loader thread, which the permission model counts as a worker.
//   Node warns that this weakens the model; the workers a builder file could
//   start still inherit the same fs restrictions.
// - File READS are NOT jailed. Scoped --allow-fs-read breaks tsx: its
//   tsconfig discovery walks every ancestor directory and probes
//   case-variant paths on macOS, each of which the permission model treats
//   as a distinct denied resource. We therefore pass --allow-fs-read=* and
//   a builder file can read anything the invoking user can.
// - NETWORK: the permission model on Node 22/24 does not cover network
//   access at all (https://nodejs.org/api/permissions.html), so no network
//   jail exists there. Newer runtimes (observed on node 25.9.0) deny network
//   by default under --permission because a net permission exists and we do
//   not grant it. Do not rely on the sandbox to block exfiltration on the
//   CI-supported Node 22/24.
// - On runtimes without the stable --permission flag (Node < 22.13, which
//   includes 22.12, the engines.node floor), the permission model is not
//   applied at all; the sandbox is then only the stripped environment, the
//   pinned cwd, and process isolation. If a spawn still fails with "bad
//   option" we retry once without the permission flags and remember that for
//   the process lifetime.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { FlowDoc } from "@flow-as-code/core";
import { PACKAGE_NAMES, SLUG_PATTERN, serialize } from "@flow-as-code/core";

import { cliVersion } from "./version.js";

/**
 * Recorded in meta.generator of every FlowDoc this CLI writes.
 *
 * The version is this package's release, not the FlowDoc format version, so
 * the stamp answers "which build wrote this document". `@flow-as-code/core`
 * deliberately stamps `core@<format version>` instead; docs/01-flowdoc-spec.md
 * records why the two differ. Derived, never written by hand: it shipped as a
 * hardcoded `cli@0.0.1` from the 0.1.0 tarball. See ./version.ts.
 *
 * A function, and not the `GENERATOR` const it replaced in 0.1.1, because this
 * module is the public `@flow-as-code/cli/synth` entry: a const would have to
 * be computed while the module loads, and ./version.ts explains why nothing
 * here may read the filesystem at that point. Throws if the manifest is
 * missing, which for a real install it is not.
 */
export function generator(): string {
  return `cli@${cliVersion()}`;
}

const SENTINEL = "__FLOW_CLI_SYNTH_ENVELOPE_V1__";

/** A synth failure with a message meant for the terminal. */
export class SynthError extends Error {}

/**
 * Where a stack frame points, with the `:line:column` suffix taken off.
 *
 * V8 writes a frame as `at <name> (<location>)` when it has a function name to
 * report and as `at <location>` when it does not, so the location is the last
 * parenthesised run of the line or, failing that, everything after `at `. The
 * result is a path, a `file:` URL, a `node:` specifier, or (for the nameless
 * `at Object.<anonymous>` form) something that is none of those.
 */
function frameLocation(line: string): string {
  const parenthesised = /\(([^()]*)\)\s*$/.exec(line)?.[1];
  const location = parenthesised ?? line.replace(/^\s*at\s+/, "");
  return location.replace(/:\d+:\d+$/, "");
}

/** Whether a location has `node_modules` as a whole path segment. */
function underNodeModules(location: string): boolean {
  // Both separators: a Windows stack reads `at fn (C:\w\node_modules\x\y.js:1:1)`.
  return location.split(/[/\\]/).includes("node_modules");
}

/**
 * A frame location as one comparable path, or undefined when it names no file.
 *
 * A stack spells the same file three ways: the plain path a compiled frame
 * carries, the `file:` URL the ESM loader produces, and either separator
 * depending on the platform. Symlinks are the fourth: the loader reports the
 * real path, while a caller holding the path the user typed may still be
 * looking at the link (on macOS `/tmp/x` is really `/private/tmp/x`). So both
 * sides go through realpath, and a path that does not resolve (a stack from
 * another machine, a fixture) falls back to itself rather than throwing.
 */
function comparablePath(location: string): string | undefined {
  let asPath = location;
  if (/^file:/i.test(asPath)) {
    try {
      asPath = fileURLToPath(asPath);
    } catch {
      return undefined;
    }
  }
  let real = asPath;
  try {
    real = realpathSync(asPath);
  } catch {
    // Not a path on this machine; compare the literal text instead.
  }
  return real.replace(/\\/g, "/");
}

/**
 * The frames of a thrown value's stack that point at the user's own code.
 *
 * A syntax error in a builder file used to print the actionable line and then
 * ten frames of esbuild and node stream internals under it
 * (`at failureErrorWithLog (.../node_modules/esbuild/lib/main.js:1752:15)`,
 * `at Pipe.onStreamRead (node:internal/stream_base_commons:191:23)`), which buries
 * the file, line and column that the message above already names. The studio's
 * badge shows only the first line for the same reason; the terminal now matches
 * that intent.
 *
 * Frames inside node_modules and node's own internals are dropped, and so are
 * the header lines the stack repeats from the message that is printed above it.
 * A frame in the builder file or anywhere else the user wrote survives, because
 * that is the one a runtime error in a flow needs. There is no verbose flag or
 * env var in this CLI to hide the full stack behind, so what is dropped here is
 * dropped: the retained frames plus the message carry the location.
 *
 * `builderPath` is the file being synthesized. Its own frames are kept even
 * when it sits under a directory named node_modules, which a vendored or
 * linked builder file legitimately does: the node_modules rule is about
 * dependency code, and the file the user asked to run is never that. Without
 * the exemption such a file reports a throw with no line or column at all.
 */
export function actionableFrames(stack: string | undefined, builderPath?: string): string[] {
  if (stack === undefined) return [];
  const builder = builderPath === undefined ? undefined : comparablePath(resolve(builderPath));
  return (
    stack
      .split("\n")
      .filter((line) => /^\s*at /.test(line))
      // Vendor frames go by where the frame points, not by the text of the
      // whole line. A substring test over the line drops a frame whose
      // function name happens to read `loadNodeModules` or whose builder file
      // sits in a directory called `node_modules-sandbox`, and those are the
      // frames this function exists to keep. The segment test is what makes
      // `node_modules` mean the dependency tree rather than eleven characters.
      // The builder file itself is exempt: it is the user's own code wherever
      // it lives.
      .filter((line) => {
        const location = frameLocation(line);
        if (!underNodeModules(location)) return true;
        return builder !== undefined && comparablePath(location) === builder;
      })
      // What is left must name a file on disk. That drops node's own frames,
      // whose location is a `node:internal/...` specifier rather than a path
      // (`at addChunk (node:internal/streams/readable:559:12)`), and the bare
      // `at Object.<anonymous>` form that carries no location at all. Neither
      // says anything about the user's flow.
      .filter((line) => /[(\s](\/|[A-Za-z]:\\|file:)/.test(line))
  );
}

export interface SynthesizedFlow {
  name: string;
  doc: FlowDoc;
}

export interface SynthFileResult {
  flows: SynthesizedFlow[];
  /** `sha256:<hex>` of the builder file bytes, ready for meta.sourceHash. */
  sourceHash: string;
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveSibling(base: string): string {
  // Compiled layout: dist/<base>.js next to dist/synth.js. Under vitest this
  // module runs from src/, where only the .ts exists; the child runs under
  // tsx either way, so both are executable.
  const here = dirname(fileURLToPath(import.meta.url));
  const js = join(here, `${base}.js`);
  if (existsSync(js)) return js;
  const ts = join(here, `${base}.ts`);
  if (existsSync(ts)) return ts;
  throw new SynthError(`flow-cli is broken: ${base} not found next to ${here}`);
}

function resolveTsxLoader(): string {
  // tsx's package export "." is dist/loader.mjs, the --import registration.
  return createRequire(import.meta.url).resolve("tsx");
}

function supportsStablePermissionFlag(): boolean {
  // --permission is stable from Node 23.5 and was backported to 22.13.
  // https://nodejs.org/api/permissions.html
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  return major >= 23 || (major === 22 && minor >= 13);
}

/** Set after a sandbox retry so we do not pay the failed spawn twice. */
let permissionFlagsUnsupported = false;

/**
 * True when the sandbox stopped the child before our runner produced anything.
 *
 * A denial raised by the USER's flow code must not trigger the retry: that
 * would silently drop the sandbox for exactly the input it is protecting
 * against. So this only matches a failure with no envelope on stdout, meaning
 * the runner never got far enough to report.
 */
function sandboxRefusedToStart(result: ChildResult): boolean {
  if (parseEnvelope(result.stdout) !== undefined) return false;
  if (result.code === 9 && result.stderr.includes("bad option")) return true;
  return (
    result.stderr.includes("ERR_ACCESS_DENIED") || result.stderr.includes("ERR_DLOPEN_DISABLED")
  );
}

interface ChildResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runChild(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<ChildResult> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", rejectP);
    child.on("close", (code) => resolveP({ code, stdout, stderr }));
  });
}

interface Envelope {
  flows?: { name: string; doc: FlowDoc }[];
  error?: { message: string; stack?: string; code?: string };
}

/**
 * The node error codes that mean "something in the builder graph was loaded as
 * CommonJS and reached an ES module".
 *
 * ERR_PACKAGE_PATH_NOT_EXPORTED is the one a user actually meets: `require` of
 * @flow-as-code/core misses its `import`-only export condition and node reports
 * a missing `exports` main, naming a package.json inside node_modules.
 * ERR_REQUIRE_ESM and ERR_REQUIRE_ASYNC_MODULE are the same mistake reported by
 * runtimes that got further before failing.
 * https://nodejs.org/api/errors.html#nodejs-error-codes
 */
const MODULE_SYSTEM_ERROR_CODES = new Set([
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_REQUIRE_ESM",
  "ERR_REQUIRE_ASYNC_MODULE",
]);

/**
 * A module-system failure rewritten to name the builder file and the remedy, or
 * undefined when the failure was something else.
 *
 * The builder file itself is forced to ES module source by the resolution hook
 * (synth-resolve-hook.ts), so reaching here means a DIFFERENT file in the graph
 * was compiled as CommonJS: a helper module the builder imports, sitting under a
 * package.json that says `"type": "commonjs"`. Node's own message for that names
 * `.../node_modules/@flow-as-code/core/package.json`, a file the user did not
 * write and cannot usefully change, and offers no next step. This says which
 * file was being synthesized, what the module system mismatch is, and the two
 * ways out, then quotes node underneath so nothing is hidden.
 */
export function explainModuleSystemFailure(
  error: { message: string; code?: string },
  builderPath: string,
): string | undefined {
  if (error.code === undefined || !MODULE_SYSTEM_ERROR_CODES.has(error.code)) return undefined;
  return (
    `Evaluating ${builderPath} failed: something in its import graph was loaded as ` +
    `CommonJS, so an \`import\` of ${PACKAGE_NAMES.core} became a \`require\` of a ` +
    `package that only ships ES modules.\n` +
    `flow-cli evaluates the builder file itself as an ES module whatever the enclosing ` +
    `package.json says; the modules it imports keep their project's module system. ` +
    `Set "type": "module" in the nearest package.json (\`flow-cli init\` writes one ` +
    `for a directory that has no project above it), or move what those helper modules ` +
    `provide into the .flow.ts file.\n` +
    `Node reported: ${error.message}`
  );
}

function parseEnvelope(stdout: string): Envelope | undefined {
  // The envelope is the last sentinel-prefixed line; user code writing to
  // stdout during module evaluation cannot fake or corrupt it earlier.
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line !== undefined && line.startsWith(SENTINEL)) {
      return JSON.parse(line.slice(SENTINEL.length)) as Envelope;
    }
  }
  return undefined;
}

/**
 * Evaluates the builder file in the sandboxed child and returns its flows.
 * Throws SynthError with an actionable message on any failure.
 */
export async function synthFile(sourcePath: string): Promise<SynthFileResult> {
  const absPath = resolve(sourcePath);
  let sourceBytes: Buffer;
  try {
    sourceBytes = await readFile(absPath);
  } catch {
    throw new SynthError(
      `Cannot read ${absPath}: no such file. Pass the path of a .flow.ts builder file.`,
    );
  }
  const sourceHash = `sha256:${sha256Hex(sourceBytes)}`;

  const runner = resolveSibling("synth-runner");
  const resolveHook = resolveSibling("synth-resolve-hook");
  const loader = resolveTsxLoader();
  const sourceDir = dirname(absPath);

  // Private scratch dir for tsx (it writes a cache and an IPC pipe under
  // os.tmpdir(), which honors TMPDIR/TEMP/TMP). This is the only path the
  // permission model allows the child to write.
  const scratch = await mkdtemp(join(tmpdir(), "flow-cli-synth-"));

  const permissionArgs =
    supportsStablePermissionFlag() && !permissionFlagsUnsupported
      ? ["--permission", "--allow-fs-read=*", `--allow-fs-write=${scratch}/`, "--allow-worker"]
      : [];
  // argv after the runner: the builder file, the resolution hook the runner
  // registers before importing it, and the module URL that hook falls back to
  // when the builder's own directory cannot resolve @flow-as-code/core. See
  // synth-resolve-hook.ts.
  const baseArgs = ["--import", loader, runner, absPath, resolveHook, import.meta.url];
  const env: NodeJS.ProcessEnv = {
    // Minimum the child needs: PATH for anything resolving binaries plus the
    // temp override for tsx. Deliberately no NODE_OPTIONS, no AWS_*, no
    // HOME-derived config.
    PATH: process.env.PATH,
    TMPDIR: scratch,
    TEMP: scratch,
    TMP: scratch,
  };

  try {
    let result = await runChild([...permissionArgs, ...baseArgs], sourceDir, env);
    if (permissionArgs.length > 0 && sandboxRefusedToStart(result)) {
      // Two ways the permission model can stop the child from ever running our
      // code: the runtime does not know the flags, or the TypeScript loader
      // needs a capability we withheld (some versions shell out to compile).
      // Both are environment problems rather than problems with the user's
      // flow, so we retry unsandboxed rather than failing outright, and say so.
      permissionFlagsUnsupported = true;
      process.emitWarning(
        "flow-cli synth: this runtime's permission model rejected the sandbox, " +
          "so the builder file is being evaluated WITHOUT it. Environment stripping " +
          "and the pinned working directory still apply. Upgrade Node to restore the sandbox.",
      );
      result = await runChild(baseArgs, sourceDir, env);
    }

    const envelope = parseEnvelope(result.stdout);
    if (envelope === undefined) {
      const detail = result.stderr.trim();
      throw new SynthError(
        `Evaluating ${absPath} failed (exit code ${result.code ?? "unknown"}).` +
          (detail === "" ? "" : `\n${detail}`),
      );
    }
    if (envelope.error !== undefined) {
      const frames = actionableFrames(envelope.error.stack, absPath);
      const explained = explainModuleSystemFailure(envelope.error, absPath);
      throw new SynthError(
        (explained ?? `Evaluating ${absPath} threw: ${envelope.error.message}`) +
          (frames.length === 0 ? "" : `\n${frames.join("\n")}`),
      );
    }
    const flows = envelope.flows ?? [];
    if (flows.length === 0) {
      throw new SynthError(
        `No flows exported from ${absPath}. Export a Flow instance or a zero-argument ` +
          `function returning one (e.g. "export function myLine(): Flow { ... }").`,
      );
    }
    return { flows, sourceHash };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** Serializes a doc with the meta this CLI stamps. Byte-stable. */
export function serializeWithMeta(doc: FlowDoc, sourceHash: string): string {
  return serialize({ ...doc, meta: { generator: generator(), sourceHash } });
}

/**
 * The `flow-cli synth` command body: synth every flow the file exports and
 * write <flow.name>.flowdoc.json into outDir (default: the source file's
 * directory). Returns the written paths in write order.
 */
export async function synthToFiles(sourcePath: string, outDir?: string): Promise<string[]> {
  const absPath = resolve(sourcePath);
  const dir = outDir === undefined ? dirname(absPath) : resolve(outDir);
  const { flows, sourceHash } = await synthFile(absPath);
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const { name, doc } of flows) {
    // The Flow constructor already rejects non-slug names, but the child
    // process output is untrusted (a hostile module can fake a duck-typed
    // Flow), so the name is re-checked here before it becomes a file path.
    if (!SLUG_PATTERN.test(name)) {
      throw new Error(
        `Refusing to write flow named "${name}": names must be lowercase words separated by single hyphens.`,
      );
    }
    const docPath = join(dir, `${name}.flowdoc.json`);
    await writeFile(docPath, serializeWithMeta(doc, sourceHash), "utf8");
    written.push(docPath);
  }
  return written;
}
