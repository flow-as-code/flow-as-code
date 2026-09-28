# B05: studio Terraform mode

Phase B, plan `/Users/austinrose/.claude/plans/let-s-make-a-plan-glowing-sphinx.md` (settled decisions 5, 12 and 19).

## Acceptance criteria

- B05a: the open document's companion is visible (a badge, bridge store only); New flow takes a slug, flow or module, and the companion, and creates a minimal lint-clean document through `POST /bridge/docs`, refusing a taken name; the conflict dialog names the companion it is about; a `.flow.tf`'s `lint.disable` reaches lint as `LintOptions.disable`; the `.flow.tf` reader's sync warnings are shown; the demo's bridge stub keeps the real store's export surface. Tests: `newFlowUi`, `conflictUi` tf case, `studioState`, `lintProtocol`, `demoStubs`.
- B05b: a fourth export target, flowascode, behind the save gate, byte-identical to `flow-cli emit --target flowascode`, `tofu fmt`-clean, offline-scan clean, and browser-safe.

## Notes (2026-09-28, B05a)

- `DocRef` and a store's read carry `sourceKind` and `lintDisable`; `StudioState` holds both for the open document. A synced bridge payload carries the whole lint list (absent means none), so removing a `lint` block clears it; a sync the studio dispatches itself (a forced canvas write) names no companion and keeps what it had.
- The lint worker's `LintRequest.disable` filters out hard rules before calling core's `lint`, which now throws on one (the `fix(core)` commit before this). `validateDoc` (the save gate) runs the hard rules only, which no `disable` may touch, so it takes no list.
- New flow's documents are one `DisconnectParticipant` (a flow) or one `EndFlowModuleExecution` with `Settings: {}` (a module), laid out by the owned layout; both pass the schema and every lint rule, which the test asserts.
- The hosted demo is unaffected: the badge and New flow render only on a `BridgeStore`, and the demo build's bridge stub cannot be constructed.
- Neutered and watched red, then restored: the lint worker's hard-rule filter, passing `disable` to lint, taking a synced lint list whole, the bridge-only condition, and the dialog's companion choice.
