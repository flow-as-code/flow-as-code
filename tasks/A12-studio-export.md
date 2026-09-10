# A12 Studio: export targets

Deliverables: in-app export to CDK (flow-cdk scaffold), Terraform (flow-tf with address-map editor UI), and raw materialized JSON against a chosen resource map.
Acceptance: TF export of the demo with a completed address map passes `terraform validate`; CDK export compiles; raw export deploys to a sandbox via UpdateContactFlowContent.

## Status: done

`src/export/` in flow-studio holds the three targets (`targets.ts`), the map editors' model (`refMap.ts`), the document set (`docSet.ts`), and delivery (`deliver.ts`); `ExportDialog.tsx` is the UI behind "Export as…". `runExport` is the single entry point and every button goes through it.

### Parity is by construction, then tested

No emitter is reimplemented. The CDK scaffold moved to `@criticaldynamics/flow-cdk/scaffold` and is now the one generator behind both `flow-cli emit --target cdk` and the studio button; Terraform is `emitTf` from the new `@criticaldynamics/flow-tf/emit` subpath (the package index carries `writeTf`, which imports `node:fs` and cannot be bundled); raw is flow-core's `materializeWithMap` plus `serializeContent` with `flow-cli render`'s file names.

`tests/exportParity.test.ts` runs the BUILT CLI as a subprocess and compares bytes for all three targets, including `--out` into a subdirectory (which proves the studio's subdirectory arithmetic equals node's `path.relative`, since the scaffold's `FLOW_DOCS` depends on it), and compiles the studio's scaffold with `tsc --noEmit`.

### Acceptance, and where each is pinned

| Criterion                                                         | Test                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| TF export equals the emitter's file map for the same inputs       | `tests/exportTargets.test.ts`, against conformance/emit-tf goldens  |
| ... and passes `tofu validate`                                    | `tests/exportTofu.test.ts` (RUN_TOFU_VALIDATE=1, flow-tf's harness) |
| CDK export is byte-identical to the CLI and passes `tsc --noEmit` | `tests/exportParity.test.ts`                                        |
| Raw export with a complete map leaves no `${cdref:`               | `tests/exportTargets.test.ts`                                       |
| ... and with an incomplete map lists every missing token          | `tests/exportTargets.test.ts` (union across the set)                |
| The address-map editor rejects a literal ARN inline               | `tests/exportUi.test.tsx`, `tests/exportRefMap.test.ts`             |
| No target can export a document failing a hard lint rule          | `tests/exportGate.test.ts`, against the functions, not the buttons  |
| Both delivery paths emit identical bytes                          | `tests/exportDeliver.test.ts`                                       |
| The bridge writes only inside the served directory                | `packages/cli/src/bridge/server.test.ts`                            |

Conformance fixtures are the existing ones rather than new: `conformance/emit-tf/demo-complete-map` and `demo-incomplete-map` supply the address maps, the golden trees, and the `validate/` provider stubs; `conformance/materialize/demo-with-map` supplies the resource map and the materialized golden. Nothing about the cross-language contract changes here, so a new case would have been a copy.

### Notes

- "Which references are still unmapped" is asked of the emitter, by reading back the `# TODO: no terraform address for …` lines it writes, rather than restating flow-tf's resolution rules. A module reference the set itself emits therefore needs no address, and the editor does not ask for one.
- The emit-tf CI job now runs the studio project too, and a test in each package asserts the job still names it, so neither tofu gate can go quiet.
- Deferred: the sandbox half of the original acceptance line (raw export deploying through `UpdateContactFlowContent`) stays with the gated integration job; the studio writes the file, and pushing it to an instance is `flow-cli`'s and the export path's business, not a browser's.
