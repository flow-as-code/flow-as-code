# D00 Catalog census: what "every action" is measured against

Phase D, contract. No gate. Lands before D01 so the format bump knows every
ref type the remaining Types need.

`catalog.json` records the 56 Types the Developer Guide's four category pages
list (27 contact, 6 participant, 15 flow control, 8 interactions; rechecked
2026-10-04, matching). That is not everything AWS documents or the console
writes:

| Type                              | Console block                    | Documented where                                                                                                                                                                         | Restrictions stated                           |
| --------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `RouteContactToAgent`             | Interrupt agent                  | https://docs.aws.amazon.com/connect/latest/adminguide/interrupt-agent.html                                                                                                               | customer queue flow only, all channels        |
| `LoadContactContent`              | Get stored content               | https://docs.aws.amazon.com/connect/latest/adminguide/get-stored-content.html                                                                                                            | email only                                    |
| `AuthenticateParticipant`         | Authenticate Customer            | https://docs.aws.amazon.com/connect/latest/adminguide/authenticate-customer.html (the linked action page is empty)                                                                       | chat, inbound; needs Cognito and Profiles     |
| `CheckSegmentMembership`          | Customer profiles, check segment | https://docs.aws.amazon.com/connect/latest/adminguide/journey-flow-block-customer-profiles.html                                                                                          | also an outbound-campaign journey block       |
| `TransferParticipantToThirdParty` | Transfer to phone number         | console export (`conformance/roundtrip/unknown-actions`); https://docs.aws.amazon.com/connect/latest/APIReference/participant-actions-transferparticipanttothirdparty.html renders empty | voice; inbound, customer queue, both transfer |

Blocks with no documented Type at all, per
https://docs.aws.amazon.com/connect/latest/adminguide/contact-block-definitions.html:
Agentic CX, External Tool, Data Table, Create persistent contact association,
and the Customer profiles action "Get profile recommendations". Only a console
export can name their Types.

`GetParticipantInput` has gained `EnableDTMFBuffer`, `StoreInput` and
`InputEncryption` for the Set Touchtone Buffer Behavior block
(https://docs.aws.amazon.com/connect/latest/adminguide/set-touchtone-buffer-behavior.html);
the catalog has none of the first and third.

## Acceptance criteria

- The catalog can say where a Type is documented. The four admin-guide Types
  and `TransferParticipantToThirdParty` are added as `modeled: false` entries,
  each with its `doc` URL and a new field recording its source
  (`devguide`, `adminguide` or `console-export`; the name is settled here and
  described where the catalog's other fields are). The devguide category
  lists are unchanged; the new entries sit in a category whose meaning is
  written down, not in one of the four pages' categories they do not appear
  on. `catalog.test.ts` gains a mutation proving a Type in a category list
  without an entry (and the reverse) fails.
- Each new entry is backed by evidence recorded in actions.md under a new
  numbered rule: the page quote and URL, and a create the service accepts
  with the Type and minimal parameters (rule 37's method, probe input kept),
  so a Type the service refuses is not added as if it existed. A Type the
  service refuses is recorded with the refusal and left out.
- Console-only blocks are recorded in actions.md, "Unmodeled actions", as
  needing a console export, block name and admin-guide URL each, with no
  invented Type name. When the owner's export lands (owner decision 8), each
  Type it names is added the same way, in a follow-up commit under this task
  or D09.
- `GetParticipantInput`'s catalog parameters gain `EnableDTMFBuffer` and
  `InputEncryption` with their kinds from the page, after C04 has merged
  (C04 owns the stored form). Whether either is required in some form is
  probed, not read from the page. The builder does not type them here;
  blocks carrying them stay generic until D09.
- The census table in actions.md states the denominator as a count with its
  parts (56 devguide, N documented elsewhere, M console-exported, K
  console-only awaiting an export) and lists the modeled-type forms that stay
  generic (Lex V1, `VoiceAnalyticsBehavior`, `ChatBehavior`, the older
  recording action's `AnalyticsBehavior`, Wait's console-only forms), so the
  number does not hide them.
- For each new Type, the census row names the ref types its parameters need,
  read from its page or export, so D01 carries all of them in one bump. A
  Type whose ref needs are unknown until an export says so is marked, and
  D01 records the risk of a later bump.
- The skill reference regenerated in the same commit as the catalog change;
  `tests/skills.test.ts` green.

## Evidence

- One sweep, rule 39 (or the next free number): each new Type created alone
  with a disconnect in the flow type its page names, accepted or refused,
  with the message; probe inputs under `conformance/flow-language/probes/`.
  Until D01's runner exists, the probe inputs are kept by hand in the same
  placeholder form.
- The admin-guide pages fetched on the day, quoted where the catalog relies
  on them.

## Sandbox prerequisites and cost

- A live session for the sandbox account (`aws sso login`); the 2026-10-04
  research found the token expired. Owner action.
- `AuthenticateParticipant` may refuse a create without a Cognito user pool
  and Customer Profiles; if so, the probe moves to D09 after D03's domain
  exists, and this task records the refusal.
- `LoadContactContent` is email only; whether a create needs email enabled on
  the instance is part of the probe.
- Cost: creates are free. The owner's console export costs nothing.

## Both repositories

flow-as-code: the catalog (both copies), actions.md, `catalog.test.ts`
mutation, skill reference, a changeset for `core` (the catalog is shipped
data). No builder, codegen, schema or studio change.

terraform-provider-flowascode: the new catalog field breaks
`internal/flowdoc/catalog.go`'s strict parse, so the Go struct learns it in a
provider commit before the re-vendor; `oracle_test.go` expectations for
`modeled` and `catalogOrder` move with the new entries (by hand here, or
after D01's extended oracle). Re-vendor at the merge commit; record the
provider commit here.
