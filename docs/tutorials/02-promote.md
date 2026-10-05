# Promote a flow from dev to prod

A contact flow is promoted when prod runs exactly what dev ran, bound to prod's
own queues, hours and functions. With the Terraform provider that means one
copy of the flow, in a Terraform module, applied from the same commit by each
environment's root module. Nothing is copied, exported, find-and-replaced or
re-pasted between environments.

This tutorial continues [Your first flow with the Terraform provider](01-first-flow.md)
and uses the same `examples/terraform-provider/`. Outputs are from a live run
on 2026-09-29 (Terraform 1.8.5, provider v0.1.0), identifiers masked.

## The shape: one module, one root per environment

```
flows/            the flows, once: a Terraform module
envs/dev/         dev's root module: providers, backend, dev's resources
envs/prod/        prod's root module: providers, backend, prod's resources
```

The flow refers to what it uses by key (`"queue:appointments"`), and binds
each key in `refs` to a variable of the module. Each root module calls the
module and says what the variables are in its environment. That call is the
only place the environments differ.

Dev creates its own resources:

```hcl
module "flows" {
  source = "../../flows"

  connect_instance_id    = var.connect_instance_id
  main_line_hours_arn    = aws_connect_hours_of_operation.main_line.arn
  appointment_lookup_arn = aws_lambda_function.appointment_lookup.arn
  appointments_queue_arn = aws_connect_queue.appointments.arn

  depends_on = [aws_connect_lambda_function_association.appointment_lookup]
}
```

Prod's are owned by a platform team, who publish them as outputs of their own
configuration, and prod reads their state:

```hcl
data "terraform_remote_state" "platform" {
  backend = "local"

  config = {
    path = "../platform/terraform.tfstate"
  }
}

module "flows" {
  source = "../../flows"

  connect_instance_id    = var.connect_instance_id
  main_line_hours_arn    = data.terraform_remote_state.platform.outputs.main_line_hours_arn
  appointment_lookup_arn = data.terraform_remote_state.platform.outputs.appointment_lookup_arn
  appointments_queue_arn = data.terraform_remote_state.platform.outputs.appointments_queue_arn
}
```

In a real organization the remote state is an S3 or HCP Terraform backend, not
a sibling directory. Neither environment writes an ARN into a file: each value
is an address Terraform resolves.

## Step 1: apply dev

As in the first tutorial:

```
cd examples/terraform-provider/envs/dev
terraform apply
```

```
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.

Outputs:

appointment_line_document_sha256 = "3d12a6cd22f8e04018712c78915e89cef32b09d60849b573a7af41f14a641e65"
```

`appointment_line_document_sha256` comes from the module's `outputs.tf`,
which is what `flow-cli emit --target flowascode` writes beside `flows.tf`
for every document, named by its FlowDoc name (a test holds the example's
copy to the emitter's):

```hcl
output "appointment_line_document_sha256" {
  description = "SHA-256 of flow appointment-line as a FlowDoc, references still tokens: equal across environments that apply the same document."
  value       = sha256(flowascode_contact_flow.appointment_line.flowdoc)
}
```

`flowdoc` is the flow as a FlowDoc with its references still tokens, so it
names no environment. Its hash is the flow's identity across environments.
(`content_hash` would not do: it hashes the content Connect holds, in which
each environment's ARNs are filled in.)

## Step 2: apply prod

The platform team's configuration exists first; in the example it is
`envs/platform/`, which creates the same kinds of resources and publishes
their ARNs:

```
cd ../platform && terraform apply
Apply complete! Resources: 5 added, 0 changed, 0 destroyed.
```

Then prod:

```
cd ../prod
terraform plan -out=tfplan
```

```
Plan: 1 to add, 0 to change, 0 to destroy.

Changes to Outputs:
  + appointment_line_document_sha256 = "3d12a6cd22f8e04018712c78915e89cef32b09d60849b573a7af41f14a641e65"
```

The hash is known at plan time and equals dev's. Prod is about to run the
document dev runs, before anything changes in prod.

```
terraform apply tfplan
```

```
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.

Outputs:

appointment_line_document_sha256 = "3d12a6cd22f8e04018712c78915e89cef32b09d60849b573a7af41f14a641e65"
```

In Connect, the two flows differ in exactly the ARNs: prod's
`UpdateContactTargetQueue` names the platform's queue, dev's names dev's.

## Step 3: let a pipeline do it

`examples/terraform-provider/ci/promote-flows.yml` is a GitHub Actions
workflow for this layout. A pull request plans both environments, so lint
findings and the diff for each environment show up in review. A merge to
`main` applies dev, then plans prod and stops unless prod's plan carries the
document dev applied:

```yaml
- name: prod runs the document dev ran
  env:
    DEV_DOCUMENT: ${{ needs.dev.outputs.document }}
  run: |
    prod=$(terraform show -json tfplan | jq -r '.planned_values.outputs.appointment_line_document_sha256.value')
    if [ "$prod" != "$DEV_DOCUMENT" ]; then
      echo "::error::prod would run flow document $prod; dev ran $DEV_DOCUMENT"
      exit 1
    fi
```

and then waits for a reviewer on the `prod` environment before applying. It
authenticates to AWS through GitHub's OIDC provider, so no AWS key is stored
anywhere. The file's header lists the roles and variables it expects.

Rolling back is the same pipeline: revert the commit, merge, and the reverted
document goes through dev and then prod.

## Another layout: look resources up by name

If both environments name their resources the same way, one root module can
find them with `hashicorp/aws` data sources, and the environments differ only
in the instance id and the credentials:

```hcl
data "aws_connect_hours_of_operation" "main_line" {
  instance_id = var.connect_instance_id
  name        = "main-line"
}

data "aws_connect_queue" "appointments" {
  instance_id = var.connect_instance_id
  name        = "appointments"
}

data "aws_lambda_function" "appointment_lookup" {
  function_name = "appointment-lookup"
}

module "flows" {
  source = "../flows"

  connect_instance_id    = var.connect_instance_id
  main_line_hours_arn    = data.aws_connect_hours_of_operation.main_line.arn
  appointment_lookup_arn = data.aws_lambda_function.appointment_lookup.arn
  appointments_queue_arn = data.aws_connect_queue.appointments.arn
}
```

Run it once per environment with that environment's credentials and
`TF_VAR_connect_instance_id`, from a separate state per environment (a
workspace each, or a backend key each). This configuration was validated
against the providers' schemas; it was not applied in the run above.

## Shared modules: versions and aliases

A flow module that several flows invoke promotes the same way, with one more
step. The flow does not invoke the module's latest content; it invokes an
alias, and the alias points at a version:

```hcl
resource "flowascode_contact_flow_module_version" "greeting" {
  instance_id            = var.connect_instance_id
  contact_flow_module_id = flowascode_contact_flow_module.greeting.contact_flow_module_id
  content_hash           = flowascode_contact_flow_module.greeting.content_hash
  description            = "Greeting as reviewed"

  lifecycle {
    create_before_destroy = true
  }
}

resource "flowascode_contact_flow_module_alias" "greeting_live" {
  instance_id                 = var.connect_instance_id
  contact_flow_module_id      = flowascode_contact_flow_module.greeting.contact_flow_module_id
  name                        = "live"
  contact_flow_module_version = flowascode_contact_flow_module_version.greeting.version
  description                 = "The version callers hear"
}
```

and the flow binds `module:greeting@live` to the alias:

```hcl
  refs = {
    "module:greeting@live" = flowascode_contact_flow_module_alias.greeting_live.arn
  }
```

When the module's content changes, the plan replaces the version (it is keyed
to `content_hash`), creates the new one first, moves the alias to it in place,
then deletes the old one. Connect refuses to delete a version an alias still
points at, which is why `create_before_destroy` is not optional here. The
alias's `arn` is the module ARN qualified by the alias id, the only form
Connect runs as the alias. Put these resources in the flows module and they
promote with it: dev's alias moves when dev applies, prod's when prod does.
`examples/terraform-provider/cookbook/` has all three resources, applied live.

## Other deploy paths

The same idea works without the provider:

- `flow-cli emit --target flowascode --address-map refs.prod.tfmap.json`
  writes these resources from a FlowDoc, with each environment's addresses in
  a small JSON map; `--target tf` writes `aws_connect_contact_flow` resources
  for `hashicorp/aws` instead.
- The CDK construct takes a binder per stack.

[Promote one flow across two environments](../../examples/promote-across-environments/README.md)
runs all three from one document, with a test holding that the environments
differ in exactly one file.

## Checklist

- The flow's actions name reference keys; only `refs` holds addresses.
- The flows live in a module with no provider block.
- Each environment has its own root module, state and credentials.
- Plans run on pull requests, for every environment.
- Prod applies the commit dev applied, and the document hash says so.
