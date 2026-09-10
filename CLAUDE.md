# CLAUDE.md (OSS repo)

You are building the open-source flow tooling described in README.md. The private product repo consumes these packages from npm; nothing tenant-specific, no pricing, no vertical flow content, and no multi-tenant orchestration may enter this repo.

## Read first

1. README.md
2. docs/01-flowdoc-spec.md (the interchange format; everything pivots on it)
3. docs/02-studio-design.md
4. docs/03-tf-emitter.md
5. tasks/README.md, then work tasks in order

## Where things stand (2026-09-10)

Status only where it changes what you should do. The work record is `tasks/`.

- The repository is public at https://github.com/flow-as-code/flow-as-code. Its
  history was squashed to a single commit before publication, so there is no
  earlier commit to read; `tasks/` is the record of how anything got the way it
  is, and blame will not tell you.
- CI runs on GitHub Actions and is green. Check a claim about a run with
  `gh run list`, not against a note in a doc.
- The site is live: https://flow-as-code.dev/ and the read-only studio at
  https://flow-as-code.dev/studio/, deployed by `.github/workflows/pages.yml`
  on push to main. A change under `site/` or in the studio ships on merge.
- The packages are on npm. For the version the registry serves, read
  `npm view @flow-as-code/cli version`, not a number written down here. History
  worth keeping: 0.1.0 went out by hand on 2026-09-09, because npm trusted
  publishing cannot create a package that does not yet exist, and 0.1.1
  followed the same day through the workflow below, the run that proved the
  OIDC exchange and the SLSA provenance attestations. Both are being
  unpublished, so treat them as history and never point a reader at either as
  something to install. Inside the repo the workspace still resolves
  `@flow-as-code/*`, and `npm run build` before `npm test` is what makes that
  true, so a registry install is never the path a contributor takes here.
- Releases go through `.github/workflows/release.yml`, dispatched by hand,
  publishing over OIDC with no npm token anywhere. The filename is fixed by the
  Trusted Publisher configured for each package on npmjs.com. CONTRIBUTING.md,
  "Releasing", is the procedure.
- Every `uses:` in `.github/workflows/` that leaves this repository is pinned to
  a full commit SHA with its version in a trailing comment, kept current by
  `.github/dependabot.yml` and held by `tests/releaseGates.test.ts`. A `./.github/`
  reference is this repo's own tree and needs no pin. Do not replace a pin with a
  tag to make a diff read better.
- `.changeset/` holds unconsumed changesets for the next release. Add to them.
  Running `changeset version` is step 1 of a release, on `main`, not something
  to do in a feature branch.
- `examples/promote-across-environments/` exists and is typechecked and tested
  like the packages. A change to the emitters or the CLI can break it.
- Phase A's definition of done below is met, verified from a clean clone.

## Non-negotiables

- FlowDoc is the single interchange format. The studio, codegen, synth, export, lint, and both emitters read/write FlowDoc. No second format.
- References are tokens (`${cdref:type:name}`), never literal ARNs. Lint fails on `arn:aws:` in authored content.
- Codegen output must be idiomatic, diffable TypeScript that a human would plausibly have written, stable across runs (same FlowDoc in, byte-identical TS out).
- Round-trip invariants are tested: synth(codegen(doc)) equals doc (modulo layout defaults), and codegen(synth(code)) is byte-stable after one normalization pass.
- Unknown or not-yet-modeled Connect blocks must degrade gracefully everywhere: parse into a GenericBlock, render as a generic node in the studio, re-emit unchanged. Never drop content.
- Every lint rule, builder feature, and codegen case lands with conformance fixtures in the same commit. The future Go provider vendors conformance/ and must pass identically.
- Simulate harness respects documented limits: 5 concurrent, 100 queued, 5-minute duration. Verify API names in current AWS docs at implementation time; record doc URLs in comments.
- Studio is local-first: no telemetry, no network calls except AWS SDK when the user connects an instance. It must work fully offline on FlowDoc files.
- Release strategy, competitive positioning, and marketing drafts belong in the
  private product repo, not here. Two such files left the working tree on
  2026-09-10; `tasks/A13-release.md` names them and where they live now. Do not
  restate their contents here or anywhere else public, and do not write a
  pointer telling a reader where a copy might still be retrieved. The prior-art
  comparison that stayed, `docs/adr/0004-prior-art-aws-l2-cdk-library.md`, is
  the shape a public version of that argument takes: a technical difference, no
  timing, no marketing directive, no pointer to a private decision record.
- License headers: Apache-2.0, applied by `npm run headers:fix`. The copyright holder is entity-neutral ("The flow-as-code Authors") and lives in one constant in scripts/license-headers.mjs. Never write a legal entity name into individual files; the name is expected to change.

## Stack

TypeScript 5.9, Node 22.12 or later (CI runs 22, 24, and 26), npm workspaces, Vitest 4, ESLint 10 (flat config) + Prettier 3. Studio: React 18, @xyflow/react 12, Vite 8, Tailwind 4 (@tailwindcss/vite), happy-dom for component tests. `@flow-as-code/cdk` peers on aws-cdk-lib ^2.267 and constructs ^10.8. No jsii yet (docs/adr/0001-defer-jsii.md: deferred until the API stabilizes).

## Working agreements

Same as the product repo: restate acceptance criteria before starting a task, small conventional commits, docs updated in the same commit, no em-dashes and no filler in docs, cite AWS doc URLs for any behavior relied on.

## Definition of done for Phase A

`flow-cli studio` opens the demo FlowDoc, a change on the canvas regenerates demo.flow.ts, editing demo.flow.ts updates the canvas within a second, `flow-cli emit --target tf` and `--target cdk` both produce deployable output for the demo flow, and lint plus the round-trip invariant tests are green in CI.

Met, and verified from a clean clone rather than from a developer tree. "Deployable" is not an argument from the emitted text: the Terraform side is `tofu validate`-clean in CI against OpenTofu 1.7.0 and 1.12.6, and the CDK side was deployed to a live Amazon Connect sandbox on 2026-09-02 and read back with `DescribeContactFlow` (`tasks/A07-flow-cdk.md`). Phase A is closed, and its result is what the `@flow-as-code` scope has served on npm since 2026-09-09.
