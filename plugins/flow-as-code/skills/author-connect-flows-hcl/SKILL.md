---
name: author-connect-flows-hcl
description: Write or change Amazon Connect contact flows and flow modules as HCL for the flow-as-code/flowascode Terraform provider (flowascode_contact_flow and flowascode_contact_flow_module resources with action blocks). Use when creating a flow, adding or rewiring actions, fixing a plan-time lint finding or an InvalidContactFlowException from Connect, or reviewing a .flow.tf file.
license: Apache-2.0
---

# Author Amazon Connect flows in HCL

A flow is one `flowascode_contact_flow` resource (a module is one
`flowascode_contact_flow_module`) with one `action` block per action, in
order. The provider lints the flow at plan time and creates it through the
Amazon Connect API. Full per-type facts are in
[references/actions.md](references/actions.md); read the section for every
action type you write.

## The resource

```hcl
resource "flowascode_contact_flow" "support_line" {
  instance_id = var.connect_instance_id
  name        = "support-line"
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

Rules:

- `name` is a slug (lowercase, digits, hyphens) and the resource label is the
  same slug with underscores. A Connect name that is not a slug goes in
  `display_name`.
- `type` is the Connect flow type (`CONTACT_FLOW`, `CUSTOMER_QUEUE`,
  `AGENT_TRANSFER`, ...). A module has no `type`, may have
  `settings = jsonencode({...})`, and ends in `end_flow_module_execution {}`.
- The first action is the start unless `start = "<id>"` says otherwise.
- Inside an action, in this order: `id`, `next` (not on terminal actions), one
  typed sub-block named after the Connect action type in snake case
  (`MessageParticipant` is `message_participant`), then `condition` blocks,
  then `error` blocks, then an optional `position { x y }` for the canvas.
- An action type without a typed block (see the list at the top of the
  reference) is written `generic { type = "..." parameters = jsonencode({...}) }`.
  Prefer a typed block whenever one exists: only typed blocks are linted.
- Settable attributes are `instance_id`, `name`, `display_name`, `type`,
  `description`, `state`, `start`, `refs`, `tags`, `settings` (modules),
  `external_invocation_enabled` (modules) and a `lint { disable = [...] }`
  block, plus `depends_on`, `provider` and `lifecycle`. Do not put `count` or
  `for_each` on a flow resource in a `.flow.tf`: the studio and `flow-cli`
  refuse it (`COUNT_OR_FOR_EACH`), because one file is one flow.

## References: keys in actions, addresses in refs

- A field that names a Connect resource (queue, hours, Lambda function,
  prompt, flow, module, Lex bot alias, view) holds a reference key,
  `"<type>:<name>"`: `"queue:support"`, `"hours:main-line"`,
  `"lambda:customer-lookup"`, `"prompt:welcome"`, `"flow:after-hours"`,
  `"module:greeting@live"`, `"view:form@1"`. A JSONPath (`"$.Attributes.x"`)
  is also accepted there.
- The resource's `refs` map binds each key once to a Terraform expression:
  a resource attribute, a data source, remote state output or module variable.
- Never write an ARN in an action (the plan fails with `LITERAL_ARN`) or in
  `refs` (it works, but it is an environment-specific value in the flow; the
  studio and `flow-cli` refuse it). A key bound to `null` fails the plan
  naming the key.
- A module invoked through an alias binds `module:<name>@<alias>` to
  `flowascode_contact_flow_module_alias.<label>.arn`, never to the module's own
  ARN (that would run the module's latest content, not the release).

## Branches Connect requires

Connect refuses a flow at create (`InvalidContactFlowException`) when an
action misses a branch its type requires or has one it does not take. The
reference lists them per type. The ones most often missed, all confirmed
against the service:

- `transfer_contact_to_queue` and `dequeue_contact_and_transfer_to_queue`:
  both `QueueAtCapacity` and `NoMatchingError`.
- `get_participant_input` with `store_input = "False"` (branch on keys):
  `InputTimeLimitExceeded`, `NoMatchingCondition` and `NoMatchingError`.
  With `store_input = "True"` (store digits): `input_validation`, no
  conditions, only `NoMatchingError`. `store_input` must always be written.
- `check_metric_data`: `NoMatchingError`, `NoMatchingCondition` and at least
  one condition. For the `NumberOfAgents*` metrics the only condition is
  `NumberGreaterThan` `["0"]`.
- `check_hours_of_operation`: exactly the conditions `Equals ["True"]` and
  `Equals ["False"]`, plus `NoMatchingError`.
- `compare` and `distribute_by_percentage`: `NoMatchingCondition`, no
  catch-all, and a `next` naming the same action as the
  `NoMatchingCondition` branch. Connect refuses either without `next`
  (checked 2026-09-30); it accepted every target tried, but the tooling
  writes and reads back the copy, as the console does.
- `next`: write one on every non-terminal action, except
  `message_participant_iteratively`, where it is optional. Of the 31
  non-terminal types, 30 were probed without one and Connect refused 29,
  accepting only `message_participant_iteratively` (the list is in
  `conformance/flow-language/actions.md`, rule 38);
  `connect_participant_with_lex_bot` was not probed and is assumed to behave
  the same, and `next-action-required` reports them all. Terminal actions
  must not have one.
- `update_contact_callback_number`: `InvalidCallbackNumber` and
  `CallbackNumberNotDialable`, no catch-all.
- `update_contact_recording_behavior`: no error branch at all.
- `message_participant`: the catch-all `NoMatchingError` is optional.
- Most other non-terminal actions: `NoMatchingError`.
- Terminal actions (`disconnect_participant`, `end_flow_execution`,
  `end_flow_module_execution`, `transfer_contact_to_agent`): no `next`, no
  branches.

Every `next` and branch target must name an action in the same resource.

## Lint at plan time

The provider runs the flow-as-code lint rules on every plan. `no-literal-arn`
and `no-unresolved-token` are hard: they fail the plan and cannot be disabled.
The rest (`action-allowed-in-flow-type`, `action-count`,
`attribute-set-before-read`, `channel-restricted-action`, `conditional-shape`,
`error-branches`, `module-depth-5`, `next-action-required`,
`prompt-length-3000`, `reachable-blocks`, `recording-consent-before-record`,
`terminal-blocks`, `unique-names`) print warnings keyed by rule id. Treat `error-branches`,
`conditional-shape` and `next-action-required` warnings as failures: Connect
will refuse the flow. (`next-action-required` was added on 2026-09-30,
`channel-restricted-action` and `attribute-set-before-read` on 2026-10-05; a
provider or `flow-cli` release older than that does not run them.)
`attribute-set-before-read` warns on a `$.Attributes.<name>` read in message
text that no document in the linted set writes through
`update_contact_attributes`; it reports nothing on a single document, since
attributes cross flows, and is the rule to disable on a flow whose attributes
arrive from outside any flow (set by the API that started the contact, a chat
widget, or an agent). `channel-restricted-action` warns on every
`wait` and `show_view`, which their pages support on chat only: leave it on a
flow that voice contacts reach, and disable it for a flow that serves chat
alone, since the document cannot say which. A rule that genuinely does
not apply to one flow can be switched off for that resource only:

```hcl
  lint {
    disable = ["prompt-length-3000"]
  }
```

## Workflow

1. Write or edit the resource. Keep one flow resource per `.flow.tf` file if
   the directory is also opened in the flow-as-code studio.
2. `terraform fmt` and `terraform validate`.
3. `terraform plan`: fix every warning from `error-branches`,
   `conditional-shape` and `action-allowed-in-flow-type`, and every error.
4. `terraform apply`. If Connect still refuses the flow, its error lists each
   problem with a path such as `Actions[3]`; the index counts `action` blocks
   from zero in file order.

Without a Terraform plan, `npx flow-cli synth <name>.flow.tf` writes the
FlowDoc and `npx flow-cli lint <dir>` runs the same rules on it.

## Examples

The flow cookbook has complete, live-tested recipes: business hours, a keypad
menu, collected input, Lambda routing, a callback when the queue is full, a
percentage split, a shared module released through an alias, and a generic
block: https://flow-as-code.dev/docs/example-terraform-provider-cookbook/
