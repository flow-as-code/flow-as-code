# Bring existing flows under Terraform

Most instances already have flows, built in the console or deployed some
other way. This tutorial takes them over without recreating them: a flow
keeps its id, its ARN and anything that points at it (phone numbers, other
flows' transfers), and from then on changes go through a plan.

There are three ways in, depending on where the flows are managed today:

| Today                                      | Way in                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| In the console, a few flows                | an `import` block per flow                                                 |
| In the console, many flows                 | `flow-cli export --author tf` for the whole instance, then `import` blocks |
| As `aws_connect_contact_flow` in Terraform | a `moved` block per flow                                                   |

Outputs below are from a sandbox instance on 2026-09-29 (Terraform 1.8.5,
provider v0.1.0, `@flow-as-code/cli` 0.2.0), identifiers masked.

## A few flows: import blocks

Write an `import` block with the flow's id, `<instance id>:<flow id>` (both
are in the flow's ARN), and let Terraform generate the configuration:

```hcl
import {
  to = flowascode_contact_flow.appointment_line
  id = "<instance id>:<flow id>"
}
```

```
terraform plan -generate-config-out=generated.tf
```

```
Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.
```

`generated.tf` holds the flow as action blocks:

```hcl
resource "flowascode_contact_flow" "appointment_line" {
  description  = null
  display_name = null
  instance_id  = "<instance-id>"
  name         = "appointment-line"
  refs = {
    "hours:main-line"           = "arn:aws:connect:us-west-2:<account>:instance/<instance-id>/operating-hours/<id>"
    "lambda:appointment-lookup" = "arn:aws:lambda:us-west-2:<account>:function:appointment-lookup"
    "queue:appointments"        = "arn:aws:connect:us-west-2:<account>:instance/<instance-id>/queue/<id>"
  }
  ...
  action {
    id   = "welcome"
    next = "check-hours"
    error {
      next = "apologize"
      type = "NoMatchingError"
    }
    message_participant {
      media     = null
      prompt_id = null
      ssml      = null
      text      = "Thanks for calling. Let's get you to the right place."
    }
  }
```

The provider read each ARN in the flow, found what it names in the instance's
inventory, and wrote a reference key in its place: the actions say
`"queue:appointments"`, not the queue's ARN. The ARNs are left in `refs`,
because Terraform needs a value there and the provider cannot know which of
your resources each one is. Three things to tidy before you commit:

1. **Replace each `refs` value with the address that manages it.** An ARN left
   in `refs` works, but it is the per-environment table this tooling exists to
   delete, and the studio refuses it. Write `aws_connect_queue.appointments.arn`,
   a `data` source, remote state, or a module variable, as
   [the promotion tutorial](02-promote.md) does.
2. **Replace `instance_id` with a variable** (`var.connect_instance_id`).
3. **Leave the rest as it is.** The `null` attributes (`settings = null`,
   `next = null` and the others) read as unset, in Terraform and in the
   studio and `flow-cli` alike, and the alphabetical order of the blocks is
   only order. To edit the flow in the studio too, move its resource into a
   file of its own named after it, `appointment-line.flow.tf` (one flow per
   file); with the two edits above made, `npx flow-cli synth
appointment-line.flow.tf` reads it to its FlowDoc, and a save in the studio
   rewrites it in the canonical form. Export (below)
   writes the canonical form directly.

Then plan again. When the configuration describes the flow as it is, the plan
is empty and nothing in Connect changes.

A flow named in the console as "Main Line" keeps that name: `name` becomes the
slug `main-line`, which identifies the flow to the tooling, and
`display_name = "Main Line"` is what Connect shows. Import writes both; the
first apply renames nothing.

## Many flows: export the instance

`flow-cli export` reads every flow and module in an instance and writes a
FlowDoc and a companion for each. With `--author tf` the companion is a
`.flow.tf` in the provider's canonical form, references already keys:

```
npx flow-cli export --instance <instance ARN> --out flows/ --author tf
```

```
default-agent-transfer (flow): default-agent-transfer.flowdoc.json, default-agent-transfer.flow.tf
default-outbound (flow): default-outbound.flowdoc.json, default-outbound.flow.tf
sample-queue-configurations-flow (flow): sample-queue-configurations-flow.flowdoc.json, sample-queue-configurations-flow.flow.tf
sample-ab-test (flow): sample-ab-test.flowdoc.json, sample-ab-test.flow.tf
sample-note-for-screenpop (flow): sample-note-for-screenpop.flowdoc.json, sample-note-for-screenpop.flow.tf
failed: Sample Lambda integration (arn:aws:connect:us-west-2:<account>:instance/<instance-id>/contact-flow/<id>): Cannot export "sample-lambda-integration": 1 ARN(s) not found in the instance inventory: arn:aws:lambda:us-east-1:<account>:function:state-lookup
Exported 19 of 20 to flows/
1 flow(s) could not be exported
```

The failure is the tool refusing to guess. That flow invokes a Lambda
function the instance's inventory does not list (it points at another
region), and rather than write its ARN into the document, export names it and
moves on. Associate the function with the instance, or fix the flow, and
export again.

One exported file, abridged:

```hcl
resource "flowascode_contact_flow" "sample_note_for_screenpop" {
  instance_id  = var.connect_instance_id
  name         = "sample-note-for-screenpop"
  display_name = "Sample note for screenpop"
  type         = "CONTACT_FLOW"
  description  = "Screenpop is a Contact control pannel feature that allows loading a web page optionally with parameters based on attributes. Refer to the screenpop documentation for more information."
  start        = "2b6ee9f2-0f1a-417c-91c7-bdc12cfc6a07"

  refs = {
    # TODO: no terraform address for ${cdref:queue:basicqueue}.
    "queue:basicqueue" = null
  }

  action {
    id   = "35dde84a-f902-4a2b-9e0d-b6079d2a5260"
    next = "e8f664fd-3e86-4aaa-915f-c1fa4a4d4dd0"
    transfer_contact_to_queue {}
    error {
      type = "NoMatchingError"
      next = "e8f664fd-3e86-4aaa-915f-c1fa4a4d4dd0"
    }
    error {
      type = "QueueAtCapacity"
      next = "e8f664fd-3e86-4aaa-915f-c1fa4a4d4dd0"
    }
    position {
      x = 928
      y = 85
    }
  }

  ...
}
```

The console's action ids and block positions are kept, so the studio shows
the flow as the console drew it. Each `refs` entry arrives as `null` under a
`TODO`; the provider refuses a plan with a `null` binding and names the key,
so none can be forgotten. Fill them in, add an `import` block per flow, and
plan until it is empty.

`flow-cli lint flows/` runs the same rules the provider runs at plan time,
without a plan. On a freshly exported instance it is a quick way to see which
console flows would not survive a redeploy as they are.

## From hashicorp/aws: moved blocks

A flow managed today as `aws_connect_contact_flow` moves to the provider
without being recreated. Replace the resource with a `flowascode_contact_flow`
describing the same flow, and add:

```hcl
moved {
  from = aws_connect_contact_flow.appointment_line
  to   = flowascode_contact_flow.appointment_line
}
```

Terraform 1.8 and OpenTofu 1.10 carry the state across resource types. The
move copies the flow's identity and name; the next plan writes the actions
from your configuration, and when they describe the flow as it is, nothing
changes in Connect. `aws_connect_contact_flow_module` moves to
`flowascode_contact_flow_module` the same way.

To write the new resource from the old one's content, run the content through
flow-cli: `flow-cli export --author tf` reads the live flow, or, for a
`.tftpl` file the `tf` emitter wrote, the FlowDoc it was emitted from is
already in your repository and `flow-cli codegen <doc> --to tf` writes the
companion.

## Afterwards

- [Promote the flows](02-promote.md) from a module, one root per environment.
- [Edit them in the studio](04-studio.md): a `.flow.tf` and its FlowDoc are a
  pair the studio keeps in step.
- The provider's registry guide `migrate-from-aws-provider` covers the same
  ground from the provider's side.
