# D02 Contact state: four types, and the passthrough fixture

Phase D, engine. Gated on D01. No new ref type. The first task able to break
`conformance/roundtrip/unknown-actions`, which holds `CreateTask`,
`ResumeContact`, `UpdatePreviousContactParticipantState` and
`TransferParticipantToThirdParty`, and which a codegen test requires to hold
only unmodeled types.

## Types

Devguide pages fetched 2026-10-04.

| Type                                    | Parameters                                                                                                                                                               | Errors (page)                                                   | Restrictions (page)                                                           | Size   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| `ResumeContact`                         | none                                                                                                                                                                     | `NoMatchingError`                                               | none on the devguide; the admin guide: tasks only, other channels error       | S      |
| `UpdatePreviousContactParticipantState` | `PreviousContactParticipantState`: `AgentOnHold`, `CustomerOnHold`, `OffHold`                                                                                            | `NoMatchingError`                                               | inbound and transfer flows; voice only; the admin guide adds outbound whisper | S      |
| `UpdateContactMediaStreamingBehavior`   | `MediaStreamingState` `Enabled` or `Disabled` (static); `Participants[]` {`ParticipantType` `Customer`, `MediaDirections[]` `From`, `To`}; `MediaStreamType` `Audio`     | `NoMatchingError`                                               | contact, customer queue, transfer and whisper flows, not hold; voice only     | S to M |
| `UpdateContactMediaProcessing`          | `ChatProcessor` {`ProcessingEnabled` `"True"` or `"False"`, `LambdaProcessorARN` (static), `ChatProcessorSettings` {`DeliverUnprocessedMessages` `"True"` or `"False"`}} | `NoMatchingError` ("must always be defined"), `ChannelMismatch` | no Restrictions section; chat only                                            | S to M |

Pages:
https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactresumecontact.html,
https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatepreviouscontactparticipantstate.html,
https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediastreamingbehavior.html,
https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediaprocessing.html.
Admin guide: https://docs.aws.amazon.com/connect/latest/adminguide/resume-contact.html,
https://docs.aws.amazon.com/connect/latest/adminguide/hold-customer-agent.html.

## Acceptance criteria

- The four types are modeled per tasks/README.md, "The per-type checklist",
  one commit each, with `conformance/roundtrip/contact-state/` as the group
  fixture (a module if no single flow type admits all four, as B01e did).
- `UpdateContactMediaProcessing.ChatProcessor.LambdaProcessorARN` is a
  `lambda` reference (a nested path), never a literal ARN; `no-literal-arn`
  fails a fixture that writes one.
- Channels: each type's `channels` is recorded from its page (C03's
  vocabulary); the channel lint fires on each in a fixture, with a pass case.
- Where the devguide and the admin guide disagree on flow types
  (`UpdatePreviousContactParticipantState` in outbound whisper; the media
  streaming module case), the catalog follows the service: the probe below
  settles it, and actions.md records both pages and the result.
- `ChannelMismatch` and `NoMatchingError` on media processing are both
  required if and only if the service refuses each removed alone.
- `roundtrip/unknown-actions` is re-authored in the commit that models the
  first of `ResumeContact` and `UpdatePreviousContactParticipantState`: it
  keeps `TransferParticipantToThirdParty`, takes types still unmodeled at
  that point in the console's exported shape, keeps a flow token and a queue
  token inside their parameters, and the codegen test still holds every
  action to `GenericBlock`. Owner decision 10 governs what it holds once
  nothing is left.
- The studio tests that use `UpdatePreviousContactParticipantState` as their
  generic block (the detachable helper document, B01j) move to a type still
  unmodeled, in the same commit.

## Evidence

One sweep, the next numbered rule, per tasks/README.md, "The evidence rule
for this phase", for each type: required set accepted, each required error
removed alone refused, no `NextAction` refused; and:

- `UpdatePreviousContactParticipantState` created in each of inbound,
  transfer-to-agent, transfer-to-queue and outbound whisper flows;
- media streaming created in a module and in a customer hold flow;
- media processing created with a `LambdaProcessorARN` the instance has not
  associated as `MESSAGE_PROCESSOR` (to learn whether the create validates
  the association), and with one it has;
- `ResumeContact` in a contact flow and a module.

## Sandbox prerequisites and cost

- Live media streaming enabled: a Kinesis Video Streams prefix, a KMS key
  (`aws/kinesisvideo` or customer-managed) and retention "No data retention"
  (https://docs.aws.amazon.com/connect/latest/adminguide/enable-live-media-streams.html).
  Owner action. Cost near zero with no retention: $0.0085 per GB ingested,
  nothing idle.
- One Lambda function associated as `MESSAGE_PROCESSOR` through
  `CreateIntegrationAssociation`
  (https://docs.aws.amazon.com/connect/latest/adminguide/setup-sms-messaging.html).
  Owner action (IAM). Cost: invocations only.
- Exercising (the showcase's concern, not this task): an agent on a voice
  call for previous-participant state, a paused task for `ResumeContact`.

## Both repositories

- [ ] flow-as-code, checklist lines 1 to 10, per type.
- [ ] `unknown-actions` re-authored; studio generic-block tests moved.
- [ ] Probe inputs under `conformance/flow-language/probes/<rule>/`.
- [ ] Provider: re-vendor at the merge commit, oracles re-recorded (lines 11
      to 14); the provider commit recorded here.
