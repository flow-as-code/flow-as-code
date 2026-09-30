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

## Notes (2026-09-29, tutorials, cookbook and agent skills)

- The provider was on the Terraform Registry (v0.1.0) with its OpenTofu
  listing pending, so the public texts said so. Both are resolved: OpenTofu
  listed it on 2026-09-30, the texts now name both registries, and B03e is
  done (tasks/B03).
- `examples/terraform-provider/`: a flows module, dev, platform and prod root
  modules, a cookbook of ten recipes and a GitHub Actions promotion pipeline.
  Every file was applied to the sandbox with Terraform 1.8.5 and provider
  v0.1.0, planned again clean, and destroyed; prod's plan carried dev's
  document hash (`3d12a6cd...`). Building the cookbook found the catalog
  errors fixed in #13 and #14 (actions.md rule 37): four recipes that linted
  clean were refused by Connect.
- Four tutorials (`docs/tutorials/`), the cookbook page and
  `docs/07-agent-skills.md` are published; every transcript in them is from
  the sandbox runs, identifiers masked.
- Agent Skills under `plugins/flow-as-code/skills/` (authoring HCL,
  promotion, adoption, flow-cli), installable as a Claude Code plugin from
  `.claude-plugin/marketplace.json`, validated with `claude plugin validate`
  and installed into a throwaway config. The action reference is generated
  from the catalog by `scripts/build-skill-reference.mjs`. The site publishes
  the skills under `/skills/` and lists them in `llms.txt`.
- `tests/terraformProviderExample.test.ts` and `tests/skills.test.ts` hold
  what can be held offline; each was shown red by breaking what it guards.
- Done from the list above: the README and landing page (provider, packages,
  diagram, tutorials, agent skills), docs/06's compatibility row and
  publishing section, and `CLAUDE.md`. Still open: ADR-0004.
