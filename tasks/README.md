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
is built in its own repository, `flow-as-code/hollow-hour-example-typescript`, against the
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

1. The satellite repository is `flow-as-code/hollow-hour-example-typescript`
   (built as `hollow-hour`, then `hollow-hour-example`; renamed on 2026-09-30
   when the owner split the showcase into approach-specific repositories).
   Its Terraform-first sibling, `flow-as-code/hollow-hour-example-terraform`,
   authors the same flows directly in HCL and holds no FlowDocs, so it is
   linked from C09 but not vendored. The example id and the vendored directory
   keep `hollow-hour-example`, which names the showcase, not an approach. It pins the
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

# Phase D: every Connect flow action modeled (planned 2026-10-04)

Planned 2026-10-04. The owner's goal: flow-as-code models every Amazon Connect
flow action, so the Hollow Hour showcase
(`flow-as-code/hollow-hour-example-typescript` and its Terraform-first
sibling, `flow-as-code/hollow-hour-example-terraform`) can exercise every one
through typed blocks rather than generic ones. Today 35 of the 56 types on the
Developer Guide's four category pages are modeled; the other 21 parse to a
GenericBlock and round-trip verbatim. AWS also documents Types outside those
pages, and the console emits at least one Type no page lists. This phase
states what "every" is measured against (D00), lands the format and tooling
changes the remaining types need all at once (D01), models them in groups
on the evidence rule's terms (D02 to D09), and releases them in an order that
never leaves a published reader behind a published writer (D10).

Nothing of the showcase is built here. The showcase consumes the release in
its own repositories (its Tier 4); this repository records only that the
vendored snapshot still lints clean (C07's re-sync).

## Why a separate phase

Phase C has a definition of done centred on the showcase's first tiers and a
closing task, C11, gated on a fixed list. Twenty-five or more new types is a
B01-sized effort: a format version, catalog vocabulary, a provider minor and a
live sweep per group. Numbering it C16 onwards would hold Phase C open on work
its definition of done never named, and C12 to C15 being numbered after C11
was already a workaround. A phase of its own can close on its own evidence.

## How it relates to Phase C

- Phase C closes and releases on its own first. C11 ships what C01 to C15
  produce (0.2.x or 0.3.0, as the changesets decide); Phase D's release is
  D10, separate. Folding D into C11 would hold C's release on live evidence
  that needs owner actions (feature enablement, quota tickets).
- D01 is gated on C03. C03 adds the catalog's `channels` field, and several
  types here are restricted by channel (media streaming, media processing,
  `CreateWisdomSession`, Voice ID, `UpdatePreviousContactParticipantState`,
  `StartOutboundChatContact`). D01 extends that vocabulary; it does not
  invent a second one.
- C04 touches `GetParticipantInput`'s stored form and does not block, but
  D00's new `GetParticipantInput` parameters land after it, on the same type.
- C01 is not closed: its file still records no CI runs. Main has two green
  runs since the fix (36794827383 for #22, 36795832942 for #23; the runs for
  #20 and #21 were cancelled). The third consecutive green run is recorded in
  C01 with all three URLs before C11, and that is Phase C's work, not D's.
- "Considered and not taken" in Phase C says flow-type and channel
  restrictions on unmodeled types wait until "modeling them is its own task".
  Phase D is that task.

## Order

| #   | Task                                                                 | Group    | Gate                                    |
| --- | -------------------------------------------------------------------- | -------- | --------------------------------------- |
| D00 | Catalog census: what "every action" is measured against              | contract | none                                    |
| D01 | FlowDoc 0.3, catalog vocabulary, provider and oracle prep            | contract | C03 merged, D00                         |
| D02 | Contact state (4 types); re-author `roundtrip/unknown-actions`       | engine   | D01                                     |
| D03 | Customer Profiles (6 types)                                          | engine   | D01, a Profiles domain on the sandbox   |
| D04 | Outbound (3 types)                                                   | engine   | D01; deploy-only where quotas block     |
| D05 | Tasks and AI agents (`CreateTask`, `CreateWisdomSession`)            | engine   | D01, an AI agents domain on the sandbox |
| D06 | Cases (3 types); ADR on per-domain field ids                         | engine   | D01, D03's Profiles domain, a Cases one |
| D07 | `UpdateRoutingCriteria`; ADR on the recursive expression             | engine   | D01                                     |
| D08 | Voice ID (2 types), gated on the service still accepting them        | engine   | D01, a probe                            |
| D09 | Types D00 adds from the admin guide and console exports              | engine   | D00 exports, D01                        |
| D10 | Release: provider minor, npm 0.3.0, pins, then the showcase consumes | release  | D02 to D09, C11 released                |

D02 to D09 may run in any order once D01 is merged; the order above is
cheapest evidence first. Each group follows B01's pattern: one commit per
type, a group fixture, a review round (reviewers and a refuter per finding;
B01 found 14 to 38 findings per group), then the live sweep recorded as a
numbered rule in `conformance/flow-language/actions.md` (39 onwards).

## The per-type checklist

Every type in D02 to D09 lands with all of the following, in one commit per
type unless a line says otherwise. Each task file repeats it as its
"Both repositories" list and adds what is particular to its group.

flow-as-code:

1. `conformance/flow-language/catalog.json` entry (`modeled: true`, `block`,
   `terminal`, `flowTypes`, `channels`, `parameters`, `constraints`, `refs`,
   `transitions`, and `textBodies`, `announces`, `recordingEnabler`, `waits`
   or `shapes` where they apply), copied by `npm run sync:schema`.
2. `conformance/flow-language/actions.md`: a Modeled set row, a
   Reference-bearing parameters row for each ref, a Per-action parameter
   shapes entry, the "Unmodeled actions" count, and the group's numbered rule.
3. `packages/core/src/actions.ts` tables, held by `catalog.test.ts` and
   `actions.test.ts`; a new catalog vocabulary item has a mutation test.
4. A block class in `blocks.ts`, an inverter in `codegen.ts`, exports from
   `index.ts`, tests in `codegen.test.ts` and `synth.test.ts`.
5. A per-type clause in `conformance/schema/flowdoc-0.3.schema.json` (never
   in the frozen 0.2 schema).
6. Lint fixtures under `conformance/lint/<rule>/` where the type adds a case;
   new rule code in `packages/core/src/lint/` only for a new constraint form.
7. The group's `conformance/roundtrip/<group>/doc.flowdoc.json`, and a
   `conformance/hcl/roundtrip/<case>/expected.flow.tf` carrying the typed
   sub-block.
8. Studio: palette entry and default parameters (`palette.ts`), inspector
   fields with ref pickers (`inspectorSchema.ts`), drag rules in
   `mutations.ts` only where conditions or errors need them, with tests.
9. The skill reference regenerated (`node scripts/build-skill-reference.mjs`)
   in the same commit as the catalog change; the modeled count in
   `packages/core/SPEC.md`.
10. A changeset per group (`core`, and `studio` where the palette or inspector
    changed).

terraform-provider-flowascode, once per group at a merge commit on main here:

11. `scripts/sync-conformance.sh <sha>`; `internal/conformance/COMMIT` and
    `MANIFEST.json` updated.
12. The oracles re-recorded against a built flow-as-code: the extended
    `catalog-oracle.mjs` (D01), `lint-oracle.mjs`, `export-oracle.mjs`,
    `materialize/testdata/oracle.mjs`, `ajv-oracle.mjs`.
13. A lint port in `internal/lint/rule_*.go` for any new rule or constraint
    form, and the acceptance fake taught any refusal the group relies on.
14. `CHANGELOG.md` names the vendored commit; the provider commit is recorded
    in the task file.

## The evidence rule for this phase

`CLAUDE.md` allows a change to the catalog's error branches, conditions or
shapes only on a create the service refuses or accepts, recorded with its date
and message. For every type here that means a sweep on the sandbox instance
(rule 37's and 38's method), each probe a throwaway `CreateContactFlow`
created as PUBLISHED and deleted after, its deletion confirmed by a describe
call that returns `ResourceNotFoundException`:

- the required set alone is accepted;
- each catalog-required error removed alone is refused;
- the type without `NextAction` is refused (or, for a terminal type, with one
  is refused);
- each flow type the catalog allows or forbids that the pages disagree on is
  probed, and each doubtful spelling or shape is put to the service;
- each result is recorded with the date, UTC time, flow type, Region and the
  exception message, never the account or instance id.

Probe inputs are kept (rule 37 regrets losing them), under
`conformance/flow-language/probes/<rule>/`, with every account, instance and
resource id replaced by a named placeholder that D01's runner fills from the
environment at run time. A probe that fails on a missing instance feature
rather than on the catalog (rule 37's `UpdateContactData` on an instance
without Voice ID) is rerun on an instance with the feature, and the first
result is recorded as what it was.

Two kinds of coverage are kept apart throughout. "Deployable" is a create the
service accepts. "Exercisable" is a live contact running the action. Phase D
needs the first for every type; the second is the showcase's, and several
types (outbound campaigns, SMS, Voice ID) may only ever be deployable.

## Definition of done for Phase D

- D00's census is merged and states the denominator: every Type in it is
  either modeled, with its catalog entry, builder class, inverter, schema
  clause, studio entry and fixtures, or recorded in actions.md as not
  modeled with the evidence for why (a create the service refuses, or a
  console-only block whose export was not obtainable), and that list is
  named in the release notes.
- Every modeled type added in this phase has its sweep recorded as a
  numbered rule with its probe inputs kept.
- FlowDoc 0.3 is the current version, 0.2 is frozen byte for byte, and every
  reader in both repositories migrates a 0.2 document on the way in.
- The provider release that reads 0.3 is on both registries and was
  published no later than the npm set that writes it; the emit-tf lane
  validates a case holding the new typed blocks against it.
- `roundtrip/unknown-actions` still exercises passthrough.
- CI is green on main at the closing commit, checked with `gh run list`, and
  `tasks/README.md` gains a "Where it ended" for Phase D.

## Considered and not taken

- Numbering the work C16 onwards (see "Why a separate phase").
- One FlowDoc bump per new ref type. An older reader refuses a document
  carrying a token it does not know, so each bump is a release both
  repositories must make in step. One bump, landed first in D01, carrying
  every ref type the census shows, costs one migration.
- Adding per-type clauses to the released 0.2 schema. It would tighten a
  published format; B01 did that only before 0.2 shipped.
- Typing every console form of already modeled types (Lex V1 `LexBot`,
  `VoiceAnalyticsBehavior` and `ChatBehavior` on the recording and analytics
  action, the older recording action's `AnalyticsBehavior`, Wait's
  console-only forms). They round-trip as generic blocks today, which the
  showcase can exercise; each becomes a task when a user needs the typed
  form. D00 records them so the denominator does not hide them.
- A `voiceconnector` ref type for `CompleteOutboundCall`'s Chime
  `VoiceConnector` form, by default (owner decision 4).
- A `number` catalog kind for `UpdateRoutingCriteria`'s `ProficiencyLevel`, by
  default: the expression is a `json` value (D07), so nothing outside it
  needs a float.
- Exercising Voice ID live. The service ended on 2026-05-20; D08 probes only
  whether a create is still accepted.

## Owner decisions

Each has a recommended default that the plan assumes until the owner says
otherwise. Record the answer and its date here when given.

1. **The denominator.** Default: the D00 census, counted as the 56 Developer
   Guide Types, plus the Types other AWS pages document
   (`RouteContactToAgent`, `LoadContactContent`, `AuthenticateParticipant`,
   `CheckSegmentMembership`), plus console-exported Types
   (`TransferParticipantToThirdParty`, and each console-only block once an
   export names its Type). Not counted: forms of modeled types listed under
   "Considered and not taken".
2. **Voice ID.** Default: probe once (D08). If the service accepts a create,
   model both types as deployable only; if it refuses, record the refusal
   and leave them generic, outside the denominator with that reason.
3. **0.3 schema strictness against migrated 0.2 documents.** Default: a 0.3
   per-type clause encodes only what the service enforces at create, so any
   0.2 document the service accepted also validates after migration; a test
   migrates every 0.2 fixture that holds one of the newly modeled types
   generically and validates it against 0.3. A shape the clause refuses but
   the service accepts stays generic in codegen rather than failing a read.
4. **Chime voice connector.** Default: no `voiceconnector` ref type;
   `CompleteOutboundCall` is typed for its caller-id and time-limit form, and
   a block carrying `VoiceConnector` stays generic, as Lex V1 does.
5. **Cases field ids.** Default: a `casefield` ref type and tokens as map
   keys in `CaseRequestFields` (a new path form), because field ids are
   per-domain UUIDs and the showcase's environments may differ only in
   bindings. D06's ADR records the alternative (literal ids, an accepted
   limitation) and why it was not taken, or the owner's choice if different.
6. **Outbound gates.** Default: no campaigns quota ticket and no SMS
   registration. `CheckOutboundCallStatus` and `StartOutboundChatContact`
   are modeled on create evidence alone and documented as deployable, not
   exercisable. Either gate can be opened later without changing the model.
7. **Sandbox features.** Default: enable on the sandbox instance only, kept
   between tasks and torn down at D10: a Customer Profiles domain, a Cases
   domain with one template and two fields, an AI agents assistant on an
   AWS-owned key with no knowledge base, live media streaming with no
   retention, one Lambda associated as `MESSAGE_PROCESSOR`, one predefined
   attribute, one task template, and one claimed US DID kept and never
   released (the release cooldown makes reclaiming costly). Each is an owner
   action: the IAM writes and feature enablement are refused to agents.
8. **Console exports for undocumented blocks.** Default: the owner builds one
   flow in the sandbox console holding each block D00 lists without a
   documented Type, exports it, and commits the export (ids replaced by
   placeholders) under `conformance/flow-language/exports/`; D09 models
   from it.
9. **Release order.** Default: provider v0.2.0 (reads FlowDoc 0.3) is
   published before npm 0.3.0, not after; both after C11's release.
10. **The passthrough fixture once every Type is modeled.** Default: it keeps
    any console-only Type still unmodeled; if none remains, it holds a
    synthetic Type name, documented as such, and the codegen test asserts the
    name is absent from the catalog.
