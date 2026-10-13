# D04 Outbound: three types

Phase D, engine. Gated on D01 (the `phonenumber` ref type). Two of the three
cannot be run without an owner gate that takes a quota ticket or weeks of
registration; under owner decision 6 they are modeled on create evidence
alone and documented as deployable, not exercisable.

## Types

Devguide pages fetched 2026-10-04.

| Type                       | Parameters                                                                                                                                                                                                                                                                     | Conditions                                                                              | Errors (page)     | Restrictions (page)                                             | Size   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------- | ------ |
| `CheckOutboundCallStatus`  | `{}`                                                                                                                                                                                                                                                                           | `Equals` only; `CallAnswered`, `VoicemailBeep`, `VoicemailNoBeep`, `NotDetected` (enum) | `NoMatchingError` | outbound campaigns only; flow type unstated                     | S to M |
| `CompleteOutboundCall`     | `CallerId.Number` (static or JSONPath); `VoiceConnector` {`VoiceConnectorType` `ChimeConnector`, `VoiceConnectorArn`, `FromUser`, `ToUser`, `UserToUserInformation`?}; `ConnectionTimeLimitSeconds` 1 to 600, dynamic                                                          | none                                                                                    | none              | only while an outbound call is being placed; flow type unstated | M      |
| `StartOutboundChatContact` | `SourceEndpoint` {`Address` phone-number ARN, `Type` `CONNECT_PHONENUMBER_ARN`}, `DestinationEndpoint` {`Address` E.164, `Type` `TELEPHONE_NUMBER`}, `ContactFlowArn` (flow), `ContactSubtype` `connect:SMS`, `InitialSystemMessage`? {`Content`}, `RelatedContact`? `CURRENT` | none                                                                                    | `NoMatchingError` | SMS only                                                        | M      |

Pages:
https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkoutboundcallstatus.html,
https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-completeoutboundcall.html,
https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-startoutboundchatcontact.html.
The admin guide's Call phone number block is valid only in outbound whisper
flows (https://docs.aws.amazon.com/connect/latest/adminguide/call-phone-number.html).

## Acceptance criteria

- The three types are modeled per tasks/README.md, "The per-type checklist",
  one commit each, with `conformance/roundtrip/outbound/` as the group
  fixture.
- `CompleteOutboundCall` has no error branch (`WITHOUT_CATCH_ALL`) if the
  service refuses `NoMatchingError` on it, as rule 37 found for
  `UpdateContactRecordingBehavior`; the sweep decides, not the page's
  "None". Its `ConnectionTimeLimitSeconds` kind follows the console export
  (`integerString` is expected, after B01e) and is `dynamic`. Under owner
  decision 4 a block carrying `VoiceConnector` stays generic and the
  inverter refuses it; a fixture holds that.
- `StartOutboundChatContact.SourceEndpoint.Address` is a `phonenumber`
  reference and `ContactFlowArn` a `flow` reference; constants are recorded
  as single-value enums.
- `CheckOutboundCallStatus`'s conditions are the `enum` kind with the four
  operands, `NextAction` per the sweep.
- Flow types: the catalog records the flow types each type is accepted in, by
  probe, since the pages state none; actions.md records that the restriction
  is the service's, not a page's.
- Each type's actions.md entry states "deployable; not exercised" with the
  gate that would make it exercisable (campaign quota, SMS registration).
- The phone-number export case: `conformance/export/` gains a case whose
  inventory holds a claimed number, and an exported `StartOutboundChatContact`
  rewrites its ARN to a `phonenumber` token; `materialize` resolves it back.

## Evidence

One sweep, the next numbered rule, per tasks/README.md, "The evidence rule
for this phase", for each type; and:

- each type in every flow type, to record where the service accepts it;
- `StartOutboundChatContact` with a voice DID's ARN (not SMS-enabled), to
  learn whether the create validates the number's capability;
- `CompleteOutboundCall` with the `VoiceConnector` form and an invented
  connector ARN, to learn whether the create validates it;
- `CheckOutboundCallStatus` on an instance without campaigns enabled.

A create that needs campaigns or SMS enabled and is refused without them is
recorded as such; the type then stays generic until the owner opens the gate,
and this task records which.

## Sandbox prerequisites and cost

- One claimed US DID, kept (owner decision 7): about $0.03 a day, $0.0022 a
  minute inbound. Never released: a released number enters a cooldown of up
  to 180 days, and claim-and-release cycles beyond 200% of the quota block
  further claims
  (https://docs.aws.amazon.com/connect/latest/APIReference/API_ReleasePhoneNumber.html).
- Gates, not taken by default:
  - Outbound campaigns: outbound calling, a dedicated queue, a KMS key,
    campaigns enabled in the console, and a Support quota increase because
    the default concurrent campaign call quota is 0
    (https://docs.aws.amazon.com/connect/latest/adminguide/enable-outbound-campaigns.html).
    Campaign voice $0.045 a minute.
  - SMS: an End User Messaging SMS number with two-way messaging, imported
    into Connect, the account out of the SMS sandbox, and US registration
    that "can take up to 15 business days"; the lease is billed before
    approval
    (https://docs.aws.amazon.com/connect/latest/adminguide/setup-sms-messaging.html).
    $0.014 per message on the Connect side.

## Both repositories

- [x] flow-as-code, checklist lines 1 to 10, per type.
- [x] Export and materialize cases for the `phonenumber` ref.
- [x] Probe inputs under `conformance/flow-language/probes/46/`, run on
      2026-10-13 (see "Evidence" under "Record").
- [ ] Provider: re-vendor, oracles re-recorded, `export/arn.go` and the
      inventory fake exercised by a phone-number case (lines 11 to 14); the
      provider commit recorded here.

## Record (2026-10-12)

Implemented on branch `feat/d04-outbound`, stacked on
`feat/d07-routing-criteria` (#49), as tasks/README.md orders Phase D (D02,
D05, D03, D06, D07, then D04). It was begun at `ae5f4b9`, before D07 was
rebased onto D06, and rebased onto D07's tip `c6c455f` (on D06) before the
pull request opened. After the review it was rebased again, onto
`fe90a60`, D07 on D06's review head; the `hcl/emit/phase-d-refs` golden's
SMS block became typed then, as the `casefield-key` golden's had. One commit per type, then this record, each green on
`npm run build`, `npm test`, `npm run lint` and `npm run typecheck`:

1. `feat(core): model CheckOutboundCallStatus`
2. `feat(core): model CompleteOutboundCall for its caller ID and time limit`
3. `feat(core): model StartOutboundChatContact and re-author the
passthrough fixture`
4. `docs(conformance): cite the published flows behind rule 46's outbound
types`

The three Developer Guide pages were read again on 2026-10-12 with the
admin guide's Check call progress, Call phone number and Send message
block pages; the action pages say what the table above says. Rule 46 in
`conformance/flow-language/actions.md` quotes all six. The builder now
models 54 of the 61 Types.

### What each type records, and why

- `CheckOutboundCallStatus`: no parameters; `conditions` `enum` with the
  four operands in the page's order; the catch-all required and wired;
  `next` `mirrors:error:NoMatchingError`, because the page's one error is
  "if no condition matches", the no-match path `Wait`'s NextAction already
  mirrors. The acceptance criterion leaves `NextAction` to the sweep;
  until it runs the mirror is the class's reading, and
  `status-no-next` and `status-next-elsewhere` settle it. The class takes
  `onStatus`, one path per status, at least one, in the page's order.
  Unrestricted by flow type (the admin guide: "All flow types") and
  `channels: ["VOICE"]` from the admin guide's channel table, the one page
  that names a channel, as `ResumeContact`'s is. No 0.3 clause: the type
  has no parameter, and nothing about its conditions is known to be
  enforced at create.
- `CompleteOutboundCall`: `CallerId` an optional object whose `Number` is
  a `stringOrJsonPath`, and `ConnectionTimeLimitSeconds` an optional
  `integerString` from 1 to 600 with `dynamic`. No error branch
  (`WITHOUT_CATCH_ALL`): the page says "None.", the admin guide's block
  "has no error branch", and four flows published on GitHub carrying the
  type (rule 46 cites them at their commits) wire none.
  `complete-with-catch-all` is the sweep's check, as rule 37's was for the
  recording behavior. Those four flows also settle `Number`: three hold a
  JSONPath and one a static E.164 number, never an ARN, so it is not a
  `phonenumber` reference. None carries the time limit, so its
  `integerString` spelling is the console's spelling of every other
  seconds field, not an observation, and `complete-time-limit-number`
  puts the JSON number to the service. Flow types `OUTBOUND_WHISPER` and
  `MODULE` and `channels: ["VOICE"]`, the admin guide's Call phone number
  block (the action page names neither). Under owner decision 4 the page's
  `VoiceConnector` is not in the catalog: codegen, the studio and HCL keep
  a block carrying it generic, and the group fixture holds one.
- `StartOutboundChatContact`: the page's six keys in its order;
  `SourceEndpoint.Address` a `phonenumber` reference and `ContactFlowArn`
  a `flow` reference, each a token or a JSONPath (the admin guide sets
  both manually or dynamically); the two endpoint types, the subtype and
  `RelatedContact` single-value enums; the catch-all and `next` required.
  Unrestricted by flow type and with no `channels`: the page's "Only SMS
  chats are supported" is the subtype of the contact the action creates,
  recorded as the enum, and the admin guide's Send message block lists
  every flow type and channel. The class writes the constants and holds a
  static destination to E.164.

### Flow types are the admin guide's until the sweep

(Settled on 2026-10-13, see "Evidence": the service accepted
`CheckOutboundCallStatus` and `StartOutboundChatContact` in every flow type
probed, and `CompleteOutboundCall` in outbound whisper flows only, a module
refused. The record below is as it stood before the sweep.)

The acceptance criterion asks that the catalog record the flow types each
type is accepted in, by probe. No probe has run, so each entry is the
admin guide's reading, and actions.md says so beside each type and says
that a probe's refusal will make the restriction the service's, not a
page's. Every type has a probe in every flow type: nine each, with the
inbound one being the type's required-form probe (the outbound whisper one
for `CompleteOutboundCall`).

### Schema clauses and owner decision 3

`CompleteOutboundCall`'s clause holds `CallerId` an object whose `Number`
is a string, `ConnectionTimeLimitSeconds` a string or an integer (the
page's integer beside the catalog's decimal string, until a probe settles
the spelling) and `VoiceConnector` an object. `StartOutboundChatContact`'s holds `SourceEndpoint.Address` and
`ContactFlowArn` to a token or a JSONPath (this repository's invariant),
the endpoints and the message to objects and the destination address to a
string. The single-value enums and the time limit's bounds stay in the
catalog and the builder. `conformance.test.ts` has a rejection case for
each part of both clauses, and each case was checked to pass the schema
with its type's clause removed.

### Studio

Each type is in the palette (Branch for the status check, Interact for the
call and the SMS). A drag from a status check's handle adds the next
status the page lists; the call has a caller ID and time limit field; the
SMS has pickers for the number and the flow, the destination, the message
and the related contact. An optional field nested in an object, emptied,
now removes the object when nothing else is left in it, so clearing the
caller ID removes `CallerId` and clearing the message removes
`InitialSystemMessage` rather than leaving an empty object no class
writes; `inspectorUi.test.tsx` holds both and fails without the change.

### Export and materialize

`conformance/export/outbound-sms` holds a claimed number (with a
description) and an outbound whisper flow carrying all three types in the
builder's shape, `Conditions` present, so codegen types them; the
number's ARN in the SMS source exports to `${cdref:phonenumber:sms-line}`
and the flow's to a `flow` token, and the static caller ID stays a
number. `conformance/materialize/phonenumber-with-map` is that exported
document with a map, and its test holds the materialized actions equal to
the ones the export read. `phase-d-refs`' exported SMS keeps the
console's transitions and stays generic, as D05 recorded.

### The passthrough fixture

On D07's tip `conformance/roundtrip/unknown-actions` held the flow token
in `StartOutboundChatContact`'s `ContactFlowArn` and the queue token in the
`UserToUserInformation` of `CompleteOutboundCall`'s `VoiceConnector` form,
both types this task models. No Type left unmodeled after D06, D07 and
this task (Voice ID's two, D09's five) has a recorded key that holds a
flow or a queue, so both tokens stay where they are, each in a form of a
modeled type that its class does not write:

- `CompleteOutboundCall` with `VoiceConnector`, generic under owner
  decision 4, as D07's re-authoring planned.
- `StartOutboundChatContact` in the WhatsApp form the admin guide's Send
  message block offers: the subtype `connect:WhatsApp`, which the API
  reference names and the action page and the catalog's enum do not, and
  the API's `InitialTemplatedSystemMessage` (`KnowledgeBaseId`,
  `MessageTemplateId`, each a JSONPath), the template a WhatsApp message
  needs. The subtype alone kept codegen generic but not HCL, whose rule 10
  checks a value's JSON type and not an enum's values, so the `validate:
pass` `generic-only` golden would have carried a typed sub-block the
  published provider lacks; the key the catalog does not record keeps the
  block generic in every view. The key is the API's; the Flow language key
  the console writes for the template is unrecorded.

The fixture is no longer "only unmodeled types". The two tests that hold
it (`codegen.test.ts`, `conformance.test.ts`) now allow a modeled type
only in one of those two named forms, and still hold every action to a
GenericBlock; actions.md, "Unmodeled actions", records the change. Owner
decision 10 anticipated a synthetic Type once every Type is modeled; this
is the step before it, and a reviewer may prefer the synthetic Type now.

### Group fixture and goldens

`conformance/roundtrip/outbound` is an outbound whisper flow: a call placed
with a static caller ID or through a voice connector (generic), the
progress checked on all four statuses, and an SMS by reference on
voicemail and one by attribute with no detection. Its HCL golden is
`awaits-provider`. The `casefield-key` golden's SMS block is now the typed
`start_outbound_chat_contact` sub-block, as the HCL contract's rule 10
requires of a modeled type whose shape the catalog accepts, and its case
description says so. `flow-cli emit` writes the group fixture for `tf`,
`cdk` and `flowascode`, the unbound references under their TODO comments.

### Evidence

Run on 2026-10-13, 17:12 to 17:13 UTC, on the sandbox (us-west-2), after
the sandbox-features root (provider repository,
`acceptance/sandbox-features`) claimed one US DID to the instance and
published the probe target flow. The 75 inputs in
`conformance/flow-language/probes/46/` gave 37 accepted and 38 refused;
`results.json` holds each, and `PENDING.md` is gone. The sandbox has
neither outbound campaigns nor SMS messaging, so each acceptance is the
deployable reading owner decision 6 asks for. Rule 46's last bullet quotes
every result. What moved the model:

- `CompleteOutboundCall` was refused in every flow type but outbound
  whisper, a module included ("not supported in a flow module"), so its
  `flowTypes` is `OUTBOUND_WHISPER` alone, without the module the note
  above `IN_MODULE` had allowed; `fail-complete-outbound-call-in-module`
  holds it.
- `CheckOutboundCallStatus` with the catch-all and no status condition was
  refused naming `Transitions.Conditions`, so the catalog carries
  `minConditions` 1 and error-branches reports a block without one
  (`fail-check-outbound-call-status-without-conditions`). The class
  already required one status.

What the run settled without a change:

- `CheckOutboundCallStatus` and `StartOutboundChatContact` are accepted in
  every flow type probed and in a module, on an instance with neither
  campaigns nor SMS: both are deployable, as modeled.
- A static caller ID must be a number claimed on the instance: an
  unclaimed number and the DID's ARN were refused "invalid resource", a
  JSONPath accepted. The catalog keeps a `stringOrJsonPath`; the class's
  comment says a static number is environment-specific.
- `CompleteOutboundCall` refuses an error branch, and accepts its time
  limit as a string, a number, a JSONPath and `"601"`; with a voice
  connector the time limit is required, and an invented connector ARN is
  accepted. That form stays generic (owner decision 4).
- `StartOutboundChatContact`'s source was accepted as the voice DID by ARN
  and by number: the create checks neither the number's SMS capability nor
  the address's form. Its required keys, constants and the message's
  object shape were each refused when broken; the WhatsApp subtype asks
  for `InitialTemplatedSystemMessage`, a form that stays generic.
- `status-campaign`, in a `CAMPAIGN` flow, was refused for the
  disconnect as well as the status check, which says nothing about the
  action on an instance without campaigns.

### Review (2026-10-12)

Seven confirmed findings on #51 (head `4b1d9a6`), each repaired:

- No rejection case held `StartOutboundChatContact`'s `DestinationEndpoint`
  to an object. One does now, and every part of both outbound clauses was
  deleted in turn and each turned a case red (ten parts, ten cases), which
  this record had claimed before it was true.
- No probe left out a required key. `sms-no-source-endpoint`,
  `sms-no-destination-endpoint`, `sms-no-contact-flow`, `sms-no-subtype`,
  `sms-no-source-address`, `sms-no-source-type`,
  `sms-no-destination-address`, `sms-no-destination-type`,
  `sms-no-message-content` and `complete-caller-id-empty` do, and rule 46
  names each.
- The clause held `ConnectionTimeLimitSeconds` to a string, a spelling no
  observation supports, against the page's "An integer". It now admits a
  string or an integer until `complete-time-limit-number` and
  `complete-time-limit` run; the catalog keeps `integerString` as the
  console's convention, and a test accepts both spellings.
- The studio appended a re-added status after the ones still wired, which
  the class does not write, so the guard refused the drag. The studio now
  sorts a status check's branches into the page's order on a drag and on
  an edit, and a test removes and re-adds a status (failing without the
  change).
- Every SMS shape and removal probe sent the voice DID as its source, so a
  capability refusal would have hidden what each tests. Each now reads the
  source from an attribute, and the accepted-set probe with it; the DID is
  in three probes that ask about the source (`sms-source-did-set-alone`,
  new, `sms-required` and `sms-source-number`).
- Four passages still said the passthrough fixture holds only unmodeled
  Types (the `generic-only` case, `conformance/README.md`, rule 36's
  note in actions.md, a test comment). Each now names the two forms.
- The fixture's tests no longer required an unmodeled Type to remain.
  Both do again (owner decision 10).

Three findings refuted but close, each decided here:

- "Every flow type" for `CheckOutboundCallStatus` omits `CAMPAIGN`, the
  flow type campaigns use. FlowDoc has no `CAMPAIGN` connect type, so the
  catalog cannot record it; `status-campaign` puts the type to the service
  in a `CAMPAIGN` flow and rule 46 will record the result.
- The fixture's `InitialTemplatedSystemMessage` carries `KnowledgeBaseId`
  and `MessageTemplateId` but not `TemplateAttributes`, which the API marks
  required. The fixture is a passthrough Flow language action, never an
  API request, and the console's key for the template is unrecorded; it is
  kept as is, the record saying the key is the API's and the shape a
  guess.
- The passthrough `CompleteOutboundCall` sits in a `CONTACT_FLOW`, which
  the catalog's restriction to outbound whisper flows makes a lint error.
  Nothing lints round-trip fixtures, and this one already fails
  `terminal-blocks` by its loop; it stays, and `complete-contact-flow`
  settles whether the service refuses the type there.

### Not done here

- A console export of each block from the sandbox (owner decision 8).
  The call's shape rests on four published flows, the status check's on
  an AWS sample's console export whose block was never wired (so not its
  `NextAction`), and the SMS's on its page alone, since a GitHub code
  search on 2026-10-12 found no published flow carrying it. A third-party
  library writes the same shapes for all three and records the call
  refused in an inbound flow; rule 46 cites both and treats neither as a
  create recorded here.
- The provider re-vendor and oracles (checklist lines 11 to 14), after the
  merge commit exists, with `export/arn.go` and the inventory fake given a
  phone-number case.
