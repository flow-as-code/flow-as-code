# C07 `scripts/sync-example.mjs` and `examples/vendored/hollow-hour-example/`

Phase C, integration. Gated on a commit in `flow-as-code/hollow-hour-example-typescript` whose
FlowDocs lint clean against this repository's current catalog. Not started
before that commit exists.

A pinned snapshot of a small subset of the showcase's FlowDocs, written by a
script from one satellite commit and never edited in place. It is the pattern
`terraform-provider-flowascode` uses for `conformance/`
(`scripts/sync-conformance.sh`: a full 40-character sha, a `--from <clone>`
mode for unpushed commits, the directory replaced wholesale, `COMMIT` and a
`MANIFEST.json` of sha256 per file that a test recomputes offline), in the
other direction.

## Acceptance criteria

- `node scripts/sync-example.mjs <sha> [--from <clone>]` refuses anything but
  a full lowercase 40-character hex sha; fetches the satellite tree at that
  commit (the GitHub tarball through `gh api`, or `git archive` from a local
  clone with `--from`); copies an explicit allow-list of paths written in the
  script, not a glob; and replaces `examples/vendored/hollow-hour-example/` wholesale.
  The subset is the flows the studio opens: `hh-hotline-main`, one generated
  district and its customer queue flow, and the greeting module the flows
  bind to. The script is the only network client added by this phase, runs
  only when a person invokes it, and nothing in `npm run build`,
  `npm run build:site` or `npm test` calls it.
- The directory holds `COMMIT` (the sha and a newline), `MANIFEST.json` (the
  sha256 of every other file, sorted by path), the FlowDocs, and a generated
  `README.md` saying where the files come from, at which commit, and that a
  fix is made in the satellite and re-synced, never here.
- `tests/vendoredExample.test.ts`, offline: recomputes the manifest and fails
  on any added, removed or changed file; validates each FlowDoc against the
  schema of the version it names; runs lint with the current catalog and
  fails on any finding of severity `error`; asserts no `arn:aws:` and no
  phone number outside 555-0100 to 555-0199. Each check shown red by a
  mutation (an edited byte, an extra file, a catalog change that the snapshot
  violates).
- Prettier, ESLint, `npm run headers:fix`, the workspace globs and
  `tsc` leave the directory alone, so no tool rewrites a byte the manifest
  holds. Held by the manifest test running after `npm run format`.
- The script has unit tests for its argument checks and manifest writer that
  need no network.
- `CLAUDE.md` "Where things stand" gains a line: what the directory is, the
  commit it pins, that it is refreshed by the script only, and that a catalog
  or lint change that turns its test red is either a bug here or a re-sync
  after a fix in the satellite.
- `CONTRIBUTING.md` says how to re-sync and when.

## Assumptions

- The satellite's license is Apache-2.0 with the same entity-neutral holder,
  so vendored files need no separate notice beyond the generated README. If
  that changes, this task stops until it is resolved.
- The satellite's content passes the `CLAUDE.md` amendment: fictional,
  non-commercial, no product IP, no pricing, no tenant content. The sync
  script does not judge that; the review of the PR that lands a re-sync does.
