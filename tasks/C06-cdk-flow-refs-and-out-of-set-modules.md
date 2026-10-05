# C06 CDK: same-set flow references in event hooks, and out-of-set modules

Phase C, emitters. Two shapes the showcase uses work on the Terraform and
flowascode paths and not, or not provably, on CDK. The owner dropped CDK for
the showcase, so this task is about the CDK package's own coverage, not a
dependency of the showcase.

1. A reference to another flow in the same set, as when
   `UpdateContactEventHooks` points a hook at a whisper flow. `FlowSet`
   resolves module references itself; a same-set flow reference goes through
   the binder's `flow()`, which would have to return a `Lazy.string` over the
   set's flows. That was seen to synthesize outside this repository and is
   untested here.
2. An out-of-set module alias bound per environment (`${cdref:module:x@live}`
   with no module `x` in the set). `FlowSet` throws on it.

## Acceptance criteria

- Shape 1: a `packages/cdk` test that synthesizes a set in which one flow's
  event hook references another flow in the set, and asserts that the
  template carries a reference to that flow's resource (no literal ARN) and
  the dependency between them. A set whose flow references form a cycle fails
  at synth with a message naming the cycle, not with a CloudFormation error at
  deploy.
- Shape 2: either `FlowSet` accepts an out-of-set module reference that the
  caller binds per environment, with a test, or it refuses with a message that
  names the reference and says what to do instead, with a test. The choice is
  recorded here.
- `examples/promote-across-environments/` still typechecks and its tests pass.
- `packages/cdk/README.md` states both behaviors; a changeset for
  `@flow-as-code/cdk`.

## Assumptions

- No conformance fixture is expected: CDK has no Go counterpart. If one turns
  out to be needed, it lands in the same commit, as for every builder feature.
- A deploy to a live instance is not required. If one is made, it follows A07
  and is recorded here with its date.

## Result (2026-10-05)

Shape 1: `FlowSet` resolves a `${cdref:flow:name}` whose flow is in the set
itself, to `CfnContactFlow.attrContactFlowArn` with an explicit dependency,
the way it already resolved a module reference to its alias, and the way the
tf and flowascode emitters resolve their own documents. The binder's `flow()`
is not consulted for a flow in the set, so no `Lazy.string` is needed for the
dead-line pattern inside one set; across two `FlowSet`s in one stack the
binder may return a `Lazy.string` over the other set's `flows`, and a test
proves that resolves to the right `Fn::GetAtt`. Creation order is one
dependency order over flows and modules together (modules first, names break
ties), so the template is stable however the files were read. A cycle fails
at synth with `Flow reference cycle: a -> b -> a.` and the remedy; a
self-reference is a cycle of one.

Shape 2: accept. `TokenBinder` gains an optional `module(name, alias)`,
called only for a module not in the set, with the alias the token pins or
`live`, so a caller binds it per environment from a map or an import. A module
in the set shadows the binder. Without the method, synth fails naming the
token, the document and both remedies. Refusing was the alternative; accepting
matches the emitters, where an out-of-set module comes from the address map,
and is what the showcase's layout (a shared module in one stack, lines in
another) needs. The scaffold writes `module` and `flow` only for names the set
does not hold, and `view` when a document shows one, which it had not before.

Tests: `packages/cdk/src/flow-set.test.ts` (two new describe blocks, one new
snapshot) and `packages/cdk/src/scaffold.test.ts`. No conformance fixture:
CDK has no Go counterpart, and nothing in `conformance/` changed. No deploy
was made.

## Status (2026-10-05)

Merged to main in #28 (`3bd04c4`, 2026-10-05 17:26 UTC); its run,
37348490241, passed.
