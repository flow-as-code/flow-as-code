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
