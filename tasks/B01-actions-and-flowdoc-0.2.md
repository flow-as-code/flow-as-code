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
