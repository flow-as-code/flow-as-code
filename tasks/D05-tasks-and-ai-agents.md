# D05 Tasks and AI agents: `CreateTask`, `CreateWisdomSession`

Phase D, engine. Gated on D01 (the `tasktemplate` and `assistant` ref types)
and, for `CreateWisdomSession`'s evidence, on an AI agents domain linked to
the sandbox instance.

## Types

Devguide pages fetched 2026-10-04.

| Type                  | Parameters                                                                                                                                                                                                                                                                                                                     | Errors (page)     | Restrictions                                                                                                                            | Size   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `CreateTask`          | `ContactFlowId` (flow; "must be fully static or a single valid JSONPath identifier"), `Attributes` map, `Name`, `Description`?, `References` map ("Type": "Value" on the page; likely {`Value`, `Type`} objects), `DelaySeconds` 1 to 518400 at most one with `ScheduledTime` (format undocumented), `TaskTemplateId` (static) | `NoMatchingError` | "supported on all channels and in all contact flow types"                                                                               | M to L |
| `CreateWisdomSession` | `WisdomAssistantArn` (static or dynamic)                                                                                                                                                                                                                                                                                       | `NoMatchingError` | devguide: voice only, all flow types; admin guide: all channels, only inbound, customer queue, outbound whisper and both transfer flows | M      |

Pages: https://docs.aws.amazon.com/connect/latest/devguide/createtask.html,
https://docs.aws.amazon.com/connect/latest/devguide/createwisdomsession.html,
https://docs.aws.amazon.com/connect/latest/adminguide/connect-assistant-block.html.

## Acceptance criteria

- Both types are modeled per tasks/README.md, "The per-type checklist", one
  commit each, with `conformance/roundtrip/tasks-and-assistants/` as the
  group fixture.
- `CreateTask.ContactFlowId` is a `flow` reference with `dynamic` (the page
  allows a single JSONPath identifier) and `TaskTemplateId` a
  `tasktemplate` reference; whether the template is an id or an ARN, and the
  `References` value shape, come from a console export committed under
  `conformance/flow-language/exports/`.
- `DelaySeconds` and `ScheduledTime` are `atMostOne`; `ScheduledTime`'s
  format is recorded from the export and a probe, not guessed. The
  satellite's VERIFY 16.8 records `ContactFlowId` and `Name` as required
  from the page (its sandbox sweep covered `TransferParticipantToThirdParty`
  only); the sweep here is the first evidence, before the catalog relies on
  it.
- `CreateWisdomSession.WisdomAssistantArn` is an `assistant` reference;
  export maps a `wisdom` ARN to it through D01's inventory, and the
  materialize case resolves it back. A JSONPath value stays allowed
  (`dynamic`).
- Channels and flow types for `CreateWisdomSession` follow the action page
  (as actions.md does elsewhere: the action pages govern over the admin
  guide), and actions.md records the admin guide's disagreement and the
  probe's result per flow type.
- `ResumeContact` (D02) and `CreateTask` sit in one fixture flow if D02 has
  merged, so the pair a task flow needs is round-tripped together.

## Evidence

One sweep, the next numbered rule, per tasks/README.md, "The evidence rule
for this phase", for both types; and:

- `CreateTask` with `DelaySeconds` and `ScheduledTime` together, each alone,
  and `ScheduledTime` in two candidate formats;
- `CreateTask` with a template id the instance does not have;
- `CreateWisdomSession` in each flow type the two guides disagree on, and on
  an instance with no assistant linked.

## Sandbox prerequisites and cost

- A task template (`awscc_connect_task_template`; hashicorp/aws has none).
  Free. Tasks cost $0.070 each when run
  (https://aws.amazon.com/products/connect/customer/pricing/appendix/); a
  create runs none.
- An AI agents domain (assistant) on an AWS-owned key with no knowledge
  base, linked through `CreateIntegrationAssociation` (`WISDOM_ASSISTANT`)
  (https://docs.aws.amazon.com/connect/latest/adminguide/ai-agent-initial-setup.html).
  Owner action. Connect tags associated resources `AmazonConnectEnabled:True`;
  anything Terraform-managed must set that tag itself or the next apply
  removes it. Free under Connect Customer pricing with no knowledge base;
  under Customer Basic, $0.0080 a minute of voice when run. Which plan the
  account bills under was not readable on 2026-10-04 (expired session); the
  owner confirms it.
- Exercising on voice also needs real-time conversational analytics set by a
  recording and analytics block; that is the showcase's concern.

## Both repositories

- [x] flow-as-code, checklist lines 1 to 10, per type.
- [x] Export and materialize cases for `tasktemplate` and `assistant`: both
      were D01's (`conformance/export/phase-d-refs`,
      `conformance/materialize/casefield-key-with-map`), and D01's
      `export.test.ts` runs the export case against its goldens.
- [x] Probe inputs under `conformance/flow-language/probes/42/`; the sweep
      itself has not run (see "Evidence" under "Record").
- [ ] A console export of each block under
      `conformance/flow-language/exports/` (owner decision 8; see "Not
      done here").
- [ ] Provider: re-vendor, oracles re-recorded, non-Connect ARN parsing in
      `export/arn.go` covered (lines 11 to 14); the provider commit recorded
      here.

## Record (2026-10-12)

Implemented on branch `feat/d05-tasks-and-ai-agents`, stacked on
`feat/d02-contact-state` (#46, itself on #44) at `a544893`, so
`ResumeContact` is available to the group fixture. One commit per type,
then the CLI wiring D01 left to this task, then this record, each green on
`npm run build`, `npm test`, `npm run lint` and `npm run typecheck`:

1. `feat(core): model CreateTask with its flow and task template as
references`
2. `feat(core): model CreateWisdomSession with its assistant as a
reference`
3. `feat(cli): read AI agents assistants on export when the Q in Connect
SDK is there`

The devguide pages were read again on 2026-10-12 with the admin guide's
Create task and Connect assistant block pages and the StartTaskContact API
reference; each says what the table above says, and the admin guide's
Connect assistant page now also names an Orchestration AI agent setting.
Rule 42 in `conformance/flow-language/actions.md` quotes them.

### What each type records, and why

- `CreateTask`: every key the page lists, in its order. `ContactFlowId` is
  a `flow` reference that is not required: the admin guide's Use template
  form needs a flow only "If the selected template does not include a
  flow", and StartTaskContact marks it optional. The acceptance criterion
  asks for `dynamic` on it; a reference already admits a single JSONPath
  (actions.md, "Reference-bearing parameters"), and the vocabulary keeps
  `dynamic` for scalar kinds (`catalog.test.ts` refuses it on a `ref`), so
  the criterion is met by the kind's reading and no flag is added. `Name`
  is required (unmarked on the page, required by the API). `TaskTemplateId`
  is a `tasktemplate` reference, static on the page, so the 0.3 clause
  holds it to a token and codegen leaves a JSONPath generic.
  `DelaySeconds` is an `integerString` from 1 to 518400 with `dynamic`, the
  console's decimal-string spelling of every integer recorded so far (rule
  39), and the two timing keys are `atMostOne`. `ScheduledTime` is a
  `stringOrJsonPath` and `References` a `json` value, because their stored
  form is not recorded: the class writes a JSONPath schedule only (the
  admin guide's "Set date and time using attribute") and no `References`,
  and codegen leaves a static schedule, a numeric delay or any
  `References` generic. The class takes a flow, a template or both.
  Unrestricted by flow type and channel.
- `CreateWisdomSession`: one `assistant` reference, required, a JSONPath
  allowed. The action page says voice only and every flow type; the admin
  guide's block says every channel and five flow types. The catalog
  follows the action page, as actions.md does elsewhere: `channels:
["VOICE"]` and unrestricted. Rule 42 records the disagreement and a probe
  for each flow type the pages disagree on (customer and agent hold,
  customer and agent whisper, a module) with a customer queue control.
  The channel cannot be probed at create; actions.md says what observation
  would change it. Any key besides `WisdomAssistantArn` (the admin guide's
  Orchestration AI agent, whose key is unrecorded) keeps the block
  generic.

### Schema clauses and owner decision 3

Each clause holds only the references' forms: `ContactFlowId` and
`WisdomAssistantArn` a token or a JSONPath, `TaskTemplateId` a token.
`conformance.test.ts` rejects a literal ARN in each and a JSONPath template.
The bound on `DelaySeconds`, the `atMostOne` and `Name` being required stay
in the catalog and out of the schema until a probe shows the service
refusing them. The token-only template is this repository's invariant (no
literal ARN; static on the page), the same reading D02 gave the message
processor's Lambda; `task-template-jsonpath` puts it to the service.

### The passthrough fixture

`conformance/roundtrip/unknown-actions` lost `CreateTask`. Its flow token
moved to `StartOutboundChatContact`'s `ContactFlowArn` (the D04 page's
shape, the source number a JSONPath so the document needs no 0.3 token and
stays in the 0.2 migration test) and its queue token to an
`Attributes.preferredQueue` value of `UpdateCustomerProfile`'s
`ProfileRequestData`. D04 and D03 model those types and re-author the
fixture again. The codegen test now asserts both tokens survive; the
`generic-only` HCL golden and the HCL README's generic example follow.

### Group fixture, goldens and export

`conformance/roundtrip/tasks-and-assistants` holds the assistant by
reference and by attribute, four tasks (flow, delay, attributes and
description; template alone; both on a scheduled attribute; flow and delay
by attribute), and `ResumeContact`, the pair a task flow needs. Its HCL
golden is `awaits-provider`; the `casefield-key` round-trip golden's task
and session became typed, as did those in D01's `conformance/hcl/emit/phase-d-refs`
golden (added by D01's recheck, met on the rebase onto it), and each
description says so. D01's
`conformance/export/phase-d-refs` exports both reference types; its flows
carry the console's transitions (no `Conditions` key), so codegen keeps
both types generic there, as it does for every console-shaped action, and
its goldens did not change. `conformance/materialize/casefield-key-with-map` already
resolves both reference types back to ARNs. `flow-cli emit` writes all
three targets for the fixture, with the unbound references under their
TODO comments.

### CLI

`export` and `diff` load `@aws-sdk/client-qconnect` when installed (a new
optional peer of the CLI) and pass a `QConnectClient`, so an assistant ARN
exports as a reference; absent, they run as before. The Cases client stays
D06's. `packages/cli/README.md` names the peer and `wisdom:ListAssistants`.

### Evidence

Not run. On 2026-10-12 the AWS credentials for the sandbox had expired, and
the instance had neither a task template nor a linked AI agents assistant
(owner actions under "Sandbox prerequisites and cost"). No AWS call was made
and no result is recorded. The inputs are kept in
`conformance/flow-language/probes/42/` (35 probes: 24 for `CreateTask`, 11
for `CreateWisdomSession`) with `PENDING.md`, which names the five
placeholders the run fills. Each evidence item above has its probes: the
two timing keys together and alone (`task-delay-and-schedule`,
`task-delay-string`, `task-schedule-jsonpath`), `ScheduledTime` in three
static candidate formats, a template the instance does not have
(`task-template-missing`), the flow types the guides disagree on, and an
unlinked assistant. When the sweep runs, the catalog, `actions.ts`, the
schema clauses and the fixtures change only where a result says so.

### Not done here

- The console export of a Create task block (both its options, with
  References and a static schedule) and of a Connect assistant block (with
  an Orchestration AI agent), committed under
  `conformance/flow-language/exports/` with ids replaced. Owner action
  (decision 8); no AWS console was reachable. Until then whether
  `TaskTemplateId` holds an id or an ARN, the `References` value shape and
  `ScheduledTime`'s format are unsettled, and those forms stay generic.
- The sweep, above.
- The review round tasks/README.md asks of each group.
- The provider re-vendor and oracles (checklist lines 11 to 14), after the
  merge commit exists.
