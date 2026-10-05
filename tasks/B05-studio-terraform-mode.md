# B05: studio Terraform mode

Phase B, the approved plan (settled decisions 5, 12 and 19).

## Acceptance criteria

- B05a: the open document's companion is visible (a badge, bridge store only); New flow takes a slug, flow or module, and the companion, and creates a minimal lint-clean document through `POST /bridge/docs`, refusing a taken name; the conflict dialog names the companion it is about; a `.flow.tf`'s `lint.disable` reaches lint as `LintOptions.disable`; the `.flow.tf` reader's sync warnings are shown; the demo's bridge stub keeps the real store's export surface. Tests: `newFlowUi`, `conflictUi` tf case, `studioState`, `lintProtocol`, `demoStubs`.
- B05b: a fourth export target, flowascode, behind the save gate, byte-identical to `flow-cli emit --target flowascode`, `tofu fmt`-clean, offline-scan clean, and browser-safe.

## Notes (2026-09-28, B05a)

- `DocRef` and a store's read carry `sourceKind` and `lintDisable`; `StudioState` holds both for the open document. A synced bridge payload carries the whole lint list (absent means none), so removing a `lint` block clears it; a sync the studio dispatches itself (a forced canvas write) names no companion and keeps what it had.
- The lint worker's `LintRequest.disable` filters out hard rules before calling core's `lint`, which now throws on one (the `fix(core)` commit before this). `validateDoc` (the save gate) runs the hard rules only, which no `disable` may touch, so it takes no list.
- New flow's documents are one `DisconnectParticipant` (a flow) or one `EndFlowModuleExecution` with `Settings: {}` (a module), laid out by the owned layout; both pass the schema and every lint rule, which the test asserts.
- The hosted demo is unaffected: the badge and New flow render only on a `BridgeStore`, and the demo build's bridge stub cannot be constructed.
- Neutered and watched red, then restored: the lint worker's hard-rule filter, passing `disable` to lint, taking a synced lint list whole, the bridge-only condition, and the dialog's companion choice.

## Notes (2026-09-28, B05b)

- `exportFlowascode` in `src/export/targets.ts` is `emitFlowascode` behind the save gate, and `buildExport` routes to it. The dialog's two Terraform radios share one address map and editor; the unmapped scan asks the emitter of the selected target, because the two resolve different references from the set (only `@flow-as-code/hcl` resolves an in-set module invoked without an alias), and a test builds exactly that set to show the scan's answer depends on the target.
- The studio depends on `@flow-as-code/hcl` (a devDependency, as `tf` and `cdk` are: the build bundles it). It is browser-safe throughout, so `vitest.config.ts` aliases its root to source and `tests/browserSafe.test.ts` holds the studio to that one specifier. The demo build carries no package name through it: its banner and header come from core's `PACKAGE_NAMES`, which the demo stubs.
- `offlineScan.ts` needed nothing: the package writes no URL.
- Parity: `tests/exportParity.test.ts` runs the built CLI's `emit --target flowascode` and compares file maps. `tests/exportTofu.test.ts` holds the export to `tofu fmt -check` under `RUN_TOFU_VALIDATE=1`; `tofu validate` waits for the provider on a registry (B03e).
- `DirectoryStore` (File System Access) still writes the document only; regenerating a companion in the browser is not in this plan.
- Neutered and watched red, then restored: the scan's choice of emitter, the shared address editor, `buildExport`'s route (red in the dialog's download test; the direct-call tests do not go through it), and the `format()` call that makes the emitted files fmt fixed points (red in the gated `tofu fmt` test).

## Notes (2026-09-30)

- The `tofu validate` this task left to B03e now runs: `tests/exportTofu.test.ts`
  validates the studio's flowascode export of the demo against the published
  provider, from OpenTofu 1.10, beside the `fmt` check it already had.
