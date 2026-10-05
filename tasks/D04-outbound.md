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

- [ ] flow-as-code, checklist lines 1 to 10, per type.
- [ ] Export and materialize cases for the `phonenumber` ref.
- [ ] Probe inputs under `conformance/flow-language/probes/<rule>/`.
- [ ] Provider: re-vendor, oracles re-recorded, `export/arn.go` and the
      inventory fake exercised by a phone-number case (lines 11 to 14); the
      provider commit recorded here.
