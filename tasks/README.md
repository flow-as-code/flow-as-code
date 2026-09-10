# Phase A: OSS foundation (current focus)

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
