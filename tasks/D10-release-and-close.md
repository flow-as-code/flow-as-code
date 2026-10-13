# D10 Release and close (Phase C and Phase D)

Phase D, release, and since 2026-10-05 Phase C's as well: the owner decided
that Phase C and all of Phase D ship together as the next minor release
(tasks/README.md, owner decision 9), so C11 is folded into this task and
its criteria are listed below under "Phase C's close". After D02 to D09 and
C07 to C09 (and C10 if its gate opened). As first written, this task was
behind C11's release by construction, C11 being D01's gate; that gate is
gone with the separate release. The order within this task matters, and
the mechanism is narrower than the format version (corrected 2026-10-05):
an emitted tree carries no FlowDoc version, because the provider's
`flowdoc` attribute is computed from the HCL with the provider's own
version constant, so a new CLI emitting only today's types and ref types
deploys unchanged on provider 0.1.x. What an older provider refuses is HCL
carrying a typed sub-block or a ref-type key its catalog lacks, and the
showcase's Tier 4 is the first such tree. The provider that knows them must
be published before the npm set that writes them.

## Order

1. The provider minor that reads FlowDoc 0.3, released from the provider's
   main, which carries the Phase C re-vendor (`feat/revendor-phase-c`, head
   `34dda2f`, reviewed, merged unreleased) and every Phase D re-vendor on
   top of it.
2. The npm minor, one `changeset version` on `main` consuming every pending
   changeset: Phase C's (the ones already there when Phase C started and
   the ones C03 to C06 and C12 to C15 added) and Phase D's (D01's and each
   group's).
3. The showcase repositories (`hollow-hour-example-typescript` and
   `hollow-hour-example-terraform`) move their pins to both released
   versions, in their own repositories.
4. C07's re-sync of the vendored snapshot from the satellite commit that
   adopted them.

## Acceptance criteria

- **Provider first.** The provider vendors `conformance/` at the final merge
  commit here (so every Phase C change under `conformance/`, C03 to C06 and
  C12 to C15's, is vendored at a commit on `main` as C11 required, on top of
  `feat/revendor-phase-c`), its conformance and oracle runs pass, and a minor release
  (v0.2.0 expected; the version is read from the registries, not predicted)
  is published through its signed goreleaser workflow with the owner's
  approval of the `release` environment. Its `CHANGELOG.md` names the
  vendored commit and says it reads FlowDoc 0.3. The version on both the
  Terraform and the OpenTofu registries is recorded here as read from them.
- **Pins here.** The flowascode validate pins are
  `conformance/hcl/roundtrip/*/validate/providers.tf` and
  `conformance/hcl/emit/*/validate/providers.tf` (0.1.1 today; the
  `conformance/emit-tf/*` fixtures pin hashicorp/aws only), held to the
  ci.yml cache key (`flowascode<version>`) by
  `packages/hcl/src/validate.test.ts`; they and the key move to the released
  version in one commit. In that commit every `"validate":
"awaits-provider"` case gains its `validate/` directory and flips to
  `pass`, and none is left (tasks/README.md, "HCL goldens before the
  provider release"). `FLOWASCODE_PROVIDER_CONSTRAINT` in
  `packages/hcl/src/contract.ts` rises to that version as a floor for the
  new blocks (`~> 0.1` admits it already, so no emitted
  `versions.tf.example` changed for `tofu init` before this), and
  `FLOWASCODE_EMITTED_CONSTRAINT` in `packages/tf/src/__fixtures__/tofu.ts`,
  held equal to it, moves with it. An emit-tf case holding typed blocks from
  this phase is added and validates against the published provider in CI,
  and a negative check records that the demo emitted by this CLI still
  validates against the previous provider release, so the bump alone breaks
  no older user.
- **npm.** The unconsumed changesets (every Phase C one, every Phase D
  group's, and D01's noting that older tools refuse 0.3 documents) are
  released together through `.github/workflows/release.yml` per
  CONTRIBUTING.md, "Releasing": `changeset version` on `main`, then the
  dispatched workflow. All six packages move together (they are `fixed`).
  The number is the next minor after the version the registry serves at
  dispatch, read with `npm view @flow-as-code/cli version` after the fact
  and recorded here; nothing here or in tasks/README.md predicts it, and
  FlowDoc 0.3 and an npm 0.3.0 need not coincide.
- **docs/06.** The "Versions and compatibility" row D01 added with the
  provider column "none released; D10" takes the version read from the
  registries.
- The release notes name the denominator from D00 and every Type outside the
  modeled set with its reason (Voice ID if D08 found it refused, console-only
  blocks still awaiting an export).
- The skill reference is current (`tests/skills.test.ts` green) and the site
  ships it on merge.
- **The showcase consumes.** The satellites move their pins to the released
  versions in their own repositories and add the new types in their Tier 4,
  tracked there. Two things the pins alone do not say: the satellites' Terraform
  roots pin `flowascode ~> 0.1.1` (`envs/*/providers.tf`), a shape that
  excludes a minor, so the pin must become `~> 0.2` (or the released floor)
  before the provider minor is admitted at all; and on the npm pins the
  format moves to 0.3 on synth, so the showcase's "synthesizes back to the
  same document" tests fail on `"flowdoc": "0.2"` versus `"0.3"` for its 12
  hand-authored documents until they are re-codegened, and `npm run
generate` rewrites its 7 generated pairs with new `sourceHash` values
  (checked on a scratch clone, 2026-10-06; lint over the mixed set is
  clean). The showcase's adoption issue (its #7) names neither; the owner
  adds a comment there before the satellites move. The provider minor also
  re-serializes every resource's computed `flowdoc` attribute on its first
  refresh, so every `<name>_document_sha256` output changes once with no
  document change (tasks/D01, "The next provider batch"); a promotion gate
  reading those outputs sees it on that refresh only. This repository
  records only the satellite commit it
  re-syncs from (C07's `scripts/sync-example.mjs`), that the snapshot lints
  clean against the released catalog, and the date the snapshot first
  carried 0.3 documents (it stays 0.2, read through `migrateFlowDoc` under
  D01's sweep exclusion, until the satellite moves its pins).
- **Phase C's close** (C11's criteria, folded in on 2026-10-05). C07 to
  C09 are closed on their own gates (a satellite commit, a public tag)
  before this task's release, and C10 says whether its gate opened. Every
  task file C01 to C09 and C12 to C15 records what landed against each
  criterion. The C01 follow-up C11 carried, the three timing-sensitive
  tests recorded under "Known timing-sensitive tests", is deflaked with the
  cause named or its wait recorded as correct before closing; a retry is
  not a record. `CLAUDE.md` "Where things stand" records Phase C closed and
  `tasks/README.md` gains a "Where it ended" for Phase C, as for Phase B.
- The sandbox features enabled for this phase (owner decision 7) are either
  torn down, with the date, or kept with the reason; the claimed number is
  kept regardless.
- `CLAUDE.md` "Where things stand" records Phase D closed, and
  `tasks/README.md` gains a "Where it ended" for Phase D, beside Phase C's.
- Every task file D00 to D09 records what landed against each criterion,
  with its provider commit; D08 says which way its probe went.
- CI is green on main at the closing commit, checked with `gh run list`.

## Evidence

No catalog change. The registry reads and run URLs are the record.

## Both repositories

- [ ] Provider: `feat/revendor-phase-c` merged to main unreleased (the
      lead opens that PR), then D01's and each group's re-vendor, the final
      re-vendor, release, both registries read.
- [ ] flow-as-code: constraint, hcl validate pins and cache key raised,
      every `awaits-provider` case flipped to `pass`, emit-tf case added,
      the older-provider negative check recorded, docs/06 row completed,
      every pending changeset of both phases released in one run.
- [ ] Satellites (`hollow-hour-example-typescript` and
      `hollow-hour-example-terraform`): pins moved to both released
      versions, tracked there.
- [ ] Satellite re-sync recorded (C07's script); the C01 follow-up and the
      Phase C task-file records closed; "Where it ended" written for both
      phases.
