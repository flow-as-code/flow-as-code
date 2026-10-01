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
