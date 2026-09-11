# B01 Action catalog, modeled-set expansion, FlowDoc 0.2, owned layout

Deliverables: `conformance/flow-language/catalog.json` as the machine-readable action contract for every documented type, with `packages/core/src/actions.ts` held to it by test and the catalog-bound lint rules reading it; FlowDoc 0.2 (`view` ref type, `meta.sourceKind`, optional `description`) with a migration and every reader migrating on read; an owned integer layered auto-layout replacing dagre, specified under `conformance/layout/`; the `view` export fix; 21 more modeled action types, one commit per type, each with its catalog entry, actions.md row, builder block, verified inverter, inspector and palette entries, schema constraints, and fixtures.
Acceptance: every table in actions.ts equals the catalog and the check is proven able to fail; every conformance fixture reads `flowdoc: "0.2"` and a 0.1 document migrates on every read path; `conformance/layout` cases pass and no golden carries dagre output; the stock after-contact-work flow exports; `synth(codegen(doc))` round-trips for every new type's fixture; lint plus the full suite green in CI.

## Sub-tasks

| #    | Scope                                                               |
| ---- | ------------------------------------------------------------------- |
| B01a | Catalog, `snakeCaseKey`, catalog paths, catalog-driven lint rules   |
| B01b | FlowDoc 0.2: schema, migration, `view`, `sourceKind`, `description` |
| B01c | Owned layout replaces dagre; `conformance/layout`; ADR-0005         |
| B01d | Export: `ListViews` inventory and the managed-view reverse map      |
| B01e | Contact routing group (5 types)                                     |
| B01f | Flow control group (6 types)                                        |
| B01g | Contact data group (5 types)                                        |
| B01h | Participant group (3 types); re-author `roundtrip/unknown-actions`  |
| B01i | UpdateContactRecordingAndAnalyticsBehavior                          |
| B01j | UpdateFlowLoggingBehavior; retarget the passthrough exemplar        |

## Assumptions

- The four category pages of the Connect Developer Guide are the authority on which action types exist; recounted on 2026-09-11 at 56 (27 contact, 6 participant, 15 flow control, 8 interactions).
- For the fourteen types modeled before this task, the catalog records exactly what actions.md and the builder already do; nothing about their lint behaviour changes, and the existing conformance/lint fixtures are the proof.
- The in-package copy of the catalog is refreshed by `npm run sync:schema` and lives under `packages/core/src/` because the lint rules that read it run in the studio's worker, where nothing may read the filesystem.

## Notes (2026-09-11, B01a)

- Landed `conformance/flow-language/catalog.json` (56 types, 14 modeled entries transcribed from actions.md and blocks.ts), `packages/core/src/{catalog,hcl-names,paths}.ts`, `refPathsOf` and `readRefPath` in refs.ts, and the catalog-driven `error-branches`, `prompt-length-3000` and `recording-consent-before-record`. Messages are byte-identical to before; the lint fixtures did not change.
- `catalog.test.ts` is written as a `catalogProblems()` function so the same checks run against the real catalog (expected empty) and against seven deliberate mutations (expected non-empty). The proof that the guard can fail is therefore a permanent test rather than a one-off in a pull request.
- `UpdateContactTargetQueue`: the action page marks QueueId and AgentId each optional and forbids both together, so the catalog records `atMostOne`; the builder's requirement of one is the builder's choice, not Connect's.

## Notes (2026-09-11, B01b)

- FlowDoc 0.2 landed as a derived schema (`flowdoc-0.2.schema.json`, 0.1 frozen byte for byte), `migrateFlowDoc` in core, and migration on every read path: `loadDocs` and the bridge's `parseDoc` in the CLI, `parseFlowDoc` in the studio, `FlowSet`'s loader, and `emitTf`'s entry. The CLI and the studio validate against the schema of the version a file names, then migrate, so a 0.1 file keeps the rules it was written to.
- `view` joins the token grammar with its version in the alias slot; `TokenBinder.view` is optional so existing binders compile. `description` is a document field, not a companion-only argument, so the studio, TypeScript and (later) HCL agree on it; export reads it from `DescribeContactFlow`.
- 61 JSON fixtures and 8 test files moved to `"0.2"`; `tests/flowdocVersion.test.ts` sweeps the repository so no 0.1 literal can return outside `conformance/migrate/`.

## Notes (2026-09-11, B01c)

- The owned layout (`conformance/layout/README.md`, `packages/core/src/layout.ts`, ADR-0005) replaced dagre. `autoLayout` gained an optional `start` parameter, because the walk begins at `StartAction` and the first action is not always it; every caller passes the document's start. Keys come back in document order, as before.
- Fifteen fixtures carried dagre coordinates (the demo and its four copies and goldens, four round-trip cases, three lint cases with content metadata, the materialize demo case) and were regenerated once; the derived goldens followed (`materialize/demo-with-map/expected.content.json`, three emit-tf `.tftpl` files, two CDK template snapshots). The recorded live fixture `conformance/export/demo-instance/flows/cccc3333-...-0001.json` carries the demo's positions in its Metadata, because it is the demo as deployed, so its positions moved with the demo; every other export input is hand-placed and did not.
- The six layout cases' expected positions were worked by hand from the specification before the implementation ran against them; `layout.test.ts` holds the implementation to them and to the grid the four constants define.
- `@flow-as-code/core` has no runtime dependency now.

## Notes (2026-09-11, B01d)

- `ListViews` joined the inventory (no `Type` filter; page maximum 100), `parseConnectArn` reads the AWS-managed `view/<name>:<version>` form that nests under no instance, `buildReverseMap` maps views, and `rewriteArns` carries the ARN's version into the token's alias slot. A non-slug version (`$LATEST`) stays an unknown ARN.
- `conformance/export/managed-view/` records the stock after contact work flow exporting; `conformance/materialize/view-with-version/` records the token resolving back to the versioned ARN. The fixture assumes ListViews returns the bare name and the version-less ARN for an AWS-managed view; the live integration test now asserts the stock flow exports, and the fixture is corrected to the API's real shape if the assumption is wrong. Still to verify live.
- `unknown-arns` keeps an inventory with no views, so the same ARN there is still reported as unknown: the two cases together prove both paths.

## Notes (2026-09-11, B01e)

- Each type lands in its own commit with the same set of surfaces: the catalog entry (both copies), the actions.md row, reference table entry, constraint and parameter shape, the actions.ts facts held by catalog.test.ts and actions.test.ts, the block class, the inverter with its codegen tests, the schema's per-type constraints, the studio inspector and palette entries, `conformance/roundtrip/contact-routing` and the lint fixtures the type affects. The group's fixture is a module, because no single flow type admits all five actions: queue-to-queue transfer is customer-queue only and transfer to agent is transfer-flow only.
- `DequeueContactAndTransferToQueue`: the page's "not supported in any other type of flow" names flow types, and a module has none, so MODULE stays under the convention recorded above `IN_MODULE` in actions.ts; the research verifier read the sentence as excluding modules and the reading here is recorded so it can be revisited. `NextAction` is not mentioned on the page and is wired from the admin guide's Success outcome. The block accepts a queue, an agent queue, or neither (the contact's current target queue), which the class writes as `{}`.
- `TransferContactToAgent`: terminal, with no parameters and no errors on the page, so it joins `TERMINAL_ACTIONS` and the terminal-blocks rule accepts a transfer flow that ends in it. The page's "in only transfer to agent and transfer to queue flows" is read as the other exclusive restrictions are: MODULE stays.
- `UpdateContactRoutingBehavior`: results and errors are both "None", the first modeled non-terminal action with no error branch. `WITHOUT_CATCH_ALL` in actions.ts records that, `catalogProblems` now derives the expected builder and required errors from it instead of assuming a catch-all (with a mutation test that adds one), the studio stops offering an error handle for such a type (`offersErrorBranch`), and number fields gained `optional` and `clears` so the two mutually exclusive integers can be edited without leaving both set. The 2^63-1 ceiling from the admin guide is not a JSON number JavaScript can carry, so the catalog and the builder record only the floor of 1. Its studio test exposed a gap older than the type: a block inserted from the palette and wired by drags carried `{ NextAction, Errors }` with no `Conditions`, so codegen's byte comparison never matched a block class and the block stayed generic until a save and re-synth wrote the arrays back. Mutations now write an edited action's transitions in synth normal form, and a wired palette block is typed at once.
- `CreateCallbackContact`: the console emits it from the Transfer to queue block's callback tab, not from the Set callback number block the action page links; the row in actions.md says so. The three integers have no JSON example on any page and are modeled as JSON numbers; a console export is the check. `CallerId` is a claimed phone number, not a reference type, so it is a plain string the schema does not constrain. The studio's starting values (60 s, 1 attempt, 600 s) are the studio's, inside the page's bounds; the admin guide states no console defaults.
- `UpdateContactCallbackNumber`: two named errors and no catch-all, so it joins `WITHOUT_CATCH_ALL` and both are required; the page does not say either is required, and the reading is that a number the instance cannot dial with nowhere to go is the failure the rule exists to catch. `conformance/roundtrip/unknown-actions` still carries one with an undocumented `Routing` parameter and a `NoMatchingError`, which the inverter refuses, so the fixture's passthrough guarantee holds until B01h re-authors it with an unmodeled type; a codegen test pins that.
