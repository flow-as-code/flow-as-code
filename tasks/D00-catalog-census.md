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
(https://docs.aws.amazon.com/connect/latest/adminguide/set-touchtone-buffer-behavior.html).
The research note of 2026-10-04 said the catalog had none of the first and
third; checked against `catalog.json` on 2026-10-05, it records `StoreInput`
and `InputEncryption` (an optional object with `EncryptionKeyId` and `Key`)
already and lacks only `EnableDTMFBuffer`. That addition is D09's, which
types the form, after C04; nothing about the parameter is done here.

## Acceptance criteria

- The catalog can say where a Type is documented. The four admin-guide Types
  and `TransferParticipantToThirdParty` are added as `modeled: false` entries,
  each with its `doc` URL and a new field recording its source
  (`devguide`, `adminguide` or `console-export`; the name is settled here and
  described where the catalog's other fields are). The devguide category
  lists are unchanged; the new entries sit in a category whose meaning is
  written down, not in one of the four pages' categories they do not appear
  on. `catalog.test.ts` gains a mutation proving a Type in a category list
  without an entry (and the reverse) fails. Three of its existing checks
  refuse what this task adds and are relaxed here, each replaced by a
  mutation that still fails: every entry's `doc` must start with the
  devguide prefix and end in `.html` (becomes per `source`: the devguide
  prefix for `devguide`, the admin-guide prefix for `adminguide`, the API
  Reference page or the export's path for `console-export`; a `devguide`
  entry with an admin-guide URL still fails); an unmodeled entry may carry
  exactly `category,doc,modeled` (the whitelist gains `source`, and D01 adds
  `channels`; an unknown key still fails); and `CATEGORY_COUNTS` plus the
  entry total must match the four category lists (`ActionCategory` in
  `catalog.ts`, its `categories: Record<ActionCategory, ...>` and
  `CATEGORY_COUNTS` gain the fifth category with its count, and a count off
  by one still fails). The provider's `internal/flowdoc/catalog.go` has the
  same three (its category set and its unmodeled struct of `Category` and
  `Doc` only); see "Both repositories".
- Each new entry is backed by evidence recorded in actions.md under a new
  numbered rule: the page quote and URL, and a create the service accepts
  with the Type and minimal parameters (rule 37's method, probe input kept),
  so a Type is never added as if it deployed when it does not. A Type the
  service refuses is still added as `modeled: false`, with the refusal in
  its rule and in the census, and counted in the denominator as not modeled
  with that reason (owner decision 2 and the definition of done's first
  bullet treat Voice ID the same way); what is never added is an invented
  Type name.
- Console-only blocks are recorded in actions.md, "Unmodeled actions", as
  needing a console export, block name and admin-guide URL each, with no
  invented Type name. When the owner's export lands (owner decision 8), each
  Type it names is added the same way, in a follow-up commit under this task
  or D09.
- `GetParticipantInput`'s `EnableDTMFBuffer` is not added here (moved to
  D09 on 2026-10-05, so this task has no gate on C04); this task only
  records in the census that the touchtone form has it and that D09 types
  it.
- The census table in actions.md states the denominator as a count with its
  parts, 56 devguide plus N documented elsewhere plus M console-exported,
  and beside it, not in it, K console-only blocks awaiting an export, which
  enter the denominator only when an export names a Type. A Type in the
  count that the service refuses (D08's Voice ID, if so) stays in it,
  recorded as not modeled with the refusal. The table lists the
  modeled-type forms that stay generic (Lex V1, `VoiceAnalyticsBehavior`,
  `ChatBehavior`, the older recording action's `AnalyticsBehavior`, Wait's
  console-only forms), so the number does not hide them.
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
`internal/flowdoc/catalog.go`'s strict parse, so in a provider commit before
the re-vendor its unmodeled struct (today `Category` and `Doc` only) learns
`source`, its category set learns the fifth category, and its doc-prefix
check (if it has one) becomes per source; `oracle_test.go` expectations for
`modeled` and `catalogOrder` move with the new entries (by hand here, or
after D01's extended oracle). Re-vendor at the merge commit; record the
provider commit here. This task changes nothing the published provider
reads from an emitted tree, so it may land on main before C11's release
(tasks/README.md, "How it relates to Phase C").

## Record (2026-10-05)

Landed on branch `feat/d00-catalog-census`, against main at #24, with the
AWS pages the task names read on 2026-10-05 and the sandbox's 20 default and
sample flows read with `DescribeContactFlow` the same day (17:24 UTC,
us-west-2; none carries a Type outside the Developer Guide). Nothing was
created on the sandbox: the session that did this work was limited to
read-only calls, so the create probes are written and not run (below).

### What landed

- `catalog.json` (both copies, `npm run sync:schema`): a fifth category,
  `other`, whose `doc` is the admin guide's block list, and five
  `modeled: false` entries with a `source`: `RouteContactToAgent`,
  `LoadContactContent`, `AuthenticateParticipant`, `CheckSegmentMembership`
  (`adminguide`, each `doc` its block page) and
  `TransferParticipantToThirdParty` (`console-export`, `doc` the export's
  path `conformance/roundtrip/unknown-actions/doc.flowdoc.json`, since the
  API Reference page renders empty). The four Developer Guide category lists
  are unchanged and carry no `source` (absent means `devguide`).
- `catalog.ts`: `ActionCategory` gains `other`; `CatalogSource` is new;
  `source?` sits on both action shapes. `catalog.test.ts`: `CATEGORY_COUNTS`
  gains `other: 5`, the doc-prefix check is per source (`docProblem`), the
  unmodeled whitelist admits `source`, and every entry must be listed by its
  own category (the reverse of the existing listing check).
- `actions.md`: "Action categories" describes `other`, "Machine-readable
  form" describes `source`, "Unmodeled actions" carries the census tables
  and the generic forms, and rule 39 carries the page quotes, the
  touchtone note, the block-list reading and the probe design.
- `conformance/flow-language/probes/39/<Type>.json`: one `CreateContactFlow`
  input per Type, `Content` as JSON, `{{INSTANCE_ID}}` placeholders, the
  three Types whose pages name no keys probed with `Parameters` empty.
- The skill reference regenerated; `SPEC.md` and the `blocks.ts` comment
  count 61; a `core` patch changeset.

### Relaxed checks and their replacement mutations

| Check relaxed                                             | Replacement, each shown to fail in `catalog.test.ts`                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every `doc` starts with the devguide prefix               | "on a developer guide entry pointing at an admin guide page, or carrying a source" (`CreateCase` with an admin-guide URL, and with `source: adminguide`); "on an entry outside the developer guide with the wrong page, no source, or an unknown one" (`LoadContactContent` with a devguide URL, without `source`, with `source: blog`; `TransferParticipantToThirdParty` naming a missing export) |
| an unmodeled entry carries exactly `category,doc,modeled` | "on an unmodeled entry carrying a key outside the whitelist" (`CreateCase` with `channels`)                                                                                                                                                                                                                                                                                                        |
| `CATEGORY_COUNTS` and the total over four categories      | "on the fifth category's count off by one, either way"; "on a type listed in a category without an entry, and an entry no category lists" (the existing "on a category page losing a type" still fails too)                                                                                                                                                                                        |

### The denominator

| Part                           | Types | Modeled | Note                                                                                                       |
| ------------------------------ | ----- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Developer Guide category pages | 56    | 35      | 27 contact, 6 participant, 15 flow control, 8 interactions; rechecked 2026-10-05, matching                 |
| Administrator Guide only       | 4     | 0       | `RouteContactToAgent`, `LoadContactContent`, `AuthenticateParticipant`, `CheckSegmentMembership`           |
| Console export only            | 1     | 0       | `TransferParticipantToThirdParty`                                                                          |
| Denominator                    | 61    | 35      | 26 unmodeled, none yet refused by the service (Voice ID's two stay in the 56 either way, owner decision 2) |
| Beside it: console-only blocks | 5     |         | Agentic CX, External Tool, Data Table, Create persistent contact association, Get profile recommendations  |

Forms of modeled types that stay generic and are not counted: Lex V1
`LexBot`, `VoiceAnalyticsBehavior` and `ChatBehavior`, the older recording
action's `AnalyticsBehavior`, Wait's console-only forms, and the touchtone
form of `GetParticipantInput` (`EnableDTMFBuffer`, D09).

Ref types the new Types need, for D01 (the census table in actions.md has
the detail): a `user` (agent) for `RouteContactToAgent`; a Customer Profiles
`segment` for `CheckSegmentMembership`, likely; `AuthenticateParticipant`'s
Cognito pool, app client and object type mapping are not Connect resources
and are D01's call; `LoadContactContent` and the exported form of
`TransferParticipantToThirdParty` need none. Three of the five have no known
parameter keys until an export, so D01 records the risk of a later bump.

### Pending

- The create sweep under rule 39: run `probes/39/*.json` on the sandbox
  (D01's `scripts/probe-create.mjs`, or by hand the same way), record each
  result under the rule with date, UTC time, flow type, Region and message,
  and re-author the three empty-parameter probes from the owner's export.
  Until then every new entry stands on its page alone.
- The owner's console export of the five console-only blocks (owner
  decision 8), under `conformance/flow-language/exports/`; each Type it
  names is added the same way under this task or D09.
- terraform-provider-flowascode, in a provider commit before the re-vendor:
  `internal/flowdoc/catalog.go`'s unmodeled struct (`Category`, `Doc`,
  `Modeled`) learns `Source string \`json:"source,omitempty"\``(its strict
decode refuses the new key today; the`ModeledAction`struct need not
change until D09 models one of these);`ActionCategory`'s comment learns
`other`; `conformance_test.go`'s `TestCatalogLoads`counts gain`"other": 5`(its`ModeledTypes()`count stays 35); the oracle's`perType`gains the five Types (re-recorded by`catalog-oracle.mjs`against this commit's`packages/core/dist`, or by hand as `modeled:
  false`rows like the 21 existing unmodeled ones;`catalogOrder`is
unchanged). It has no doc-prefix check. Then`scripts/sync-conformance.sh <merge commit>`, and the provider commit
  recorded here.
