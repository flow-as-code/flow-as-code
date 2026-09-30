---
name: promote-connect-flows
description: Set up or change how Amazon Connect contact flows are promoted between environments (dev, staging, prod) with the flow-as-code Terraform provider, the flow-cli emitters or the CDK construct, without per-environment ARN tables. Use when laying out flows and environments in Terraform, writing a CI/CD pipeline for flows, binding references per environment, or releasing a shared flow module through versions and aliases.
license: Apache-2.0
---

# Promote Amazon Connect flows across environments

A flow is promoted when every environment runs the same flow document, each
bound to its own queues, hours of operation, functions and prompts. The
document names those by reference key (`"queue:appointments"`); only the
binding of keys to real resources differs per environment. Never copy a flow
and edit ARNs, and never keep a table of ARNs per environment.

## Terraform provider layout (recommended)

```
flows/        a Terraform module: the flows, once (.flow.tf files, variables.tf, outputs.tf)
envs/dev/     root module: providers, backend, dev's resources, one module call
envs/prod/    root module: providers, backend, prod's resources, one module call
```

In the flows module, bind each key to a module variable:

```hcl
  refs = {
    "hours:main-line"           = var.main_line_hours_arn
    "lambda:appointment-lookup" = var.appointment_lookup_arn
    "queue:appointments"        = var.appointments_queue_arn
  }
```

Bind each key individually; `refs = var.refs` is refused by the studio and
flow-cli. The module declares `required_providers` for
`flow-as-code/flowascode` and has no provider block.

Each root module calls the module with its own addresses: resources it
creates (`aws_connect_queue.appointments.arn`), data sources by name
(`data.aws_connect_queue.appointments.arn` with `name = "appointments"`), or
another team's remote state
(`data.terraform_remote_state.platform.outputs.appointments_queue_arn`). The
module call is the only place environments differ.

Export a document hash from the module so a pipeline can prove prod runs what
dev ran:

```hcl
output "appointment_line_document_sha256" {
  value = sha256(flowascode_contact_flow.appointment_line.flowdoc)
}
```

`flowdoc` holds the flow with its references still tokens, so the hash is
equal across environments exactly when the flows are, and it is known at plan
time. Do not use `content_hash` for this: it hashes the content Connect holds,
with each environment's ARNs filled in.

## Pipeline

- Pull request: `terraform plan` in every environment. Lint findings and each
  environment's diff show in review.
- Merge to main: apply dev; record the document hash output.
- Prod: `terraform plan -out=tfplan`, read
  `.planned_values.outputs.<name>_document_sha256.value` from
  `terraform show -json tfplan`, stop unless it equals dev's, then wait for
  an approval and `terraform apply tfplan`.
- Authenticate with GitHub OIDC and a role per environment; store no keys.
- Roll back by reverting the commit; the revert goes through the same stages.

A complete GitHub Actions workflow for this layout, with every action pinned to
a commit: https://github.com/flow-as-code/flow-as-code/blob/main/examples/terraform-provider/ci/promote-flows.yml

## Shared flow modules

Flows invoke a shared module through an alias, and the alias points at a
version keyed to the module's content:

```hcl
resource "flowascode_contact_flow_module_version" "greeting" {
  instance_id            = var.connect_instance_id
  contact_flow_module_id = flowascode_contact_flow_module.greeting.contact_flow_module_id
  content_hash           = flowascode_contact_flow_module.greeting.content_hash

  lifecycle {
    create_before_destroy = true
  }
}

resource "flowascode_contact_flow_module_alias" "greeting_live" {
  instance_id                 = var.connect_instance_id
  contact_flow_module_id      = flowascode_contact_flow_module.greeting.contact_flow_module_id
  name                        = "live"
  contact_flow_module_version = flowascode_contact_flow_module_version.greeting.version
}
```

The flow binds `"module:greeting@live" = flowascode_contact_flow_module_alias.greeting_live.arn`.
`create_before_destroy` is required: Connect refuses to delete a version an
alias points at, so the new version must exist before the alias moves. Keep
these resources in the flows module so they promote with the flows.

## Without the provider

- `flow-cli emit <dir> --target flowascode --address-map refs.<env>.tfmap.json`
  writes the provider's resources from FlowDocs; `--target tf` writes
  `aws_connect_contact_flow` resources for `hashicorp/aws`. The address map
  holds Terraform addresses, never ARNs; the emitter refuses a value matching
  `arn:aws`.
- CDK: `FlowSet` takes a `TokenBinder` per stack that returns construct
  attributes or `Fn.importValue(...)`; no map at all.

## Checklist

- Actions hold keys; only `refs` holds addresses; no ARN anywhere in a flow.
- One flows module, one root module per environment, separate state and
  credentials per environment.
- Plans for every environment on every change; prod applies the commit dev
  applied, and the document hash says so.
