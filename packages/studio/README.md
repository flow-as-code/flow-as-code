[![flow-as-code](https://flow-as-code.dev/logo.png)](https://flow-as-code.dev/)

# @flow-as-code/studio

```
npm i @flow-as-code/studio
```

Apache-2.0, Node 22.12 or newer. A read-only build of this editor is deployed at
https://flow-as-code.dev/studio/ with the demo flow loaded (docs/05-hosted-demo.md).

Site and docs: <https://flow-as-code.dev/>. This package on npm:
<https://www.npmjs.com/package/@flow-as-code/studio>.

Implements docs/02-studio-design.md. React Flow canvas over FlowDoc with a palette of modeled blocks, per-type inspector panels, typed ref pickers that reject literal ARNs, a refs sidebar with usage counts, worker-based inline lint, and a save gate enforced at every write path. Unknown Connect actions render as GenericBlocks with a read-only raw JSON inspector and rewireable transitions.

The save gate is `assertSaveable` in `src/model/validate.ts`: it checks the hard lint rules (no-literal-arn, no-unresolved-token) and the FlowDoc schema from `conformance/`, and it runs inside `MemoryStore.write`, `DirectoryStore.write`, `BridgeStore.write`, the Export-as-download path, and every export target. The Save and Export buttons only reflect that rule; they read both halves of it, so a schema-invalid doc disables Save rather than failing at write time.

## The demotion invariant

codegen falls back to `new GenericBlock({...})` for any Action a block class cannot reproduce exactly. That is right for unmodeled Connect actions and wrong as the result of a canvas gesture: the block silently loses typed authoring, and neither lint nor the schema nor the save gate can see it.

`src/model/demotion.ts` answers "which Actions would codegen emit as GenericBlock?" by running `@flow-as-code/core`'s real codegen and reading the answer back, rather than restating the inverter rules. `src/model/mutations.ts` wraps every exported mutation in that check: if a block that existed before the edit would come out generic after it, the mutation throws `MutationRefused` naming the blocks and what to do instead. A block the gesture just created is exempt, because nothing was lost and lint already guides the user to wire it. `tests/mutationGuard.test.ts` enumerates the module's exports and fails if a mutation is not wrapped, so one added later is guarded by construction.

Refusals are shown, never swallowed: `commit()` in `src/state/studio.tsx` turns both a `MutationRefused` and a plain `undefined` result into a transient `NoticeBar` message. Deleting a block that other blocks still point at is refused rather than repaired, because repairing means inventing a destination for someone else's transition; the message names the neighbours and the fix is to rewire those edges first.

Local-first: the demo FlowDoc and the FlowDoc schema are baked in at build time, files open via the browser or the File System Access API where available, and the built bundle carries zero network dependencies (test-enforced). Persistence goes through the DocStore seam in `src/store/types.ts`. VS Code custom-editor packaging is a backlog item reusing this webview.

## What it publishes

The tarball is `dist` and nothing else: the Vite bundle, its assets, and
`index.html`. Every import is resolved at build time (the bundle contains no
bare specifiers), and the only consumer is `flow-cli studio`, which reads this
package's `package.json` and `dist/index.html` and serves the directory. So the
manifest declares no runtime `dependencies` at all: React, React Flow, ajv and
the three `@flow-as-code/*` packages are `devDependencies`, since they are
inputs to the build rather than things an installer must fetch. They were
runtime dependencies until A13, which would have made every `npm install
@flow-as-code/cli` pull React and React Flow that nothing
loaded.

## Export targets

"Export as…" in the toolbar covers the three targets in docs/02-studio-design.md, over the whole document set rather than the open document alone (that is what the IaC targets mean: one terraform configuration, one binder). The open document is taken from the canvas, so unsaved edits are included; the rest are read from the store.

| Target        | What it writes                                                                | What you supply                   |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| **Terraform** | `@flow-as-code/tf`'s file map: `flows.tf`, `flow_refs.tf`, `flows/*.tftpl`, … | a terraform address per reference |
| **CDK**       | `flow-stack.ts`, a `FlowSet` stack with a TODO `TokenBinder`                  | nothing                           |
| **Raw JSON**  | `<name>.json` per document, materialized Flow language                        | a resolved value per reference    |

Parity with the CLI is the feature, not a side effect. The studio does not reimplement an emitter: the CDK scaffold is `@flow-as-code/cdk/scaffold`, the same generator behind `flow-cli emit --target cdk`; Terraform is `emitTf` from `@flow-as-code/tf/emit`; raw is `@flow-as-code/core`'s `materializeWithMap` plus `serializeContent`, with `flow-cli render`'s file names. `tests/exportParity.test.ts` runs the BUILT CLI as a subprocess and compares bytes, because "they call the same function" is what a parity test must not assume, and `tests/exportTofu.test.ts` runs the studio's own Terraform output through `tofu validate` on `@flow-as-code/tf`'s harness (gated on `RUN_TOFU_VALIDATE=1`, as `@flow-as-code/tf`'s are).

The address-map editor lists every reference in the set and refuses a literal ARN inline, the same rule the ref pickers apply to parameters: a terraform address is an expression that resolves to an ARN at apply time, never the ARN itself. What is still unmapped is asked of the emitter rather than recomputed, by reading back the `# TODO: no terraform address for …` lines it writes, so a reference the set resolves itself (a module it also emits) is correctly not asked for. The resource map for raw export is the opposite case and accepts ARNs, because that output is deployable Flow language; an incomplete map refuses the export and names every missing token, not the first.

Exports run the save gate. `src/export/targets.ts` calls `assertSaveable` on every document before emitting anything, so no target can write a document that fails a hard lint rule or the schema, and `tests/exportGate.test.ts` asserts that against the export functions rather than against the buttons.

Delivery is one code path with two ends (`src/export/deliver.ts`). Served by `flow-cli studio`, the file map is POSTed to `/bridge/export` and the CLI writes it, because the bridge is the only thing that touches disk; without a bridge the browser downloads each file, folding the directory into the name (a browser cannot create one) while the dialog lists where each belongs. The bundle is built once, before either sink sees it, so the two cannot drift.

The studio bundles `@flow-as-code/cdk` and `@flow-as-code/tf` for those targets, but only their browser-safe entry points: `@flow-as-code/tf/emit` is the pure emitter, while the package index also carries `writeTf`, which imports `node:fs`. `tests/browserSafe.test.ts` fails on a node builtin anywhere in `src/`, because the tests run in node and would not otherwise notice.

## Read-only stores and the hosted demo

`DocStore.readOnly` marks a store whose `write` always refuses. `ReadOnlyStore` in `src/store/readOnlyStore.ts` wraps any store that way, and `defaultStore` boots the demo through it when `DEMO_BUILD` (`src/demoBuild.ts`, true only under `vite build --mode demo`) is set. The canvas still edits, because the document in memory is the app's own copy; the toolbar hides Save, Open file, Open folder, and the FlowDoc download, shows a "Read-only demo" badge, and labels dirty state as "edited in this tab". "Export as…" stays and its sink becomes `PreviewExportSink`: the same bundle every other sink receives, returned as text and shown in the dialog instead of downloaded. The static build itself is described in docs/05-hosted-demo.md.

## The bridge (served by `flow-cli studio`)

`BridgeStore` in `src/store/bridgeStore.ts` is the DocStore over the local `flow-cli studio` server, and it is what makes the round trip live. The browser cannot write files, so a save is a `PUT` and the CLI writes both the FlowDoc and the regenerated `<name>.flow.ts`. `assertSaveable` runs here before the request, exactly as it does in the other stores, and the server validates the document again on its side.

The app knows it has a bridge because the server injects a description into the served `index.html` (`src/store/bridgeProtocol.ts`, `BRIDGE_GLOBAL`), which is read synchronously at boot. There is no probe request, so a static build makes no network call at all and still opens the built-in demo. The protocol file is a byte-for-byte copy of `packages/cli/src/bridge/protocol.ts`; a test in `@flow-as-code/cli` fails if the two drift.

Live updates arrive on a long poll (`subscribe`), and a builder-file edit reaches the canvas without a reload: React Flow keeps the viewport because the canvas is not remounted, and the selection survives whenever the selected block still exists.

Conflicts are a question, never a merge. `ConflictModal` shows a side-by-side diff of the two FlowDocs (`src/model/docDiff.ts`, over the canonical serialization) and the user picks a side; until then `state.conflict` is set and every write path is blocked. Three states raise it: the two files diverged on disk, a save whose builder file has moved since the document was generated from it (the bridge answers 409), and a builder-file edit arriving while the canvas holds unsaved edits, which the reducer turns into the same dialog instead of replacing the document.

Develop with `npm run dev`, test with `npm test` (pure model tests plus happy-dom smoke tests), build with `npm run build`. Three files need a build first: `tests/bundle-offline.test.ts`, which fails with a message naming the command when `dist/` is missing, and `tests/bundle-boot.test.tsx` and `tests/exportParity.test.ts`, which skip silently rather than repeating it. The demo build (`npm run build:demo`, `dist-demo/`, docs/05-hosted-demo.md) has the same arrangement: `tests/demo-bundle.test.ts` fails one test naming the command, `tests/demo-boot.test.tsx` skips.
