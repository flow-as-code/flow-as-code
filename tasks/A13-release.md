# A13 Release readiness

Deliverables: Apache-2.0 headers everywhere via `npm run headers:fix`; changesets; npm publish dry-run under the decided scope; positioning post draft per the release plan; SECURITY.md and CONTRIBUTING.md. The hosted read-only demo moved to A14 so it is not blocked on naming.

## Done

- Apache-2.0 headers on every source file, enforced by `npm run lint`.
- SECURITY.md, including an honest statement of what the synth sandbox does and does not cover.
- CONTRIBUTING.md, including the rule that a new guarantee must ship with a test proven able to fail.
- Changesets configured: public access, all five packages linked so they version together, and an initial preview changeset.
- `npm publish --dry-run` clean for all five packages.

Five packaging defects were found by running the dry-run and installing the tarballs, rather than assuming:

1. No tarball contained the LICENSE. Each `files` list named it, but the file lives at the repo root and `files` cannot reach above the package directory, so five Apache-2.0 packages would have published without their licence. A copy now lives in each package, kept current by `npm run sync:license`, mirroring how the flow-cli schema copy is handled.
2. The published source maps pointed at `../src`, which was not published, so every map was dead on arrival. `src` now ships alongside `dist`. What goes with it is whatever each package's `files` list does not exclude, so that list is the specification and it has to name every category by hand: `*.test.ts` and `*.test.tsx`, `__fixtures__`, `__snapshots__`, `__generated__`, test helpers, and `*.tsbuildinfo`. A category the list does not name ships, which is not visible until the dry run prints the tarball listing, so read that listing rather than the `files` list when checking this.
3. The exclusion in (2) was one class of file too narrow: `files` negated `*.test.ts` but not what sits beside a test, so the flow-cdk tarball shipped `src/__snapshots__/flow-set.test.ts.snap` (630 lines of synthesized CloudFormation) and `src/test-helpers.ts`. All five `files` lists now negate `__snapshots__`, `*.snap`, and `test-helpers`, and `tests/packaging.test.ts` reads the real `npm pack --dry-run --json` listing and fails on any packed path matching a test, spec, snapshot, fixture, helper, buildinfo, or `dist-demo` pattern, or missing `LICENSE`, `README.md`, `package.json`, or `dist`.

4. flow-studio declared react, react-dom, `@xyflow/react`, ajv, and the three `@criticaldynamics/*` packages as runtime `dependencies`, although its `dist` is a self-contained bundle with no bare specifiers and its only consumer, `flow-cli studio`, reads just its `package.json` and `dist/index.html`. Because flow-cli depends on flow-studio, every `npm install @criticaldynamics/flow-cli` fetched React and React Flow that nothing loads. They are `devDependencies` now, and `tests/packaging.test.ts` holds the three facts that make that correct: the manifest declares no runtime dependencies, the bundle imports nothing by bare specifier, and the tarball is `dist` plus the manifest, README, and LICENSE. Proven from a consumer install of the five tarballs: 25 packages installed, no `react` or `@xyflow` in the tree, and `flow-cli studio` served the document plus all seven referenced assets and `/bridge/info`, `/bridge/docs`, `/bridge/docs/<name>`, and `/bridge/events` at 200.

5. flow-cli's `main`, `types`, and `exports["."]` all pointed at the bin script, so `import "@criticaldynamics/flow-cli"` parsed the host process's argv, printed the usage block, and exited 1, and the entry's types were an empty `export {}`. The commander program now lives in `src/bin.ts` (`dist/bin.js`, which `bin` points at) and the root entry is a side-effect-free module re-exporting the `synth`, `watch`, and `bridge` subpaths. `packages/cli/src/index.test.ts` imports the built root in a child process and fails if it writes anything or exits, and holds the root's exports equal to the union of the three subpaths. Splitting the bin also took the shebang out of `dist/index.d.ts`; it travels with `dist/bin.d.ts` now, which nothing resolves.

Each package also gained `repository` (with `directory`), `homepage`, and `bugs`, and `"engines": {"node": ">=20.19"}`, the floor CONTRIBUTING.md already required. Only the root manifest carried `engines`, and the root is never published, so a consumer on an older Node got a runtime failure rather than an install-time warning. `tests/packaging.test.ts` holds all five to the root's value, so the floor moves in one place.

Three documentation gaps that the packages themselves falsified:

- The root README had no install or quick-start section: which packages to install, that they version together, and that the CLI is `npx flow-cli`. It has one now.
- The flow-cli README described the studio bridge as "list, read, write, resolve, export". There is no `/bridge/list`; the routes are `/bridge/info`, `/bridge/docs`, `/bridge/docs/<name>` (GET and PUT), `/bridge/docs/<name>/resolve`, `/bridge/export`, and `/bridge/events`. The README now carries the route table and the token contract (`token` query parameter or `x-flow-studio-token` header), both read off `src/bridge/server.ts`.
- flow-cdk peers on `aws-cdk-lib ^2.267.0`, narrower than a bare `^2`, and npm 7 and later enforce peers. The floor is kept, not lowered: `FlowSet` builds `CfnContactFlowModuleVersion` and `CfnContactFlowModuleAlias`, which are recent `aws-cdk-lib/aws-connect` additions. CLAUDE.md already stated `^2.267`; `packages/cdk/README.md` now states it too, with what lowering it would take. Both peers were later marked optional, for the reason in the re-verification section below; the floor is unchanged.

## The dry-run, as it stands

`npm publish --dry-run --workspace @criticaldynamics/<pkg>` for each of the five, re-run after every fix above. Every one exits 0 and ends with `+ @criticaldynamics/<pkg>@0.0.1`, above it the same two lines each time: `npm warn publish This command requires you to be logged in to https://registry.npmjs.org/ (dry-run)` and `npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)`. The warning is the absence of a login, not a defect; nothing is uploaded.

| Package     | Package size | Unpacked | Files |
| ----------- | ------------ | -------- | ----- |
| flow-core   | 189.1 kB     | 786.0 kB | 164   |
| flow-cdk    | 26.5 kB      | 89.5 kB  | 23    |
| flow-cli    | 143.5 kB     | 547.9 kB | 120   |
| flow-tf     | 30.8 kB      | 107.5 kB | 28    |
| flow-studio | 226.8 kB     | 753.2 kB | 12    |

These numbers are a snapshot of one dry run, taken after the last code change on `release/loose-ends`. Every byte a package ships moves them, so a later run that reports different figures is drift and not a defect; the sizes are recorded to show the order of magnitude, and nothing asserts them. What is held is the shape of the tarball: `tests/packaging.test.ts` reads the real `npm pack --dry-run --json` listing and fails on a packed test, snapshot, fixture, helper, or buildinfo path, or a missing `LICENSE`, `README.md`, `package.json`, or `dist`. Shasums are not recorded for the same reason, since they change with every build.

Against the review's first measurement, flow-cdk is two files lighter (the snapshot and the test helper are gone) and flow-cli ten heavier: `bin` and `synth-resolve-hook`, each as a `.ts`, a `.js`, a `.d.ts` and their two maps.

The bin was packed with mode 0644, first left alone on the argument that npm's bin-links corrects it to 0755 on install (true: the consumer project shows `-rwxr-xr-x`, and `npx flow-cli --version` exits 0) and that a `chmod` step would not run on Windows. The re-verification asked for evidence, and the second half of that argument does not hold:

- `dist/` is not tracked, so git's mode bit is not the lever here: `git ls-files -s packages/cli/src/bin.ts` is `100644`, `git ls-files packages/cli/dist` is empty, and tsc writes its output 0644.
- `npm pack` does carry the on-disk bit into the tar header. With the built bin chmodded 0755 by hand, `tar -tvzf` reports `-rwxr-xr-x package/dist/bin.js` while `package/dist/index.js` stays `-rw-r--r--` (npm 11.19.0). npm's "portable" tar options normalize timestamps and ownership, not permission bits.
- `fs.chmodSync` is portable in a way that a `chmod` invocation is not: on Windows it touches only the read-only attribute and does not throw, so a Windows build runs the step and simply has no executable bit to set.

So `scripts/chmod-bins.mjs` owns the mode of every file a workspace packs out of `dist`: 0755 on the files the manifest names in `bin`, 0644 on the rest. It runs last in the root `build`, so it sees every package's finished dist, and again as flow-cli's `prepack` so that pack and publish get it with no preceding root build. It writes its one line to stderr, because `npm pack --json` returns everything the packing run put on stdout as one JSON document. `tests/packaging.test.ts` packs flow-cli for real and reads the ustar headers: `package/dist/bin.js` is 0755 and `package/dist/index.js` is 0644, alongside the tracked `package/package.json` and `package/README.md` at 0644 as a second witness.

The 0644 half was added in the clean-clone verification. The first version of the script set the bin bit only, and the test compared against `package/dist/index.js`, which failed on a developer tree that predates the bin split: while `bin` pointed at `dist/index.js`, npm's bin-links chmodded that file to 0755 at install time, tsc's incremental writes preserve an existing file's mode, and `dist/` is untracked, so nothing ever reset it. Moving the comparison to files git owns fixed that but dropped the mutant the assertion exists to catch, since a script that chmodded all of `dist` to 0755 then left the test green. Both halves hold now because the script, not the tree's history, decides the mode: the test seeds `dist/bin.js` at 0644 and `dist/index.js` at 0755 before packing, so it reads the packing step's work. Three mutations were run against it. `FILE_MODE` at 0o755 (chmod every dist file executable) fails on `dist/index.js`, expected 420, received 493. Commenting out both `chmodSync` calls (chmod nothing) fails on `dist/bin.js`, expected 493, received 420. `BIN_MODE` at 0o644 fails on `dist/bin.js` the same way.

A publish run from Windows would still ship 0644, since there is no bit to carry; npm's bin-links covers that case as it always did.

Working on that turned up a second, worse defect in the same field, which every dry run so far had reported as a warning and nobody had read. `"bin": {"flow-cli": "./dist/bin.js"}` made npm 11.19.0 answer `npm publish --dry-run` with `npm warn publish "bin[flow-cli]" script name dist/bin.js was invalid and removed`: publish-time normalization drops a bin whose value starts with `./`, so the manifest the registry would receive declares no bin and `npm i -g @criticaldynamics/flow-cli` would install no `flow-cli` command. Every check so far installed the tarball by path, and the tarball's own `package.json` keeps the entry, which is exactly why this was invisible. Reproduced on two throwaway packages differing only in the prefix: with it the warning, without it a clean dry run. The value is now `dist/bin.js` and `tests/packaging.test.ts` fails on a leading `./` in any workspace `bin`.

## Release-readiness review: studio findings

A browser pass over `flow-cli studio` on the demo directory found six defects. All six are fixed on `release/studio`, each with a test proven able to fail.

1. The inspector's free-text fields were uncontrolled, keyed by block id and parameter. A doc-synced event replaced the document while a field kept rendering the previous text, so clicking into it and clicking away with no typing committed the stale text and the next Save wrote it over the edit that had just arrived from disk, with no conflict dialog. Every such field now holds a draft that resets when its parameter moves. Reproduced and re-verified in a browser: with the paired `.flow.ts` edited on disk, the panel shows the new text and a click plus blur leaves the document clean and both files untouched.
2. The conflict dialog covered the canvas only, so the inspector stayed live behind it and an edit made there went into a document no answer would write. The dialog now covers the shell and the reducer refuses a mutation while a conflict is open.
3. Keeping the canvas side is a forced write from the browser, so it runs the save gate. That ran only inside the write, which threw its refusal into the header behind the modal and left the dialog up with the same dead button: an unsaveable canvas side had no visible way out. The gate now runs when the dialog renders, the findings are named beside the canvas column, and a failed resolve is shown in the dialog.
4. `state.error` had no clearing path short of opening another document, so one refused save left a clipped red line in the header for the rest of the session. It clears on the next edit, save, or sync, and wraps instead of truncating.
5. A bridge error event (a builder file that did not synth) was an eight-second toast carrying the whole stack trace. The toast now shows the first line, and a badge naming the file stays until that document syncs again.
6. Every Terraform address row suggested `aws_connect_queue.front_desk.arn`, and a refused export's list of unmapped tokens survived filling the map in. Placeholders are derived from the reference type (resource names checked against the AWS provider docs) and the stale message goes as soon as the map changes.

One unrelated gate defect came out of the same run: the roundtrip suite's `tsc --noEmit` check takes about five seconds, which is the default per-test timeout, so a full parallel `npm test` failed it on the clock. Reproduced on main at 9ec1554; the check now has a timeout it can meet.

## Fixed after the release-readiness review

A review of the packed tarballs from a consumer's position, and of the studio
in a browser, found defects that the in-repo tests could not see because every
test ran inside the workspace. Fixed on `release/synth-cli`:

1. Synth in a plain directory. A generated `<name>.flow.ts` imports flow-core
   by package name, and a folder of FlowDocs has no `node_modules`, so the
   sandboxed child died with `ERR_MODULE_NOT_FOUND` and editing the builder
   file never updated the canvas: Phase A's third definition-of-done clause
   failed outside a project that already depended on flow-core. The child now
   falls back to flow-cli's own copy of flow-core after normal resolution
   fails, and treats a `.flow.ts` as ESM when no `package.json` above it
   decides otherwise (`packages/cli/src/synth-resolve-hook.ts`). A copy
   installed next to the builder file still wins. Covered by two tests in
   `packages/cli/src/synth.test.ts` that run from `os.tmpdir()`, where
   nothing above the file can resolve anything.

2. The CDK scaffold's document directory. `const FLOW_DOCS = "../flows"` was
   read relative to the CDK app's working directory, so `cdk synth` from the
   project root, where `cdk.json` normally lives, failed with
   `ENOENT: no such file or directory, scandir '../flows'`, and an `--out`
   outside the source tree emitted a long `../` climb that only worked from
   the out directory. The scaffold now resolves the expression against its own
   file (`fileURLToPath(new URL(source, import.meta.url))`); the expression
   itself stays relative, so no absolute path from the machine that generated
   the file is baked into it. Verified with `npx cdk synth` in a throwaway
   consumer directory: exit 0 from the project root and from the scaffold's
   directory, one `AWS::Connect::ContactFlow` in the template and no `cdref`
   token left; the previous form still fails with ENOENT from the root.

3. Generated files carried this repository's copyright. `flow-cli codegen`
   output and the CDK scaffold both opened with the repo's own Apache-2.0
   header, written into a consumer's project as if it were their file. Both
   now open with a neutral "Generated by" banner and no copyright line,
   which is what the Terraform emitter already did. Codegen's banner names the
   document it came from. `@keep` behaviour is unchanged. The repo's own
   header lint is untouched: `conformance/` is outside its scan.

4. Literal ARNs reported as schema noise. `flow-cli lint` on a document holding
   one ARN printed five schema pattern messages, none of which named the
   `no-literal-arn` rule, because the schema gate runs before any rule. The
   document loader now reports one line per offending field, by rule id, and
   drops only the schema errors that same ARN caused; everything else the
   schema found is still listed. The rule itself also reads `refs[].token`
   now, which it never did: an ARN there passed lint, and the studio's save
   gate is lint, so only the schema was catching it.

## CI and documentation review (2026-09-02)

A release-readiness pass over the workflow and the prose:

- `.github/workflows/ci.yml`: the live sandbox job now needs a push to `main` or a `workflow_dispatch` on top of the `CONNECT_SANDBOX_ENABLED` variable, so a fork pull request cannot schedule it and fail on credentials it was never going to get. Top-level `permissions: contents: read`, a `timeout-minutes` on every job, and a step that deletes a leftover `flow-as-code-a07-integration` stack before deploying, because `cancel-in-progress` applies to that job and can kill a run before its own teardown.
- The build matrix is Node 20, 22, and 24. `npm run build` and `npm test` were run under Node 24.20.0: 70 test files passed and 2 skipped, 1300 tests passed and 18 skipped. CONTRIBUTING.md and CLAUDE.md name the same three.
- What the sandbox job covers is now stated in the yml, `tasks/A06-export-and-simulate.md`, and `packages/core/README.md`: the whole-instance export and the A07 deploy, not the simulate suite and not the lossless export of the deployed demo, both of which need a superset stack and a resource map and stay an operator run.
- Live test failure output masks the account segment of every ARN, so a failure in that job does not print an account id into a public log.
- The positioning post draft said export and the test-case runner had only run offline. A06 records three live sessions; the draft now says what ran live and what is still open, and names a role rather than a person.

## Integration of the four review branches (2026-09-02)

`release/packaging`, `release/studio`, `release/synth-cli` and `release/ci-docs` merged in that order. Two conflicts, both textual and both resolved by keeping each side: `docs/02-studio-design.md`, where two streams extended the same two bullets, and the packaging-defect list above, where one stream split item 2 in two and the other rewrote it. Two defects existed only in the combination and so were invisible to every stream on its own:

- `SECURITY.md` started carrying the npm scope, because one stream documented the flow-core resolution fallback in it while another added `tests/renameCoverage.test.ts`, which fails on any file carrying the placeholder that the recipe below does not name. It is a real rename site and step 9 now names it.
- `flow-cli synth` in a plain folder still failed on Node 20, which is the `engines.node` floor and the first CI matrix entry. The fallback the synth stream added treats a nullish `format` from the default resolver as "no package.json decided this", and that is true on Node 22 and later. Node 20 answers `"commonjs"` for the same folder instead, so the builder file was loaded as CommonJS, its `import` of flow-core became a `require` that ESM-only flow-core cannot satisfy, and the require never reached the resolve hook that holds the fallback. The hook now walks for a `package.json` itself rather than reading the decision off the resolver's answer, so the two runtimes agree. Verified by running the same builder file in an `os.tmpdir()` folder under Node 20.20.2 (was: `Cannot find module '@criticaldynamics/flow-core'`, now: the expected envelope) and under 22.23.2 and 26.8.1, which were already passing. `packages/cli/src/synth-resolve-hook.test.ts` drives the hook with both answers so the case is pinned on every runtime, not only on the one that gets it wrong.

Gates green on Node 26.8.1 (lint, typecheck, test, build, headers), and `npm run build && npm test` green on Node 20.20.2 and 22.23.2.

## Re-verification of the integrated branch (2026-09-02)

A second pass over the merged branch found two fixes that had not landed where
they were claimed to have landed.

1. `no-literal-arn` was still not enforced on the bridge write path. The rule
   was added to `flowDocProblems`, but behind `if (validate(value)) return []`,
   so it ran only on a document the schema had already rejected. Only
   ref-shaped fields carry the `${cdref:...}` pattern, so an ARN in
   `Parameters.Text` is schema-valid, and a direct `PUT /bridge/docs/<name>`
   carrying one was accepted with 200 and rewrote both files. The scan now runs
   whether or not the schema is satisfied. The document loader is unchanged:
   it consults `flowDocProblems` only after a schema failure, so the `lint`
   command still reports a free-text ARN through the rule rather than as a
   load error.

The reason it shipped as fixed is the test that covered it. "Refuses to
write a document the studio's own gate would refuse" asserted on the
studio's client-side `assertSaveable` and issued no HTTP request at all, so
it was green while the server wrote the file. It is now an HTTP-level test
that PUTs the ARN document with and without `force`, expects 422 naming the
rule, and asserts both files unchanged in bytes and mtime. Proven able to
fail by restoring the early return.

2. flow-cdk declared `aws-cdk-lib` and `constructs` as non-optional peers, and
   npm auto-installs those, so `npm install @criticaldynamics/flow-cli` pulled
   166 MB of CDK that nothing in that install loads: the CLI and the studio
   reach flow-cdk for `/scaffold` alone, which imports nothing but flow-core.
   This is the same defect as the flow-studio React one (packaging item 4)
   through a different mechanism. Both peers are now marked optional, the same
   pattern flow-cli uses for `@aws-sdk/client-connect`, so the `^2.267` floor
   is still enforced for anyone constructing a `FlowSet`. Measured from a fresh
   project holding only the five tarballs and no declared peers: 25 packages
   and 25 MB, against 25 packages and 193 MB before. `tests/packaging.test.ts`
   holds the floor, the optional flags, and the scaffold subpath's one bare
   import.

Both re-verified end to end, not only in the suite. `flow-cli studio` from the
built `dist/bin.js` over a plain directory answers a `PUT /bridge/docs/<name>`
carrying an ARN in `Parameters.Text` with 422 naming the rule, with and without
`force`, and both files keep their bytes and mtimes. A fresh consumer install of
the five tarballs with no declared peers is 25 MB with no `aws-cdk-lib`,
`constructs`, or `react` in the tree.

Gates green on Node 26.8.1 (lint, typecheck, test, build, headers): 74 test
files passed and 2 skipped, 1378 tests passed and 18 skipped. `npm run build`
and `npm test` green on Node 20.20.2 and 22.23.2 with the same counts.

## The low findings from round 2 (2026-09-02)

Round 2 approved the branch and left five low items. All five are closed on
`release/polish`; each guard was neutered and watched to fail before it was
restored.

1. The studio's "Code out of sync" badge never cleared when the builder file
   was restored to bytes identical to the last synced content. The watcher
   returned early on a content hash it already held, which is what an undo
   produces, and consumers latch the preceding `error`. The ledger records that
   a pair's last change ended in error, and only then does the no-op emit
   `synced`; nothing is rewritten, because the document on disk is the one
   those bytes produced. An echo or a touch on a healthy pair is still silent.
   The badge itself had its accessible name set to the raw absolute path of the
   builder file, and its visible label clipped mid-path: the label is now the
   file name alone (measured in a browser: `clientWidth` equals `scrollWidth`,
   so nothing is cut), and `aria-label` and `title` carry one sentence naming
   the file and the failure, with the absolute path inside the message reduced
   to that same file name. Verified in a browser against a live
   `flow-cli studio`: break the file, read the badge, restore it byte for byte,
   badge gone.
2. `node packages/cli/dist/index.js <subcommand>` exited 0 printing
   nothing after the bin split. The library entry now writes one line naming
   `dist/bin.js` and exits 1 when `process.argv[1]` matches its own
   `import.meta.url`. The import path is untouched, and the existing test that
   imports the entry in a child process and asserts no output is still green.
3. `flow-cli studio` on a directory holding only a `.flowdoc.json` never wrote
   the paired `.flow.ts`, so the documented loop could not start there. The
   bridge writes it on open through the same codegen a canvas save runs and
   stamps the document with the `meta.sourceHash` of the source generated, and
   hands those bytes to the watcher's `noteWrite` so the first scan cannot read
   the new pair as a divergence. The stamp alone was not enough: without the
   `noteWrite` the end-to-end test reports the pair as never seen in sync.
4. flow-cdk's optional peers removed npm's install-time signal, so a consumer
   who skipped the CDK met `ERR_MODULE_NOT_FOUND` for `aws-cdk-lib` out of
   `dist/flow-set.js`. The peers stay optional, since that is the 25 MB, and
   the entry resolves `aws-cdk-lib` itself and throws one error naming both
   packages and the floor. ESM links the whole graph before any body runs, so
   `flow-set.js` moved behind a dynamic import; the types come in through a
   type-only import and are erased.
5. The bin mode dispute is settled above, in "The dry-run, as it stands".

Gates green on Node 26.8.1: `npm run lint`, `npm run typecheck`,
`npm run build`, `npm run headers` (205 files), and `npm test` with 75 test
files passed and 2 skipped, 1389 tests passed and 18 skipped.

## The last two findings from round 3 (2026-09-02)

Both are closed on `release/loose-ends`.

1. `actionableFrames` dropped every frame whose location carries `node_modules`
   as a path segment. That is right for a dependency and wrong for the builder
   file itself when it lives under such a directory, which a vendored or linked
   flow does: a throw in `<dir>/node_modules/demo.flow.ts` printed the message
   with no line or column under it, where the raw stack had both. The function
   now takes the file being synthesized and exempts that file's own frames,
   comparing resolved real paths so the `file:` URL the ESM loader reports and
   the path the caller was handed match through a symlinked temp directory.
   Reproduced with the built CLI on such a file before and after the fix:
   before, the only frame left was flow-cli's own runner; after,
   `demo.flow.ts:2:7` and the frame under it are printed and no esbuild or node
   internal frame is. Four mutations, each watched to fail: drop the exemption,
   make it unconditional, drop the `file:` URL handling, drop the realpath.
   The unconditional one also fails three of the older frame tests.
2. The package-size table above was measured before the fixes on this branch
   and had drifted on three rows. It is re-measured from a dry run on this
   branch, and the text around it now says the numbers are a snapshot that
   moves with the packed contents, so a later reader does not read drift as a
   defect.

Gates green on Node 26.8.1: `npm run lint`, `npm run typecheck`,
`npm run build`, `npm run headers` (205 files), `npm test` with 76 test files
passed and 2 skipped, 1409 tests passed and 18 skipped, and the five publish
dry runs, whose only warning is the absent login.

## The rename, done 2026-09-03

The npm scope and the schema `$id` host were placeholders. They are not any
more. What changed, and what deliberately did not:

- npm scope `@criticaldynamics` to `@flow-as-code`.
- Package short names `flow-core`, `flow-cdk`, `flow-cli`, `flow-tf`,
  `flow-studio` to `core`, `cdk`, `cli`, `tf`, `studio`, so a consumer writes
  `@flow-as-code/core` rather than repeating the scope. The package
  directories moved with them (`packages/core`, and so on), which is what
  `packages/core/src/package-names.test.ts` now reads: the short name is the
  directory name, so there is no second list to fall out of date.
- GitHub org `critical-dynamics` to `flow-as-code`, so `repository.url`,
  `homepage`, and `bugs.url` in all five manifests point at
  `https://github.com/flow-as-code/flow-as-code`. The repository name did not
  change.
- Schema `$id` host `critical-dynamics.dev` to `flow-as-code.dev`, in both
  `conformance/schema/*.json`, re-synced into the byte copies flow-cli ships
  with `npm run sync:schema`, and in the studio's offline allow-list, which
  holds the FlowDoc `$id` by exact match.
- `meta.generator` stamps, which use the unscoped short name: `core@0.1` from
  `synth()` and `export()`, `cli@0.0.1` from the CLI. Codegen's banner now
  reads its name from `PACKAGE_NAMES` the way the Terraform banner already
  did, rather than carrying its own literal.

  The CLI half of that was a hardcoded literal and shipped wrong: 0.1.0 went to
  npm printing `0.0.1` for `flow-cli --version` and stamping `cli@0.0.1` into
  every FlowDoc it wrote. Both now read `packages/cli/package.json` at runtime
  (`packages/cli/src/version.ts`, guarded by `packages/cli/src/version.test.ts`),
  so they cannot drift at the next bump. `core@0.1` stays the FlowDoc format
  version on purpose; docs/01-flowdoc-spec.md records why the two differ.

Not renamed, deliberately: the copyright holder, which was already the
entity-neutral `The flow-as-code Authors` and stays byte-identical in all 206
headers; the `flow-cli` binary, because `flow` would collide with the Facebook
Flow type checker on PATH; FlowDoc, its `flowdoc: "0.1"` key, the
`.flowdoc.json` extension and the schema file names; the `${cdref:...}` token
prefix, which is baked into every conformance fixture and the schema
`pattern`, so changing it would be a format break rather than a rename; the
lint rule ids, which the future Go provider keys off; the `@example` scope in
`packages/studio/src/demo/package-names.ts`, which is the RFC 2606
documentation placeholder the hosted demo shows on purpose; `package-lock.json`,
which `npm install` regenerated; and the notes under `tasks/`, which record
work done while the placeholder was in force.

Two things the earlier recipe had wrong, found by running it:

- The `conformance/` expectations are not exempt. They are generated output and
  the tests compare them byte for byte, so the emitted Terraform banner, the
  codegen banner, the import specifier in the exported `.flow.ts` files, and
  the `meta.generator` stamps in the exported FlowDocs all had to move with the
  names. Only the two schema `$id` lines were listed before; sixteen more
  golden files carried a name.
- The package directories carry the name too, in relative cross-package
  imports, the tsconfig project references, the studio's Vite alias and
  demo-stub path patterns, and every test that addresses a sibling package by
  path.

`tests/renameCoverage.test.ts` was the pre-rename inventory: it asserted that
each listed site still carried the placeholder, so both of its main assertions
inverted the moment this landed. It is now the guard on the state the rename
established: no tracked file outside `tasks/` carries either spelling, in any
casing. Mutation-tested by planting the old scope in `SECURITY.md`, watching it
name that file, and removing it.

Gates after the rename, on Node 26.8.1: `npm run lint`, `npm run typecheck`,
`npm run build`, `npm run headers` (206 files), `npm test` with 77 test files
passed and 2 skipped, 1388 tests passed and 18 skipped, and
`npm publish --dry-run --workspaces` exiting 0 for all five, each tail reading
`+ @flow-as-code/<pkg>@0.0.1`, whose only warning is the absent login. The test
count is 24 lower than the 1412 the branch tip carried: the inventory test had
28 cases, 25 of them one per listed site, and the guard that replaced it has 4.
Nothing else lost a test.

## The Node floor moved to 22.12 (2026-09-04)

Every Node version named in the dated sections above is what was true on that
date and is no longer current. Node 20 reached end of life on 2026-04-30 and is
neither supported nor tested. `engines.node` is `>=22.12` in all six manifests,
not the `>=20.19` recorded under "Done", and `tests/packaging.test.ts` still
holds the five published manifests to the root's value, so the floor still moves
in one place. The CI matrix is Node 22, 24 and 26, not 20, 22 and 24; the job
list is under "CI on a real runner" below, and CONTRIBUTING.md and CLAUDE.md
name the same three. Nothing about the packaging work above changed with the
floor. tasks/A04-synth-sandbox-and-watch.md records what the move did change,
which is which runtimes the synth sandbox can put permission flags on.

## Blocked (rewritten 2026-09-09)

What this section said until now, and why it was wrong, is in "Superseded"
below. It had gone stale in three places at once, so it is replaced rather
than amended.

Still blocking the release, as of 2026-09-09:

1. **The publish itself.** Nothing is on the registry. `curl` against
   `https://registry.npmjs.org/@flow-as-code%2F<pkg>` answers 404 for all five
   of `core`, `cdk`, `cli`, `tf` and `studio`. The `flow-as-code` npm
   organization exists and `npm publish --dry-run --workspaces` exits 0 for all
   five with no warning but the absent login, so what is left is an operator
   run: `npx changeset version`, then a real `npm publish --workspaces` from a
   logged-in session. The files under `.changeset/` are deliberately unconsumed
   and are what that first release versions from; do not run `changeset version`
   in a feature branch.
2. **The positioning post.** The draft has not been reviewed and has not gone
   out. It no longer lives here: see "The strategy docs left this repo" below.

Nothing else blocks the release. One repository setting is worth fixing
alongside it, and is not a commit: private vulnerability reporting is off
(`gh api repos/flow-as-code/flow-as-code/private-vulnerability-reporting`
answers `{"enabled": false}`), so the advisory form SECURITY.md points a
reporter at is not offered on a public repository until it is enabled in
Settings, Code security. SECURITY.md carries a fallback until then.

### Superseded

Three claims this section carried are false and are recorded here so a reader
who remembers them knows they were retracted rather than quietly dropped.

- "CI has never run on a real remote. The repository has no git remote."
  False since 2026-09-04. The repository is public at
  https://github.com/flow-as-code/flow-as-code and CI has run on GitHub Actions
  many times. The precondition this section set, one green run with its URL
  recorded here, is met; the URLs are in the next subsection.
- "The A07 live deploy is still outstanding." False since 2026-09-02. It
  completed that day and is recorded under "Live deploy verified (2026-09-02)"
  in `tasks/A07-flow-cdk.md`: the FlowSet deployed to the sandbox, the deployed
  flows were read back with `DescribeContactFlow` and compared against what the
  FlowDocs materialize to, and the stack was torn down leaving the sandbox at
  20 flows, 0 modules, 0 test cases and 0 `flow-as-code-*` stacks. The
  2026-09-02 expired-session attempt this section pointed at is the morning
  attempt, superseded the same day.
- "the four jobs". The workflow has more than four. The job list is below.

### CI on a real runner

Verified 2026-09-09 with `gh run list` and `gh run view` against the repository,
not from a local run. Run URLs are
`https://github.com/flow-as-code/flow-as-code/actions/runs/<id>`.

At `main` (15f8886, the single squashed commit the repository was published
with), both workflows succeeded:

| Workflow | Run id      | Conclusion |
| -------- | ----------- | ---------- |
| CI       | 34369711587 | success    |
| Pages    | 34369711711 | success    |

Every job of CI run 34369711587, read back with `gh run view --json jobs`:

| Job                           | Conclusion                               |
| ----------------------------- | ---------------------------------------- |
| build / node 22               | success                                  |
| build / node 24               | success                                  |
| build / node 26               | success                                  |
| emit-tf goldens / tofu 1.7.0  | success                                  |
| emit-tf goldens / tofu 1.12.6 | success                                  |
| publish dry-run               | success                                  |
| sandbox integration           | skipped, `CONNECT_SANDBOX_ENABLED` unset |

The sandbox job is skipped by design: it is gated on the repository variable
`CONNECT_SANDBOX_ENABLED`, which is not set, so a fork or a routine push does
not reach for credentials. What it would cover is stated in the yml and in
`tasks/A06-export-and-simulate.md`.

Earlier green CI runs on the same workflow, before the squash:
33892223093, 33895014441, 33929608350, 33933232244.

### Gate figures from a clean install at 15f8886

Measured on this commit, not recalled: `npm test` 1413 passed and 20 skipped
across 79 files passed and 2 skipped; `npm run headers` 210 files;
`npm publish --dry-run --workspaces` exit 0 for all five packages, warning-free
apart from the not-logged-in notice.

## The publish became a workflow (2026-09-09)

0.1.0 went out by hand from a laptop, because npm trusted publishing cannot
create a package that does not yet exist. The registry's own metadata dates it:
`https://registry.npmjs.org/@flow-as-code%2fcore` reports `0.1.0` published at
`2026-09-09T16:27:40Z`, and all five packages carry a `<name>@0.1.0` git tag.
That retracts item 1 of "Blocked" above, which said nothing was on the registry.
Item 2, the positioning post, still stands.

Every release after 0.1.0 goes through `.github/workflows/release.yml` instead.
A Trusted Publisher is configured on npmjs.com for each of the five packages,
naming this repository and that filename, so the publish authenticates over
OIDC and there is no npm token anywhere in the repository or in Actions.

The operator procedure and the recovery from a half-failed publish are in
CONTRIBUTING.md under "Releasing"; they are not repeated here.

Three things about the design are worth recording because they are not
obvious:

- The `npx changeset publish` step has to live in `release.yml` itself. npm
  validates the OIDC token against the workflow filename it was configured
  with, and for a called workflow "the github context is always associated with
  the caller workflow"
  (https://docs.github.com/en/actions/reference/workflows-and-actions/reusable-workflows),
  which is the mismatch npm's own troubleshooting describes for `workflow_call`
  and `workflow_dispatch` (https://docs.npmjs.com/trusted-publishers/). The
  gate job does call `ci.yml`, which is safe only because that workflow never
  publishes.
- The npm bundled with Node 22 is too old. Trusted publishing needs npm 11.5.1
  or later, and `https://nodejs.org/dist/index.json` on 2026-09-09 has the
  newest Node 22 (v22.23.2) bundling npm 10.9.8. Node 24.21.0 bundles 11.19.0
  and Node 26.8.2 bundles 11.19.1. The release job pins Node 24 and
  `.github/actions/ensure-npm` checks the floor at run time rather than
  trusting that, upgrading to a pinned npm if it has to and failing loudly if
  it still cannot reach the floor.
- `ci.yml` gained a `workflow_call` trigger with one input, `release_gate`. It
  changes nothing about what is built or tested. It exists because
  `github.event_name` inside the called workflow is the release's own
  `workflow_dispatch`, which would otherwise let the live sandbox job through
  and make a release depend on a reachable AWS account.

What is verified and what is not, as of this commit: the three YAML files pass
`@action-validator/cli`; `actions/checkout@v7` and `actions/setup-node@v7` both
declare `using: node24` in their `action.yml` at that tag, read with `gh api`;
the version comparison, the unconsumed-changeset check, the registry check, the
stale-tag guard and the new-tag diff were each run locally against both their
passing and their failing input. The OIDC exchange itself is not verified and
cannot be without cutting a real release. 0.1.1 is the first run that proves it.

## Two defects in that workflow, found and fixed before the first dispatch (2026-09-09)

Both would have failed the release at dispatch, which is the worst moment to
find them. Both were then reproduced on a real runner rather than argued from
the documentation, on a throwaway branch whose workflows could not publish.

**The gate call was rejected outright.** `release.yml`'s `gates` job called
`ci.yml` granting `contents: read`, and `ci.yml`'s `integration` job declared
`id-token: write` for the AWS role. A called workflow may only downgrade what
its caller granted, and GitHub checks that statically
(https://docs.github.com/en/actions/reference/workflows-and-actions/reusable-workflows).
Observed: a run of that exact shape ended `startup_failure` in one second, with
zero jobs created, and the page for it says "requesting 'id-token: write', but
is only allowed 'id-token: none'." The job's `if` never came into it; nothing
ran at all.

Three fixes were possible. Granting the permission at the call site works: a
caller granting `contents: read` plus `id-token: write` to the same called
workflow ran green, so this was a judgement and not a constraint. It was not
chosen, because it puts a token-minting permission on the release path for a
job that is guaranteed skipped, and leaves "a release does not depend on a
reachable AWS account" resting on one `!inputs.release_gate` clause whose
reasoning lives only in a comment. Splitting the gate set in two was rejected
outright: it is the drift the reuse exists to prevent.

What was chosen: the live sandbox job moved to
`.github/workflows/integration.yml`, keeping its gates and its triggers. It was
never part of the gate set a pull request passes, because its `if` excludes
`pull_request`, so nothing about that property changed, and the AWS-independence
of a release is now structural. `ci.yml` lost its only `workflow_call` input,
`release_gate`, which retracts the third bullet of the section above.

The cost is real and worth naming: "what CI runs" is now two files rather than
one, and a reader of `ci.yml` no longer sees the sandbox job. And the move does
not by itself stop the next job of this shape from reintroducing the problem, so
`tests/releaseGates.test.ts` reads both workflows and fails when `ci.yml` asks
for a permission the `gates` job does not grant. Proven able to fail: with an
`id-token: write` job put back into `ci.yml` it reports "ci.yml asks for
`id-token: write` but release.yml's gates job grants `id-token: none`".

Observed afterwards: the fixed call, `uses: ./.github/workflows/ci.yml` with
`contents: read`, ran all six gate jobs green on a runner, including both
`emit-tf` tofu jobs and `publish dry-run`.

**The tags would have been silently lost, after the publish.** `changeset
publish` creates ANNOTATED tags: `@changesets/git` runs
`git tag <name>@<version> -m <name>@<version>`, and `-m` implies `-a`
(https://git-scm.com/docs/git-tag). An annotated tag needs a committer
identity, and `actions/checkout` configures none.

The finding as first reported was that tag creation would die on a hosted
runner. It is worse than that: it dies quietly. `@changesets/git` runs git
through spawndamnit, which resolves with the exit code rather than rejecting and
keeps the child's stderr in a buffer nothing prints, and `tagPublish` discards
`tag()`'s boolean. Observed on a runner, in order: `user.name` and `user.email`
both unset after checkout; a plain `git tag -a` exiting 128 with "fatal: empty
ident name (for <runner@...>) not allowed"; and then `@changesets/git`'s `tag()`
returning `false`, creating no tag, printing nothing, and exiting node 0. So the
job would have published all five packages, logged "New tag:" five times, and
gone green with the registry five versions ahead of the repository, which is not
a state a re-dispatch fixes.

The publish job now configures `github-actions[bot]` and its numeric noreply
address (user id 41898282) as the local committer, proves annotated tagging
works with a throwaway tag before the publish rather than after it, and after
the publish asserts the invariant against both sides: every version the registry
serves must have its tag on the remote. Observed on a runner: with that identity
configured `tag()` returns true and writes a tag object tagged
`github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`;
an annotated tag pushes and deletes cleanly under `contents: write`; and the
registry-versus-remote-tag check reports all five 0.1.0 versions present and
tagged.

Two smaller corrections in the same pass. `setup-node`'s `registry-url` does not
write a project `.npmrc`, as the comment claimed; it writes a user-level one and
exports `NPM_CONFIG_USERCONFIG` at it, observed on the runner as
`/home/runner/work/_temp/.npmrc`, with no project `.npmrc` present. The
distinction is the precedence: a committed `.npmrc` would override it. And the
two preflight steps that interpolated `github.ref` and `github.workflow_ref`
into their shell scripts now bind them to `env:` variables, since a git ref name
may contain a double quote.

One claim in the brief that this pass could not use: `changeset publish` has no
`--dry-run` flag. Its usage line in `@changesets/cli` 2.31.1 is
`publish [--tag <name>] [--otp <code>] [--no-git-tag]`. The rehearsal therefore
exercised the tagging and the checks around the publish with the publish itself
removed, rather than a dry run of it.

Still unverified, and still only provable by cutting a release: the OIDC
exchange with npm, whether any Trusted Publisher configuration names an
Environment (if one does, the publish job needs a matching `environment:`), and
whether provenance attestations are generated.

That list is retracted. The 0.1.1 publish on 2026-09-09 is the release that
proved all three: run 34391491094 of `release.yml` succeeded, its publish job
carries no `environment:` and needed none, so no Trusted Publisher names one,
and `npm view @flow-as-code/core@0.1.1 dist.attestations` returns a
`https://slsa.dev/provenance/v1` predicate.

## The strategy docs left this repo (2026-09-10)

`docs/04-release-and-positioning.md` and `docs/drafts/positioning-post.md` are no
longer in the working tree. Both were internal release-planning and marketing
material, which does not belong in this repository. Nothing an open-source
consumer needs, and on launch day a reader who clicks `docs/` would have met
internal planning before the FlowDoc spec. What each file said is deliberately
not restated here.

This note previously said the two files "now live in the private product repo".
That was written as though the deletion had been a move, and it had not been:
nothing had copied them anywhere, and the sentence made a pair of unrecovered
files look filed. They were recovered on 2026-09-10 from the pre-rewrite history
and are held outside this repository. The correction worth keeping is the
general one: deleting a file because it belongs somewhere else is only a move
once the copy exists, and this record cannot vouch for what is outside it.

Neither file is in the tree, and neither is to be retrieved from anywhere in
this repository or described as retrievable from it. A GitHub Support request
to purge the objects was filed on 2026-09-10. The copies in the product repo
are the record; this note is the record that they moved and why.

What stayed public is the part of the first file a reader of this repository
genuinely asks about: the prior-art comparison against Amazon's internal L2 CDK
library, rewritten as `docs/adr/0004-prior-art-aws-l2-cdk-library.md` with the
technical difference only. No timing, no marketing directives, no pointer to a
private decision record.

References to both files were rewritten here, in `tasks/A11-studio-roundtrip.md`
and in `examples/promote-across-environments/README.md`. Two further mentions
were comments rather than links, and were reworded on the integration branch
once the streams merged: the list in `scripts/build-site.mjs` of what is
deliberately not published, and the header comment in `site/index.html`, which
ships into the published page source at https://flow-as-code.dev/.

The open item in "Blocked" is unchanged: the post has still not been reviewed
and has still not gone out. It is now tracked in the product repo.
