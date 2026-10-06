# C05 Releasing a module nothing in the set references

Phase C, emitters. Both emitters derive a module's aliases from the flows in
the same set that invoke it (`aliasesByModule`):

- flowascode (`packages/hcl/src/emit.ts`): a module no flow in the set
  references gets its `flowascode_contact_flow_module` resource and no version
  and no alias.
- flat Terraform (`packages/tf/src/emit.ts`): the module and an
  `awscc_connect_contact_flow_module_version` are written, and no alias.

A module released on its own, to be bound from another root through the
address map (`${cdref:module:name@alias}` resolved per environment), therefore
has its version and alias written by hand, as
`examples/terraform-provider/cookbook/module-release.tf` does today.

The showcase needs this shape: its greeting modules are released through a
`live` alias in their own root, and the flows bind to that alias by map, so
switching the greeting is a change to one binding and rolling it back is the
reverse.

## Acceptance criteria

- A decision recorded here, with its reason, between: (a) a way for a set to
  declare the aliases a module publishes when nothing in the set invokes it,
  for example an emit option; (b) the hand-written shape as the supported one,
  held by test. Any option that changes the FlowDoc format goes through its
  versioning.
- If (a): both emitters honor it; the flowascode output uses the same
  `content_hash` and `create_before_destroy` shape as an invoked module; the
  flat Terraform output is `tofu validate`-clean in the emit-tf lane;
  `conformance/emit-tf/` and `conformance/hcl/` gain a case each; the provider
  re-vendors and passes, with its commit recorded here.
- If (b): the cookbook recipe names the case, and a test holds that the
  emitters write no alias for an unreferenced module, so the documented
  behavior cannot drift silently.
- Either way, `packages/tf/README.md`, `packages/hcl/README.md` and docs/06 say
  what happens to an unreferenced module.
- A changeset for each package whose output moved.

## Record (2026-10-05)

Done on branch `feat/c05-unreferenced-module-release`, stacked on C13 and
C12. The decision is **(a), an emit option**, and the reason: the showcase's
shape (greeting modules released through a `live` alias in a root of their
own, flows binding the alias by map) is the shape the emitters already write
for an invoked module, down to `content_hash` and `create_before_destroy`,
so the only thing missing was a way to say which aliases a module publishes
when no flow in the set says it for the emitter. Holding the hand-written
copy as the supported shape (b) would have left every such root maintaining
a second copy of what the emitter knows how to write, which is the gap the
showcase reported. Nothing in the FlowDoc format changes: the aliases a
module publishes are a property of a deployment, not of the document, so
they are an emit option, not a document field.

- **The option.** `moduleAliases: { "<module>": ["<alias>", ...] }` on
  `emitFlowascode` and `emitTf`, and `--module-alias module:<name>@<alias>`
  on `flow-cli emit`, repeatable, on both Terraform targets (refused on
  `cdk`, as `--address-map` is). The value is the key a flow in another root
  binds, so the flag reads as "publish what `module:greeting@live` binds
  to". A module publishes the union of the aliases the set's flows invoke it
  through and the declared ones, sorted, once each; a module not in the set,
  or an alias that is not a slug, is refused with the problem listed.
- **The shape.** Both emitters write a declared alias exactly as an invoked
  one: a test on each holds everything from the module resource on byte for
  byte equal between a set where a flow invokes `module:greeting@live` and a
  set where the option declares it. On flowascode that is the version
  resource keyed to `content_hash` with `create_before_destroy`, and the
  alias resource; on the flat target the awscc version and alias. The
  version comment in `flows.tf` now says the aliases are those invoked or
  declared, which moved the `module-set` golden by two comment lines.
- **The alias ARN is an output.** `outputs.tf` (C13) adds
  `<module>_<alias>_arn` per published alias, the alias resource's `arn`,
  which is what the other root's address map binds; the showcase's
  hand-written `greeting_standard_live_arn` output is this. Rule 29 names
  it; the `module-set` outputs golden gained two.
- **Unreferenced and undeclared is unchanged, and now held by test:**
  flowascode writes the module resource alone; the flat target writes the
  module and a version and no alias. `packages/tf/README.md`,
  `packages/hcl/README.md`, `packages/cli/README.md`, docs/03 and docs/06
  say so, and the cookbook's `module-release.tf` names the flag that writes
  its shape.
- **Fixtures.** `conformance/emit-tf/module-release` and
  `conformance/hcl/emit/module-release`: one module nothing invokes,
  `options.moduleAliases` declaring `live`, an empty address map, `validate:
pass` with the providers pinned as the other cases pin them (awscc for the
  flat target's alias, flowascode alone for the provider's). The flat
  target's output is `tofu validate`-clean in the emit-tf lane through the
  existing gated test over every case; the provider-shaped output through
  `packages/hcl/src/validate.test.ts`.
- **The provider re-vendor criterion is not met and stays open** until the
  Phase C release batch re-vendors `conformance/` into the provider
  repository and its commit is recorded here; everything else in this task
  is done. Its emit runner plans the new case's `flows.tf` like the others,
  so nothing here is expected to need a change there beyond the re-vendor.

Changeset: `.changeset/unreferenced-module-release.md` (`@flow-as-code/hcl`,
`@flow-as-code/tf` and `@flow-as-code/cli` minor).

## Status (2026-10-05)

Merged as #34 (`e37f171`, 2026-10-05 18:15 UTC) into its base branch,
`feat/c13-emit-per-flow-outputs`, not into main: it was stacked on C13, and
C13's branch was merged into C12's branch (#32) after C12 had already
reached main through #29, so neither #32 nor #34 moved main. Both reached
main through #39 (`8b00b1b`, 21:22 UTC), opened from C13's branch and
retargeted to main. `tasks/README.md`, "Lessons", records the rule. The
provider re-vendor above is still pending and is C11's.

- Provider re-vendor landed: terraform-provider-flowascode #10, merge commit d69bd14 (2026-10-06), vendoring flow-as-code 78b0a87 (conformance identical to main at fe3e3d6), unit and sandbox acceptance lanes green. Unreleased by owner decision: it ships with Phase D as the next minor (D10).
