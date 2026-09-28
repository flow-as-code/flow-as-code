# Terraform provider and the HCL view

Phase B adds a third way to author a flow, HCL, and a Terraform provider that
applies it. This page is the reader's map: what the provider is, what a
`.flow.tf` looks like, how it pairs with a document, which versions work
together, how to migrate from `hashicorp/aws`, and how the provider is
published. The contract itself is `conformance/hcl/README.md`; the decisions
are ADR-0006 and ADR-0007.

Sections marked "to be completed" fill in as their tasks land; each marker
names the task.

## What it is

`flow-as-code/flowascode` is a Terraform provider (Terraform 1.8 and later,
OpenTofu 1.10 and later) whose resources take a flow's actions as HCL blocks
and create, update and delete the flow through the Amazon Connect API:

- `flowascode_contact_flow`: a flow, with its Connect type.
- `flowascode_contact_flow_module`: a flow module, with its settings.
- `flowascode_contact_flow_module_version`: a snapshot of a module, keyed to
  its content hash.
- `flowascode_contact_flow_module_alias`: a named pointer at a version.
- `data.flowascode_view`: an AWS-managed or custom view, by name and type.

It is not the emitter. `flow-cli emit --target tf` still writes
`aws_connect_contact_flow` resources over rendered content for anyone who
stays on `hashicorp/aws`; `--target flowascode` writes the provider's
resources. Pick `tf` when the flows are generated artifacts nobody edits as
HCL; pick `flowascode` when the flows are authored in HCL, reviewed as HCL, or
need plan-time lint.

## The resource shape

```hcl
resource "flowascode_contact_flow" "appointment_line" {
  instance_id = var.connect_instance_id
  name        = "appointment-line"
  type        = "CONTACT_FLOW"

  refs = {
    "hours:main-line"    = aws_connect_hours_of_operation.main_line.arn
    "queue:appointments" = aws_connect_queue.appointments.arn
  }

  action {
    id   = "welcome"
    next = "check-hours"
    message_participant {
      text = "Thanks for calling."
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id = "hang-up"
    disconnect_participant {}
  }
}
```

One `action` block per action, in order. Inside it: `id`, `next`, one typed
sub-block named after the action type (`message_participant`,
`check_hours_of_operation`, and so on, the catalog's `block` name) or a
`generic` block for a type the tooling does not model, then `condition` and
`error` blocks, then `position` where the action sits somewhere other than
where auto-layout puts it. Reference fields hold a key (`"queue:front-desk"`)
that the `refs` map binds to a Terraform expression; a literal ARN is refused
at plan time. `conformance/hcl/README.md` has every rule, and its goldens are
the byte-exact examples.

## Companions

A document has one companion source, `<name>.flow.ts` or `<name>.flow.tf`,
paired by suffix and chosen when the document is created. The studio and the
bridge treat the two alike: a save regenerates the companion, an edit to the
companion re-syncs the canvas, and comments marked `@keep` survive either way.
What a `.flow.tf` carries beyond the document (its `refs` bindings,
`instance_id`, `tags`, `state` and `lint` settings) is kept across
regeneration. `flow-cli convert --to ts|tf` switches a document's companion
and says what it drops. To be completed by B03 (the CLI commands) and B05 (the
studio).

## Versions and compatibility

The provider has its own semantic version from v0.1.0 and records the commit
of `conformance/` it vendors. The FlowDoc format version it reads is the one
the schema under `conformance/schema/` names at that commit.

| Provider                | FlowDoc | Schema file             | Terraform     | OpenTofu       |
| ----------------------- | ------- | ----------------------- | ------------- | -------------- |
| to be completed by B04k | 0.2     | flowdoc-0.2.schema.json | 1.8 and later | 1.10 and later |

A repository test holds the table's FlowDoc column to `FLOWDOC_VERSION` and
its schema file to one present under `conformance/schema/`.

## Migrating from hashicorp/aws

To be completed by B04j. In outline: `terraform import` (or an `import` block
with `-generate-config-out`) takes an existing flow into
`flowascode_contact_flow`; the generated configuration carries literal ARNs in
reference fields, which the studio refuses until they are replaced by keys and
`refs` entries; a `moved` block from `aws_connect_contact_flow` or
`aws_connect_contact_flow_module` moves state without a destroy, on Terraform
1.8 and OpenTofu 1.10 and later.

## Publishing and the acceptance gate

To be completed by B04i and B04k. In outline: releases are tagged `v*` in the
provider repository, built by goreleaser, signed with a GPG key held in a
GitHub Environment behind a required reviewer, published to the Terraform
Registry and submitted to the OpenTofu registry; every pull request runs live
acceptance tests against a sandbox Connect instance on both floors, and an
unreachable sandbox blocks the merge.

## Considered and not used

Provider-defined functions, a `provider::flowascode::flowdoc()` that would
turn HCL into a document at plan time, were considered as a way to keep
`hashicorp/aws` as the only resource provider. They were not used: the
document would still need API calls only a managed resource can make, and a
function cannot carry the plan-time diagnostics the lint rules produce.
