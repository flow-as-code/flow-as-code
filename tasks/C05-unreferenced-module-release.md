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
