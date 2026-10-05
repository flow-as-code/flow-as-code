# D10 Release and close

Phase D, release. After D02 to D09 and after Phase C's release (C11). The
order matters: an npm set that writes FlowDoc 0.3 published before a
provider that reads it breaks every Terraform deploy of a document the new
CLI wrote, the showcase's first.

## Acceptance criteria

- **Provider first.** The provider vendors `conformance/` at the final merge
  commit here, its conformance and oracle runs pass, and a minor release
  (v0.2.0 expected; the version is read from the registries, not predicted)
  is published through its signed goreleaser workflow with the owner's
  approval of the `release` environment. Its `CHANGELOG.md` names the
  vendored commit and says it reads FlowDoc 0.3. The version on both the
  Terraform and the OpenTofu registries is recorded here as read from them.
- **Pins here.** `FLOWASCODE_PROVIDER_CONSTRAINT` in
  `packages/hcl/src/contract.ts` rises to that version; the emit-tf lane's
  validate pin (`conformance/emit-tf/*/validate/providers.tf`, and its cache
  key) moves to it; an emit-tf case holding typed blocks from this phase is
  added and validates against the published provider in CI.
- **npm.** The unconsumed changesets (every Phase D group's, and D01's
  noting that older tools refuse 0.3 documents) are released through
  `.github/workflows/release.yml` per CONTRIBUTING.md, "Releasing". All six
  packages move together (they are `fixed`). The version the registry serves
  is read with `npm view @flow-as-code/cli version` and recorded here.
- The release notes name the denominator from D00 and every Type outside the
  modeled set with its reason (Voice ID if D08 found it refused, console-only
  blocks still awaiting an export).
- The skill reference is current (`tests/skills.test.ts` green) and the site
  ships it on merge.
- **The showcase consumes.** The satellites move their pins to the released
  versions in their own repositories and add the new types in their Tier 4,
  tracked there. This repository records only the satellite commit it
  re-syncs from (C07's `scripts/sync-example.mjs`) and that the snapshot
  lints clean against the released catalog.
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
- [ ] flow-as-code: constraint and validate pin raised, emit-tf case added,
      changesets released.
- [ ] Satellite re-sync recorded (C07's script).
