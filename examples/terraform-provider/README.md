# The Terraform provider example

One flow, authored in HCL for the `flow-as-code/flowascode` provider, deployed
to a dev and a prod environment from the same commit, and a cookbook of
smaller flows beside it. The tutorials walk through it step by step; this page
is the map of the files.

Everything here was applied to a live Amazon Connect instance on 2026-09-29
with Terraform 1.8.5 and provider v0.1.0 from the Terraform Registry, then
destroyed. `tests/terraformProviderExample.test.ts` holds the parts that do not
need an AWS account on every push: every flow reads back through the HCL reader,
lints clean, and is already `terraform fmt` output; the flows module's
companion regenerates byte for byte; the environments differ only where they
should.

## What is here

```
flows/                           a Terraform module holding the flows
  appointment-line.flow.tf       the flow, as a flowascode_contact_flow resource
  appointment-line.flowdoc.json  the same flow as a FlowDoc, for the studio
  variables.tf                   the instance, and one ARN per reference
  outputs.tf                     the flow's ARN and its document hash
  versions.tf                    the provider the module needs
envs/dev/                        dev: creates its own hours, queue and function
envs/platform/                   a platform team's configuration prod reads
envs/prod/                       prod: reads the platform's state
cookbook/                        eight flows, one pattern each, and what they bind
ci/promote-flows.yml             a GitHub Actions pipeline: plan, dev, then prod
```

## The flow is written once

`flows/appointment-line.flow.tf` is the demo appointment line: it checks
hours of operation, sets a queue, looks the caller up with a Lambda function,
and transfers. It names what it uses by reference key, never by ARN:

```hcl
    check_hours_of_operation {
      hours_of_operation_id = "hours:main-line"
    }
```

and binds each key once, in the resource's `refs` map, to a variable of the
module:

```hcl
  refs = {
    "hours:main-line"           = var.main_line_hours_arn
    "lambda:appointment-lookup" = var.appointment_lookup_arn
    "queue:appointments"        = var.appointments_queue_arn
  }
```

The module has no provider block and no credentials. Each environment's root
module configures the providers and passes its own ARNs in.

## Two environments, one module call each

`envs/dev/main.tf` creates the hours, the queue and the function, and calls the
module with their attributes. `envs/prod/main.tf` creates none of them; it
reads a platform team's state and calls the same module with its outputs. The
module call is the only place the two differ:

```hcl
module "flows" {
  source = "../../flows"

  connect_instance_id    = var.connect_instance_id
  main_line_hours_arn    = aws_connect_hours_of_operation.main_line.arn
  appointment_lookup_arn = aws_lambda_function.appointment_lookup.arn
  appointments_queue_arn = aws_connect_queue.appointments.arn
}
```

```hcl
module "flows" {
  source = "../../flows"

  connect_instance_id    = var.connect_instance_id
  main_line_hours_arn    = data.terraform_remote_state.platform.outputs.main_line_hours_arn
  appointment_lookup_arn = data.terraform_remote_state.platform.outputs.appointment_lookup_arn
  appointments_queue_arn = data.terraform_remote_state.platform.outputs.appointments_queue_arn
}
```

Both applies printed the same `appointment_line_document_sha256`,
`3d12a6cd22f8e04018712c78915e89cef32b09d60849b573a7af41f14a641e65`: the hash
of the flow as a FlowDoc, with its references still tokens. Prod ran the
document dev ran. Connect holds a different ARN in each environment, and only
there.

## Running it

You need Terraform 1.8 or later or OpenTofu 1.10 or later (the provider is on
both registries), credentials for an AWS account, and the
id of an Amazon Connect instance in it. The dev and platform roots also need an
`appointment-lookup.zip` for the function, which is yours to supply; any
Node.js handler returning a string map will do.

```
cd envs/dev
export TF_VAR_connect_instance_id=<your instance id>
terraform init
terraform apply
```

The region is in each root's `providers.tf`. The tutorials show the output of
every step and what to change for your own flows:

- [Your first flow with the Terraform provider](../../docs/tutorials/01-first-flow.md)
- [Promote a flow from dev to prod](../../docs/tutorials/02-promote.md)
- [Bring existing flows under Terraform](../../docs/tutorials/03-adopt.md)
- [Edit a .flow.tf in the studio](../../docs/tutorials/04-studio.md)
- [The flow cookbook](cookbook/README.md)
