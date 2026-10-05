# @flow-as-code/tf

## 0.2.1

### Patch Changes

- Updated dependencies [7c63c5c]
- Updated dependencies [953b5ad]
  - @flow-as-code/core@0.2.1

## 0.2.0

### Minor Changes

- 81780fb: FlowDoc gains an optional `displayName`: the name Connect shows when it is not the slug in `name`. `name` stays the slug that names files and references; `displayName` is what a deploy names the Connect resource, and every path now uses it (`connectName(doc)`): the CDK construct's `Name`, `emitTf`'s `name`, and `@flow-as-code/hcl`'s new `display_name` attribute. Export writes it whenever the instance's name is not the slug it assigns, so a console flow called "Main Line" is exported as `name: "main-line"`, `displayName: "Main Line"`, and deploying the export keeps its name. The builder takes it as `FlowConfig.displayName` (1 to 127 characters, not blank).
- 0ca35a6: FlowDoc 0.2. The format gains the `view` reference type (`Refs.view(name, version?)`, version in the alias slot), `meta.sourceKind` (`ts` or `tf`), and an optional top-level `description` that the builder, `synth`, codegen and export all carry. `migrateFlowDoc` reads 0.1 and 0.2 and returns 0.2; the CLI, the studio, `FlowSet` and `emitTf` migrate every document on the way in, and the CLI and the studio validate a file against the schema of the version it names first. `synth()` and `exportFlow()` stamp `core@0.2`; `flow-cli synth`, `export` and the studio bridge stamp `meta.sourceKind`. `TokenBinder` gains an optional `view(name, version?)`.

  The auto-layout every tool assigns to an unplaced action is now an owned layered algorithm specified in `conformance/layout/README.md` (ADR-0005) rather than dagre, so a second implementation can reproduce it; `autoLayout(actions, start?)` takes the document's start action, `@flow-as-code/core` drops its only runtime dependency, and flows that relied on auto-layout are arranged differently on the canvas (hand-placed positions are untouched).

  Export reads `ListViews`, so a flow that shows an AWS-managed view (the stock after contact work flow) exports with a `${cdref:view:<name>@<version>}` reference instead of failing on an unknown ARN; `parseConnectArn` reads the view ARN form that nests under no instance, and `ConnectInventoryClient` gains `listViews()`.

### Patch Changes

- 2e9446a: Add the HCL contract under `conformance/hcl/`: the rules for writing a FlowDoc as a `flowascode_contact_flow` or `flowascode_contact_flow_module` resource and reading it back, twelve byte-exact round-trip goldens that are `tofu fmt` fixed points, seven regeneration cases for what a rewrite carries and keeps, the address sugar the TypeScript parser rewrites, and the error codes both implementations raise. A structural test in core holds every case to the documents and the catalog; a gated test in tf runs `tofu fmt -check` over the goldens.
- Updated dependencies [dfd5c3b]
- Updated dependencies [d0c8885]
- Updated dependencies [5b7db7a]
- Updated dependencies [4895560]
- Updated dependencies [40f33a7]
- Updated dependencies [f822c37]
- Updated dependencies [81780fb]
- Updated dependencies [1eeed56]
- Updated dependencies [07080eb]
- Updated dependencies [e3e131a]
- Updated dependencies [3f3f471]
- Updated dependencies [0ca35a6]
- Updated dependencies [2e9446a]
- Updated dependencies [5538b55]
- Updated dependencies [8ef9309]
- Updated dependencies [0282a03]
- Updated dependencies [ed22e85]
- Updated dependencies [e6ac8f3]
- Updated dependencies [b2d81ed]
  - @flow-as-code/core@0.2.0

## 0.1.2

### Patch Changes

- 4e3507e: Make the npm install path work end to end, and give it a first flow to open.

  `flow-cli synth` failed in any project whose package.json does not say `"type": "module"`, which is most of them: `npm init -y` writes `"type": "commonjs"` explicitly. The builder file was loaded as CommonJS, its `import` of `@flow-as-code/core` became a `require` of a package that ships only ES modules, and Node refused with `No "exports" main defined` naming a manifest inside `node_modules`. Since synth is the code-to-canvas half of the round trip, the studio's live sync went with it. The CLI now resolves a `.flow.ts` entry and its relative imports as ES modules whatever the nearest package.json says, and leaves the rest of the project's modules to load as they did. Where resolution still fails, the error names the builder file and the two remedies rather than a manifest the reader did not write.

  New: `flow-cli init [dir]`. It writes a demo FlowDoc, the typed `.flow.ts` that synthesizes to it, and, when nothing above the directory is already a package, a package.json marking the pair as modules. It refuses to overwrite and names every collision. The template ships inside `@flow-as-code/cli` and is byte-identical to the conformance demo. Before this, nothing an npm install produced was a document, so `studio`, `lint` and `emit` had nothing to open.

  Reference maps take three key forms wherever one is read: the whole token (`${cdref:queue:appointments}`), the bare `type:name`, and the variable name the Terraform emitter writes (`queue_appointments_arn`). `render --resources`, `simulate --resource-map` and `emit --target tf --address-map` accept the same spellings, so a map written for one is no longer rejected by the next for how it spells its keys. The values still differ by command, and the CLI's docs and its missing-key error now say so instead of implying one file serves all three. A missing key names all three forms it would have taken. The key and identifier rules moved into `@flow-as-code/core`, which had byte-identical copies of them in `@flow-as-code/tf` and `@flow-as-code/studio`; core also exports `token()` now.

  The studio opens the canvas at a size a reader can read. The initial fit no longer shrinks a whole flow to whatever the pane can hold, and zooming out by hand still reaches the same floor.

  Packaging metadata on all five: keywords, a homepage pointing at that package's own docs page on flow-as-code.dev instead of a GitHub subdirectory anchor, and CHANGELOG.md inside the published tarball, which none of them shipped at 0.1.0 or 0.1.1. npm metadata is immutable per version, so this release is the chance to fix it. Each README now also links the site and its own registry page.

- Updated dependencies [4e3507e]
  - @flow-as-code/core@0.1.2

## 0.1.1

### Patch Changes

- @flow-as-code/core@0.1.1

## 0.1.0

### Minor Changes

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

- Updated dependencies [15f8886]
- Updated dependencies [15f8886]
- Updated dependencies [15f8886]
- Updated dependencies [15f8886]
- Updated dependencies [15f8886]
  - @flow-as-code/core@0.1.0
