---
name: adopt-connect-flows
description: Bring existing Amazon Connect contact flows and flow modules under Terraform with the flow-as-code/flowascode provider without recreating them, from the console (import blocks, flow-cli export) or from hashicorp/aws aws_connect_contact_flow resources (moved blocks). Use when a flow already exists in a Connect instance and should be managed as code, or when migrating off aws_connect_contact_flow.
license: Apache-2.0
---

# Adopt existing Amazon Connect flows

Adopting a flow keeps its id and ARN, so phone numbers, other flows'
transfers and anything else pointing at it keep working. Pick the route by
where the flow is managed today:

| Today                                   | Route                                                          |
| --------------------------------------- | -------------------------------------------------------------- |
| Console, a few flows                    | `import` block per flow, `-generate-config-out`                |
| Console, many flows                     | `flow-cli export --author tf`, then an `import` block per flow |
| `aws_connect_contact_flow` in Terraform | `moved` block per flow                                         |

## Import blocks

The import id is `<instance id>:<flow id>`; both are in the flow's ARN
(`.../instance/<instance id>/contact-flow/<flow id>`). Modules use
`<instance id>:<module id>`, aliases `<instance id>:<module id>:<alias id>`.

```hcl
import {
  to = flowascode_contact_flow.appointment_line
  id = "<instance id>:<flow id>"
}
```

`terraform plan -generate-config-out=generated.tf` writes the flow as action
blocks. The provider has already turned each ARN in the flow into a reference
key found in the instance's inventory; the ARNs themselves are left as `refs`
values. Before committing:

1. Replace every `refs` value with the address of the resource that manages
   it (a resource attribute, data source, remote state output or module
   variable). Leave no ARN.
2. Replace the literal `instance_id` with `var.connect_instance_id`.
3. Plan until the plan is empty: then the configuration describes the flow as
   it is and applying changes nothing. The `null` attributes the generator
   writes (`settings = null`, `next = null`, ...) are unset and can stay.

A Connect name that is not a slug ("Main Line") is kept as
`display_name = "Main Line"` with `name = "main-line"`; the first apply
renames nothing.

Once its `refs` hold addresses and `instance_id` a variable, generated
configuration reads through `npx flow-cli synth <name>.flow.tf` and opens in
the studio, which rewrites it in canonical order on the next save; an ARN left
in `refs` is refused there. Export writes the canonical form directly.

## flow-cli export

```
npx flow-cli export --instance <instance ARN> --out flows/ --author tf
```

writes `<name>.flowdoc.json` and `<name>.flow.tf` for every flow and module,
in canonical form: reference keys in actions, each `refs` entry `null` under a
`# TODO` comment for you to bind, `display_name` where the console name is not
a slug, console positions kept. A flow that refers to something the instance's
inventory does not list (a Lambda function in another region, a deleted
queue) fails by name rather than writing its ARN; fix the flow or associate
the resource, and export again. Then add an `import` block per flow and plan
until empty. Exported flows carry the console's action ids (UUIDs); renaming
them changes nothing in behaviour but produces a diff on every action.

`npx flow-cli lint flows/` after an export shows which console flows break a
rule the provider enforces at plan time.

## From hashicorp/aws

Write a `flowascode_contact_flow` for the same flow, delete the
`aws_connect_contact_flow`, and add:

```hcl
moved {
  from = aws_connect_contact_flow.appointment_line
  to   = flowascode_contact_flow.appointment_line
}
```

Needs Terraform 1.8 or later, or OpenTofu 1.10 or later.
`aws_connect_contact_flow_module` moves to `flowascode_contact_flow_module`
the same way. The move copies identity and name; the next plan writes the
actions from configuration and is empty when they match the live flow. To
write the new resource, export the live flow (above) or, when the old
resource was emitted by `flow-cli emit --target tf`, run
`npx flow-cli codegen <doc>.flowdoc.json --to tf` on the FlowDoc it came from.

## After adopting

Bind references per environment and promote from a module: see the
promote-connect-flows skill.
