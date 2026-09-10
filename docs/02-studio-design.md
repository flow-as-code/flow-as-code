# @flow-as-code/studio design

A local-first visual editor over FlowDoc, with live bidirectional sync to typed builder code, and CDK or Terraform files as the export targets. This goes one step past both the Connect console (visual, but ARN-bound and instance-bound) and FlowLang (typed code and console round-trip, but proprietary and not IaC-native): visual editing whose output is IaC.

## Delivery

- Primary: `flow-cli studio [dir]` starts a local Vite-built app plus a small file/watch server on 127.0.0.1. Works on a directory of FlowDocs and TS builder files. See "The bridge" below.
- Later (backlog): the same webview packaged as a VS Code custom editor for `*.flowdoc.json`.
- A hosted read-only demo (static build, the demo FlowDoc baked in) for marketing; no backend. Built by `npm run build:demo` and deployed at https://flow-as-code.dev/studio/ , see docs/05-hosted-demo.md.

## Canvas

- React Flow (`@xyflow/react` 12). One node per Action; edges per transition, error edges styled distinctly. Deterministic dagre auto-layout for docs without `layout`.
- Palette groups mirror the Connect console taxonomy (Interact, Set, Branch, Integrate, Terminate) but only blocks `@flow-as-code/core` models are insertable; everything else renders as a read-only GenericBlock with raw JSON inspection.
- Reference fields are typed pickers, not text: choosing a queue creates/uses `${cdref:queue:...}`. A refs sidebar lists every token in the doc with usage counts. Literal ARN entry is rejected in the UI (same rule as lint).
- Inline lint: the lint engine runs in a worker on every change; findings badge nodes and list in a panel. The studio can never save a doc that fails `no-literal-arn` or `no-unresolved-token`.

## Bidirectional sync (the core trick)

- Studio edits write FlowDoc. The save also runs `codegen` to regenerate the paired `<name>.flow.ts`, and stamps the document with `meta.sourceHash` of the source it just generated, so the pair is in sync for the watcher.
- Opening a directory writes the missing half. A document with no `<name>.flow.ts` beside it gets one before the server starts serving, through the same `codegen` path a canvas save uses, stamped the same way. Without it a directory of documents alone (an export from an instance, a file copied out of `conformance/`, a file a colleague sent) had nothing to edit, so the loop below could not start there until the user saved from the canvas once. Generating it on open is safe because codegen is deterministic: the bytes are the ones the first save would have written. An existing builder file is never touched, and a document that codegen refuses is named on the terminal and skipped so the rest of the directory still opens. The watcher is then told those exact bytes are the server's own, so its first scan cannot read the new pair as a divergence.
- Edits to `<name>.flow.ts` trigger `synth` (executed in a sandboxed child process) regenerating FlowDoc; the canvas hot-reloads without a page reload, keeping the viewport and the selection. The inspector's free-text fields commit on blur, so they hold a draft; a document that changes underneath one resets its draft. Uncommitted keystrokes lose to text that reached disk, because the alternative is committing text the document has never seen and writing it back over the file that changed.
- The served directory needs no `node_modules`. A generated builder file imports `@flow-as-code/core` by package name, and the synth child falls back to `@flow-as-code/cli`'s own copy when the directory cannot resolve it (packages/cli/src/synth-resolve-hook.ts). A copy installed next to the file still wins. Without this the loop above only worked inside a project that already depended on `@flow-as-code/core`.
- Dirty guard via `meta.sourceHash`: if both sides changed since last sync, the studio shows a diff and asks which side wins. No silent merges. That covers three states: the two files diverged on disk, a save whose builder file has moved underneath it, and a builder-file edit arriving while the canvas holds unsaved changes. All three get the same dialog, and saving is blocked until the user answers. So is editing: the dialog covers the whole shell and the reducer refuses a mutation while it is open, because the answer writes one of two frozen documents and an edit made behind it would be in neither. Keeping the canvas side is a write from the browser, so it runs the save gate first and the dialog names what the gate refused rather than leaving a dead button and a message in the header behind it.
- Codegen is the hard part done well: one inline block construction per Action in document order, so the Identifier is the stable name and nothing is renamed or reordered on the way through; comments preserved via a `// @keep` convention; byte-stable output. Round-trip invariants are CI-tested (see CLAUDE.md).

## The bridge (`flow-cli studio`)

The browser cannot write files, so the CLI does. One `node:http` server serves the built studio and a small JSON API; the studio talks to it through the DocStore seam and nothing else in the app touches persistence.

- `GET /bridge/info`, `GET /bridge/docs`, `GET /bridge/docs/<name>`, `PUT /bridge/docs/<name>`, `POST /bridge/docs/<name>/resolve`, `GET /bridge/events?cursor=<seq>`, `POST /bridge/export`.
- `POST /bridge/export` takes a target and a relative-path-to-content map the studio has already emitted, and writes it under the served directory. Every path is checked twice, against the protocol's path rule and then by resolving it and requiring the result to be inside that directory. It pairs nothing, publishes no event, and overwrites only what it writes, because emitted terraform and CDK files are output rather than documents.
- The event stream is a long poll carrying the watch engine's `synced`, `conflict`, and `error` events, enriched with the document (or both sides of the conflict). An `error` is a builder file that did not become a FlowDoc, so the canvas and that file have stopped agreeing: the studio shows the first line of it as a toast and keeps an out-of-sync badge naming the file until that document syncs again. The terminal running `flow-cli studio` prints the whole message plus the stack frames that point at files the user wrote; frames inside `node_modules` and node's own internals are dropped, because a transform failure's stack is ten frames of esbuild and stream internals under a line that already names the file, line and column. The badge is width-capped, so its visible label stops at the file name and the sentence that says what is wrong is its `aria-label` and its tooltip, with the message cut to its first line and the absolute path inside it reduced to that same file name. Undoing a broken edit clears it: a builder file restored to the bytes of the last successful sync emits `synced` even though nothing was rewritten, because otherwise the badge outlives the state it reports. No websocket library and no EventSource: a long poll needs nothing but fetch and behaves the same in a browser and in a test.
- The protocol is one file, `packages/cli/src/bridge/protocol.ts`, copied byte for byte into the studio because `@flow-as-code/cli` depends on the studio for its assets and the reverse import would be a cycle. A test fails if the copies differ.
- The server injects its own description into the served `index.html`, so the studio knows it has a bridge without probing for one and a static build makes no request at all.
- Local-first is enforced by shape: 127.0.0.1 only and not configurable, the `Host` header checked against localhost (loopback alone does not stop DNS rebinding), a per-run session token carried in the printed URL that every bridge API request must present (assets need none, so the page can boot), refusal of any request carrying a foreign `Origin` or a `Sec-Fetch-Site` other than `same-origin` or `none`, no CORS headers, documents addressed by slug rather than path, and every asset path checked to be inside the one served directory. SECURITY.md records the threat model.
- Writes go through the CLI, which is the only thing that touches disk, and both processes validate: the studio runs its save gate before the request and the server validates against the packaged FlowDoc schema again.

## Export targets (in-app buttons and CLI parity)

- CDK: writes/updates a stack file using `@flow-as-code/cdk` (FlowSet + TokenBinder scaffold with TODO bindings for each ref type).
- Terraform: invokes `@flow-as-code/tf` (see docs/03-tf-emitter.md).
- Raw: materialized Flow JSON against a chosen resource map (for console import via API, debugging).

All three run over the whole document set, which is what the IaC targets mean: one terraform configuration, one binder covering every reference type in the set. Parity with the CLI is enforced by construction and then tested. The generators are shared modules rather than reimplementations (`@flow-as-code/cdk/scaffold` behind both the CLI's `emit --target cdk` and the studio's button, `@flow-as-code/tf/emit`, `@flow-as-code/core`'s `materializeWithMap`), and a test in `@flow-as-code/studio` runs the built CLI as a subprocess and compares the bytes.

Terraform needs an address per reference, so that target carries a map editor: every reference in the set with its type and name, an address field each suggesting the resource type that reference actually needs, and a count of what is still unmapped. A literal ARN is refused inline, the same rule the ref pickers apply to parameters. What counts as unmapped is read back from the emitter's own TODO output rather than recomputed, so a reference the set resolves itself needs no entry. The raw target's resource map is the opposite case and takes ARNs, since its output is deployable Flow language; an incomplete map refuses the export and lists every missing token.

Exporting is a write path, so it runs the same save gate as a save: a document failing a hard lint rule or the schema cannot be exported by any target, and the check lives in the export functions rather than in the buttons.

Delivery has two ends and one code path. Under `flow-cli studio` the emitted file map is POSTed to the bridge, which writes it (the CLI is the only thing that touches disk, and it re-checks every path); with no bridge the browser downloads the files, folding each directory into the file name because a browser cannot create one. The bundle is built once, before either end sees it.

## Explicitly out of scope for v1

Multi-user editing, cloud storage, Connect console import-file parsing (not Flow language), TF-to-FlowDoc reverse parsing, telemetry.
