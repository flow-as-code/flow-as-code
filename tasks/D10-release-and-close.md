# D10 Release and close

Phase D, release. After D02 to D09 (C11's release is D01's gate, so it is
behind by construction). The order matters, and the mechanism is narrower
than the format version (corrected 2026-10-05): an emitted tree carries no
FlowDoc version, because the provider's `flowdoc` attribute is computed
from the HCL with the provider's own version constant, so a new CLI
emitting only today's types and ref types deploys unchanged on provider
0.1.x. What an older provider refuses is HCL carrying a typed sub-block or a
ref-type key its catalog lacks, and the showcase's Tier 4 is the first such
tree. The provider that knows them must be published before the npm set
that writes them.

## Acceptance criteria

- **Provider first.** The provider vendors `conformance/` at the final merge
  commit here, its conformance and oracle runs pass, and a minor release
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
  new blocks (`>= 0.1` admits it already, so no emitted
  `versions.tf.example` changed for `tofu init` before this), and
  `FLOWASCODE_EMITTED_CONSTRAINT` in `packages/tf/src/__fixtures__/tofu.ts`,
  held equal to it, moves with it. An emit-tf case holding typed blocks from
  this phase is added and validates against the published provider in CI,
  and a negative check records that the demo emitted by this CLI still
  validates against the previous provider release, so the bump alone breaks
  no older user.
- **npm.** The unconsumed changesets (every Phase D group's, and D01's
  noting that older tools refuse 0.3 documents) are released through
  `.github/workflows/release.yml` per CONTRIBUTING.md, "Releasing". All six
  packages move together (they are `fixed`). The number is the next minor
  after C11's, read with `npm view @flow-as-code/cli version` after the
  fact and recorded here; nothing here or in tasks/README.md predicts it,
  and FlowDoc 0.3 and an npm 0.3.0 need not coincide.
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
  tracked there. This repository records only the satellite commit it
  re-syncs from (C07's `scripts/sync-example.mjs`), that the snapshot lints
  clean against the released catalog, and the date the snapshot first
  carried 0.3 documents (it stays 0.2, read through `migrateFlowDoc` under
  D01's sweep exclusion, until the satellite moves its pins).
- The sandbox features enabled for this phase (owner decision 7) are either
  torn down, with the date, or kept with the reason; the claimed number is
  kept regardless.
- `CLAUDE.md` "Where things stand" records Phase D closed, and
  `tasks/README.md` gains a "Where it ended" for Phase D.
- Every task file D00 to D09 records what landed against each criterion,
  with its provider commit; D08 says which way its probe went.
- CI is green on main at the closing commit, checked with `gh run list`.

## Evidence

No catalog change. The registry reads and run URLs are the record.

## Both repositories

- [ ] Provider: final re-vendor, release, both registries read.
- [ ] flow-as-code: constraint, hcl validate pins and cache key raised,
      every `awaits-provider` case flipped to `pass`, emit-tf case added,
      the older-provider negative check recorded, docs/06 row completed,
      changesets released.
- [ ] Satellite re-sync recorded (C07's script).
