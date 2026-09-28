# B02 The HCL contract

Deliverables: `conformance/hcl/`, the rules for writing a FlowDoc as a `flowascode_contact_flow` or `flowascode_contact_flow_module` resource and reading it back, frozen as byte-exact fixtures before either implementation exists, so that `@flow-as-code/hcl` (B03) and the Go provider (B04) are built against the same goldens; the round-trip rule and the list of families a second implementation must pass; the provider document skeleton and the two ADRs.
Acceptance: `conformance/hcl/README.md` states the resource shape, attribute and block order, string and number rendering, the transitions normal form, the position rule, the banner, the `@keep` rule, the carryover set, the error codes and the module version and alias shapes; every round-trip golden is a `tofu fmt` fixed point, held by a gated test that is proven able to fail; an ungated test holds every case to a FlowDoc 0.2 in synth normal form, its bindings to the document's references and its sub-block names to the catalog; parse and refuse cases cover hand-written inputs and every error code; `conformance/README.md` names the family and the round-trip rule; docs/06, ADR-0006 and ADR-0007 are published pages.

## Sub-tasks

| #    | Scope                                                                                      |
| ---- | ------------------------------------------------------------------------------------------ |
| B02a | README, address sugar, roundtrip and regenerate goldens, the fmt gate, the structural test |
| B02b | parse and refuse cases                                                                     |
| B02c | the round-trip rule in conformance/README.md and the family index test                     |
| B02d | docs/06, ADR-0006, ADR-0007, site pages, changeset                                         |

## Assumptions

- The goldens were drafted with a throwaway generator in a scratch directory, never committed, and then read line by line; they are the contract, and B03's writer must reproduce them, not the other way round.
- The fmt fixed points were checked against OpenTofu 1.12.6 (`tofu fmt`), the binary the repository's gated tests already use. `terraform fmt` shares the formatter (hclwrite); the plan's verify-at-implementation item on alignment inside `jsonencode({...})` and after a multi-line attribute is answered by the goldens themselves, which carry both.

## Notes (2026-09-28, B02a)

- Twelve round-trip cases: the demo with every reference bound and with one unbound, a module with empty and with non-empty `Settings`, a generic-only flow, hand-placed positions with an explicit start, hostile text, a lint block, a description with tags, the flow-control numbers, the participant actions, and the recording block. Each borrows its document from elsewhere under `conformance/` except `module-settings`, whose document lives beside it. `bindings.json` is the address map; `case.json` carries the options a companion holds that a document does not (`instanceId`, `tags`, `lintDisable`).
- Rule 10's typed-or-generic test is the catalog's shape, not the builder's: the recording case's chat form is typed here (its `ChatBehavior` is a `json` kind) and a GenericBlock in codegen. The two agree on the action either way, which is all the round-trip invariant asks.
- Seven regenerate cases pin the carryover set: kept comments, a refs value carried whatever its expression, a stale key dropped, a new key written null with its TODO, address sugar normalized, extras (provider, state, tags, lint, lifecycle, depends_on) carried, and the instance id carried.
- `packages/core/src/hcl-conformance.test.ts` is ungated and structural; `packages/tf/src/hcl-fmt.test.ts` runs `tofu fmt -check` behind `RUN_TOFU_VALIDATE=1`, through the one tofu harness. Neutered and watched go red: a binding to a key the document lacks, a sub-block the catalog does not know, a misaligned attribute.
