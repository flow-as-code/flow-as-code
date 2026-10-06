# CLAUDE.md (OSS repo)

You are building the open-source flow tooling described in README.md. The private product repo consumes these packages from npm; nothing tenant-specific, no pricing, no vertical flow content, and no multi-tenant orchestration may enter this repo. One exception, set out under Non-negotiables: a fictional showcase maintained in its own repository may be vendored here at a pinned commit.

## Read first

1. README.md
2. docs/01-flowdoc-spec.md (the interchange format; everything pivots on it)
3. docs/02-studio-design.md
4. docs/03-tf-emitter.md
5. docs/06-terraform-provider.md (Phase B: the provider and HCL as a third view; the contract is conformance/hcl/README.md)
6. tasks/README.md, then work tasks in order

## Where things stand (2026-09-30)

Status only where it changes what you should do. The work record is `tasks/`.

- The repository is public at https://github.com/flow-as-code/flow-as-code. Its
  history was squashed to a single commit before publication, so there is no
  earlier commit to read; `tasks/` is the record of how anything got the way it
  is, and blame will not tell you.
- CI runs on GitHub Actions and is green on main (37377884054, the merge of
  #35 on 2026-10-05). C01 closed on 2026-10-05 on run 37344998368 (#25), the
  third consecutive green after its fix (#21); its file lists every run on
  main that day, including two red ones with their causes, and the
  timing-sensitive tests seen on PR and local runs. Check a claim about a run
  with `gh run list`, not against a note in a doc.
- The site is live: https://flow-as-code.dev/ and the read-only studio at
  https://flow-as-code.dev/studio/, deployed by `.github/workflows/pages.yml`
  on push to main. A change under `site/` or in the studio ships on merge.
- The packages are on npm. For the version the registry serves, read
  `npm view @flow-as-code/cli version`, not a number written down here. History
  worth keeping: 0.1.0 went out by hand on 2026-09-09, because npm trusted
  publishing cannot create a package that does not yet exist, and 0.1.1
  followed the same day through the workflow below, the run that proved the
  OIDC exchange and the SLSA provenance attestations. Only the `cli` copies
  of those two could be unpublished, on 2026-09-10: npm refuses to unpublish a
  package any other package depends on, and it applies that per package rather
  than per version, so `core`, `cdk`, `tf` and `studio` keep 0.1.0 and 0.1.1
  for as long as the CLI depends on them. That is settled, not pending. Treat
  all of them as history and never point a reader at one as something to
  install; the CLI pins its five siblings at an exact version, so nothing
  resolves onto them by accident. Inside the repo the workspace still resolves
  `@flow-as-code/*`, and `npm run build` before `npm test` is what makes that
  true, so a registry install is never the path a contributor takes here.
  0.2.0 (2026-09-29) is the first release with `@flow-as-code/hcl`; its
  `0.0.0` (and a `0.0.0-stage` the registry made itself) is a deprecated,
  code-free placeholder published by hand so its Trusted Publisher could be
  configured. Treat it as history too.
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
  `examples/terraform-provider/` (a flows module, per-environment roots, the
  cookbook, a pipeline) is held by `tests/terraformProviderExample.test.ts`.
- The Terraform provider is its own public repository,
  https://github.com/flow-as-code/terraform-provider-flowascode. It vendors
  `conformance/` at a pinned commit, so a change here to the catalog, lint
  rules or fixtures needs a re-vendor there (its `scripts/sync-conformance.sh`)
  and its TypeScript oracles re-recorded. It is on the Terraform and OpenTofu
  registries; read the version a registry serves rather than one written
  here. The emit-tf job validates provider-shaped output against the published
  provider from OpenTofu 1.10 (B03e), so a provider release that stops
  accepting it turns that lane red.
- The catalog's error branches, conditions and shapes were checked against the
  service on 2026-09-29, both ways: each required branch removed alone is
  refused, and the required set alone is accepted
  (`conformance/flow-language/actions.md`, rule 37). Change one only on the
  same kind of evidence, a create the service refuses or accepts, recorded
  with its date and message.
- Agent Skills live in `plugins/flow-as-code/skills/`, installable as a Claude
  Code plugin from `.claude-plugin/marketplace.json` and published on the site
  under `/skills/`. The action reference there is generated from the catalog
  (`node scripts/build-skill-reference.mjs`); `tests/skills.test.ts` fails
  when it is stale, so a catalog change regenerates it in the same commit.
- Phase A's definition of done below is met, verified from a clean clone.
- Phase B (the provider and HCL as a third view, tasks B01 to B06) closed on
  2026-09-30: every task's criteria are met and recorded in its task file, the
  provider is released and on both registries, the npm set is at 0.2.0, and the
  site carries the provider tutorials, the flow cookbook and the agent skills.
- Phase C (a vendored showcase and the tool gaps it exposed, tasks C01 to
  C15) was planned on 2026-09-30; the plan is the Phase C section of
  `tasks/README.md`. Its code tasks (C02 to C06, C12 to C15) merged on
  2026-10-05; only C07 to C09 remain. Phase C is code complete; by owner
  decision on 2026-10-05, C11 is folded into D10 and the next release is
  one aggregated minor carrying Phase C and Phase D together, the provider
  minor that reads FlowDoc 0.3 published first (`tasks/README.md`, Phase D,
  owner decision 9). The showcase itself is built in its own
  repository, `flow-as-code/hollow-hour-example-typescript`; nothing of it is
  vendored here until C07, and C07 to C09 wait on a commit (and, for C09, a
  public tag) there.
- Phase D (every Connect flow action modeled, tasks D00 to D10) was planned
  on 2026-10-04; the plan is the Phase D section of `tasks/README.md`.

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
  private product repo, not here. Two such files were removed from the working
  tree on 2026-09-10; `tasks/A13-release.md` names them. Removing a file from
  this repo is not the same as filing it somewhere else, and nothing here can
  assert that a copy exists elsewhere. Confirm a copy is held before deleting
  anything on the grounds that it belongs elsewhere. Do not restate their
  contents here or anywhere else public, and do not write a pointer telling a
  reader where a copy might still be retrieved. The prior-art
  comparison that stayed, `docs/adr/0004-prior-art-aws-l2-cdk-library.md`, is
  the shape a public version of that argument takes: a technical difference, no
  timing, no marketing directive, no pointer to a private decision record.
- Showcase examples (amended 2026-09-30): a fictional, non-commercial
  showcase maintained in its own repository may be vendored here, and only as
  a snapshot written by a script from one pinned commit, recorded with that
  commit and a hash per file, and never edited in place. It carries no product
  IP, no pricing, no tenant content, and nothing drawn from a real business or
  a real customer; it is no place for launch plans or marketing either, which
  stay under the rule above. A fix to vendored content is made in its own
  repository and re-synced. The vendored files are held by this repository's
  lint and CI like any other FlowDoc. Nothing else about the showcase (its
  deploys, environments, Lambdas or CI) lives here.
- License headers: Apache-2.0, applied by `npm run headers:fix`. The copyright holder is entity-neutral ("The flow-as-code Authors") and lives in one constant in scripts/license-headers.mjs. Never write a legal entity name into individual files; the name is expected to change.

## Stack

TypeScript 5.9, Node 22.12 or later (CI runs 22, 24, and 26), npm workspaces, Vitest 4, ESLint 10 (flat config) + Prettier 3. Studio: React 18, @xyflow/react 12, Vite 8, Tailwind 4 (@tailwindcss/vite), happy-dom for component tests. `@flow-as-code/cdk` peers on aws-cdk-lib ^2.267 and constructs ^10.8. No jsii yet (docs/adr/0001-defer-jsii.md: deferred until the API stabilizes).

## Working agreements

Same as the product repo: restate acceptance criteria before starting a task, small conventional commits, docs updated in the same commit, no em-dashes and no filler in docs, cite AWS doc URLs for any behavior relied on.

## Definition of done for Phase A

`flow-cli studio` opens the demo FlowDoc, a change on the canvas regenerates demo.flow.ts, editing demo.flow.ts updates the canvas within a second, `flow-cli emit --target tf` and `--target cdk` both produce deployable output for the demo flow, and lint plus the round-trip invariant tests are green in CI.

Met, and verified from a clean clone rather than from a developer tree. "Deployable" is not an argument from the emitted text: the Terraform side is `tofu validate`-clean in CI against OpenTofu 1.7.0 and 1.12.6, and the CDK side was deployed to a live Amazon Connect sandbox on 2026-09-02 and read back with `DescribeContactFlow` (`tasks/A07-flow-cdk.md`). Phase A is closed, and its result is what the `@flow-as-code` scope has served on npm since 2026-09-09.
