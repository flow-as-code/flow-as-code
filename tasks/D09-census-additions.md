# D09 Types D00 adds from the admin guide and console exports

Phase D, engine. Gated on D01 and, for console-only blocks, on the owner's
export (owner decision 8); the `GetParticipantInput` bullet below also needs
C04 merged (#27, `1b674b1`, on main). The Types here are the ones the 56 devguide pages
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
- `GetParticipantInput`'s catalog parameters gain `EnableDTMFBuffer` with its
  kind from the Set Touchtone Buffer Behavior page (moved here from D00 on
  2026-10-05; C04 owns the stored form, so this lands after it); whether it
  is required in some form is probed, not read from the page. The catalog
  already records `InputEncryption` (`EncryptionKeyId`, `Key`, optional):
  its recorded shape is checked against the page, not re-added. Both are
  typed in the builder for that form, with a codegen case, so a console
  export of the block inverts.
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

- [x] flow-as-code, checklist lines 1 to 10, per Type, for the two Types
      modeled (`LoadContactContent`, `TransferParticipantToThirdParty`); the
      other three wait on evidence (see "Record").
- [ ] Exports committed with ids replaced. Only the kept
      `TransferParticipantToThirdParty` shape is under
      `conformance/flow-language/exports/`; it is the old fixture's action,
      not a file the console wrote, and no owner export has been taken.
- [x] Probe inputs under `conformance/flow-language/probes/47/`; the sweep
      itself has not run (see "Evidence" under "Record").
- [ ] Provider: re-vendor, oracles re-recorded (lines 11 to 14); the provider
      commit recorded here.

## Record (2026-10-12)

Implemented on branch `feat/d09-census-additions`, stacked on
`feat/d04-outbound` (#51) at `4b1d9a6`, as the Phase D order ends D07,
D04, D09, D08. It was first written on `feat/d07-routing-criteria` at
`b6f9b24` and rebased once D04's pull request was open; the rebase put
rule 47 after D04's rule 46, the probes README line after D04's, merged
the catalog entries, regenerated the skill reference and the goldens, and
re-authored `roundtrip/unknown-actions` against D04's version, whose flow
and queue tokens sit in generic forms of two types D04 modeled. Each
commit is green on `npm run build`, `npm test`, `npm run lint` and
`npm run typecheck`:

1. `feat(core): model LoadContactContent from the admin guide's Get stored content`
2. `feat(core): model TransferParticipantToThirdParty from the kept export`
3. `docs(conformance): record the census types D09 leaves unmodeled, with their probes`

The builder now models 56 of the 61 Types. Rule 47 in
`conformance/flow-language/actions.md` quotes each page and records every
decision below.

### Per type

| Type                              | Outcome                      | Why                                                                                                                                                                             |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoadContactContent`              | modeled                      | the admin guide's Flow language example; the service accepted a create (rule 40)                                                                                                |
| `TransferParticipantToThirdParty` | modeled                      | the kept export; the service accepted it and refused each error removed (VERIFY 16.8, rule 40)                                                                                  |
| `RouteContactToAgent`             | not modeled, blocked         | the service refused the Type by name ("Invalid Action type", rule 40); `route-keys` reruns the probe on the sandbox, and an agent would need a `user` ref type 0.3 lacks        |
| `CheckSegmentMembership`          | not modeled, blocked         | refused the same way on an instance with no Profiles domain; `segment-keys` reruns it on one with a domain, and a static segment would need a `segment` ref type 0.3 lacks      |
| `AuthenticateParticipant`         | not modeled, blocked         | the service named three keys, but no page or export shows their contents or the conditions; `authenticate-nested-keys` asks for the nested keys, and an export gives the shapes |
| Console-only blocks (five)        | not modeled, awaiting export | no Type is known (owner decision 8); D10 names them in the release notes                                                                                                        |

The second acceptance criterion's case applies to the two ref types: if an
export shows `RouteContactToAgent`'s agent or `CheckSegmentMembership`'s
segment as a static id, the type stays generic with that reason recorded,
or waits for a FlowDoc bump planned here; neither gets a literal ARN.

### `TransferParticipantToThirdParty`'s doc

The catalog's `doc` for a `console-export` Type must be a kept file, and
the file it named, `roundtrip/unknown-actions`, no longer holds the Type
once the Type is modeled. The action is therefore kept as
`conformance/flow-language/exports/transfer-participant-to-third-party.json`,
with a README saying what it is: the fixture's action as re-authored on
2026-09-11 "in the shapes the console's sample flows export", with its
number a JSONPath and a disconnect added. It is not a verbatim console
export, and a real one (owner decision 8) replaces it.

### Decisions a reviewer should check

- The destination number is a JSONPath only in the builder and codegen
  (the third acceptance criterion); the catalog's kind,
  `stringOrJsonPath`, admits a static number in a document and the HCL,
  and `third-static-number` settles it.
- `ContinueFlowExecution` `"True"` requires `CallFailed` and
  `ConnectionTimeLimitExceeded` through a catalog shape, from the
  showcase's VERIFY 16.8 (2026-09-30, its messages quoted in rule 47).
  With `"False"` only the catch-all is required, from a cookbook comment
  with no recorded message; the class still takes the other two when
  wired, so an author can switch the flag without the block passing
  through a generic state. `third-end-all-branches` and
  `third-required-set-alone` settle it.
- `ThirdPartyConnectionTimeLimitSeconds` has no bound in the catalog (none
  is stated anywhere); the builder refuses a value that is not a positive
  integer.
- `LoadContactContent`'s `ContentType` is optional in the catalog, because
  rule 40's create was accepted without it, while the class always writes
  it and codegen types only that form.
- `LoadContactContent` is `unrestricted`: the page's ten flow types are
  every FlowDoc connect type, and `actions.test` requires a restricted
  type to be refused somewhere.
- `channel-restricted-action`'s message for
  `TransferParticipantToThirdParty` names the catalog `doc`, which is the
  kept export's path rather than the block page; the rule reads `doc` for
  every type.
- The Terraform cookbook's generic recipe moved from
  `TransferParticipantToThirdParty` to `StartVoiceIdStream`, because a
  recipe of a now-modeled voice-only type lints with a channel warning,
  which `tests/terraformProviderExample.test.ts` refuses. It was validated
  against the published provider (`RUN_TOFU_VALIDATE=1`). D08 moves it
  again if it models that type.
- The studio's detachable test document uses `AuthenticateParticipant`,
  which stays unmodeled, in place of `LoadContactContent`.

### `EnableDTMFBuffer` (the fifth criterion)

Not typed in this branch. The Set Touchtone Buffer Behavior page writes
the Enable form as `"EnableDTMFBuffer": "true"` alone, while the catalog
requires `InputTimeLimitSeconds` of every `GetParticipantInput` and, by a
shape the service set on 2026-09-29, `StoreInput` and two more branches
whenever `StoreInput` is not `"True"`. `conditional-shape` reports the
page's own Enable example three times today (checked 2026-10-12). Typing
the form needs a shape conditioned on a key being present, a vocabulary
form that does not exist, with its mutation test and a port to the
provider's lint, and the criterion asks that whether the parameter is
required "is probed, not read from the page". The seven `dtmf-buffer-*`
probes ask the service; the typed form follows their results, in this task
or a follow-up recorded here. The catalog's `InputEncryption`
(`EncryptionKeyId`, `Key`) was checked against the page and matches.

### Evidence

Not run. On 2026-10-12 the AWS credentials for the sandbox had expired.
No AWS call was made and no result is recorded. The inputs are kept in
`conformance/flow-language/probes/47/` (43 probes) with `PENDING.md`,
which names what the instance needs (a Customer Profiles domain for
`segment-keys` and `authenticate-nested-keys`, an encryption key for one
buffer probe), the two placeholders, and how to read the probes whose
result depends on another. `load-required-set-alone` and
`third-required-set-alone` are the accepted-set probes; each required key
and each required error has a removal probe, and neither type has an
optional container.

### Not done here

- The sweep, above, and any catalog change its results call for.
- Console exports of the five console-only blocks and of the three
  blocked Types (owner decision 8).
- `EnableDTMFBuffer`, above.
- The review round tasks/README.md asks of each group.
- The provider re-vendor and oracles (checklist lines 11 to 14), after the
  merge commit exists; the provider's typed blocks for the two Types come
  with it, and `conditional-shape`'s port meets its first shape with no
  `requires.parameters`.
