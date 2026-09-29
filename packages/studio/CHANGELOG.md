# @flow-as-code/studio

## 0.2.0

### Minor Changes

- d0c8885: `flow-cli` learns the `.flow.tf` companion. `codegen --to tf` writes a document as a `flowascode_contact_flow` resource (without `--to`, the kind the document's `meta.sourceKind` names), keeping an existing file's `@keep` comments, `refs` bindings and carried attributes; `synth` reads a `.flow.tf` back in process; `export --author tf` writes one per exported document; `emit --target flowascode` writes a document set for the flowascode provider; and the new `convert --to ts|tf` switches a document's companion, carrying `@keep` comments across and printing what the new companion does not carry. `@flow-as-code/core` exports `extractKeepComments`, and `codegen` takes `options.keep` in place of the comments `previous` holds. `init --author tf` scaffolds a `.flow.tf`, and `flow-cli studio` and the watch engine pair a document with either companion: a `.flow.tf` edit re-syncs the document in process, a canvas save regenerates it keeping its bindings and settings, and a name with both companions is refused. The studio bridge protocol is version 2, in both byte copies: payloads carry `sourceKind` and a `.flow.tf`'s `lintDisable`, a write result names its companion as `sourcePath` and `sourceText` (was `tsPath` and `tsText`), a conflict names `sourcePath` and `sourceKind`, synced events carry the `.flow.tf` reader's warnings, `flowascode` joins the export targets, and `POST /bridge/docs` creates a document with the companion it names. The watch engine's events and `noteWrite` take `sourcePath`, `sourceKind` and `sourceContent` in place of `tsPath` and `tsContent`. In the studio, the toolbar badges the open document's companion, New flow creates a document with the companion the user picks, a `.flow.tf`'s `lint.disable` list reaches the lint panel (never for a hard rule), and what reading a `.flow.tf` noticed shows as a notice. "Export as…" offers a fourth target, "Terraform (flowascode provider)", byte-identical to `flow-cli emit --target flowascode` and sharing the Terraform address map. `convert` refuses to discard companion edits the document lacks unless `--force`, and `codegen` restamps the document it pairs with.
- 40f33a7: Model the contact-data actions: `TagContact` (up to six user-defined tags, with the catch-all the service requires although the page lists none), `UntagContact` (static keys; the service's spelling, the page's `UnTagContact` being refused on the wire), `UpdateContactTextToSpeechVoice` (a Polly voice with an optional engine in the console's capitalised spelling and an optional speaking style, each static or a JSONPath, and an optional catch-all), `UpdateContactData` (name, description, language, customer id, references, the Voice ID settings and an optional target contact, in the page's string spellings), and `UpdateContactEventHooks` (one event hook to a flow, the first map-valued reference), each as a builder block, a codegen inverter, a catalog entry, FlowDoc 0.2 schema constraints, and an insertable studio block.
- f822c37: Model the contact-routing actions: `DequeueContactAndTransferToQueue` (queue-to-queue transfer in a customer queue flow), the terminal `TransferContactToAgent`, `UpdateContactRoutingBehavior` (queue priority or time adjustment; the first modeled non-terminal action with no error branch, so `error-branches` now reads the catalog's required flags rather than assuming a catch-all), `CreateCallbackContact` (a callback contact with its delays, attempt count, optional queue, creation flow and caller ID), and `UpdateContactCallbackNumber` (a JSONPath number with two named errors and no catch-all, both of which `error-branches` requires), each as a builder block, a codegen inverter, a catalog entry, FlowDoc 0.2 schema constraints, and an insertable studio block with its inspector fields.
- 3f3f471: Model the flow-control actions: `Loop` (a 0 to 100 count, static or a single JSONPath, with its two fixed conditions and NextAction mirroring the done path, the count a decimal string as the console writes it, the catch-all optional as the console sometimes writes it), `Wait` (a timeout written as the console's `TimeLimitSeconds` decimal string, static or a JSONPath, the events that may interrupt it, one condition per event, and `ParticipantNotFound` exactly when a bot participant is waited for), `DistributeByPercentage` (branches as percentages, written as the console's chain of NumberLessThan thresholds), `UpdateFlowAttributes` (attributes written as the console's `{ Value }` objects with the catch-all every console export carries), `CheckMetricData` (a staffing or queue metric with its comparisons, its two errors read by type since the console writes them in either order), and `GetMetricData` (queue metrics for a queue, an agent queue or the target queue, narrowed to a channel), each as a builder block, a codegen inverter, a catalog entry, FlowDoc 0.2 schema constraints, and an insertable studio block. The catalog gained a `dynamic` marker for parameters whose page also accepts a JSONPath. In the studio, a block with fixed conditions (`CheckHoursOfOperation`, `Loop`) now gets them from drags on its primary handle, one operand at a time, and NextAction mirroring follows the catalog for every type that mirrors an error or a condition, so retargeting a `CheckHoursOfOperation`'s out-of-hours branch carries NextAction along instead of being refused.
- 0ca35a6: FlowDoc 0.2. The format gains the `view` reference type (`Refs.view(name, version?)`, version in the alias slot), `meta.sourceKind` (`ts` or `tf`), and an optional top-level `description` that the builder, `synth`, codegen and export all carry. `migrateFlowDoc` reads 0.1 and 0.2 and returns 0.2; the CLI, the studio, `FlowSet` and `emitTf` migrate every document on the way in, and the CLI and the studio validate a file against the schema of the version it names first. `synth()` and `exportFlow()` stamp `core@0.2`; `flow-cli synth`, `export` and the studio bridge stamp `meta.sourceKind`. `TokenBinder` gains an optional `view(name, version?)`.

  The auto-layout every tool assigns to an unplaced action is now an owned layered algorithm specified in `conformance/layout/README.md` (ADR-0005) rather than dagre, so a second implementation can reproduce it; `autoLayout(actions, start?)` takes the document's start action, `@flow-as-code/core` drops its only runtime dependency, and flows that relied on auto-layout are arranged differently on the canvas (hand-placed positions are untouched).

  Export reads `ListViews`, so a flow that shows an AWS-managed view (the stock after contact work flow) exports with a `${cdref:view:<name>@<version>}` reference instead of failing on an unknown ARN; `parseConnectArn` reads the view ARN form that nests under no instance, and `ConnectInventoryClient` gains `listViews()`.

- 0282a03: Model `UpdateFlowLoggingBehavior` (Enabled or Disabled, no error branches) as a builder block, a codegen inverter, a catalog entry, a FlowDoc 0.2 schema constraint and an insertable studio block. The class writes the bytes its GenericBlock form wrote, so no document changes; the demo flow is modeled end to end, and GenericBlock passthrough is exercised by the `unknown-actions` conformance fixture instead.
- e6ac8f3: Model the participant actions: `MessageParticipantIteratively` (a loop of text, SSML, prompt or S3 audio messages, with an optional interrupt every so many seconds and an optional catch-all, holding the participant with no next action as the console's hold flows do), `ConnectParticipantWithLexBot` (the Lex V2 form: an optional body, the bot alias, session attributes, an initial message, a timeout and one branch per intent), and `ShowView` (a view by reference, its data, a hidden transcript, the required time limit and one branch per view action, its next action mirroring the catch-all as the admin guide's JSON writes it), each as a builder block, a codegen inverter, a catalog entry, FlowDoc 0.2 schema constraints, and an insertable studio block. The catalog gained `waits`, and `terminal-blocks` accepts an action that holds the participant with nothing wired as an end, so the console's own hold and queue flows lint clean. The studio's inspector edits a view's reference and version as two fields of ViewResource, and its reference picker offers a version when it creates a view reference.
- b2d81ed: Model `UpdateContactRecordingAndAnalyticsBehavior` in its voice recording form (the recorded participants and IVR recording) or its screen recording form, one per block as the service requires, with the catch-all and `ChannelMismatch` the page always requires, as a builder block, a codegen inverter, a catalog entry whose recording enabler the consent rule reads, FlowDoc 0.2 schema constraints, and an insertable studio block. The chat form and the voice analytics settings stay generic; `error-branches` reports the chat form's `InFlightRedactionConfigurationFailed` through the catalog's new `requiredWhenKey`.

## 0.1.2

### Patch Changes

- d5b8a54: Show a narrow-viewport notice instead of a broken layout. Below 700 CSS pixels the studio now opens with a short explanation that it is built for a desktop screen and what the palette, inspector and canvas need the width for, rather than a three-column editor squeezed to nothing. It is not a lock: two controls and Escape close it for the rest of the visit, and it is a real modal while it is up, taking focus, keeping Tab inside itself and giving focus back on close. It keys off the viewport, not the input device, so a small window on a laptop sees it too and widening the window takes it away with no reload. The hosted read-only demo adds the sentence saying so and a link back to the site root; the studio `flow-cli studio` serves says neither, because that one writes to your own files and has no site above it.
- 4e3507e: Make the npm install path work end to end, and give it a first flow to open.

  `flow-cli synth` failed in any project whose package.json does not say `"type": "module"`, which is most of them: `npm init -y` writes `"type": "commonjs"` explicitly. The builder file was loaded as CommonJS, its `import` of `@flow-as-code/core` became a `require` of a package that ships only ES modules, and Node refused with `No "exports" main defined` naming a manifest inside `node_modules`. Since synth is the code-to-canvas half of the round trip, the studio's live sync went with it. The CLI now resolves a `.flow.ts` entry and its relative imports as ES modules whatever the nearest package.json says, and leaves the rest of the project's modules to load as they did. Where resolution still fails, the error names the builder file and the two remedies rather than a manifest the reader did not write.

  New: `flow-cli init [dir]`. It writes a demo FlowDoc, the typed `.flow.ts` that synthesizes to it, and, when nothing above the directory is already a package, a package.json marking the pair as modules. It refuses to overwrite and names every collision. The template ships inside `@flow-as-code/cli` and is byte-identical to the conformance demo. Before this, nothing an npm install produced was a document, so `studio`, `lint` and `emit` had nothing to open.

  Reference maps take three key forms wherever one is read: the whole token (`${cdref:queue:appointments}`), the bare `type:name`, and the variable name the Terraform emitter writes (`queue_appointments_arn`). `render --resources`, `simulate --resource-map` and `emit --target tf --address-map` accept the same spellings, so a map written for one is no longer rejected by the next for how it spells its keys. The values still differ by command, and the CLI's docs and its missing-key error now say so instead of implying one file serves all three. A missing key names all three forms it would have taken. The key and identifier rules moved into `@flow-as-code/core`, which had byte-identical copies of them in `@flow-as-code/tf` and `@flow-as-code/studio`; core also exports `token()` now.

  The studio opens the canvas at a size a reader can read. The initial fit no longer shrinks a whole flow to whatever the pane can hold, and zooming out by hand still reaches the same floor.

  Packaging metadata on all five: keywords, a homepage pointing at that package's own docs page on flow-as-code.dev instead of a GitHub subdirectory anchor, and CHANGELOG.md inside the published tarball, which none of them shipped at 0.1.0 or 0.1.1. npm metadata is immutable per version, so this release is the chance to fix it. Each README now also links the site and its own registry page.

## 0.1.1

## 0.1.0

### Minor Changes

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

- 15f8886: Static read-only demo build of the studio, and one module for the npm package names.

  - **core**: `package-names.ts` exports `PACKAGE_SCOPE` and `PACKAGE_NAMES`;
    codegen, the cdk scaffold, the tf banner, and the CLI read the
    specifiers from it. Output is unchanged.
  - **studio**: `DocStore.readOnly`, `ReadOnlyStore`, and `PreviewExportSink`,
    so a store without a write path still edits in memory and previews exports
    as text. `npm run build:demo` writes `dist-demo/`: relocatable asset paths,
    the bridge client and the package names swapped for stubs, no modulepreload
    polyfill, and a Content-Security-Policy meta tag with `connect-src 'none'`.
    Tests scan the artifact for network primitives, absolute URLs, and the
    package name, and boot it with every network entry point stubbed to throw.
    See docs/05-hosted-demo.md.

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
