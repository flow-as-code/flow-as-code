# D09 Types D00 adds from the admin guide and console exports

Phase D, engine. Gated on D01 and, for console-only blocks, on the owner's
export (owner decision 8). The Types here are the ones the 56 devguide pages
do not list but D00's census counts.

## Types

| Type                              | Source                                                                                                                      | Restrictions stated                                                           | Known before modeling                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `RouteContactToAgent`             | https://docs.aws.amazon.com/connect/latest/adminguide/interrupt-agent.html (Interrupt agent)                                | customer queue flow only, all channels                                        | parameters from the admin guide page; an export confirms                                                                                    |
| `LoadContactContent`              | https://docs.aws.amazon.com/connect/latest/adminguide/get-stored-content.html (Get stored content)                          | email only                                                                    | as above                                                                                                                                    |
| `AuthenticateParticipant`         | https://docs.aws.amazon.com/connect/latest/adminguide/authenticate-customer.html (Authenticate Customer; action page empty) | chat; inbound                                                                 | needs a Cognito user pool and Customer Profiles; a ref type for the pool if D00 found one                                                   |
| `CheckSegmentMembership`          | https://docs.aws.amazon.com/connect/latest/adminguide/journey-flow-block-customer-profiles.html                             | also an outbound-campaign journey block                                       | needs a segment definition                                                                                                                  |
| `TransferParticipantToThirdParty` | console export (`conformance/roundtrip/unknown-actions`); the API Reference page renders empty                              | voice; inbound, customer queue, transfer to agent and transfer to queue flows | the satellite's sweep (its VERIFY 16.8) found `CallFailed`, `ConnectionTimeLimitExceeded` and `NoMatchingError` all required; re-swept here |
| Console-only blocks               | Agentic CX, External Tool, Data Table, Create persistent contact association, Get profile recommendations                   | from the export                                                               | Type names unknown until exported                                                                                                           |

`TransferParticipantToThirdParty`'s restrictions come from
https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-phone-number.html.

## Acceptance criteria

- Each Type with a documented page or a committed export is modeled per
  tasks/README.md, "The per-type checklist", one commit each, with
  `conformance/roundtrip/census-additions/` as the group fixture. Its catalog
  `doc` points at the page or the export it was modeled from, and its
  actions.md entry says which.
- A Type whose parameters need a ref type D01 did not carry is either left
  generic with the reason recorded, or waits for a later FlowDoc bump that is
  planned and recorded here; it does not get a literal ARN.
- `TransferParticipantToThirdParty`'s destination number is a parameter the
  showcase supplies at run time (its own rule: never committed), so the
  builder accepts a JSONPath for it; whether a static number is accepted is
  recorded from the sweep.
- Console-only blocks whose export the owner has not produced by the time
  the rest of this task is done are listed in the census as awaiting an
  export, and the task closes without them; D10 names them in the release
  notes.
- `GetParticipantInput`'s `EnableDTMFBuffer` and `InputEncryption` (added to
  the catalog in D00) are typed in the builder for the Set Touchtone Buffer
  Behavior form, with a codegen case, so a console export of that block
  inverts.
- `roundtrip/unknown-actions` is re-authored once more if
  `TransferParticipantToThirdParty` is modeled, per owner decision 10.

## Evidence

One sweep, the next numbered rule, per tasks/README.md, "The evidence rule
for this phase", for each Type; for a Type with no devguide page, the export
is the shape's evidence and the sweep is the requirement's. Probe inputs
kept.

## Sandbox prerequisites and cost

- `AuthenticateParticipant`: a Cognito user pool and Customer Profiles (D03).
  Owner action. Cognito's free tier covers a probe.
- `CheckSegmentMembership`: a segment definition on the Profiles domain
  (`awscc_customerprofiles_segment_definition`). Owner action.
- `LoadContactContent`: whether email must be enabled is learned by D00's
  probe; if so, an email address on the instance. Owner action.
- `TransferParticipantToThirdParty`: the claimed DID (owner decision 7) for
  caller id. Running it costs $0.038 a minute plus $0.0048 a minute US
  outbound; a create costs nothing.
- Console exports: owner action (decision 8).

## Both repositories

- [ ] flow-as-code, checklist lines 1 to 10, per Type.
- [ ] Exports committed with ids replaced.
- [ ] Probe inputs under `conformance/flow-language/probes/<rule>/`.
- [ ] Provider: re-vendor, oracles re-recorded (lines 11 to 14); the provider
      commit recorded here.
