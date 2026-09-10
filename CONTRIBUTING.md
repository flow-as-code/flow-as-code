# Contributing

## Getting started

```
npm ci
npm run build      # tsc -b honours the project references, then vite for the studio
npm run lint
npm run typecheck
npm test
```

Node 22.12 or newer. CI runs Node 22 (the `engines.node` floor), 24 (the
Active LTS), and 26 (the current release); local development on a newer
runtime is fine, but do not add a dependency whose `engines.node` excludes 22.
Node 20 reached end of life on 2026-04-30 and is no longer supported.

Run `build` before `test`. Some tests read build output, and the workspace
packages resolve to `dist`.

`build` runs `npm rebuild --workspaces --ignore-scripts` after `tsc -b`, which
is what links `node_modules/.bin/flow-cli`. npm links workspace bins during
install, and at `npm ci` time `packages/cli/dist/bin.js` does not exist yet, so
the link is skipped; without the relink, `npx flow-cli` from the repo root would
miss the workspace and reach for a `flow-cli` on the registry. After `build`,
the `npx flow-cli` lines in the root README work from a checkout. `build` then
builds the studio and its demo bundle and ends with `scripts/chmod-bins.mjs`,
which owns the mode of every file a workspace packs out of `dist`.

All five packages are on npm (0.1.1, published 2026-09-09), but inside this
repository `@flow-as-code/*` resolves through the workspace and nowhere else, so
a checkout never reads the registry copies. Build first or the imports do not
exist.

## What CI runs

`.github/workflows/ci.yml`, on push and pull request:

- `build / node 22`, `24` and `26`: `npm ci`, then lint, typecheck, build,
  `build:site`, test. `lint` includes the header check.
- `emit-tf goldens / tofu 1.7.0` and `1.12.6`: the emitted HCL has to be
  `tofu validate`-clean against a real OpenTofu, on the floor and the current
  release. It asks for exact provider versions, pinned in
  `conformance/emit-tf/*/validate/providers.tf`, so a blocking lane never turns
  red because a third party published that morning. The canary below is what
  watches the newest ones instead.
- `publish dry-run`: `npm publish --dry-run` once per package, which is what
  catches a packaging defect before a release does.

That is the whole of `ci.yml`, and it is deliberately the whole of it. A
release reuses this file as its gate set, and a called workflow may only
downgrade the permissions its caller granted, so a job here that asks for more
than `contents: read` is rejected before any job starts. `tests/releaseGates.test.ts`
fails a pull request that would introduce one.

The same test holds the other rule about these files: every `uses:` that leaves
this repository names a full commit SHA with its version in a trailing comment,
never a floating tag. `.github/dependabot.yml` is what moves those SHAs; a
reference into `./.github/` needs no pin. `.github/workflows/release.yml` says
why.

`.github/workflows/provider-drift.yml`, weekly on Monday and on dispatch, runs
the same three test projects the `emit-tf` job runs, on OpenTofu 1.12.6, with no
provider cache, so it resolves whatever the registry serves that morning. It is
the other half of those pins: they buy a lane that does not depend on a third
party's release day, and this buys back the noticing.

What it floats each file to is the range that file's own user-facing artifact
declares, because "what a user gets" is not one constraint. A
`conformance/emit-tf/*/validate/providers.tf` is a test-only file; its
counterpart is the `versions.tf.example` the emitter writes, so it resolves
under that, which is open-ended and therefore crosses a major the day one
ships. An `examples/*/terraform/*/providers.tf` is itself the published advice,
so it resolves under its own `~> 6.0` and keeps that range on disk.

It gates nothing. It is not called by `ci.yml` or `release.yml`, it is not a
required check, and it has no `workflow_call` trigger, all of which
`tests/releaseGates.test.ts` holds. When it goes red, no merge and no release is
blocked, and the answer is a considered pin bump rather than a scramble: read
the resolved version and the first error from the run's step summary, then move
`conformance/emit-tf/*/validate/providers.tf` and the matching `emit-tf` cache
key in `ci.yml` together, in one commit. A test holds those two in step.

The seam it runs through is `TOFU_PROVIDER_MODE=float`, read by
`packages/tf/src/__fixtures__/tofu.ts`. It rewrites the constraint on the text's
way to a temp directory and never touches the files in the working tree, so the
guards that assert those files are pinned exactly are as strict during a canary
run as during any other.

Every committed `providers.tf` a gated test can init is named by
`providerSites()` in the same file. `prewarmTofuCache()` downloads exactly that
set before any worker starts, and `tofu()` refuses an `init` whose workspace
asks for anything else. A new gated test that builds a workspace some other way
therefore fails at its first init with a message naming what it asked for,
rather than downloading a provider in the middle of the parallel suite. That is
not hypothetical: it is how the example environments went on floating for a day
after everything else was pinned.

To reproduce a canary run locally:

```sh
RUN_TOFU_VALIDATE=1 TOFU_PROVIDER_MODE=float npx vitest run \
  --project @flow-as-code/tf --project @flow-as-code/studio --project repo
```

Either mode prints which one it used and which versions it resolved before the
first test runs.

`.github/workflows/integration.yml`, on push to main and on dispatch, is the
live Amazon Connect sandbox run, which is where `id-token: write` is needed for
the AWS role. It is skipped unless the repository variable
`CONNECT_SANDBOX_ENABLED` is `true`, so a fork pull request never reaches for
credentials it was not going to get, and it is a separate workflow so that a
release never depends on a reachable AWS account.

`.github/workflows/pages.yml` deploys the landing page and the read-only studio
demo to https://flow-as-code.dev/ on push to main.

`.github/workflows/release.yml` publishes to npm. It is dispatched by hand, and
it calls `ci.yml` rather than restating its jobs, so the gate set a release
passes is the gate set above and there is only one definition of green. See
"Releasing" below.

## Releasing

A release is two steps, on purpose. A publish cannot be taken back: npm allows
unpublishing a version only within 72 hours, and a version number can never be
reused afterwards (https://docs.npmjs.com/policies/unpublish). So the version
bump is a reviewable commit and the publish is a separate, deliberate act.

**Step 1, the operator, locally.** On `main`, with the changesets for the
release already merged:

```
npx changeset version   # consumes .changeset/*.md, bumps all five, writes CHANGELOGs
npm install             # refresh package-lock.json for the new versions
git commit -am "release: 0.1.1"
git push origin main
```

Review the bumped manifests and the generated CHANGELOGs before committing. All
five packages are `linked` in `.changeset/config.json`, so they move together.

**Step 2, the operator, on GitHub.** Actions, "Release", "Run workflow", branch
`main`. Nothing else. There is no npm token to supply and none exists: the
publish authenticates over OIDC.

**What the workflow does.**

1. `preflight`, in about a minute. Refuses to go on unless the ref is `main`,
   `id-token: write` is actually in effect, the file is still
   `.github/workflows/release.yml`, `.changeset/` holds no unconsumed
   changeset, at least one package version is absent from the registry, and no
   git tag already exists for a version that is not published. Each of those is
   a way for a release to half-happen or to silently do nothing.
2. `gates`, calling `.github/workflows/ci.yml`. The whole of it, granted
   `contents: read` and nothing more. The live sandbox job is not in that file,
   so an unreachable AWS account cannot block a publish.
3. `publish`. Upgrades npm if the runner's is below 11.5.1, the floor npm's
   trusted publishing documents, sets a committer identity so the annotated
   tags `changeset publish` creates can be made at all, then runs
   `npx changeset publish` and pushes the `<package>@<version>` tags. No
   `--access` or `--provenance` flag: `publishConfig.access` already says
   public, and provenance is automatic under trusted publishing. Before it
   exits it re-checks the registry against the remote's tags, because a version
   that published without a tag is the one bad end state `changeset publish`
   does not report on its own.

**The filename is fixed.** Each of the five packages has a Trusted Publisher on
npmjs.com naming this repository and `release.yml`. npm matches that string
exactly and a configuration cannot be edited, only deleted and recreated
(https://docs.npmjs.com/trusted-publishers/). Renaming the file breaks every
publish.

**If a publish half-fails.** `changeset publish` publishes each package
separately, so some can land and others fail. It publishes only versions the
registry does not already have, and the workflow pushes the tags for whatever
did publish before failing. So the recovery is to fix the cause and dispatch the
workflow again on the same commit: the packages already on the registry are
skipped, the rest are published. Do not bump versions to work around a failure,
and do not unpublish. If the job failed after publishing but before pushing tags
(the log says so), push the tags by hand from a checkout of that commit.

## The rules that are not negotiable

These come from CLAUDE.md and they are enforced by tests, not by review alone.

- **FlowDoc is the only interchange format.** Everything reads and writes it.
- **References are tokens**, never literal ARNs. Lint fails on `arn:aws:` in
  authored content, and that rule blocks a studio save.
- **Never drop content.** An action the builder does not model round-trips
  verbatim as a `GenericBlock`, through synth, codegen, the studio, and both
  emitters.
- **Deterministic output.** The same input produces byte-identical output. If
  you add a code path that emits anything, add a test that runs it twice and
  compares bytes.
- **Round-trip invariants hold.** `synth(codegen(doc))` equals `doc`, and the
  studio may not turn a modeled block into a generic one.

## Tests must be able to fail

This project has repeatedly shipped guards that looked enforced and were not: a
save gate that could be deleted with every test still passing, an export path
that bypassed it, a live test that accepted every possible outcome, and an
oracle whose error handler swallowed its own alarms.

So when you add a guarantee, prove the test for it can fail. Delete or neuter
the mechanism, watch the test go red, restore it, watch it go green. Say so in
the pull request. A test that passes when the feature is gone is worse than no
test, because it reports safety that is not there.

## Conformance fixtures

`conformance/` is the cross-language contract; a future Go provider vendors it
and must pass identically. Every lint rule, builder feature, codegen case, and
emitter case lands with fixtures **in the same commit** as the code.

Fixtures are data. They are excluded from ESLint and Prettier so goldens stay
byte-stable. Regenerate emitter goldens with `UPDATE_GOLDENS=1`.

## Docs and citations

Update docs in the same commit as the change. No em-dashes.

Cite an AWS documentation URL in a comment for any AWS behavior you rely on.
Several times this project has found the documentation contradicting an
assumption that looked obviously true, so the citation is the point rather than
a formality.

## Commits

Small conventional commits. Explain why in the body, not just what.

## Licensing

Apache-2.0. `npm run headers:fix` applies the header; `npm run lint` fails
without it. The copyright holder is deliberately entity-neutral and lives in a
single constant in `scripts/license-headers.mjs`.

The header goes on files in this repository, never on files the tools generate
into someone else's project. Codegen output, the CDK scaffold, and the
Terraform emitter's files carry a "Generated by" banner and no copyright line.
