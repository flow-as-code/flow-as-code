# Phase A: OSS foundation (closed 2026-09-10)

Work in order. Each task: restate acceptance criteria, list assumptions, done means every criterion demonstrably met with tests green.

## Order

A00a and A00b are prerequisites added 2026-08-31. A14 is split out of A13.

| #             | Task                                                    | Group         |
| ------------- | ------------------------------------------------------- | ------------- |
| A00a          | Repo hygiene and toolchain                              | foundation    |
| A00b          | Flow language reference, FlowDoc schema, demo flow      | contract      |
| A01-A05       | FlowDoc, builder, lint, codegen, synth, materialization | engine        |
| A07, A08, A09 | flow-cdk, CLI, flow-tf                                  | emitters      |
| A10-A12       | Studio                                                  | studio        |
| A14           | Hosted read-only demo                                   | public signal |
| A06           | Export and simulate                                     | live AWS      |
| A13           | Release readiness                                       | release       |

## Why A06 moved

A06 (export and simulate) appears in no clause of the Phase A definition of done in CLAUDE.md, and it is the only task requiring a live Connect instance. Running it ahead of the emitters, CLI, and studio delayed the first demonstrable milestone without unblocking anything. Scope is unchanged; only the position moved. Recorded 2026-08-31.

## Why A00b exists

Every task pivots on FlowDoc `content` being valid Amazon Connect Flow language, but nothing in the repo recorded which Action types exist or their parameter and transition shapes. A01 would have encoded guesses into the conformance fixtures that everything downstream compares against.

## Why A14 exists

The hosted read-only studio demo was the only release deliverable not blocked by the npm scope and project name, which were unresolved when this was written and were settled on 2026-09-03. It ships as soon as the studio round-trip works, rather than waiting on packaging.

The private product repo's Phase 0 resumes after A08 (its tenant-stack consumes core and cdk from npm, so it waits on the publish in A13).

## What happened between 2026-09-03 and 2026-09-09

- 2026-09-03: the rename. Scope `@criticaldynamics` to `@flow-as-code`, short names to `core`, `cdk`, `cli`, `tf`, `studio`, and the schema `$id` host to `flow-as-code.dev`. Details in A13. Notes under `tasks/` keep the old spelling where they record work done while it was in force.
- The history was squashed to a single commit, 15f8886, and the repository was published at https://github.com/flow-as-code/flow-as-code. There is no pre-publication history in the repository; `tasks/` is the record.
- 2026-09-04: first CI on a real GitHub Actions runner, after one failing run. Every green result recorded in `tasks/` before this date is a local run. Run URLs are in A13.
- The site went live at https://flow-as-code.dev/ with the read-only studio at /studio/, deployed by `.github/workflows/pages.yml`. A14 records the four operator actions it needed, all closed by 2026-09-09.
- The publish happened on 2026-09-09: all five packages at 0.1.0 by hand, then
  0.1.1 through `.github/workflows/release.yml`, which is the run that proved
  the OIDC exchange and the provenance attestations. A13 records it. Both were
  unpublished for `cli` on 2026-09-10; the other four packages keep them,
  because npm will not unpublish a package that another package depends on and
  the CLI depends on all four. Neither is a version to install or to name in
  public text; what the registry serves is what
  `npm view @flow-as-code/cli version` says.
- 2026-09-10: the release plan and the unposted positioning draft moved to the
  private product repo. Nothing under `docs/` is a marketing document now. A13
  records what went and what stayed.

# Phase B: Terraform provider and HCL as a third view (closed 2026-09-30)

Approved 2026-09-11. A Go provider (`flow-as-code/flowascode`, its own
repository) whose resources take action blocks and call the Connect API, a
pure-TypeScript `@flow-as-code/hcl` package, and `.flow.tf` as a paired
companion the studio reads and writes the way it reads and writes `.flow.ts`.
FlowDoc stays the single interchange format. The decisions, the contract, and
the operator actions are in the approved plan; each task file restates its
acceptance criteria and records what landed.

## Order

Contract first: nothing downstream is built on a fact that is not frozen as
data under `conformance/` first.

| #   | Task                                                             | Group    |
| --- | ---------------------------------------------------------------- | -------- |
| B01 | Action catalog, 21 more modeled types, FlowDoc 0.2, owned layout | contract |
| B02 | The HCL contract: resource shape, fixtures, docs skeleton        | contract |
| B03 | `@flow-as-code/hcl` and the CLI companions                       | engine   |
| B04 | The provider repository, acceptance lane, registries             | provider |
| B05 | Studio Terraform mode                                            | studio   |
| B06 | Docs, site, promotion example, ADRs                              | release  |

## Why contract first

The provider is a second implementation in a second language. Everything it
must agree with the TypeScript side on (the action set, the HCL shape, the
layout algorithm, the lint findings) is written down as fixtures both sides
run before either side implements it, so a disagreement is a red test rather
than a support ticket.

## Where it ended

Closed on 2026-09-30, with every task's acceptance criteria met and recorded in
its file. What shipped:

- `flow-as-code/flowascode`, in its own public repository, on the Terraform
  Registry (from 2026-09-29) and the OpenTofu registry (from 2026-09-30),
  signed with the project's release key; v0.1.1 is current.
- The npm set at 0.2.0 (2026-09-29), `@flow-as-code/hcl` among it, with FlowDoc
  0.2, the 21 newly modeled action types and the `.flow.tf` companion.
- The action catalog checked against the service on 2026-09-29, both ways
  (`conformance/flow-language/actions.md`, rule 37): lint now requires what
  Connect requires at create and nothing more.
- Provider-shaped output validated against the published provider in CI from
  OpenTofu 1.10 (B03e).
- On the site: four provider tutorials, the flow cookbook, agent skills (also a
  Claude Code plugin), and the landing page's provider section.

# Phase C: a vendored showcase and the gaps it exposed (planned 2026-09-30)

Planned 2026-09-30 from the owner's decisions of that date. A fictional
showcase, Hollow Hour Removal Co. (a dispatch line for haunted households),
is built in its own repository, `flow-as-code/hollow-hour-example`, against the
published packages and provider. This phase does three things in this
repository: it fixes the tool gaps that building the showcase exposed, it
vendors a pinned snapshot of the showcase's FlowDocs so the hosted studio can
open them, and it publishes a tutorial page that walks through the showcase at
a tag. Everything else about the showcase (its flows, generator, environments,
Lambdas, scenarios, CI, deploys and copy) lives and is tracked in the
satellite repository, not here.

FlowDoc stays the single interchange format. No task here writes showcase
content by hand: the snapshot is produced by a script from a satellite commit
and never edited in place, the way the provider vendors `conformance/`.

## Decisions this phase builds on

Settled by the owner on 2026-09-30; do not re-ask them.

1. The satellite repository is `flow-as-code/hollow-hour-example` (renamed
   from `hollow-hour` on 2026-09-30, before anything was published). It pins the
   published npm set and the published provider, and is not a workspace of
   this repository.
2. This repository integrates it by vendoring a pinned snapshot, not by a
   submodule, a build-time fetch, or an in-tree example. `CLAUDE.md` is
   amended to allow that (see its Non-negotiables).
3. The showcase's dev, qa and prod environments are each deployed to their own
   Connect instance, parameterized by instance id through `TF_VAR_`. That work
   is the satellite's; nothing here deploys anything.
4. The showcase deploys through `flow-cli emit --target flowascode` and the
   published `flowascode` provider. CDK is not a path for this example.
5. Flow and module names carry a constant `hh-` prefix, identical in every
   environment. No emitter prefix option is needed for it (see "Considered
   and not taken").
6. The keypad interview is the baseline; Lex is a stretch in the satellite
   and nothing in this phase depends on it (C10 is gated on it).
7. Two names from the draft are replaced with original ones: the grade for
   several entities at once is "Chorus", and the queue for grades 4 and 5 is
   `lantern-crew`. Neither echoes existing ghost-removal fiction.

## Order

| #   | Task                                                                    | Group       | Gate                          |
| --- | ----------------------------------------------------------------------- | ----------- | ----------------------------- |
| C01 | CI green on main again (demo-boot teardown)                             | baseline    | none                          |
| C02 | The site's staleness inputs cover `conformance/demo/`                   | baseline    | none                          |
| C03 | Channel-restricted actions: `Wait` and `ShowView` on voice              | contract    | none                          |
| C04 | Stored-input `GetParticipantInput` in the typed builder                 | engine      | none                          |
| C05 | Releasing a module nothing in the set references                        | emitters    | none                          |
| C06 | CDK: same-set flow refs in event hooks, out-of-set modules              | emitters    | none                          |
| C07 | `scripts/sync-example.mjs` and `examples/vendored/hollow-hour-example/` | integration | a satellite commit            |
| C08 | Hosted-studio example picker                                            | studio      | C01, C07                      |
| C09 | Tutorial: a worked example at a tag                                     | docs        | C08, satellite public, a tag  |
| C10 | Simulate: Lex substitution and mock responses                           | live AWS    | Lex enters the showcase scope |
| C12 | Emit: unbound refs on flowascode, unused map keys, constraint           | emitters    | none                          |
| C13 | Emit: per-flow outputs for a promotion gate                             | emitters    | none                          |
| C14 | Simulate: a library entry point and an offline dry run                  | simulate    | none                          |
| C15 | CLI and studio gaps from the showcase's first tier                      | cli, studio | none                          |
| C11 | Release and close                                                       | release     | C01 to C09, C12 to C15        |

C12 to C15 were added after the plan's first draft, from the showcase's build
reports, and are numbered after C11 so no earlier number moves; they come
before it in order. C15 takes up the smaller gaps the first tier's build
reported that C12 to C14 do not cover, several of which the first draft had
deferred or declined; its criteria keep those reasons as constraints. What
remains under "Considered and not taken" states its reason and whether it is
deferred or declined.

## Why the baseline comes first

The last CI run on main (36742854426, 2026-09-30) is red on an unhandled
`ReferenceError: window is not defined` raised after
`packages/studio/tests/demo-boot.test.tsx` finished, with every test passing.
The run before it on the same test file was green, so it is intermittent. C08
changes exactly the tests that boot the demo, and an integration PR cannot be
judged against a red baseline. C02 is a gap older than this phase that C07 and
C08 would otherwise widen: the site assembler decides whether the built demo
is stale from `SOURCE_PATHS`, and the demo FlowDoc under `conformance/demo/`
is an input to the bundle that the list does not name.

## Why the tool gaps come before the integration

Each gap in C03 to C06 and C12 to C15 is a fact about the tools, not about the showcase, and
lands on the evidence rule in `CLAUDE.md`: an AWS doc URL for behavior relied
on, and for a change to the catalog's error branches, conditions or shapes, a
create the service refuses or accepts, recorded with its date and message.
The showcase found them; it is never the evidence for them. They need no
satellite commit, so they are not blocked on one, and once released the
satellite can use the typed forms instead of generic blocks.

A change under `conformance/` needs a re-vendor in the provider repository
(`scripts/sync-conformance.sh`) and its oracles re-recorded; a catalog change
regenerates the skill reference in the same commit. Each task that touches
either says so in its criteria.

## Why a vendored snapshot

The hosted studio runs under CSP `connect-src 'none'` and must work from a
clean clone offline, so it cannot fetch the showcase at run time or at build
time. A git submodule breaks `npm run build:site` from a plain clone. An
in-tree example is the vertical content `CLAUDE.md` keeps out. A snapshot
written by a script from one satellite commit, recorded with that commit and a
hash per file, keeps the build offline and lets this repository's CI lint the
snapshot against the current catalog, so a catalog change that would break
the showcase is red here first. It is the pattern the provider already uses
for `conformance/`, in the other direction.

## Considered and not taken

- An emitter name-prefix option. The owner chose a constant `hh-` prefix in
  the FlowDocs themselves, which needs nothing from the emitters.
- A non-zero exit when an address map lacks an entry, on the flat Terraform
  target only. Its `TODO_MISSING_ADDRESS_*` placeholder is an undeclared
  reference by design, so `tofu validate` fails on it
  (`packages/tf/README.md`). This does not hold for `--target flowascode`,
  which writes an unbound reference as `null` under a TODO comment: that
  validates, exits 0 and is refused only at plan time. That gap is taken, in
  C12.
- Counting `InvokeFlowModule` as an announcement in
  `recording-consent-before-record`. The rule walks one FlowDoc and cannot
  see what a module plays; treating the call as an announcement would pass a
  flow whose module says nothing. The showcase plays its notice in the flow.
- A lint rule for `DequeueContactAndTransferToQueue` without a preceding
  `MessageParticipantIteratively`. Only the admin guide states the order; the
  service creates the flow without it, so it is guidance, not a refusal. The
  satellite follows the guide.
- Deferred: a command that builds a simulate resource map from state. The
  showcase's `scenarios/resource-map.mjs` does it from `tofu show -json` in
  sixty lines; C14's dry run needs only an address map. Revisit once C14 has
  shipped and a second user asks.
- Taken in C15, after the first draft deferred or declined them: `lint` and
  `emit` over more than one directory, the instance id expression and
  `variables.tf` on the CLI, a lint for message-text attribute references,
  a studio marker for generated FlowDocs, codegen and Prettier, the lint
  JSON report's shape, and the esbuild install-script warning. The first
  draft's note on the warning was wrong: `@flow-as-code/cli` depends on
  `tsx` at run time, and `tsx` on `esbuild`, so a consumer that installs only
  the CLI gets the warning from it (C15).
- Flow-type and channel restrictions on unmodeled types
  (`CheckOutboundCallStatus`, `CompleteOutboundCall`, `CreateWisdomSession`,
  `TransferParticipantToThirdParty`). They stay generic blocks; modeling them
  is its own task when a user needs more than the passthrough.

## Definition of done for Phase C

The hosted studio opens `appointment-line` by default and a vendored
showcase flow at `#example=hollow-hour-example`, with the bundle making no network
request and the npm studio package carrying none of the showcase; the snapshot
under `examples/vendored/hollow-hour-example/` matches its `COMMIT` and `MANIFEST.json`
and lints clean against the current catalog in CI; the tutorial is on the site
and links only to the satellite at a tag; C03 to C06 and C12 to C15 are
released with fixtures and a provider re-vendor where `conformance/` changed;
CI is green on main.
