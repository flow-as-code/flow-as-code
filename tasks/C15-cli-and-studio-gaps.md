# C15 CLI and studio gaps from the showcase's first tier

Phase C, cli and studio. Building the showcase's first tier
(`flow-as-code/hollow-hour-example-typescript`, its `tasks/T1-first-night.md`) against
the published 0.2.0 set turned up a list of gaps. Three tasks already hold
part of it:

- C12: `flow-cli emit --target flowascode` exits 0 with an unbound reference
  (it writes `null` under a TODO comment), ignores address-map keys no
  reference uses, and its `versions.tf.example` says `>= 0.1` where the docs
  say `~> 0.1`.
- C13: the flowascode emitter writes no per-flow outputs.
- C14: simulate's `scenarioProblems` is not exported, there is no dry run
  that validates scenarios offline, and `expect-transfer` matches a queue by
  name, not by token.

This task holds the rest. Each item is a fact about the tools; the showcase
found it and is never the evidence for it.

- **`lint` and `emit` take one directory or file.** The argument is
  `<dir-or-file>` (`packages/cli/src/bin.ts`). The showcase has two sets
  (`flows/`, `seasonal/`) and runs each command twice. Running them
  separately is also what keeps each set's cross-document rules scoped to
  that set, so a multi-directory run must not merge sets silently.
- **The CLI does not expose `instanceIdExpression`, or a way to skip
  `variables.tf`.** `@flow-as-code/hcl`'s `emit` takes
  `instanceIdExpression` and writes `variables.tf` only without it
  (`packages/hcl/src/emit.ts`); `flow-cli emit` passes neither, so a root
  that declares `connect_instance_id` itself copies `flows.tf` alone out of
  the emitted tree.
- **Codegen output is not Prettier-formatted, and its banner is fixed.**
  `generatedMarker` in `packages/core/src/codegen.ts` writes two fixed lines
  at a print width of 100. A consumer with its own Prettier config has to
  list every companion in `.prettierignore`, and a generator that owns a
  FlowDoc cannot say so in the companion's banner.
- **The studio has no marker for a FlowDoc a generator owns.** The showcase
  stamps `meta.generator` on its generated FlowDocs; the studio opens them
  editable with nothing to say an edit will be overwritten by the next
  `npm run generate`.
- **Nothing checks attribute references in message text.** A prompt that
  reads `$.Attributes.x` where nothing in the set sets `x` speaks an empty
  value at run time. The first draft declined a rule because attributes
  cross flows (a whisper reads what the main flow set), so a one-document
  rule mostly reports false positives.
- **The shape of `flow-cli lint --format json` is undocumented.**
  `packages/cli/README.md` says "a `summary` plus `findings`" and calls it
  stable, but names no fields and no version, where simulate's report is
  `flow-simulate-report/0.1`. The showcase parses it in its own lint script.
- **A fresh install prints npm's install-script warning for esbuild.** npm
  11's script allowlisting reports `esbuild (postinstall: node install.js)`
  as not covered. `@flow-as-code/cli` depends on `tsx` at run time (the
  synth runner registers it with `--import`), and `tsx` on `esbuild`, so a
  consumer that installs only the CLI sees it too.

## Acceptance criteria

- `flow-cli lint` and `flow-cli emit` accept more than one directory or file
  (or this file records why not, with the alternative a consumer should use).
  If they do, each directory is linted or emitted as its own set, so
  cross-document rules and module aliasing never reach across sets, and the
  report names the set each finding or file came from. Exit status is the
  worst across sets. `emit` with more than one set writes each set to its
  own output directory, and refuses an `--out` that would merge them.
- `flow-cli emit --target flowascode` takes `--instance-id-expression <expr>`
  (validated by the emitter's existing `checkExpression`) and, with it,
  writes no `variables.tf`, matching the library. `packages/cli/README.md`
  documents both, and a test shows the tree with and without the flag.
- A decision on codegen and Prettier, recorded here with its reason:
  either codegen's TypeScript is left unchanged by Prettier 3 at the
  repository's settings (a test runs Prettier over the codegen conformance
  outputs and asserts no change), or it is not, and `packages/cli/README.md`
  says so and shows the `.prettierignore` lines a consumer adds. Either way
  the round-trip and byte-stability invariants hold unchanged.
- Codegen takes an optional extra banner line (for example
  `flow-cli codegen --banner <text>` and a `banner` option on `codegen()`),
  written after the fixed lines and preserved across regeneration, so a
  generator can say it owns the file. A codegen conformance case covers it.
- The studio shows a FlowDoc whose `meta.generator` names a generator other
  than `core` or `cli` (the forms docs/01-flowdoc-spec.md documents) as
  generated: a visible marker naming the generator, and a confirmation
  before the first edit that says the next run will overwrite it. Nothing is
  written to the FlowDoc for it. A component test covers both, shown red by a
  mutation.
- A decision on message-text attribute references, recorded here with its
  reason. If taken: a set-wide rule of severity `warning` that reports a
  `$.Attributes.<name>` read in message text when no document in the linted
  set sets `<name>` (UpdateContactAttributes, or any other action the catalog
  records as writing contact attributes), with conformance fixtures under
  `conformance/lint/` for a hit, a cross-flow miss (set in one flow, read in
  another) and a single-file run that stays silent, as `module-depth-5`
  does. A rule that lands needs a provider re-vendor, recorded here with its
  commit.
- The lint JSON report is documented field by field in
  `packages/cli/README.md`, carries a format id (for example
  `flow-lint-report/0.1`, in the pattern of the simulate report), and has a
  JSON Schema under `conformance/schema/` that a test validates the CLI's
  output against. A change to its shape is a new version.
- The esbuild warning: the cause is recorded here with the `npm ls`
  output that shows the chain from `@flow-as-code/cli`, and one of these is
  done and recorded: `tsx` becomes an optional or peer dependency of the CLI
  with a clear error from `flow-cli synth` when it is missing; or the CLI
  keeps it, and `packages/cli/README.md` says why the warning appears and
  what a consumer approves (`npm install-scripts approve esbuild`, checked
  against the npm version current when this lands).
- Each finding above that changes behavior is shown red by a mutation, and
  every package whose surface moved has a changeset.

## Assumptions

- None of this changes the FlowDoc format. If the studio marker or the codegen
  banner turns out to need a field, it goes through the format's versioning
  in docs/01-flowdoc-spec.md first.
- The showcase keeps working on 0.2.0 until C11 releases this; it moves its
  pins in its own repository afterwards.
