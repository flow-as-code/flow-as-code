# A11 Studio: live code round-trip

Deliverables: `flow-cli studio` server (static app + file/watch bridge over the A04 engine); canvas edits regenerate paired TS via codegen; TS edits hot-reload the canvas; conflict dialog with side-by-side diff on dirty-both.
Acceptance: the Phase A definition of done in CLAUDE.md, first two clauses, demonstrably pass on the demo directory.

## Shipped (2026-08-31)

- `flow-cli studio [dir]` serves the built studio and a small JSON bridge from one `node:http` server. It binds 127.0.0.1 and only 127.0.0.1, picks a free port unless `--port` says otherwise, prints the URL, and logs one line per sync event. The assets are resolved through the studio package's own exports (`@criticaldynamics/flow-studio/dist/index.html`), because flow-cli is installed on its own and the studio is a sibling package there, not a sibling directory; a studio that is installed but not built fails with the build command in the message.
- Bridge protocol: `packages/cli/src/bridge/protocol.ts`, copied byte for byte to `packages/studio/src/store/bridgeProtocol.ts` because flow-cli depends on the studio and the reverse import would be a cycle. `src/bridge/protocol.test.ts` fails if the two differ, the same arrangement `src/schema.test.ts` uses for the packaged schema. Routes: `GET /bridge/info`, `GET /bridge/docs`, `GET /bridge/docs/<name>`, `PUT /bridge/docs/<name>`, `POST /bridge/docs/<name>/resolve`, `GET /bridge/events?cursor=<seq>`.
- The event stream is a long poll, not a websocket and not EventSource. It needs nothing but fetch, behaves identically in a browser and in a node test, and cannot half-close; the client holds one request open and resumes from the cursor the last batch returned, so an event published between two polls still arrives. An empty batch pauses briefly before re-polling, so a server that answers immediately cannot turn the loop into a busy wait.
- The studio knows it is served by a bridge because the server injects its description into the served `index.html` (`window.__FLOW_STUDIO_BRIDGE__`, with `<` escaped so a directory name cannot close the script tag). No probe request, so a static build (A14) still boots straight onto the demo store with no network call at all.
- `BridgeStore` (`src/store/bridgeStore.ts`) implements the A10 DocStore seam and runs `assertSaveable` before the request, exactly as `MemoryStore` and `DirectoryStore` do. The server validates independently against the packaged FlowDoc schema, because a gate that exists in only one process is a gate a bug walks around.
- Canvas save writes BOTH halves: flow-core `codegen` produces `<name>.flow.ts` with the existing file passed as `options.previous` (so `@keep` comments survive), and the FlowDoc is stamped with `meta.sourceHash` of the source just generated. That is what keeps the pair in sync for the A04 watcher's dirty guard; writing only the doc would leave a pair the watcher then reports as dirty in an unknowable direction.
- The watcher gained `noteWrite(name, contents)` so the bridge's own writes are recognized as its own instead of read as an external edit. It is called after both files land: chokidar's `awaitWriteFinish` window (50 ms) is orders of magnitude longer than the gap, and a write that throws leaves the ledger untouched.
- TS edit to canvas: the A04 watcher re-synths, the bridge reads the new document and publishes it, and the reducer swaps it in. The canvas is not remounted, so React Flow keeps the viewport, and the selection is kept whenever the selected block still exists in the new document.

## Conflicts: three ways in, one dialog

The dirty-both rule is `docs/02-studio-design.md`: show a diff, ask which side wins, never merge and never pick. Three states reach it:

1. The watcher finds the pair diverged on disk (both files edited outside the studio). Origin `disk`; both sides are files.
2. A canvas save arrives whose document was generated from a builder file that has since changed. `writePair` compares `meta.sourceHash` against the source on disk and refuses with `PairConflict`; the route answers 409 carrying both sides. Without this the save would silently overwrite an editor's work, because regenerating the source is what a save does. Origin `canvas`: the canvas side is the unsaved document in the browser, and nothing else has those bytes.
3. A builder-file edit arrives while the canvas has unsaved changes of its own. The reducer raises the same conflict rather than replacing the document, so the live round trip cannot eat unsaved work.

While a pair is in conflict the bridge answers every write with 409 and the Save button is disabled with the reason. The single write that passes is the forced one the dialog issues for "keep the canvas version", which is the user answering. "Keep the code version" is always `POST /resolve {"side":"code"}`: the FlowDoc is rewritten from the builder file, and the builder file is not regenerated, because the user chose the source they have.

The diff is over the canonical serialization (`src/model/docDiff.ts`), so key order and layout rounding are not differences a user is asked to arbitrate, and two sides that serialize identically say so instead of showing an empty diff. It is a plain LCS with the common prefix and suffix trimmed; a middle larger than a million cells degrades to "everything here changed" rather than allocating a matrix nobody can afford.

## Local-first and the shape of the server

- 127.0.0.1 is not configurable. This process writes files the user owns, so a bridge reachable from the network is a remote file writer.
- Binding loopback is not by itself protection against DNS rebinding, so the `Host` header is checked too: a request addressed to anything but localhost is refused. No CORS headers are ever sent.
- Added 2026-08-31, after the bridge was found cross-site writable: a per-run session token rides in the URL the CLI prints and every bridge API request must present it (assets are served without one so the page can boot), and a request carrying a foreign `Origin` or a `Sec-Fetch-Site` other than `same-origin` or `none` is refused. Withholding CORS headers stops a cross-origin page reading a response, not sending a CORS-simple `POST` (the `/bridge/export` write path); `src/bridge/forgery.test.ts` proves each guard by forging the request it stops.
- Documents are addressed by flow-core slug, never by path, which is what keeps `..` out of the file paths the server builds. Assets are served from one directory and every resolved path is checked to be inside it; `tests` attempt `../secret.txt`, encoded separators, and `/etc/passwd`.
- The studio still makes no outbound request. The bridge is same-origin, and the offline bundle test is unchanged.

## Also on this branch (A10 review findings)

- Delete no longer promises a detach it is about to refuse. `Inspector.onDelete` runs the mutation first: a refusal becomes a notice with no prompt at all, and the prompt only appears for a delete that will happen. It says the transitions' branches are removed from the blocks that hold them, which is what `deleteBlock` does.
- `normalizeOperands` in `model/capabilities.ts` is now the one rule for what a comma-separated operand field means, used by the inspector and by the branch a canvas drag creates. They disagreed: a drag authored `[""]` while the inspector refused to. Blanks between commas are still dropped; a field that is blank all the way through is the placeholder state, which is what the drag already created and what the schema's `minItems: 1` allows.
- Dangling transitions (a target Identifier no Action carries) are surfaced instead of being silently undrawable: `danglingTransitions` in `model/graph.ts`, a count on the source node, and `DanglingPanel` listing each one with a jump to its source. They are still preserved in the file and re-emitted verbatim.

## Notes and known trade-offs

- Two sessions on the same directory are consistent, not coordinated: each save publishes a `synced` event that the other tab adopts (or turns into a conflict if it has unsaved work). Multi-user editing stays out of scope (docs/02-studio-design.md).
- The event buffer holds the last 500 events. A client that is away longer than that misses the older ones; the next document it reads is still the current one, so the effect is a missed notification, not a wrong canvas.
- A `synced` event that arrives before the first document has finished loading is dropped, because the reducer routes events by the open document's name and there is no open document yet. The read that follows reads the same file, so the canvas is not stale; the cost is a missed notification during the first few milliseconds.
- `packages/cli/src/studio.test.ts` needs the studio built, like the two studio bundle tests: without `npm run build` it fails with the message that names the build command. CI builds before it tests.
- A document with no `meta.sourceHash` has no provenance to check, so a save regenerates its builder file without asking. `@keep` comments in that file still survive, since the existing text is passed to codegen either way.
- `flow-cli studio` depends on `@criticaldynamics/flow-studio`, which inverts the publish order the release plan gave: the studio has to be on npm before the CLI that serves it. That plan is corrected in this commit. (The plan then lived at `docs/04-release-and-positioning.md`; it has since moved to the private product repo.)
- The FlowDoc schema import in `model/validate.ts` carries an explicit `with { type: "json" }` attribute. It has to: `packages/cli/src/bridge/server.test.ts` imports the studio's BridgeStore across the package boundary (testing the server against a hand-rolled client would leave the half the app uses untested), and that pulls the file into the NodeNext compilation in `tsconfig.test.json`, where a bare JSON import is an error.
