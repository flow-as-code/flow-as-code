# C16 Builder and codegen: an unaliased module reference

Phase C, core and studio. Issue #41. The showcase's second tier
(hollow-hour-example-typescript#10) bound a module in its own set without an
alias and could not write it in the builder: `Refs.module(name, alias)`
requires an alias (`packages/core/src/refs.ts:90`), and codegen leaves an
unaliased `${cdref:module:<name>}` generic (`packages/core/src/codegen.ts:474`,
"Refs.module requires an alias"). The token grammar admits the form
(`TOKEN_PATTERN`, alias optional on every type), and every emitter binds it in
some way. The showcase is where the gap surfaced, not the evidence for it.

Like C12 to C15, this is a tool gap the showcase exposed, so it is Phase C
work; "Why a separate phase" in `tasks/README.md` is about Phase D's new
types and does not apply to it.

## Owner decisions (2026-11-23)

1. Supported end to end, not refused in the emitters. C16 lands before D10,
   which gains it as a dependency.
2. An unaliased module ref means the module's current content: the bare
   module ARN. Whether `@flow-as-code/cdk` changes its default alias `live`
   to match is a separate decision, not part of this task.

## What the form means today

The three deploy paths bind it differently:

- `@flow-as-code/hcl` (flowascode): an in-set module resolves to the module
  resource's `arn`, the bare module ARN (`tasks/B03-hcl-package-and-cli.md`,
  line 40). This already matches decision 2.
- `@flow-as-code/cdk`: binds it to the module's default alias `live`
  (`DEFAULT_MODULE_ALIAS` in `packages/cdk/src/binder.ts`; docs/01, line 22).
  This differs from decision 2, and stays as it is under this task.
- `@flow-as-code/tf`: resolves only the aliased form in set; an unaliased
  module is an external reference bound to an address the user supplies
  (B03, line 40; docs/01, line 22).

What Connect does with each qualifier was settled on the sandbox through the
TestCase API (`tasks/B04-terraform-provider.md`, line 45; contract rule 27):
`<module>:<alias id>` runs the aliased version, `<module>:<version>` that
version, the bare ARN the module's current content, and `<module>:<alias
name>` nothing. A flow bound to the bare ARN therefore runs whatever the
module holds now, which is what the showcase wanted for a module deployed by
the same apply.

## Acceptance criteria

- docs/01 states that an unaliased module ref means the module's current
  content (the bare ARN), with the B04 evidence as the reason. It says that
  `@flow-as-code/cdk` binds it to `live` instead, and that changing that
  default is its own decision, because a CDK behavior change is a release
  note, not a side effect.
- `Refs.module(name, alias?)`: the alias is optional, and without it the token
  is `${cdref:module:<name>}`. Existing calls with an alias are unchanged.
- Codegen reads an unaliased `InvokeFlowModule` back as `Refs.module("<name>")`,
  byte-stable, and no longer leaves it generic.
- `@flow-as-code/tf` either resolves an unaliased in-set module to the
  `awscc_connect_contact_flow_module` resource's ARN, or this file records why
  it stays external.
- Fixtures in the same commit: a `conformance/roundtrip/` case holding an
  unaliased module invocation (synth(codegen(doc)) equals doc), an HCL golden
  under `conformance/hcl/roundtrip/` with its `case.json`, and codegen and
  refs unit tests.
- The studio's ref picker (`packages/studio/src/components/RefPicker.tsx`)
  offers a module without an alias.
- The catalog's ref description and the generated skill reference
  (`node scripts/build-skill-reference.mjs`) say the alias is optional.
- The provider re-vendors the new fixtures and passes, with its commit
  recorded here.
- Changesets for `core` and `studio`, and for `tf` if it changes.
- The issue is closed from the merge, with a link to this file.

## Assumptions

- No FlowDoc version bump: the grammar already admits the form and every
  reader parses it.
- The showcase's `live` alias workaround is removed in its own repository,
  not here.

## Not done here

- Changing `@flow-as-code/cdk`'s `DEFAULT_MODULE_ALIAS` (decision 2).
