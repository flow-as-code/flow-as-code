# @flow-as-code/studio

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
