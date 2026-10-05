# Your first flow with the Terraform provider

This tutorial deploys a contact flow written in HCL to an Amazon Connect
instance with the `flow-as-code/flowascode` provider, then shows what the
provider does at plan time that a rendered JSON blob cannot: it lints the flow,
and it shows a change made in the Connect console as a change to one action.

It uses `examples/terraform-provider/` from the repository. Every output below
is from a run against a live instance on 2026-09-29 with Terraform 1.8.5 and
provider v0.1.0, with account and instance identifiers masked.

## What you need

- Terraform 1.8 or later, or OpenTofu 1.10 or later: the provider is on both
  registries, and every `terraform` command below is the same with `tofu`.
- Credentials for an AWS account with an Amazon Connect instance, and the
  instance's id (the last segment of its ARN).
- A clone of the repository, for the example's files.

## Step 1: declare the provider

The provider takes the same configuration vocabulary as `hashicorp/aws`
(region, profile, `assume_role`, endpoints), so one region and one set of
credentials serve both. `envs/dev/providers.tf`:

```hcl
terraform {
  required_version = ">= 1.8.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    flowascode = {
      source  = "flow-as-code/flowascode"
      version = "~> 0.1"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

provider "flowascode" {
  region = "us-east-1"
}
```

## Step 2: read the flow

`flows/appointment-line.flow.tf` is one `flowascode_contact_flow` resource with
one `action` block per action, in order. An action is its `id`, its `next`
action, one sub-block named after its Connect type, and its branches:

```hcl
  action {
    id   = "set-working-queue"
    next = "look-up-appointment"
    update_contact_target_queue {
      queue_id = "queue:appointments"
    }
    error {
      type = "NoMatchingError"
      next = "apologize"
    }
  }
```

`update_contact_target_queue` is the Flow language's `UpdateContactTargetQueue`
in snake case, and `queue_id` is its `QueueId` parameter. Every action type
the tooling models has a typed block like this; one it does not model yet goes
in a `generic` block with its type and its parameters as `jsonencode(...)`,
unchanged.

`"queue:appointments"` is a reference key, not an ARN. The resource's `refs`
map binds each key once to a Terraform expression, here a module variable:

```hcl
  refs = {
    "hours:main-line"           = var.main_line_hours_arn
    "lambda:appointment-lookup" = var.appointment_lookup_arn
    "queue:appointments"        = var.appointments_queue_arn
  }
```

That split is the point. The actions describe the flow and are the same in
every environment; `refs` says which queue `queue:appointments` is here, and it
is the only thing an environment changes.

## Step 3: plan

```
cd examples/terraform-provider/envs/dev
export TF_VAR_connect_instance_id=<your instance id>
terraform init
```

```
Initializing modules...
Initializing provider plugins...
- Installing flow-as-code/flowascode v0.1.0...
- Installed flow-as-code/flowascode v0.1.0 (self-signed, key ID 2C8E2160F58950AC)
- Installing hashicorp/aws v6.66.0...
- Installed hashicorp/aws v6.66.0 (signed by HashiCorp)
Partner and community providers are signed by their developers.
Terraform has been successfully initialized!
```

The key id is the project's release signing key; `SECURITY.md` in the
provider repository gives its full fingerprint.

```
terraform plan -out=tfplan
```

The plan shows the flow twice over. `flowdoc` is the flow as a FlowDoc, the
interchange format every flow-as-code tool reads, with its references still
tokens:

```
  # module.flows.flowascode_contact_flow.appointment_line will be created
  + resource "flowascode_contact_flow" "appointment_line" {
      + arn             = (known after apply)
      + contact_flow_id = (known after apply)
      + content         = (known after apply)
      + content_hash    = (known after apply)
      + flowdoc         = jsonencode(
            {
              + connectType = "CONTACT_FLOW"
              + content     = {
                  + Actions     = [
                      ...
                              + QueueId = "${cdref:queue:appointments}"
```

`content` is what Connect will hold, with each token replaced by the ARN its
`refs` entry resolves to; it is known after apply because the queue does not
exist yet. The plan ends:

```
      + name            = "appointment-line"
      + refs            = {
          + "hours:main-line"           = (known after apply)
          + "lambda:appointment-lookup" = (known after apply)
          + "queue:appointments"        = (known after apply)
        }
      + state           = (known after apply)
      + type            = "CONTACT_FLOW"

Plan: 6 to add, 0 to change, 0 to destroy.
```

## Step 4: apply

```
terraform apply tfplan
```

```
aws_connect_hours_of_operation.main_line: Creation complete after 1s [id=...]
aws_connect_queue.appointments: Creation complete after 0s [id=...]
aws_iam_role.appointment_lookup: Creation complete after 1s [id=...]
aws_lambda_function.appointment_lookup: Creation complete after 15s [id=...]
aws_connect_lambda_function_association.appointment_lookup: Creation complete after 0s [id=...]
module.flows.flowascode_contact_flow.appointment_line: Creation complete after 1s [id=...]
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.

Outputs:

appointment_line_document_sha256 = "3d12a6cd22f8e04018712c78915e89cef32b09d60849b573a7af41f14a641e65"
```

The flow is published in Connect, named `appointment-line`. A second
`terraform plan` finds nothing to change.

## Step 5: let the plan catch mistakes

The provider runs the flow-as-code lint rules at plan time, before anything
reaches Connect. Most rules warn; the hard rules, the ones about references,
fail the plan.

Delete the `error` block from `set-working-queue` and plan:

```
Warning: error-branches

  with module.flows.flowascode_contact_flow.appointment_line,
  on ../../flows/appointment-line.flow.tf line 4, in resource "flowascode_contact_flow" "appointment_line":
   4: resource "flowascode_contact_flow" "appointment_line" {

action "set-working-queue": UpdateContactTargetQueue does not wire its
"NoMatchingError" branch.
```

Connect would refuse this flow at apply, so treat the warning as a stop. (A
rule you have decided does not apply to a flow can be switched off for that
resource with `lint { disable = ["rule-id"] }`; the hard rules cannot.)

Put the block back, and paste a queue's ARN where the key was:

```hcl
    update_contact_target_queue {
      queue_id = "arn:aws:connect:us-west-2:111122223333:instance/11111111-2222-3333-4444-555555555555/queue/66666666-7777-8888-9999-000000000000"
    }
```

```
Error: LITERAL_ARN

  with module.flows.flowascode_contact_flow.appointment_line,
  on ../../flows/appointment-line.flow.tf line 61, in resource "flowascode_contact_flow" "appointment_line":
  61:       queue_id = "arn:aws:connect:us-west-2:111122223333:instance/11111111-2222-3333-4444-555555555555/queue/66666666-7777-8888-9999-000000000000"

action[set-working-queue].update_contact_target_queue.queue_id holds a
literal ARN; write a reference key such as "queue:<name>" and bind it in
refs.
```

The plan fails. An ARN in a flow is the thing that makes a flow impossible to
promote, so it never gets as far as a plan.

## Step 6: see a console edit as a diff

Someone changes the welcome message in the Connect console. The next plan
reads the live flow back as action blocks and shows the change where it is:

```
Note: Objects have changed outside of Terraform
...
  # module.flows.flowascode_contact_flow.appointment_line will be updated in-place
  ~ resource "flowascode_contact_flow" "appointment_line" {
      ~ action {
            id   = "welcome"
            # (1 unchanged attribute hidden)

          ~ message_participant {
              ~ text = "Thanks for calling Example Clinic." -> "Thanks for calling. Let's get you to the right place."
            }

            # (1 unchanged block hidden)
        }

        # (10 unchanged blocks hidden)
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

`apply` puts the reviewed text back. To keep the console's edit instead, copy
the new text into the `.flow.tf` and plan again; the plan is then empty.

## Step 7: clean up

```
terraform destroy
```

## Where next

- [Promote this flow to prod](02-promote.md), from the same commit.
- [The flow cookbook](../../examples/terraform-provider/cookbook/README.md):
  menus, callbacks, Lambda routing, modules and more, each applied live.
- [Bring existing flows under Terraform](03-adopt.md) if your flows already
  exist in Connect.
- [The provider and the HCL view](../06-terraform-provider.md), the reference.
