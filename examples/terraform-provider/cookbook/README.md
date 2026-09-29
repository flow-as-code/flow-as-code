# The flow cookbook

Common contact flow patterns, each a complete `flowascode_contact_flow`
resource for the Terraform provider. Every recipe in this directory was
applied to a live Amazon Connect instance on 2026-09-29 (Terraform 1.8.5,
provider v0.1.0), planned again with no changes, and destroyed.
`tests/terraformProviderExample.test.ts` holds, on every push, that each one
reads back through the HCL reader, is already `terraform fmt` output, lints
with no findings, and appears on this page exactly as it is in its file.

The recipes refer to their queues, hours and function by key
(`"queue:support"`), and each binds its keys in `refs` to the resources in
`supporting.tf`. In your configuration, bind them to your own resources, data
sources or module variables; the flows do not change.

Two things every recipe gets right, because Connect refuses a flow that gets
them wrong: each action wires the error branches its type requires (the
provider's lint says which, at plan time), and each reference is a key, never
an ARN.

To run them all: `terraform apply` in this directory, with
`TF_VAR_connect_instance_id` set and a `customer-lookup.zip` for the function.

## Route by business hours

Check an hours of operation, transfer during them, and say so outside them. `check_hours_of_operation` takes exactly the two conditions `True` and `False`, plus the catch-all. Every transfer needs both `QueueAtCapacity` and `NoMatchingError`: Connect refuses a `TransferContactToQueue` without either.

`business-hours.tf`:

```hcl
# Route to a queue during business hours; otherwise say so and hang up.
resource "flowascode_contact_flow" "business_hours" {
  instance_id = var.connect_instance_id
  name        = "business-hours"
  type        = "CONTACT_FLOW"

  refs = {
    "hours:support" = aws_connect_hours_of_operation.support.arn
    "queue:support" = aws_connect_queue.support.arn
  }

  action {
    id   = "check-hours"
    next = "closed"
    check_hours_of_operation {
      hours_of_operation_id = "hours:support"
    }
    condition {
      operator = "Equals"
      operands = ["True"]
      next     = "set-queue"
    }
    condition {
      operator = "Equals"
      operands = ["False"]
      next     = "closed"
    }
    error {
      type = "NoMatchingError"
      next = "closed"
    }
  }

  action {
    id   = "set-queue"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:support"
    }
    error {
      type = "NoMatchingError"
      next = "closed"
    }
  }

  action {
    id   = "transfer"
    next = "closed"
    transfer_contact_to_queue {}
    error {
      type = "QueueAtCapacity"
      next = "closed"
    }
    error {
      type = "NoMatchingError"
      next = "closed"
    }
  }

  action {
    id   = "closed"
    next = "hang-up"
    message_participant {
      text = "We are closed. Our hours are nine to five, Monday to Friday."
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

## A keypad menu

`get_participant_input` with `store_input = "False"` branches on the key pressed: one `condition` per key. That form needs `InputTimeLimitExceeded` (no key pressed) and `NoMatchingCondition` (a key no condition names) as well as the catch-all, and `store_input` must be written out; the `conditional-shape` rule holds all three.

`keypad-menu.tf`:

```hcl
# A keypad menu. With StoreInput "False", Connect branches on the key pressed,
# and requires the InputTimeLimitExceeded branch (no key pressed) and the
# NoMatchingCondition branch (a key no condition names). StoreInput must be
# written out: the service refuses the action without it. The conditional-shape
# lint rule holds all three.
resource "flowascode_contact_flow" "keypad_menu" {
  instance_id = var.connect_instance_id
  name        = "keypad-menu"
  type        = "CONTACT_FLOW"

  refs = {
    "queue:priority" = aws_connect_queue.priority.arn
    "queue:support"  = aws_connect_queue.support.arn
  }

  action {
    id   = "menu"
    next = "not-understood"
    get_participant_input {
      text                     = "For support, press 1. For an existing case, press 2."
      input_time_limit_seconds = 5
      store_input              = "False"
    }
    condition {
      operator = "Equals"
      operands = ["1"]
      next     = "to-support"
    }
    condition {
      operator = "Equals"
      operands = ["2"]
      next     = "to-priority"
    }
    error {
      type = "InputTimeLimitExceeded"
      next = "not-understood"
    }
    error {
      type = "NoMatchingCondition"
      next = "not-understood"
    }
    error {
      type = "NoMatchingError"
      next = "not-understood"
    }
  }

  action {
    id   = "to-support"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:support"
    }
    error {
      type = "NoMatchingError"
      next = "not-understood"
    }
  }

  action {
    id   = "to-priority"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:priority"
    }
    error {
      type = "NoMatchingError"
      next = "not-understood"
    }
  }

  action {
    id   = "transfer"
    next = "hang-up"
    transfer_contact_to_queue {}
    error {
      type = "QueueAtCapacity"
      next = "busy"
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "busy"
    next = "hang-up"
    message_participant {
      text = "All of our agents are busy. Please call back later."
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "not-understood"
    next = "hang-up"
    message_participant {
      text = "Sorry, we did not get that. Goodbye."
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

## Collect digits and keep them

With `store_input = "True"` the same action stores what the caller types in `$.StoredCustomerInput` instead of branching on it. That form needs `input_validation`, takes no conditions, and refuses the `NoMatchingCondition` and `InputTimeLimitExceeded` branches. `update_contact_attributes` then copies the digits into a contact attribute the agent's screen can show.

`collect-input.tf`:

```hcl
# Collect digits and keep them. With StoreInput "True", Connect stores the
# digits in $.StoredCustomerInput instead of branching on them: the action
# takes InputValidation, no conditions, and no NoMatchingCondition or
# InputTimeLimitExceeded branch (the conditional-shape lint rule holds all
# three).
resource "flowascode_contact_flow" "collect_input" {
  instance_id = var.connect_instance_id
  name        = "collect-input"
  type        = "CONTACT_FLOW"

  refs = {
    "queue:support" = aws_connect_queue.support.arn
  }

  action {
    id   = "ask-account"
    next = "keep-account"
    get_participant_input {
      text                     = "Please enter your eight digit account number."
      input_time_limit_seconds = 8
      store_input              = "True"
      input_validation = {
        custom_validation = {
          maximum_length = 8
        }
      }
    }
    error {
      type = "NoMatchingError"
      next = "to-support"
    }
  }

  action {
    id   = "keep-account"
    next = "to-support"
    update_contact_attributes {
      attributes = {
        accountNumber = "$.StoredCustomerInput"
      }
      target_contact = "Current"
    }
    error {
      type = "NoMatchingError"
      next = "to-support"
    }
  }

  action {
    id   = "to-support"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:support"
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "transfer"
    next = "hang-up"
    transfer_contact_to_queue {}
    error {
      type = "QueueAtCapacity"
      next = "hang-up"
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

## Route on a Lambda lookup

Invoke a function with the caller's number, then branch on one key of what it returned. A `STRING_MAP` response lands in `$.External`, and `compare` takes any operator on any value; unmatched callers take `NoMatchingCondition`. The function must be associated with the instance (`aws_connect_lambda_function_association` in `supporting.tf`) or Connect cannot invoke it.

`lambda-routing.tf`:

```hcl
# Look the caller up with a Lambda function, then route on what it returned.
# A STRING_MAP response lands in $.External, and Compare branches on one key.
resource "flowascode_contact_flow" "lambda_routing" {
  instance_id = var.connect_instance_id
  name        = "lambda-routing"
  type        = "CONTACT_FLOW"

  refs = {
    "lambda:customer-lookup" = aws_lambda_function.customer_lookup.arn
    "queue:priority"         = aws_connect_queue.priority.arn
    "queue:support"          = aws_connect_queue.support.arn
  }

  action {
    id   = "look-up"
    next = "check-tier"
    invoke_lambda_function {
      lambda_function_arn           = "lambda:customer-lookup"
      invocation_time_limit_seconds = 8
      invocation_type               = "SYNCHRONOUS"
      lambda_invocation_attributes = {
        phone = "$.CustomerEndpoint.Address"
      }
      response_validation = {
        response_type = "STRING_MAP"
      }
    }
    error {
      type = "NoMatchingError"
      next = "to-support"
    }
  }

  action {
    id   = "check-tier"
    next = "to-support"
    compare {
      comparison_value = "$.External.tier"
    }
    condition {
      operator = "Equals"
      operands = ["priority"]
      next     = "to-priority"
    }
    error {
      type = "NoMatchingCondition"
      next = "to-support"
    }
  }

  action {
    id   = "to-priority"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:priority"
    }
    error {
      type = "NoMatchingError"
      next = "to-support"
    }
  }

  action {
    id   = "to-support"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:support"
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "transfer"
    next = "hang-up"
    transfer_contact_to_queue {}
    error {
      type = "QueueAtCapacity"
      next = "hang-up"
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

## Offer a callback when the queue is full

The transfer's `QueueAtCapacity` branch leads to a callback instead of a busy message. `update_contact_callback_number` has no catch-all but two named errors, both required; `create_callback_contact` queues the callback with its delays and attempts.

`callback-when-busy.tf`:

```hcl
# Offer a callback when the queue is full: the QueueAtCapacity branch sets the
# callback number to the number the caller dialed from and queues a callback.
resource "flowascode_contact_flow" "callback_when_busy" {
  instance_id = var.connect_instance_id
  name        = "callback-when-busy"
  type        = "CONTACT_FLOW"

  refs = {
    "queue:support" = aws_connect_queue.support.arn
  }

  action {
    id   = "set-queue"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:support"
    }
    error {
      type = "NoMatchingError"
      next = "sorry"
    }
  }

  action {
    id   = "transfer"
    next = "hang-up"
    transfer_contact_to_queue {}
    error {
      type = "QueueAtCapacity"
      next = "set-callback-number"
    }
    error {
      type = "NoMatchingError"
      next = "sorry"
    }
  }

  action {
    id   = "set-callback-number"
    next = "queue-callback"
    update_contact_callback_number {
      callback_number = "$.CustomerEndpoint.Address"
    }
    error {
      type = "InvalidCallbackNumber"
      next = "sorry"
    }
    error {
      type = "CallbackNumberNotDialable"
      next = "sorry"
    }
  }

  action {
    id   = "queue-callback"
    next = "confirm"
    create_callback_contact {
      queue_id                    = "queue:support"
      initial_call_delay_seconds  = 5
      maximum_connection_attempts = 3
      retry_delay_seconds         = 600
    }
    error {
      type = "NoMatchingError"
      next = "sorry"
    }
  }

  action {
    id   = "confirm"
    next = "hang-up"
    message_participant {
      text = "All of our agents are busy. We will call you back at this number."
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "sorry"
    next = "hang-up"
    message_participant {
      text = "Sorry, we cannot take your call right now. Please try again later."
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

## Send a share of callers down a new path

`distribute_by_percentage` draws a number from 1 to 100. Each condition takes the callers below its bound, in order, and `NoMatchingCondition` takes the rest: here 20% hear the new greeting. Use it to roll out a change to part of your traffic before all of it.

`percentage-split.tf`:

```hcl
# Send a share of callers down a new path. DistributeByPercentage draws a
# number from 1 to 100; each condition takes the callers below its bound, in
# order, and NoMatchingCondition takes the rest. Here: 20% new, 80% current.
resource "flowascode_contact_flow" "percentage_split" {
  instance_id = var.connect_instance_id
  name        = "percentage-split"
  type        = "CONTACT_FLOW"

  action {
    id   = "split"
    next = "current-greeting"
    distribute_by_percentage {}
    condition {
      operator = "NumberLessThan"
      operands = ["21"]
      next     = "new-greeting"
    }
    error {
      type = "NoMatchingCondition"
      next = "current-greeting"
    }
  }

  action {
    id   = "new-greeting"
    next = "hang-up"
    message_participant {
      text = "Welcome. You are hearing our new greeting."
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "current-greeting"
    next = "hang-up"
    message_participant {
      text = "Welcome."
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

## A module several flows share

A `flowascode_contact_flow_module` is written like a flow, without `type`, and ends in `end_flow_module_execution`.

`greeting-module.tf`:

```hcl
# A flow module several flows share. Flows invoke it through an alias, so a
# change to the module reaches them only when the alias moves (see
# module-release.tf), not the moment the module's content changes.
resource "flowascode_contact_flow_module" "greeting" {
  instance_id = var.connect_instance_id
  name        = "greeting"

  action {
    id   = "greet"
    next = "done"
    message_participant {
      text = "Thanks for calling. Calls may be recorded for quality."
    }
    error {
      type = "NoMatchingError"
      next = "done"
    }
  }

  action {
    id = "done"
    end_flow_module_execution {}
  }
}
```

## Release the module through an alias

Flows invoke the module through an alias, which points at a version. The version is keyed to the module's `content_hash`, so a content change replaces it; `create_before_destroy` makes the new version exist before the old one goes, and the alias moves to it in place in between. Connect refuses to delete a version an alias still points at.

`module-release.tf`:

```hcl
# A version is a snapshot of the module's current content, replaced whenever
# that content changes. create_before_destroy makes the new version exist
# before the old one goes, and the alias moves to it in place in between:
# Connect refuses to delete a version an alias still points at.
resource "flowascode_contact_flow_module_version" "greeting" {
  instance_id            = var.connect_instance_id
  contact_flow_module_id = flowascode_contact_flow_module.greeting.contact_flow_module_id
  content_hash           = flowascode_contact_flow_module.greeting.content_hash
  description            = "Greeting as reviewed"

  lifecycle {
    create_before_destroy = true
  }
}

# The alias is what flows bind: its arn is the module ARN qualified by the
# alias id, the only form Connect runs as the alias.
resource "flowascode_contact_flow_module_alias" "greeting_live" {
  instance_id                 = var.connect_instance_id
  contact_flow_module_id      = flowascode_contact_flow_module.greeting.contact_flow_module_id
  name                        = "live"
  contact_flow_module_version = flowascode_contact_flow_module_version.greeting.version
  description                 = "The version callers hear"
}
```

## Invoke the module from a flow

The flow binds `module:greeting@live` to the alias's `arn`, which is the module ARN qualified by the alias id: the only form Connect runs as the alias. A bare module ARN would run the module's latest content, not the released version.

`invoke-module.tf`:

```hcl
# A flow that runs the shared greeting through its live alias, then continues.
resource "flowascode_contact_flow" "invoke_module" {
  instance_id = var.connect_instance_id
  name        = "invoke-module"
  type        = "CONTACT_FLOW"

  refs = {
    "module:greeting@live" = flowascode_contact_flow_module_alias.greeting_live.arn
    "queue:support"        = aws_connect_queue.support.arn
  }

  action {
    id   = "greeting"
    next = "set-queue"
    invoke_flow_module {
      flow_module_id = "module:greeting@live"
    }
    error {
      type = "NoMatchingError"
      next = "set-queue"
    }
  }

  action {
    id   = "set-queue"
    next = "transfer"
    update_contact_target_queue {
      queue_id = "queue:support"
    }
    error {
      type = "NoMatchingError"
      next = "hang-up"
    }
  }

  action {
    id   = "transfer"
    next = "hang-up"
    transfer_contact_to_queue {}
    error {
      type = "QueueAtCapacity"
      next = "hang-up"
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

## Use an action the tooling does not model

A `generic` block carries any action type as its Flow language `Type` and its `Parameters` as `jsonencode(...)`, unchanged. The provider checks nothing inside it beyond what Connect checks, so prefer a typed block where one exists. Connect decides which error branches this action takes from its parameters: with `ContinueFlowExecution` "True" these three, with "False" only the catch-all.

`unmodeled-action.tf`:

```hcl
# An action type the tooling does not model yet still has a home: a generic
# block carries its Type and its Parameters as JSON, unchanged. Nothing about it
# is checked beyond what Connect checks, so prefer a typed block when one
# exists; the catalog lists which do. Connect decides which error branches this
# action takes from its parameters: with ContinueFlowExecution "True" it takes
# these three, with "False" only the catch-all (sandbox, 2026-09-29).
resource "flowascode_contact_flow" "unmodeled_action" {
  instance_id = var.connect_instance_id
  name        = "unmodeled-action"
  type        = "CONTACT_FLOW"

  action {
    id   = "desk-phone"
    next = "hang-up"
    generic {
      type = "TransferParticipantToThirdParty"
      parameters = jsonencode({
        ContinueFlowExecution                = "True"
        ThirdPartyConnectionTimeLimitSeconds = "30"
        ThirdPartyPhoneNumber                = "+15555550100"
      })
    }
    error {
      type = "CallFailed"
      next = "hang-up"
    }
    error {
      type = "ConnectionTimeLimitExceeded"
      next = "hang-up"
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
