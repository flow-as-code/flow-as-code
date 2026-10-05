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

- [ ] flow-as-code, checklist lines 1 to 10, per type.
- [ ] Export and materialize cases for `tasktemplate` and `assistant`.
- [ ] Probe inputs under `conformance/flow-language/probes/<rule>/`.
- [ ] Provider: re-vendor, oracles re-recorded, non-Connect ARN parsing in
      `export/arn.go` covered (lines 11 to 14); the provider commit recorded
      here.
