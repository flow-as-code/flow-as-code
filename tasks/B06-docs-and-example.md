# B06: docs, site, promotion example, ADRs

Phase B, the approved plan (settled decisions 7, 9 and 10). The release-facing
half of Phase B: what a reader of this repository sees once the provider is
on both registries.

## Acceptance criteria

- B06a: `examples/promote-across-environments/flowascode/{dev,prod}` (provider
  `~> 0.1`, no credentials, the same resources and remote-state halves as the
  Terraform path), a README step 2b with real transcripts, and
  `tests/promoteAcrossEnvironments.test.ts` holding the two flowascode trees
  to a difference in exactly `flows.tf`, byte-identical with the `refs` blocks
  removed. docs/06's remaining "to be completed" sections and compatibility
  table filled. The `README.md` quick start and flow diagram, and the
  packages list in `site/index.html`. ADR-0007's round-trip-limits section.
  ADR-0004 superseded rather than edited where its "output alongside CDK"
  difference stops holding. A `CLAUDE.md` "Where things stand" entry for the
  provider repository, the registries and the hcl package.
- Gated on B03e (the provider resolving from both registries): the step 2b
  validation, and every public text that tells a reader to install the
  provider.

## Notes (2026-09-29, B06a early)

- Landed ahead of B03e, because none of it tells a reader to install
  anything: the flowascode halves of the promotion example, step 2b, the
  test, and ADR-0007's round-trip limits. The step 2b validation is an
  `it.todo` in the test and a sentence in the example's README until the
  provider is on a registry.
- The flowascode trees are three files each (`flows.tf`, `variables.tf`,
  `versions.tf.example`), and dev and prod differ only in the three `refs`
  values. Mutation-verified: emitting prod with dev's map, a refs pattern that
  matches nothing, and a `resources.tf` copy that drifts from the Terraform
  path's each turn the test red.
- ADR-0007's limits each name the fixture or test that holds them. One did
  not exist: that moving blocks in the console is not drift. The provider
  gained `TestLayoutIsNotDrift` for it.
- Still to do after B03e: the README quick start and diagram, the site's
  packages list, docs/06's compatibility row, ADR-0004, and `CLAUDE.md`.
