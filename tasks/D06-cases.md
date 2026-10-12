# D06 Cases: three types, and an ADR on per-domain field ids

Phase D, engine. Gated on D01 (the `casetemplate` and `casefield` ref types,
ADR 0008, value-dependent required errors, refs on map keys) and on a Cases domain,
which itself requires Customer Profiles (D03's domain).

Cases field ids are per-domain UUIDs, and `CaseRequestFields` uses them as
map keys. A flow written against the dev domain does not deploy against the
prod domain unless the keys are bound per environment, and the showcase's
invariant is that its environments differ only in bindings. That is the
design problem this task decides first.

## Types

Devguide pages fetched 2026-10-04.

| Type         | Parameters                                                                                                                                 | Errors (page)                                                       | Restrictions                                      | Size   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| `CreateCase` | `LinkContactToCase` `"true"` or `"false"`, `CaseTemplateId`, `CaseRequestFields` map (keys are field ids; values static or dynamic)        | `ContactNotLinked` (only when linking), `NoMatchingError`           | "can be used in any type of flow and any channel" | L      |
| `GetCase`    | `LinkContactToCase`, `GetLastUpdatedCase` `"true"` or `"false"`, `CustomerId`, `CaseRequestFields` map, `CaseResponseFields[]` (field ids) | `NoMatchingError`, `ContactNotLinked`, `MultipleFound`, `NoneFound` | none stated                                       | M to L |
| `UpdateCase` | `LinkContactToCase`, `CaseId`, `CaseRequestFields` map                                                                                     | `ContactNotLinked`, `NoMatchingError`                               | none stated                                       | M      |

Pages: https://docs.aws.amazon.com/connect/latest/devguide/createcase.html
and its siblings for `GetCase` and `UpdateCase`;
https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html.

## Acceptance criteria

- `docs/adr/0008-case-field-ids.md` is written and merged under D01, before
  the format bump (moved there on 2026-10-05 so the ref type set 0.3
  freezes is final; the plan's one-bump rule leaves no room for amending
  D01's vocabulary afterwards). This task implements its decision: the
  options it weighs (a `casefield` ref type with tokens as map keys, a new
  path form; literal ids as an accepted limitation; a FlowDoc-level alias
  table) and the default (owner decision 5: the ref type) are listed there.
  Written 2026-10-05, ahead of D01's gate as the plan allows: the ref type,
  tokens as whole map keys and list items, and a `*~` path form (every key
  of a map) in the catalog.
- The three types are modeled per tasks/README.md, "The per-type checklist",
  one commit each, with `conformance/roundtrip/cases/` as the group fixture.
- `CaseTemplateId` is a `casetemplate` reference; field ids follow the ADR,
  in `CaseRequestFields` keys and `CaseResponseFields` items alike.
- `ContactNotLinked` is required when and only when `LinkContactToCase` is
  `"true"`, using D01's value-dependent vocabulary; `error-branches` reports
  it on a linking block in a fail fixture and stays quiet on a non-linking
  one in a pass fixture, in both implementations.
- Export: a Cases inventory maps template and field ids back to tokens; a
  `conformance/export/` case holds a `CreateCase` with two fields.
- HCL: a `conformance/hcl/roundtrip/` case writes a `CreateCase` whose field
  keys are references, and `conformance/hcl/README.md` gains the rule for a
  reference in a map key if the ADR takes that path.
- Studio: the inspector offers a field picker for keys, and the
  value-dependent error appears when linking is switched on.

## Evidence

One sweep, the next numbered rule, per tasks/README.md, "The evidence rule
for this phase", for each type; and:

- `ContactNotLinked` removed alone with linking `"true"` and with `"false"`;
- `CreateCase` with a field id the domain does not have, and with a template
  id it does not have, to learn whether the create validates either;
- a create on an instance with no Cases domain associated.

## Sandbox prerequisites and cost

- Customer Profiles enabled (D03), then a Cases domain associated through
  `CreateIntegrationAssociation` (`CASES_DOMAIN`), with one template and two
  fields (https://docs.aws.amazon.com/connect/latest/adminguide/enable-cases.html).
  awscc only (`awscc_cases_domain`, `_field`, `_template`); owner action.
- Cost: $0.12 per case created, including each successful `CreateCase` run in
  a flow; nothing idle
  (https://aws.amazon.com/products/connect/customer/pricing/appendix/). A
  create of a flow creates no case.

## Both repositories

- [x] ADR 0008 (merged under D01) followed.
- [x] flow-as-code, checklist lines 1 to 10, per type.
- [x] Export, materialize and HCL cases for the field-id decision
      (`conformance/export/cases`, D01's
      `conformance/materialize/casefield-key-with-map`,
      `conformance/hcl/roundtrip/cases`).
- [x] Probe inputs under `conformance/flow-language/probes/44/`; the sweep
      itself has not run (see "Evidence" under "Record").
- [ ] Provider: re-vendor, oracles re-recorded, the value-dependent error
      ported to `internal/lint`, map-key refs in `flowmodel` and the
      serializer (lines 11 to 14); the provider commit recorded here.

## Record (2026-10-12)

Implemented on branch `feat/d06-cases`, stacked on
`feat/d03-customer-profiles` (#48), as tasks/README.md orders Phase D
(D02, D05, D03, then D06). One commit per type, then the export and CLI
wiring this task owed D01, then this record, each green on
`npm run build`, `npm test`, `npm run lint` and `npm run typecheck`:

1. `feat(core): model CreateCase with its template and field keys as
references`
2. `feat(core): model GetCase with its response fields as references`
3. `feat(core): model UpdateCase and re-author the passthrough fixture`
4. `feat(core): name Cases templates and fields by id on export`

The three Developer Guide pages and the admin guide's Cases block and case
fields pages were read again on 2026-10-12 and say what the table above
says. Rule 44 in `conformance/flow-language/actions.md` quotes them. The
builder now models 50 of the 61 Types.

### The stored shape, without a console export of our own

No console was reachable, so the shape is read from flows AWS publishes,
one of them a console export of every block; rule 44 lists them at the
commits read. They are cited, not copied into `exports/`. What they settle:

- `LinkContactToCase` and `GetLastUpdatedCase` are the strings `"true"`
  and `"false"`.
- `CaseTemplateId` is a template's id, not its ARN. D01's
  `conformance/export/phase-d-refs` had guessed the ARN; the export
  lookup below reads both.
- Every field key and response item the flows write is a system field id
  (the admin guide's case fields table, "Field ID (how you call the field
  in the API)"), and a domain's own field is "a UUID (unique ID)".
- A linking block wires `ContactNotLinked` first, and a block that does not
  link never wires it; `GetCase` wires `MultipleFound`, `NoneFound` and the
  catch-all after it, in that order.
- The console's export writes `ContactToLink: "Current"` beside a linking
  `LinkContactToCase`, the admin guide's "Current contact" or "Related
  contact". No page names the key and older flows omit it, so the catalog
  records it optional and `"Related"` rests on the admin guide's wording
  alone until `create-contact-to-link-related` runs.

### ADR 0008, reader by reader

- Catalog: `CaseTemplateId` a `casetemplate` reference; the field keys
  `CaseRequestFields.*~` and the response items `CaseResponseFields[]`
  `casefield` paths. The map and list also carry `keys`, the fifteen system
  field ids (`CASE_SYSTEM_FIELDS`), which stay literal: a key or item at a
  reference path is one of them or a token of the path's type (actions.md,
  "Machine-readable form").
- Builder and codegen: the classes take a field map whose keys are
  `Refs.casefield(...)` tokens or system ids, and codegen writes them as
  computed keys (`[Refs.casefield("priority")]: "high"`), a Prettier fixed
  point. A literal domain field id or template id keeps a block generic.
- Schema: each 0.3 clause holds what the ADR states, a string opening a
  token in those positions is a whole token of the type. A literal id still
  validates (owner decision 3: the published flows write them and nothing
  shows the service refusing one).
- Lint and `materialize`: D01's key walk and key resolution, unchanged. No
  warning on a literal UUID key: the ADR adds one only if the sweep shows
  the service validating ids, and it has not run.
- HCL: rule 11 gains the reference key position: a token in a key or item
  at a reference path is written as its reference key
  (`"casefield:priority" = "high"`) and read back, rule 20 says how the
  reader treats a string there, and
  `refuse/refuse-wrong-key-type-in-map-key` holds the refusal. The
  `casefield-key` golden's create and lookup became typed.
- Export: below.
- Studio: the inspector's field map and response names offer a
  `casefield` reference picker beside the system id list.

### What each type records, and why

- `CreateCase`: `LinkContactToCase` (required enum), `ContactToLink`
  (optional enum, written only when linking), `CaseTemplateId` (required
  `casetemplate`), `CaseRequestFields` (optional map). The catch-all is
  required; `next` required.
- `GetCase`: as `CreateCase`'s link, `GetLastUpdatedCase` (required enum),
  `CustomerId` (optional `stringOrJsonPath`, which no flow writes),
  `CaseRequestFields`, and `CaseResponseFields` (optional list, `max` 10
  from the admin guide's configuration tip). The builder wires
  `MultipleFound` and `NoneFound`, which the catalog does not require: the
  page marks neither "Must always be defined", rule 43's reading of the
  Customer Profiles lookups, while every flow wires both.
- `UpdateCase`: the link, `CaseId` (required `stringOrJsonPath`, the
  flows read `$.Case.case_id`), `CaseRequestFields`.

Every type is unrestricted by flow type and channel ("None. This can be
used in any type of flow and any channel."). The admin guide's run-time
rules, a search with no criteria and an update with no fields taking the
Error branch, are not create rules on any page; the required-set probes put
them to the service. The admin guide's Get case id action (a "Contact to
search") has no recorded key and stays generic.

### The value-dependent error

`ContactNotLinked` is the catalog's first `requiredWhenValue`
(`LinkContactToCase` `"true"`), on all three types. `error-branches` reports
it on a linking block (`fail-create-case-linking-without-contact-not-linked`
and its `get` and `update` siblings) and stays quiet on a block that does
not link or reads the flag from an attribute
(`pass-create-case-not-linking`, `pass-create-case-link-from-attribute`,
`pass-get-case-catch-all-only`), the fixture D01's record said this task
would land. D01 left open how the builder wires it. `builderErrorsFor` now
reads `requiredWhenValue` too: a branch carrying it is the builder's, and
the studio's to offer, only on an action holding the value. A `shapes`
entry with `forbids` would have said the same for the builder, and would
also have made conditional-shape report the branch on a block that does
not link, which no page or probe says the service refuses. In the studio,
one select sets the link (`setCaseLink`), adding `ContactNotLinked` first,
aimed where the catch-all goes, when linking is switched on, and removing
it with `ContactToLink` when it is switched off, in one mutation, so the
block never passes through a shape the class refuses.

### Export and the CLI

D01 keyed Cases templates and fields by ARN and noted that a bare id
matches nothing. The reverse map now keys each template and each of the
domain's own fields by id as well (`byCasesId`), and export names an id at
the catalog's `casetemplate` and `casefield` paths only. A field in
ListFields' `System` namespace, which the inventory now records, or holding
a system field id, is never a reference. `reverseMapOfResourceMap` keys a
binding that is not an ARN by id, so a resource map bound to awscc
`template_id` and `field_id` outputs round-trips offline.
`conformance/export/cases` holds a console-shaped flow with a `CreateCase`
setting two domain fields and two system fields, and a `GetCase` storing a
domain field. `flow-cli export` and `diff` load
`@aws-sdk/client-connectcases`, a new optional peer, as D05 wired the Q in
Connect client.

### The passthrough fixture

`conformance/roundtrip/unknown-actions` lost `UpdateCase`. Its queue token
moved to the `Value` of an attribute condition in `UpdateRoutingCriteria`'s
first routing step, D07's page shape with only the condition's two string
keys (the float `ProficiencyLevel` and `Expiry` have no recorded stored
form). The document still needs no 0.3 token and stays in the 0.2
migration test. D07 models that type and re-authors the fixture again. The
`generic-only` golden follows.

### Group fixture and goldens

`conformance/roundtrip/cases` holds the caller's open cases searched by
system fields, linking the contact and storing a domain field by reference,
the last updated case read by customer id when several match, the case
found updated with a domain field and its summary, linking the current
contact, and when none is found a case opened from a template with a domain
field and three system fields, linking the current contact, then a call log
case opened without linking. Its HCL golden is `awaits-provider` and writes
`casefield:` keys and items and a `casetemplate:` template, bound to
`awscc_connectcases_field` and `_template` outputs. `flow-cli emit` writes
the fixture for `tf`, `cdk` and `flowascode` (the last with
`--allow-unbound`, since the fixture binds no addresses).

### Evidence

Not run. On 2026-10-12 the AWS credentials for the sandbox had expired,
and the Cases domain, its template and its two fields are created by a
sandbox root that had not been applied (owner actions under "Sandbox
prerequisites and cost"). No AWS call was made and no result is recorded.
The inputs are kept in `conformance/flow-language/probes/44/` (57 probes:
21 for `CreateCase`, 22 for `GetCase`, 14 for `UpdateCase`) with
`PENDING.md`, which names the sandbox root's outputs to check and the seven
placeholders the run fills (the domain id, the template id, the text and
single-select field ids and an option value, and a missing field and
template id). Each type has a probe of its required set alone, and one
removing each required key alone, `LinkContactToCase` included
(`*-no-link-flag`). Each
evidence item above has its probes: `ContactNotLinked` removed with
linking `"true"` (`*-linking-no-contact-not-linked`) and wired with
`"false"` (`*-not-linking-contact-not-linked`), `create-missing-field` and
`create-missing-template`, and `create-required` run before the domain is
associated. When the sweep runs, the catalog, `actions.ts`, the schema
clauses and the fixtures change only where a result says so.

### Decisions the review asked to state

The review of #50 confirmed eight findings, repaired in
`fix(core): apply the review of #50`. It also raised four points it judged
not to be defects; each is a decision, recorded here:

- `reference_id` is in `CASE_SYSTEM_FIELDS` although the admin guide's
  table marks it "coming later in 2026". The list is an allowlist of ids
  that stay literal, so leaving it out would make export and the builder
  treat a documented system field as a domain field. `get-reference-id-field`
  puts it to the service.
- System fields Connect fills (`case_id`, `created_by`, `created_datetime`,
  the `last_*` fields, `reference_number`) are allowed as `CaseRequestFields`
  keys. The catalog's `keys` say which ids stay literal, not which are
  writable, and no page or probe shows a create refusing one (owner
  decision 3); setting one may take the Error branch at run time.
  `create-read-only-field` puts two to the service.
- `materializeWithMap` rebuilds a map with `Object.fromEntries`, so a
  `casefield` token bound to the same id as another key in the same map
  collapses into one key. Neither emitter can produce that: `emit --target
tf` binds each token to a unique sentinel, and the CDK binder returns a
  distinct value per reference. Only a hand-written resource map binding a
  field to a system id the map also writes literally, or two references to
  one field, reaches it, which is the author writing one field twice. It is
  left as is; a materialize refusal of a collapsing key is a change to D01's
  rule, not this task's.
- `GetCase` refuses a repeated response field, with no page saying so.
  The refusal is the class's alone: the catalog, the schema and lint accept
  a repeat, and codegen leaves such a block generic, with nothing dropped,
  as D03's profile names do. `get-repeated-response-field` puts it to the
  service.

The studio's link select adds `ContactNotLinked` aimed where the catch-all
goes. On a block with no catch-all yet (one just added from the palette)
there is no target, so the select writes the link alone and the block's
error handle then offers `ContactNotLinked` (`builderErrorsFor`), as it
offers any branch the class wires. A UI test on the wired group fixture
saves the document and reads the branch appearing first when linking is
switched on and gone when it is switched off.

### Not done here

- A console export of the Cases block in each action, committed under
  `conformance/flow-language/exports/` with ids replaced (owner decision 8);
  no console was reachable. Until then `ContactToLink`'s `"Related"`, the
  Get case id form's key and `CustomerId`'s use rest on the pages alone.
- The sweep, above, and the live Cases listings D01 left pending.
- The provider re-vendor and oracles (checklist lines 11 to 14), after the
  merge commit exists, including the reference key rule in its reader and
  serializer and `requiredWhenValue` in `builderErrorsFor`'s port if it has
  one.
