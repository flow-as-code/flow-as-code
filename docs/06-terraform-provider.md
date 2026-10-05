# Terraform provider and the HCL view

Phase B adds a third way to author a flow, HCL, and a Terraform provider that
applies it. This page is the reader's map: what the provider is, what a
`.flow.tf` looks like, how it pairs with a document, which versions work
together, how to migrate from `hashicorp/aws`, and how the provider is
published. The contract itself is `conformance/hcl/README.md`; the decisions
are ADR-0006 and ADR-0007. To learn it by doing, start with
[Your first flow with the Terraform provider](tutorials/01-first-flow.md).

## What it is

`flow-as-code/flowascode` is a Terraform provider (Terraform 1.8 and later,
OpenTofu 1.10 and later) whose resources take a flow's actions as HCL blocks
and create, update and delete the flow through the Amazon Connect API:

- `flowascode_contact_flow`: a flow, with its Connect type.
- `flowascode_contact_flow_module`: a flow module, with its settings.
- `flowascode_contact_flow_module_version`: a snapshot of a module, keyed to
  its content hash.
- `flowascode_contact_flow_module_alias`: a named pointer at a version. Its
  `arn` is the module ARN qualified by the alias id, the only form Connect
  runs as the alias (contract rule 27 records the run that showed it).
- `data.flowascode_view`: an AWS-managed or custom view, by name and type.

It is not the emitter. `flow-cli emit --target tf` still writes
`aws_connect_contact_flow` resources over rendered content for anyone who
stays on `hashicorp/aws`; `--target flowascode` writes the provider's
resources. Pick `tf` when the flows are generated artifacts nobody edits as
HCL; pick `flowascode` when the flows are authored in HCL, reviewed as HCL, or
need plan-time lint.

`--target flowascode` writes `flows.tf`, `variables.tf` and
`versions.tf.example` for a set of documents, never a per-document
`<name>.flow.tf`, so an emit into a directory the studio serves cannot create
a companion. Each document is one resource; its `refs` map binds each key to
the address the address map gives, to a resource the set emits itself (a flow,
a module, or a module invoked by alias through the version and alias resources
the emitter writes beside it), or to `null` under a `# TODO` comment, which
the provider refuses at plan time naming the key. The goldens are
`conformance/hcl/emit/`, one case per `emit-tf` case.

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
and says what it drops.

The commands that write or read a companion take either kind:
`flow-cli codegen <doc> --to tf` writes `<name>.flow.tf` (without `--to`, the
kind the document's `meta.sourceKind` names), `flow-cli synth <name>.flow.tf`
reads one back in process, and `flow-cli export --author tf` writes one per
exported document. `flow-cli init --author tf` scaffolds a document with a
`.flow.tf`, and `flow-cli studio` watches `.flow.tf` companions as it watches
`.flow.ts` ones: an edit re-syncs the canvas within a second, a canvas save
regenerates the file keeping what it carries, and a name with both companions
is refused until one goes. In the studio the toolbar badges the open
document's companion, New flow picks the companion for a new document, and a
`.flow.tf`'s `lint` block reaches the lint panel, and "Export as…" offers
"Terraform (flowascode provider)", the same bytes as `emit --target
flowascode`. `packages/cli/README.md` has the details.

## Versions and compatibility

The provider has its own semantic version from v0.1.0 and records the commit
of `conformance/` it vendors. The FlowDoc format version it reads is the one
the schema under `conformance/schema/` names at that commit.

| Provider | FlowDoc | Schema file             | Terraform     | OpenTofu       |
| -------- | ------- | ----------------------- | ------------- | -------------- |
| 0.1.x    | 0.2     | flowdoc-0.2.schema.json | 1.8 and later | 1.10 and later |

A repository test holds the table's FlowDoc column to `FLOWDOC_VERSION` and
its schema file to one present under `conformance/schema/`.

## Migrating from hashicorp/aws

The provider's guide `migrate-from-aws-provider` (in its registry
documentation) has the steps. Two ways in, neither recreating the flow:

- A `moved` block from `aws_connect_contact_flow` or
  `aws_connect_contact_flow_module` (Terraform 1.8, OpenTofu 1.10). The move
  copies the flow's identity and live attributes; the next plan writes the
  actions from the configuration, and when they describe the same flow
  nothing changes in Connect.
- `terraform import`, or an `import` block with `-generate-config-out`. The
  provider reads the live flow back as action blocks, with reference keys in
  the fields and each key bound in `refs` to the ARN it found in the
  instance's inventory. Replace those ARNs with the addresses of the
  resources that manage them: the provider accepts an ARN as a `refs` value
  (it cannot tell one from a resolved address), but the TypeScript reader,
  and so the studio, refuses it (`LITERAL_ARN`, rule 20).

A flow or module whose Connect name is not a slug (a console's "Main Line")
keeps it: `name` becomes the slug and `display_name` the Connect name, so
adopting it renames nothing.

## Publishing and the acceptance gate

Releases are tagged `v*` in the provider repository. The release workflow
checks the tag is on main, the changelog has the version, and the unit and
conformance lane passes, with no credentials; goreleaser then builds and
signs `SHA256SUMS` in a GitHub Environment whose GPG key and required reviewer
mean a tag alone cannot publish. The signing key's fingerprint is in the
provider repository's `SECURITY.md`, and its public half is `signing-key.asc`
there. Every pull request also runs live acceptance tests against a sandbox
Connect instance on both floors (Terraform 1.8, OpenTofu 1.10), and an
unreachable sandbox blocks the merge.

v0.1.0 was published on 2026-09-29. The Terraform Registry serves it at
https://registry.terraform.io/providers/flow-as-code/flowascode, and the
OpenTofu registry has listed it since 2026-09-30; `terraform init` and
`tofu init` both install it with its signature checked. This repository's
emit-tf job validates the provider-shaped output against the published
provider on OpenTofu 1.10 and a current release (task B03e).

## Considered and not used

Provider-defined functions, a `provider::flowascode::flowdoc()` that would
turn HCL into a document at plan time, were considered as a way to keep
`hashicorp/aws` as the only resource provider. They were not used: the
document would still need API calls only a managed resource can make, and a
function cannot carry the plan-time diagnostics the lint rules produce.
