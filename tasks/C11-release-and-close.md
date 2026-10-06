# C11 Release and close

Phase C, release. After C01 to C09 and C12 to C15 (and C10 if its gate
opened).

## Acceptance criteria

- The unconsumed changesets under `.changeset/`, including the ones C03 to
  C06 and C12 to C15 add and the ones already there when this phase started,
  are released through `.github/workflows/release.yml` per CONTRIBUTING.md, "Releasing":
  `changeset version` on `main`, then the dispatched workflow. The version
  the registry serves is read with `npm view @flow-as-code/cli version` and
  recorded here, not predicted.
- Every change to `conformance/` in this phase is vendored by the provider
  repository at a commit on `main` here, its conformance run passes, and the
  emit-tf lane's validation against the published provider is green. If a
  provider release was needed, its version on both registries is recorded
  here as read from the registries.
- The satellite moves its pins to the released versions in its own
  repository; this repository records only that the snapshot still lints
  clean against the released catalog, and re-syncs it if the satellite's
  pinned commit changed.
- `CLAUDE.md` "Where things stand" records Phase C closed, and
  `tasks/README.md` gains a "Where it ended" for Phase C, as for Phase B.
- Every task file C01 to C09 and C12 to C15 records what landed against each
  criterion, and C10 says whether its gate opened.
- CI is green on main at the closing commit, checked with `gh run list`.

## Status (2026-10-05)

Open. C02 to C06 and C12 to C15 are on main (the Phase C section of
`tasks/README.md`, "Where it stands"); the provider re-vendor those tasks
record as pending is this task's, and C07 to C09 are still ahead of it.

Follow-up this task carries: C01, "Known timing-sensitive tests", records
three tests that failed on timing on 2026-10-05 (one on a PR run, two on a
loaded local run, none on main). Deflake each with the cause named, or
record why its wait is correct, before closing; a retry is not a record.

## Status (2026-10-05, later the same day): folded into D10

By owner decision, Phase C and all of Phase D ship together as the next
minor release, so nothing is released under this task. Every criterion
above is now a D10 criterion (`tasks/D10-release-and-close.md`), with D10's
order: the provider minor that reads FlowDoc 0.3 first, then the npm minor
carrying every pending changeset of both phases, then the satellites adopt
and C07's snapshot is re-synced. The provider re-vendor the Phase C tasks
record as pending is `feat/revendor-phase-c` in the provider repository
(head `34dda2f`, reviewed), which merges to the provider's main unreleased
as the base for Phase D's provider work; D01's re-vendor lands on top of
it. The C01 deflake follow-up above moves to D10 with the rest. This file
stays as the record of what Phase C's close requires; D10 records what
landed against each line, and "Where it ended" for Phase C is written at
D10's closing commit. The reasoning is in `tasks/README.md`, Phase D, "How
it relates to Phase C", and owner decision 9 there.
