# C12 Emit: unbound references, unused map keys, the provider constraint

Phase C, emitters. Three gaps in how `flow-cli emit` reports what an address
map does and does not cover, found while building the showcase.

- **An unbound reference exits 0 on the flowascode target.** The flat
  Terraform target writes a `TODO_MISSING_ADDRESS_*` placeholder
  (`packages/tf/src/emit.ts`), an undeclared reference that `tofu validate`
  refuses. The flowascode target writes the binding as `null` under a TODO
  comment (`packages/hcl/src/emit.ts`, `bindingsFor`), which validates, exits
  0, and is refused only at plan or apply time, when the provider names the
  key. flowascode is the path the showcase deploys through, and it holds the
  gap in its own test (`tests/envEmit.test.ts`, which fails on a `null`
  binding under the emitter's TODO comment).
- **An address-map key no reference uses is ignored silently.** A typo in a
  key, or a key left behind when a flow stopped using it, emits nothing and
  says nothing. `flow-cli watch` already reports a `refs` entry no action
  references; `emit` does not.
- **The emitted `versions.tf.example` says `>= 0.1`** for the flowascode
  provider (`FLOWASCODE_PROVIDER_CONSTRAINT` in `packages/hcl/src/contract.ts`),
  while the provider tutorials and the cookbook say `~> 0.1`. A 0.x minor may
  change the schema, so the example should not admit one.

## Acceptance criteria

- `flow-cli emit --target flowascode` exits non-zero when any reference is
  unbound, naming each key and the documents that make it, unless a flag
  (for example `--allow-unbound`) keeps today's behavior for a partial map.
  The decision on the default, and the flag's name, is recorded here; the
  flat target's behavior is stated beside it in `packages/cli/README.md`.
- `flow-cli emit`, on either target, warns on stderr for each address-map key
  no reference in the set uses, and exits 0 for that alone; `--strict`
  makes it an error. A test covers both.
- `FLOWASCODE_PROVIDER_CONSTRAINT` is `~> 0.1` (or whatever the docs settle
  on, the same in both places), and a test holds the example and the docs to
  one string.
- `conformance/hcl/` gains a case for an unbound reference if the emitted
  bytes change; the provider re-vendors and passes, with its commit recorded
  here.
- A changeset for `@flow-as-code/cli` and `@flow-as-code/hcl`.

## Record (2026-10-05)

Done on branch `feat/c12-emit-bindings-diagnostics`. The decisions, and the
reason for each:

- **An unbound reference on `--target flowascode` is an error by default.**
  `flow-cli emit --target flowascode` exits 1, writes nothing, and lists each
  key with the documents that make it (`  - queue:appointments (referenced by
appointment-line)`), because the `null` binding it would otherwise write
  validates and is refused only at plan time. Nothing is written on a refusal
  so the message is the whole diagnosis, rather than a message beside a
  half-usable tree. The flag that keeps the old behavior is
  `--allow-unbound`: the partial map is written with each unbound key as
  `null` under the TODO comment, the shape to review or to finish binding in
  the file. `--allow-unbound` is accepted on `--target tf` and changes
  nothing there, since the flat target's `TODO_MISSING_ADDRESS_*`
  placeholder is already the loud form and fails `validate` (the decision
  "Considered and not taken" in `tasks/README.md` records), so a script that
  emits both targets with one flag list can keep one. `packages/cli/README.md`,
  "emit", states the flat target's behavior beside the flowascode one. The
  library is unchanged in what it writes: `emitFlowascode` and `emitTf` now
  return `unbound` (key and sorted document names) and `unusedMapKeys` beside
  `files`, and the CLI decides the exit code, so the studio's export, which
  takes the bytes, is untouched. A refused run touches nothing on disk, not
  even `--out`, which is created only when there is something to write.
- **The showcase's invariant test breaks on the new default, by design.**
  `tests/envEmit.test.ts` in `hollow-hour-example-typescript` has a probe,
  "would catch an unbound reference", that emits a partial map on the
  flowascode lane with no flag and expects a TODO or a `null`; under C12 that
  emit exits 1 and writes nothing, so the probe fails (`npm run check` exits
  1, an AssertionError at `tests/envEmit.test.ts:262`, verified on review).
  Before the showcase pins the release carrying C12 it must pass
  `--allow-unbound` on that lane, or assert the exit code and the message
  instead; that follow-up is filed in the satellite, and C07 and C09 note it
  where they bump the pin. The showcase's other lanes are unaffected: a
  complete map emits as before.
- **`--strict` is not for the showcase yet.** Against its current flows,
  `emit` reports six keys its address maps carry that no flow references
  (`hours:the-dead`, `lambda:district-for-address`, `lambda:plane-check`,
  `lambda:prank-score`, `prompt:salt-line-tips`, `queue:the-dead`): the maps
  are written for the whole design and the flows that use those keys land
  in its T2. Until then those are six warnings per emit, and `--strict`
  would refuse the run.
- **An unused address map key is a warning on either target, an error under
  `--strict`.** One stderr line per key (`warning: address map key
"queue:apointments" matches no reference in the set`), exit 0; `--strict`
  exits 1 and writes nothing. A key counts as used when any reference in the
  set reaches it by any of its three forms, including one the set resolves
  itself and so ignores (the module-set case's map entry), because that is a
  key that means something, not a typo. `--strict` is scoped to the warnings
  the command emits, which today is this one. Both flags are refused on
  `--target cdk` as `--address-map` is.
- **The constraint is `~> 0.1`**, in `FLOWASCODE_PROVIDER_CONSTRAINT`, in
  `FLOWASCODE_EMITTED_CONSTRAINT` (held equal by the existing test) and in
  rule 28, the string the tutorials, the cookbook and every example root
  already asked for. It is `>= 0.1, < 1.0`: it excludes the major that may
  change the schema and admits a 0.x minor, and the emit-tf lane validating
  against the published provider is what reports a minor that stops
  accepting the output. The pinned-lane canary test that asserted every
  emitted constraint starts with `>=` now treats the flowascode provider as
  the exception it is. A new test in `packages/hcl/src/emit.test.ts` scans
  `docs/tutorials/*.md` and `examples/**/*.tf` for the provider's
  `required_providers` entry and holds each to the constant.
- **No new `conformance/hcl/emit` case.** The bytes an unbound reference
  emits did not change; `demo-incomplete-map` already is that case. Instead
  every emit case's `case.json` carries `unbound` and `unusedMapKeys`, held
  by the emitter test, and `demo-complete-map`'s address map (the hcl copy
  only; the emit-tf copy that `cli.test.ts` hands to `render` is untouched)
  gained a key no reference uses. The four `versions.tf.example` goldens
  changed for the constraint.
- **Pending, the Phase C release batch:** the provider re-vendors
  `conformance/` (its runner reads only `docs` and `expected/flows.tf` from
  an emit case, so the new fields and the map key change nothing it checks)
  and its commit is recorded here.

Changeset: `.changeset/emit-bindings-diagnostics.md` (`@flow-as-code/cli`
and `@flow-as-code/hcl` minor, `@flow-as-code/tf` minor for the result
fields).

## Status (2026-10-05)

Merged to main in #29 (`8322121`, 2026-10-05 18:08 UTC); its run,
37353765499, passed. The provider re-vendor above is still pending and is
C11's.

- Provider re-vendor landed: terraform-provider-flowascode #10, merge commit d69bd14 (2026-10-06), vendoring flow-as-code 78b0a87 (conformance identical to main at fe3e3d6), unit and sandbox acceptance lanes green. Unreleased by owner decision: it ships with Phase D as the next minor (D10).
