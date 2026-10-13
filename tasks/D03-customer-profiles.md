# D03 Customer Profiles: six types

Phase D, engine. Gated on D01 (map key patterns and group alternatives are
its vocabulary) and on a Customer Profiles domain linked to the sandbox
instance. No new ref type: the domain is the instance's integration, not a
parameter.

## Types

Devguide pages fetched 2026-10-04, interactions category
(https://docs.aws.amazon.com/connect/latest/devguide/interactions.html).

| Type                                        | Parameters                                                                                                                                                                                           | Errors (page)                                             | Open question                                                          | Size   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| `AssociateContactToCustomerProfile`         | `ProfileRequestData` {`ProfileId`, `ContactId`} (both required), `ProfileResponseData` {}                                                                                                            | `NoMatchingError`                                         | none                                                                   | S      |
| `CreateCustomerProfile`                     | `ProfileRequestData`: about 55 named optional fields plus `Attributes.x`; `ProfileResponseData`: the same names; outputs at `$.Customer`                                                             | `NoMatchingError`                                         | the page's `{ "FirstName", ... }` is not valid JSON; an export decides | M      |
| `UpdateCustomerProfile`                     | as `CreateCustomerProfile`                                                                                                                                                                           | `NoMatchingError`                                         | as above                                                               | M      |
| `GetCustomerProfile`                        | `ProfileRequestData`: `IdentifierName` plus `IdentiferValue` (sic), or `SearchCriteria[]` {`IdentifierName`, `IdentifierValue`} with `LogicalOperator` `AND` or `OR`; `ProfileResponseData` as above | `MultipleFoundError`, `NoneFoundError`, `NoMatchingError` | the key spelling; the two forms                                        | M      |
| `GetCustomerProfileObject`                  | `ProfileId`, `ObjectType` required; `UseLatest` true or false, or `IdentifierName` plus `IdentifierValue`; about 90 response keys (`Asset*`, `Order*`, `Case*`, `*Attributes.x`)                     | `NoneFoundError`, `NoMatchingError`                       | the group constraint; the key list                                     | M      |
| `GetCalculatedAttributesForCustomerProfile` | `ProfileId`; response `CalculatedAttributes._average_hold_time`, `._frequent_caller`, `.x`                                                                                                           | `NoneFoundError`, `NoMatchingError`                       | wildcard keys                                                          | S to M |

Restrictions: none listed on the devguide pages; the admin guide's block
says all channels and all flow types
(https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html).

## Acceptance criteria

- The six types are modeled per tasks/README.md, "The per-type checklist",
  one commit each, with `conformance/roundtrip/customer-profiles/` as the
  group fixture.
- The `ProfileRequestData` and `ProfileResponseData` shapes are taken from a
  console export of each block, committed (ids replaced) under
  `conformance/flow-language/exports/`, not from the page's malformed
  example. Where export and page differ, the catalog follows the export and
  the service, and actions.md records the page's form.
- `IdentiferValue` (the page's spelling) and `IdentifierValue` are each put
  to the service, as `UnTagContact` was (rule 28); the catalog uses the
  spelling the service accepts, and if both are accepted, the console's.
- Map keys: named keys are listed with D01's key vocabulary and `Attributes.x`
  style keys use its key pattern; the HCL view writes both (a
  `conformance/hcl/roundtrip/` case holds one of each).
- The two `GetCustomerProfile` forms and the two `GetCustomerProfileObject`
  forms use D01's group alternatives; the builder refuses both or neither,
  the schema clause matches, and the studio's inspector clears one form when
  the other is set (as the recording block's fields do).
- Required errors follow the sweep, not the page; a type the service
  accepts without one of its page's errors records it optional.
- Studio: the response-data field lists are selectable, not free text, for
  the named keys; free keys for the pattern.

## Evidence

One sweep, the next numbered rule, per tasks/README.md, "The evidence rule
for this phase", for each type; and:

- the identifier spelling probe above;
- each group alternative given both and neither;
- a create on an instance with no Profiles domain linked (to learn whether
  the create validates the domain; rule 37 found that a missing feature
  yields "Invalid Action type");
- `CreateCustomerProfile` with an unknown named key, to learn whether the
  key list is enforced at create.

## Sandbox prerequisites and cost

- A Customer Profiles domain, encrypted with a KMS key, one per instance,
  linked through an integration whose `Uri` is the instance ARN
  (https://docs.aws.amazon.com/connect/latest/adminguide/enable-customer-profiles.html).
  Owner action.
- For `GetCustomerProfileObject`: an object type with one object. For
  `GetCalculatedAttributesForCustomerProfile`: one calculated attribute
  definition, and the Connect service-linked role allowed
  `ListCalculatedAttributeDefinitions` and `GetCalculatedAttributeForProfile`.
  Owner action (IAM).
- Cost: profiles holding only Connect data are free; a profile with imported
  data or custom attributes costs $0.005 on each day it is used, plus $0.005
  per 100 objects
  (https://aws.amazon.com/products/connect/customer/pricing/appendix/). A customer-managed KMS
  key carries its monthly key charge (https://aws.amazon.com/kms/pricing/,
  about $1 a month). Creates alone use no profile.
- The console exports above are owner actions (decision 8) unless a browser
  session is available.

## Both repositories

- [x] flow-as-code, checklist lines 1 to 10, per type.
- [ ] Console exports committed with ids replaced (owner decision 8; see
      "Not done here").
- [x] Probe inputs under `conformance/flow-language/probes/43/`, run on
      2026-10-13 (see "Evidence" under "Record").
- [ ] Provider: re-vendor, oracles re-recorded, key-pattern and group
      vocabulary exercised by its conformance run (lines 11 to 14); the
      provider commit recorded here.

## Record (2026-10-12)

Implemented on branch `feat/d03-customer-profiles`, stacked on
`feat/d05-tasks-and-ai-agents` (#47) at `f14310b`, as tasks/README.md
orders Phase D (D02, D05, then D03). One commit per type, then this record,
each green on `npm run build`, `npm test`, `npm run lint` and
`npm run typecheck`:

1. `feat(core): model AssociateContactToCustomerProfile`
2. `feat(core): model CreateCustomerProfile with its fields as listed keys`
3. `feat(core): model UpdateCustomerProfile and re-author the passthrough
fixture`
4. `feat(core): model GetCustomerProfile with its two search forms as group
alternatives`
5. `feat(core): model GetCustomerProfileObject with its retrievals as group
alternatives`
6. `feat(core): model GetCalculatedAttributesForCustomerProfile`

The six Developer Guide pages and the admin guide's Customer profiles block
page were read again on 2026-10-12 and say what the table above says. Rule
43 in `conformance/flow-language/actions.md` quotes them. The builder now
models 47 of the 61 Types.

### The stored shape, without a console export

No console was reachable, so the acceptance criterion's console export of
each block is not taken (see "Not done here"). In its place the shape is
read from contact flows AWS publishes in its sample repositories, each
written by the console and committed by AWS; rule 43 lists them at the
commits read. They are cited, not copied into `exports/`: they are other
projects' files, and the criterion asks for an export of this sandbox's
blocks with ids replaced. What they settle, and what the catalog follows
where they and the pages differ:

- `ProfileRequestData` is an object of strings, and `ProfileResponseData`
  a list of names, empty when no response field is chosen. The pages write
  both as braces around bare names, which is not JSON.
- Every `GetCustomerProfile` spells `IdentifierName` and `IdentifierValue`.
  The page's prose misspells the first ("IdentiferName") and its example
  the second (`"IdentiferValue"`).
- Every `GetCustomerProfile` wires `NoMatchingError`, `MultipleFoundError`
  and `NoneFoundError`, in that order, which the builder writes.
- Four of the eleven `GetCustomerProfile` blocks search by a named profile
  field (`{ "PhoneNumber": ... }`, AWS's step-by-step guide flows), neither
  of the page's two forms, and one holds `{}`.

No AWS sample carries `AssociateContactToCustomerProfile`,
`UpdateCustomerProfile` or `GetCustomerProfileObject`, and only a
third-party repository carries `GetCalculatedAttributesForCustomerProfile`;
rule 43 says so beside each, and their shapes follow the pages and their
siblings.

### What each type records, and why

- `AssociateContactToCustomerProfile`: `ProfileRequestData` a required
  object of `ProfileId` and `ContactId`, each static or a JSONPath;
  `ProfileResponseData` "None.", written as the empty list. The empty list
  is the console's form for the other five types with no response field,
  not an observation of this one; three probes (the list, its absence, and
  the page's braces) put it to the service.
- `CreateCustomerProfile` and `UpdateCustomerProfile`: `ProfileRequestData`
  a map whose `keys` are the page's 55 fields and whose `keyPatterns` is
  `^Attributes\.[^.]+$`; `ProfileResponseData` a list of strings with the
  same two. Update takes no profile id (the page lists none). The class
  refuses a name outside the lists and codegen leaves such a block generic,
  until `create-unknown-key` shows whether the service enforces the list.
- `GetCustomerProfile`: one identifier or `SearchCriteria` (one to five,
  "up to five total") with a `LogicalOperator` of `AND` or `OR`, as the
  catalog's first `groups` constraint: `exactlyOne` of the pair and of
  `SearchCriteria` with `LogicalOperator`. The class refuses both and
  neither (the union type at compile time, the constructor at run time).
  The named-field form stays generic in codegen and is probed.
- `GetCustomerProfileObject`: `ProfileId` and `ObjectType` required, then
  `exactlyOne` of `[UseLatest]` and the identifier pair. `UseLatest` is an
  enum of the strings `"true"` and `"false"`: the page writes "true /
  false" unquoted, no sample carries the type, and Connect's flags are
  strings in the published flows (`LinkContactToCase`,
  `GetLastUpdatedCase`). The class writes `"true"` only; three probes put
  the JSON boolean, `"True"` and `"false"` to the service. The response
  `keys` are the page's 76 fields and the `keyPatterns` its four
  `*Attributes.x` forms.
- `GetCalculatedAttributesForCustomerProfile`: `ProfileId`, and response
  `keys` of the page's two predefined names with the pattern
  `^CalculatedAttributes\.[^.]+$`, which admits other predefined names and
  a domain's own. They are the domain's strings, not references, as this
  task says.

Every type is unrestricted by flow type and channel: the action pages have
no Restrictions section and the admin guide's block lists all flow types
and every channel. Every type requires its catch-all and `next`.
`MultipleFoundError` and `NoneFoundError` are wired by the builder and not
required: the pages list them without "Must always be defined", the
reading D02 gave `ChannelMismatch` on the message processor, although
every published flow wires them. The `*-no-multiple-found` and
`*-no-none-found` probes settled it the other way on 2026-10-13: the
service requires them, and the fixture that held the pages' reading is now
`fail-get-profile-catch-all-only` (see "Evidence").

### Vocabulary

D01's `keys` and `keyPatterns` named a map's keys. A response list names
the fields it stores, so both may now sit on a `list` whose `of` is a
`string` as well (actions.md, "Machine-readable form").
`catalog.test.ts` refuses them on any other kind, with a mutation for a
list of objects and for a reference, and a test holds `PROFILE_FIELDS`,
`PROFILE_OBJECT_FIELDS`, `CALCULATED_ATTRIBUTE_FIELDS` and their patterns
in `actions.ts` to every parameter that carries them. The provider's
`CatalogElement` decodes both fields on any element already, so its
struct needs no change; its catalog checks, if they hold the two to maps,
need the same widening at the re-vendor. Nothing reads them to refuse a
document. `groups` is used for the first time, on `ProfileRequestData`'s
object fields, and a test reads both lookups' constraints through
`constraintViolations`.

### Schema clauses and owner decision 3

Each clause holds the containers' JSON types only: `ProfileRequestData` an
object and `ProfileResponseData` a list of strings, the shape every
published flow carries. The acceptance criterion asks that the clause
match the builder on both or neither of the group alternatives. It does
not: four of AWS's own `GetCustomerProfile` blocks are in neither form,
and no probe has shown the service refusing either, so a clause holding
`exactlyOne` would refuse documents AWS publishes. The constraint is in the
catalog and the builder until `get-both-forms`, `get-neither-form`,
`get-named-key`, `object-both-forms` and `object-neither-form` run; the
clause follows the service then. The same holds for the key lists, the
bounds and the enums.

### Studio

The inspector gains three field kinds. `fieldMap` edits a create's or
update's request: listed fields are chosen from a select (never typed),
custom attributes are typed and held to the pattern. `names` edits a
response list: listed names are ticked, others typed one per line and held
to the patterns. `form` switches an object between its group alternatives
in one mutation, removing the other form's keys and filling the chosen
one's, so the block never passes through a shape the builder refuses; the
form's fields show only while it is set (as the recording block's two
behaviors clear each other). Select and JSON fields may now edit a key
inside an object, as text and reference fields could. `inspectorUi.test.tsx`
drives each through the palette.

### The passthrough fixture

`conformance/roundtrip/unknown-actions` lost `UpdateCustomerProfile`. Its
queue token moved to a `summary` value in `UpdateCase`'s
`CaseRequestFields`, in D06's shape with `LinkContactToCase` `"false"`:
`summary` is a Cases system field id every domain defines and the
published flows write literally, so the document needs no `casefield`
token and stays in the 0.2 migration test. D06 models `UpdateCase` and
re-authors the fixture again. The `generic-only` golden follows.

### Group fixture and goldens

`conformance/roundtrip/customer-profiles` holds the caller looked up by one
identifier, by two search criteria joined by AND when several match, a
profile created when none is found (listed fields and a custom attribute),
the contact associated with it, an update, the latest order, an asset by
its identifier, and a predefined and a custom calculated attribute. Its HCL
golden is `awaits-provider` and writes a listed key unquoted and an
`Attributes.x` key quoted in one map. `flow-cli emit` writes the fixture
for `tf`, `cdk` and `flowascode`.

### Evidence

Run on 2026-10-13, 17:08 to 17:09 UTC, on the sandbox (us-west-2), after
the sandbox-features root (provider repository,
`acceptance/sandbox-features`) put a Customer Profiles domain on the
instance, linked by its integration, with the standard `CTR` object type.
75 of the 77 inputs in `conformance/flow-language/probes/43/` ran: 27
accepted and 48 refused; `results.json` holds each, and `PENDING.md` is
gone. Two did not run, because the domain has neither a profile nor a
calculated attribute definition (the root's "Not created yet" list):
`assoc-static-profile` (`{{PROFILE_ID}}`) and `calc-custom-name`
(`{{CALCULATED_ATTRIBUTE}}`). The domain was linked before the run, so no
probe saw an instance without one. Rule 43's last bullet quotes every
result. What moved the model:

- The lookup errors are required. `get-required-set-alone` was refused
  without `MultipleFoundError` and `NoneFoundError`, and the object and
  calculated lookups without `NoneFoundError`. The catalog and
  `REQUIRED_EXTRAS` require them, `pass-get-profile-catch-all-only` became
  a fail fixture, and two fail fixtures cover the other two types.
- `AssociateContactToCustomerProfile` refuses `ProfileResponseData`, even
  `[]` ("Invalid Action property name"), and accepts the block without it.
  The catalog drops the parameter, and the class, the palette, codegen and
  the group fixture write none. Its module and customer hold probes were
  refused only for that key, so they say nothing against the type there.
- A custom attribute is refused as a create or update request key
  (`Attributes.loyaltyTier`, `Attributes.preferredLanguage`, and the
  dotted `Attributes.a.b`), as is an unlisted field (`Nickname`). The
  request's `keyPatterns` are gone: the class and the studio take the
  page's fields alone there, and `Attributes.<name>` stays a response name.
- `UseLatest` is accepted only as the string `"true"`; `"false"`, `"True"`
  and the JSON boolean were refused, so the enum holds `"true"` alone.
- `GetCalculatedAttributesForCustomerProfile` without `ProfileResponseData`
  was refused, so the list is required; a name without the
  `CalculatedAttributes.` prefix was refused, and one the domain does not
  define accepted.
- The 0.3 clauses now hold what the service refused: response data on an
  association, request keys outside the fields, response names outside the
  lists, the operator's case, six criteria, `UseLatest` other than
  `"true"`, and the calculated lookup's list and prefix.

What the run settled without a change:

- `IdentifierValue` is the service's spelling; the page's
  `IdentiferValue` was refused. `LogicalOperator` is required with
  `SearchCriteria` even for one criterion.
- The catalog's two group alternatives stay the page's reading, out of
  the clauses: the service accepted a search by a named field
  (`get-named-key`), and both of the object lookup's forms together.
- Every type but the association (refused there only for its response
  key) was accepted in a module, and the create and the profile lookup in
  a customer hold flow, so the types stay unrestricted.
- An object type the domain lacks and a calculated attribute it does not
  define were each accepted: the create checks neither.

### Three readings the review asked to state

- (Settled on 2026-10-13: the service refuses `"false"`, so the enum holds
  `"true"` alone.) `UseLatest` `"false"` cannot be written by the builder,
  read typed by codegen, or chosen in the studio, although the catalog's
  enum held it.
  The page's "Either UseLatest, or IdentifierName and IdentifierValue must
  be present" does not say what `"false"` means alone or beside the pair,
  so the typed form takes only the one reading the page makes plain (the
  latest object), and a document with `"false"` round-trips as a
  GenericBlock, content kept. `object-latest-false` decides it; if the
  service accepts it, the class gains the form and the enum stays.
- (Settled on 2026-10-13: the service requires every lookup branch, so
  the catalog now marks them required.) The builder takes
  `onMultipleFound` and `onNoneFound` (and
  `onNoneFound` on the object and calculated lookups) as required, while
  the catalog marks those branches optional. That is the catalog's two
  flags doing what they say: `builder: true` is the branch the typed form
  always wires, `required: false` is what lint reports. A block wiring the
  catch-all alone lints clean (`pass-get-profile-catch-all-only`) and stays
  a GenericBlock in codegen and the studio, as `ChannelMismatch` on the
  message processor does (D02). If `*-required-set-alone` is accepted and
  the console turns out to write blocks without the lookup branches, the
  builder's two targets become optional in the same change.
- The catch-all is required although no page here marks it "Must always
  be defined". That is the repository's evidence, not the pages' words:
  rule 37 removed the catch-all from every modeled type on 2026-09-29 and
  the service refused all but `MessageParticipant`, and `TagContact`
  requires one although its page lists none. `*-no-catch-all` puts it to
  the service for each type here.

### Review (2026-10-12)

Nine confirmed findings on #48 (head `80f7e94`), each repaired:

- No probe sent `GetCustomerProfile`'s required set alone: every one wired
  both lookup branches or dropped only one. Each type now has a
  `-required-set-alone` probe (six), named in rule 43 as its accepted-set
  probe; those also leave out every optional container, so each
  `required: false` on `ProfileRequestData` and `ProfileResponseData` is
  settled by one.
- The schema rejection test mutated only the association. It now mutates
  one action of each type, and each case was checked to pass the schema
  with that type's clause removed; its comment no longer claims a console
  export.
- `packages/core/SPEC.md` described the association with the create's
  shape and missed a comma.
- The studio's response-name field reordered the list on a blur that
  changed nothing. `mergeTypedNames` keeps stored names in place and the
  field commits only when the typed set changed.
- A `GetCustomerProfile` searching by a named field reached the typed
  inspector (fields are chosen by type), and the form switch kept the
  named field beside the chosen form. `switchForm` now replaces the whole
  request, keeping only a form's `keeps` keys (the object lookup's profile
  and type), so choosing a form turns such a block typed.
- The two form-switch UI tests asserted on text that never renders in the
  inspector, on blocks that were generic from the start. They now open the
  wired fixture, check the mutation notice, save, and compare the saved
  request; each was shown to fail against the old switch.
- The changeset's calculated-attributes sentence had no predicate.

### Not done here

- A console export of each of the six actions, committed under
  `conformance/flow-language/exports/` with ids replaced. Owner action
  (decision 8); no console was reachable. Until then the shapes rest on the
  published flows above, the pages and the sweep; the object lookup's
  error order rests on the pages alone.
- A profile and a calculated attribute definition in the sandbox domain,
  so `assoc-static-profile` and `calc-custom-name` can run.
- The review round tasks/README.md asks of each group.
- The provider re-vendor and oracles (checklist lines 11 to 14), after the
  merge commit exists, including whatever its catalog checks need for
  `keys` and `keyPatterns` on a list.
