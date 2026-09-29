# ADR-0006: A Terraform provider of managed resources that take action blocks

Status: accepted, 2026-09-11

## Context

Phase A deploys flows through Terraform one way: `@flow-as-code/tf` turns a
FlowDoc set into `aws_connect_contact_flow` resources whose `content` is a
`templatefile` over a rendered `.flow.tftpl`, with the reference ARNs bound in
`flow_refs.tf`. A flow is authored in TypeScript or on the studio canvas, and
Terraform sees only the rendered JSON. Four documents recorded the reverse
direction, HCL to FlowDoc, as deferred to a "provider era".

The aim of Phase B is to author and manage flows natively in Terraform: the
actions written as HCL, validated at plan time, and applied through the
Connect API with no rendering step in between. Two shapes were considered. A
data source over the existing `hashicorp/aws` resource would turn HCL action
blocks into the `content` string and leave the create, update and delete
calls to `aws_connect_contact_flow`. A set of managed resources would own the
whole lifecycle and call the Connect API directly.

## Decision

Managed resources: `flowascode_contact_flow`, `flowascode_contact_flow_module`,
`flowascode_contact_flow_module_version`,
`flowascode_contact_flow_module_alias`, and a read-only `flowascode_view` data
source, in a separate repository, `flow-as-code/terraform-provider-flowascode`,
written in Go on the plugin framework and published as `flow-as-code/flowascode`
on the Terraform Registry and the OpenTofu registry from its first tag.

A resource takes one repeated `action` block: `id`, `next`, exactly one typed
sub-block named after the action type in snake_case (or `generic {}` for a
type the catalog does not model), then `condition` and `error` blocks, then an
optional `position`. Reference fields hold the key form of a reference
(`"queue:front-desk"`), and one `refs` map on the resource binds each key to a
Terraform expression; a literal ARN in a field or a `refs` value is a
plan-time error. Blocks were chosen over nested attributes against the plugin
framework's own advice ("Use nested attribute types instead of block types for
new schema implementations",
https://developer.hashicorp.com/terraform/plugin/framework/handling-data/blocks):
a flow is read top to bottom as a sequence of steps, which repeated blocks
show and a list attribute of objects hides behind brackets and commas.

The provider's schema is generated from `conformance/flow-language/catalog.json`,
the file that also holds `@flow-as-code/core`'s tables, so the two languages
cannot disagree about a parameter's name or kind. The provider vendors
`conformance/` at a pinned commit and passes the families
`conformance/README.md` names; its plan-time `flowdoc` attribute, the
canonical FlowDoc of the configuration with reference tokens in place, is
what the cross-language cases compare. Lint runs at plan time with the eleven
rules ported to Go; hard rules are errors and cannot be disabled, and the rest
are warnings that `lint { disable = [...] }` may silence.

The emitter keeps its `--target tf`. The provider is a second target,
`flowascode`, not a replacement, and docs/06-terraform-provider.md says when to
pick which.

## Consequences

Two implementations of one contract are held together by fixtures rather than
shared code, which is what `conformance/hcl/` is for (ADR-0007). The provider
uses the Connect API's own module version and alias operations, so it needs no
`awscc` resource; the emitter still writes those for the `tf` target.
Migration from `hashicorp/aws` is by `import` and `moved` blocks (the state
move needs Terraform 1.8 or OpenTofu 1.10 and later), so the provider's floor
is higher than the emitter's OpenTofu 1.7.0.

Live acceptance tests gate every provider pull request, a choice taken against
the recommendation: an unreachable sandbox account blocks every merge, and a
pull request from a fork cannot pass the gate.
