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
