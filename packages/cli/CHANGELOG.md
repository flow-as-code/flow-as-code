# @flow-as-code/cli

## 0.1.2

### Patch Changes

- 4e3507e: Make the npm install path work end to end, and give it a first flow to open.

  `flow-cli synth` failed in any project whose package.json does not say `"type": "module"`, which is most of them: `npm init -y` writes `"type": "commonjs"` explicitly. The builder file was loaded as CommonJS, its `import` of `@flow-as-code/core` became a `require` of a package that ships only ES modules, and Node refused with `No "exports" main defined` naming a manifest inside `node_modules`. Since synth is the code-to-canvas half of the round trip, the studio's live sync went with it. The CLI now resolves a `.flow.ts` entry and its relative imports as ES modules whatever the nearest package.json says, and leaves the rest of the project's modules to load as they did. Where resolution still fails, the error names the builder file and the two remedies rather than a manifest the reader did not write.

  New: `flow-cli init [dir]`. It writes a demo FlowDoc, the typed `.flow.ts` that synthesizes to it, and, when nothing above the directory is already a package, a package.json marking the pair as modules. It refuses to overwrite and names every collision. The template ships inside `@flow-as-code/cli` and is byte-identical to the conformance demo. Before this, nothing an npm install produced was a document, so `studio`, `lint` and `emit` had nothing to open.

  Reference maps take three key forms wherever one is read: the whole token (`${cdref:queue:appointments}`), the bare `type:name`, and the variable name the Terraform emitter writes (`queue_appointments_arn`). `render --resources`, `simulate --resource-map` and `emit --target tf --address-map` accept the same spellings, so a map written for one is no longer rejected by the next for how it spells its keys. The values still differ by command, and the CLI's docs and its missing-key error now say so instead of implying one file serves all three. A missing key names all three forms it would have taken. The key and identifier rules moved into `@flow-as-code/core`, which had byte-identical copies of them in `@flow-as-code/tf` and `@flow-as-code/studio`; core also exports `token()` now.

  The studio opens the canvas at a size a reader can read. The initial fit no longer shrinks a whole flow to whatever the pane can hold, and zooming out by hand still reaches the same floor.

  Packaging metadata on all five: keywords, a homepage pointing at that package's own docs page on flow-as-code.dev instead of a GitHub subdirectory anchor, and CHANGELOG.md inside the published tarball, which none of them shipped at 0.1.0 or 0.1.1. npm metadata is immutable per version, so this release is the chance to fix it. Each README now also links the site and its own registry page.

- Updated dependencies [d5b8a54]
- Updated dependencies [4e3507e]
  - @flow-as-code/studio@0.1.2
  - @flow-as-code/core@0.1.2
  - @flow-as-code/cdk@0.1.2
  - @flow-as-code/tf@0.1.2

## 0.1.1

### Patch Changes

- ebf8e70: Read the CLI's version from its own manifest instead of two hardcoded literals.

  `@flow-as-code/cli` 0.1.0 shipped printing `0.0.1` for `flow-cli --version` and
  stamping `cli@0.0.1` into `meta.generator` of every FlowDoc `flow-cli synth`,
  `flow-cli export`, and the studio bridge wrote. Both strings were literals that
  were correct when they were typed and wrong the moment the release bumped, and
  the generator stamp is worse than cosmetic: it puts false provenance into
  documents users commit to their own repositories, where it outlives the
  mistake.

  Both now derive from `packages/cli/package.json` at runtime, so neither can
  drift again, and `packages/cli/src/version.test.ts` fails if either is ever
  pinned to a literal. `meta.generator` from the CLI is `cli@<package version>`;
  `@flow-as-code/core` continues to stamp `core@<FlowDoc format version>`, and
  docs/01-flowdoc-spec.md now records why the two count different things.

  Documents already written with `cli@0.0.1` are not rewritten. The FlowDoc
  format and the `flowdoc` key are unchanged.

  The manifest lookup is lazy, and two exported names changed with it.

  Reading the manifest while the module loaded would have made `import` itself
  able to throw. `@flow-as-code/cli/synth` is a public subpath, and once a
  consumer bundles it `import.meta.url` no longer names a file with this
  package's manifest above it, so the lookup would walk to the filesystem root
  and fail before any of their code ran. The lookup now runs on first use and is
  cached, so importing `@flow-as-code/cli` or any of its subpaths does no
  filesystem work and cannot fail.

  That leaves nothing to compute for a constant, so `GENERATOR`, exported from
  `@flow-as-code/cli/synth` and re-exported from the package root, is now
  `generator()`. Read the value where you used it:

  ```diff
  -import { GENERATOR } from "@flow-as-code/cli/synth";
  -doc.meta = { generator: GENERATOR, sourceHash };
  +import { generator } from "@flow-as-code/cli/synth";
  +doc.meta = { generator: generator(), sourceHash };
  ```

  It returns the same `cli@<package version>` string. Calling it still throws
  when no manifest for this package can be found, which no install produces, and
  it does not fall back to a placeholder version: a plausible wrong number in
  `meta.generator` is the defect above in another form, and unlike an error
  nothing would report it.

  The internal `CLI_VERSION` binding became `cliVersion()` in the same way. It
  was never reachable from an export subpath, so no consumer can be holding it.
  - @flow-as-code/cdk@0.1.1
  - @flow-as-code/core@0.1.1
  - @flow-as-code/studio@0.1.1
  - @flow-as-code/tf@0.1.1

## 0.1.0

### Minor Changes

- 15f8886: Wire `export`, `simulate`, and `diff` to a live Amazon Connect instance.

  - `export --instance <arn>` writes a `<name>.flowdoc.json` and `<name>.flow.ts`
    pair per flow and module, with tokens in place of ARNs, `@keep` comments
    preserved, and `--on-error collect` as the default so one unexportable stock
    flow does not stop a first export.
  - `simulate <scenarios> --instance <arn>` validates a scenario file or directory
    against the packaged scenario schema, resolves every token through
    `--resource-map` before touching the instance, runs the suite within the
    documented TestCase limits, and writes a JUnit or JSON report. Exit 0 only
    when every scenario passed.
  - `diff <dir> --instance <arn>` compares each local FlowDoc with the live flow
    or module of the same name as canonical JSON, layout and meta ignored, and
    prints a unified diff per changed document. Exit 0, 1 for a difference, 2
    when the comparison itself failed.

  `@aws-sdk/client-connect` is an optional peer dependency, loaded only by these
  three commands; credentials come from the SDK's default provider chain and the
  Region from the instance ARN. The exit-64 deferred-command mechanism is removed.

- 15f8886: First developer preview.

  Typed authoring and a visual editor over one interchange format, FlowDoc, with
  CDK and Terraform as deploy targets and references carried as tokens rather
  than a translation table.

  - **core**: FlowDoc types and JSON Schema, typed builder blocks with
    compile-time error-branch enforcement, deterministic synth and serialization,
    dagre auto-layout, an eleven-rule lint engine that also builds browser-safe,
    codegen back to idiomatic TypeScript, map and binder materialization, export
    from a live instance, and a Connect Testing language compiler.
  - **cli**: lint, render, codegen, synth (in a sandboxed child process),
    emit, studio (the local bridge that serves the studio), and a file watcher
    with a dirty guard that never silently overwrites.
  - **cdk**: TokenBinder and the FlowSet construct, including module version
    publishing and alias repointing, plus the `/scaffold` entry behind
    `flow-cli emit --target cdk`.
  - **tf**: Terraform and OpenTofu emitter, validated against real OpenTofu.
  - **studio**: local-first canvas (@xyflow/react) over FlowDoc, with typed
    reference pickers, worker-based lint, a save gate that cannot be bypassed,
    Terraform, CDK, and raw JSON export, and a live code round-trip when served
    by `flow-cli studio`.

  Unknown Connect actions round-trip verbatim everywhere, so the modeled block
  set can stay small without the tooling losing content.

### Patch Changes

- 15f8886: Model the `GetParticipantInput` action as a DTMF menu block.

  - **core**: `GetParticipantInput` block class (optional Text, SSML or
    PromptId body, integer `timeoutSeconds` 1 to 180, one `Equals` branch per
    DTMF key, required `onTimeout`, `onNoMatch` and `onError` targets), registered
    in the action tables with `PromptId` as a prompt reference. Codegen inverts
    the exact shape the class emits and falls back to `GenericBlock` for the
    stored-input, Lex, validation and encryption forms. `prompt-length-3000`
    counts a menu body; `recording-consent-before-record` accepts a menu that
    plays one and, on a menu or a message, no longer counts an empty or blank
    `Text` or `SSML` as an announcement; `action-allowed-in-flow-type` restricts
    the action to contact, transfer, customer queue and module flows. Schema
    entry, a `dtmf-menu` round-trip fixture and lint fixtures land with it.
  - **studio**: the block is authored as a menu. Palette entry with the
    console's defaults; the inspector edits the body (Text, SSML, Prompt, or
    none: a menu may be silent) and the timeout, which is stored as the string
    Connect writes; a drag from the primary handle adds an `Equals` branch on the
    next free key (1 to 9, 0, `*`, `#`) and error drags wire the three errors in
    the class's order. `NextAction` mirrors the `NoMatchingCondition` target and
    the two edges move together, in either direction: dragging one away from a
    menu takes the other with it, and a next edge dropped on a menu whose
    no-match error already points elsewhere is refused as a clobber rather than
    retargeted. A branch that is not a single key, or a JSON number timeout, is
    refused by the demotion guard rather than saved generic.
    These gestures apply to the menu form only (`StoreInput` `"False"` or
    absent). The stored-input form (`StoreInput` `"True"`) stays a generic block
    on the canvas with the gestures every unmodeled block has: a primary drag
    authors `NextAction` when there is none, never a key branch, and error drags
    do nothing; the inspector does not offer `StoreInput`.
  - **cli**: bundled schema copy updated.

- Updated dependencies [15f8886]
- Updated dependencies [15f8886]
- Updated dependencies [15f8886]
- Updated dependencies [15f8886]
- Updated dependencies [15f8886]
  - @flow-as-code/core@0.1.0
  - @flow-as-code/studio@0.1.0
  - @flow-as-code/cdk@0.1.0
  - @flow-as-code/tf@0.1.0
