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

- [x] flow-as-code, checklist lines 1 to 10, per type (line 5 for three of
      the four: see "Record").
- [x] `unknown-actions` re-authored; studio generic-block tests moved.
- [x] Probe inputs under `conformance/flow-language/probes/41/`, run on
      2026-10-13 (see "Evidence" under "Record").
- [ ] Provider: re-vendor at the merge commit, oracles re-recorded (lines 11
      to 14); the provider commit recorded here.

## Record (2026-10-12)

Implemented on branch `feat/d02-contact-state`, begun from
`feat/d01-flowdoc-0.3` (#44) while D01 was in review, and opened as #46
stacked on that branch. It is rebased onto main and retargeted there once
#44 merges; this sentence is updated when it is. One commit per type, each green on `npm run build`,
`npm test`, `npm run lint` and `npm run typecheck`, then this record:

1. `feat(core): model ResumeContact and re-author the passthrough fixture`
2. `feat(core): model UpdatePreviousContactParticipantState`
3. `feat(core): model UpdateContactMediaStreamingBehavior`
4. `feat(core): model UpdateContactMediaProcessing with its Lambda as a
reference`

The devguide pages were read again on 2026-10-12 with the admin guide's
block pages (Resume contact, Hold customer or agent, Start and Stop media
streaming, Set recording, analytics and processing behavior); each says
what the table above says. Rule 41 in `conformance/flow-language/actions.md`
quotes them.

### What each type records, and why

- `ResumeContact`: no parameters, the catch-all required, `next` required,
  unrestricted by flow type. Its action page names no channel; the admin
  guide's block routes voice, chat and email down its Error branch, so
  `channels: ["TASK"]` is read from that page, the one catalog entry whose
  channels come from an admin guide page, and actions.md says so.
- `UpdatePreviousContactParticipantState`: the three values, voice only,
  the catch-all, and the action page's flow types (inbound, both
  transfers, a module). The admin guide's outbound whisper flow is not
  allowed until the probe accepts it: the catalog follows the action page
  where the two disagree, as every earlier row does, and the acceptance
  criterion that the service decide is met by the planned probe, not yet
  by a result.
- `UpdateContactMediaStreamingBehavior`: all three keys required on both
  states (the page shows one block for each), one Customer participant and
  Audio written by the class, voice only, the page's flow types plus a
  module. The bare Stop form, the module and the hold flow are probes.
- `UpdateContactMediaProcessing`: `ChatProcessor.LambdaProcessorARN` is a
  `lambda` reference (`REFERENCE_FIELDS`, the catalog's `refs`, a token-only
  schema position because the page says "Must be set statically");
  `no-literal-arn` fails `conformance/lint/no-literal-arn/fail-arn-in-message-processor.json`.
  The catch-all is required (the page: "Must always be defined");
  `ChannelMismatch` is wired by the builder and not required, because the
  page does not mark it, until a probe refuses the block without it.
  `channels: ["CHAT"]` comes from the ChannelMismatch sentence, the page
  having no Restrictions section. The class requires a Lambda when
  processing is enabled.

### Channels

`channel-restricted-action` fires on each type in
`conformance/lint/channel-restricted-action/` (`fail-resume-contact`,
`fail-hold-participant`, `fail-media-streaming`, `fail-message-processor`),
with two pass cases that are not trivially empty: the `ResumeContact` event
hook, which is not the action, and the recording action of the console
block that also holds the message processor.

### Schema clauses and owner decision 3

`flowdoc-0.3.schema.json` gains clauses for the three types with
parameters: the hold block's enum, the media streaming enums, and the
chat processor's enums and token-only Lambda; `conformance.test.ts`
rejects a mutation of each. `ResumeContact` has none: it has no parameter,
and nothing about it is known to be enforced by the service. Decision 3
lets a 0.3 clause encode only what the service enforces at create, and
without the sweep that is not known for any of these enums. Each has an
out-of-range probe in set 41 (`previous-state-other-value`,
`stream-agent-participant`, `processing-lowercase-flag`). The media
streaming clause does not hold `MediaDirections` unique: the page does not
say so, so on review of #46 that was dropped and `stream-duplicate-direction`
added (the class still refuses a repeated direction, and codegen leaves one
generic); the processor's
token-only Lambda is this repository's invariant (no literal ARN, a static
field), whatever the service accepts. If the service
accepts a value a clause refuses, the clause loses it in the commit that
records the result. This is a known risk taken by merging before the
sweep, and the reviewer should weigh it.

### The passthrough fixture

`conformance/roundtrip/unknown-actions` now holds `CreateTask` (with the
flow and queue tokens), `LoadContactContent` in the admin guide's Flow
language example shape, `TransferParticipantToThirdParty`, and
`StartVoiceIdStream` with no parameters as the last action, every one in
the console's shape. Every terminal type is modeled, so no unmodeled type
can end the flow: `StartVoiceIdStream` carries a `NextAction` and the
catch-all (the shape D08's `start-stream` probe sent) back to
`load-content`, a loop. As first committed it kept the empty `Transitions`
its predecessor had; the review of #46 asked for the console shape, and the
HCL `generic-only` golden still writes it as a generic block carrying only
its type. `StartVoiceIdStream` is D08's; if D08 models it,
D08 re-authors the fixture again (owner decision 10 governs the end
state). The hold-flow lint fixture that used an unmodeled `ResumeContact`
as its sink now ends in a loop of prompts. The studio's detachable helper
document and its raw JSON case moved to `LoadContactContent`.

### Evidence

Run on 2026-10-13, 17:06 to 17:07 UTC, on the sandbox (us-west-2), after
the sandbox-features root (provider repository,
`acceptance/sandbox-features`) put live media streaming, a Lambda
associated as `MESSAGE_PROCESSOR`, one associated plainly and one never
associated on the instance. The 35 inputs in
`conformance/flow-language/probes/41/` gave 18 accepted and 17 refused;
`results.json` holds each with its UTC time, and `PENDING.md` is gone.
Rule 41's last bullet quotes every result that moved the model:

- `UpdateContactMediaProcessing` without `ChannelMismatch` was refused
  ("Action is missing required error. Error: ChannelMismatch"), so the
  error is required in the catalog and `REQUIRED_EXTRAS`, and the pass lint
  fixture without it became a fail fixture.
- `MediaDirections` with `From` twice was refused, so the 0.3 clause holds
  the list to unique items.
- `ProcessingEnabled` `"true"` was accepted, so the 0.3 clause no longer
  holds the page's enum there (owner decision 3).
- An enabled processor without a Lambda was refused and the disabled form
  without one accepted, which the class already enforces.
- A Lambda the instance never associated was accepted: the create does not
  check the `MESSAGE_PROCESSOR` association.
- The flow types stand: the previous-participant state was refused in
  outbound whisper (the action page over the block page) and customer
  queue flows, and media streaming in a customer hold flow, and every
  other flow type and module probed was accepted.

The run first stopped on a runner bug, fixed in the same branch:
`ListContactFlowModules` on an instance with no modules answers with
`NextToken: ""`, and the runner's leftover check looped on it until the
service throttled it.

### A D01 follow-up found in review

The provider's Go port of materialize (reviewing #46) found that since D01
`materializeWithMap` no longer scans its finished output, so a token string
in `layout` would pass into `Metadata` where it used to be refused. A valid
document cannot carry one (the schema's `layout` holds only `{x, y}`
numbers), and lint does not walk `layout`. The guard belongs in materialize,
not lint: `refuseInterpolated` (or a scan of the output) should cover the
projected `Metadata` as well as the document's. Recorded for D01's owner;
no D01 code changes in this PR.

### Not done here

- The provider re-vendor and oracles (checklist lines 11 to 14), after the
  merge commit exists.
- The review round tasks/README.md asks of each group.
- The sweep, above.
