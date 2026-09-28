# B04: the Terraform provider

Phase B, plan `/Users/austinrose/.claude/plans/let-s-make-a-plan-glowing-sphinx.md` (settled decisions 1, 3, 4, 8 to 11, 13, 15, 17). The provider lives in its own repository, `flow-as-code/terraform-provider-flowascode` (Go); this file records what landed there and the operator actions it needs.

## Acceptance criteria

- B04a: a Go module serving `registry.terraform.io/flow-as-code/flowascode` over protocol 6, a provider block in hashicorp/aws's vocabulary on aws-sdk-go-base, and the repository hygiene this repository has (headers with one holder constant, no em-dashes, SHA-pinned actions with Dependabot, a CI workflow with no credentials).
- B04b: `conformance/` vendored at a pinned commit with an offline manifest check and a weekly canary that never gates.
- B04c, B04d: FlowDoc core and the 11 lint rules ported to Go, passing the vendored `schema`, `materialize`, `export`, `layout`, `roundtrip`, `migrate` and `lint` families.
- B04e to B04k: as the plan states.

## Operator actions

1. Repository: created 2026-09-28, public, `https://github.com/flow-as-code/terraform-provider-flowascode`. Repository id 1393284987, organization id 324946615 (both public identifiers, needed for the OIDC trust subject in action 2). Still to do by the owner: grant the Terraform Registry and Dependabot apps access, and enable private vulnerability reporting. Nothing has been pushed yet.
2. to 6.: not started.

## Notes (2026-09-28)

- B04a, B04b and the start of B04c are committed in the provider repository (local, unpushed): the bootstrap, the vendored conformance tree (at this repository's `e414239`, the phase-b branch, through `scripts/sync-conformance.sh --from <clone>` because those commits are not on GitHub yet), and `jsonv` plus `flowdoc.Serialize`, which matched `@flow-as-code/core`'s `serialize` byte for byte on all 81 vendored FlowDocs.
- Module versions resolved 2026-09-28: terraform-plugin-framework v1.19.0, terraform-plugin-go v0.31.0, terraform-plugin-testing v1.16.0, framework-validators v0.19.0, terraform-plugin-log v0.11.0, aws-sdk-go-base/v2 v2.0.0-beta.74, aws-sdk-go-v2/service/connect v1.202.0, aws-sdk-go-v2/config v1.33.6, santhosh-tekuri/jsonschema/v6 v6.0.3. The module declares go 1.25.0.
