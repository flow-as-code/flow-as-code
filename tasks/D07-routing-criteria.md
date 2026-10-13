# D07 `UpdateContactRoutingCriteria`, and an ADR on the recursive expression

Phase D, engine. Gated on D01. No new ref type: predefined attribute names
are portable strings.

## Type

Devguide page fetched 2026-10-04:
https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateroutingcriteria.html.

| Parameter                 | Shape                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RoutingCriteria.Steps[]` | static or dynamic (a JSONPath for the whole list)                                                                                                                                                                                                                                                                                                                                                                                       |
| `Steps[].Expression`      | a tagged union: `AttributeCondition` {`Name` 1 to 64, `Value` 1 to 64, `ProficiencyLevel` one of 1.0, 2.0, 3.0, 4.0, 5.0 ("Valid values are: 1.0, 2.0, 3.0, 4.0 and 5.0"), `ComparisonOperator` `NumberGreaterOrEqualTo`} or `AndExpression[]` (the admin guide's Lambda examples and the UpdateContactRoutingData API reference also write `OrExpression`), recursive; `RoutingCriteria`, `Steps` and `Expression` are marked Required |
| `Steps[].Expiry`          | {`DurationInSeconds`}, static                                                                                                                                                                                                                                                                                                                                                                                                           |
| Errors (page)             | `NoMatchingError`                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Restrictions (page)       | inbound, customer queue, transfer to agent and transfer to queue flows; all channels                                                                                                                                                                                                                                                                                                                                                    |

A recursive union has no Terraform schema form, and the catalog has no float
kind.

## Acceptance criteria

- `docs/adr/0009-routing-criteria-expression.md` is written and merged
  before the type: the options (`Expression` as a `json` value; all of
  `RoutingCriteria` as `json`; a depth-limited typed shape; a `number` kind),
  what each costs in the builder, the schema, HCL and the provider's
  `flowmodel`, and the decision. Default: `Steps` is a list of objects whose
  `Expression` is `json` and whose `Expiry` is typed, with `dynamic` on the
  list for the JSONPath form, so no float kind is needed.
  Written 2026-10-05, ahead of D01's gate as the plan allows, taking that
  default; it records that `2.0` cannot survive a JSON parse in any reader,
  so the integer spelling in the evidence list below decides what the
  builder can write.
- The type is modeled per tasks/README.md, "The per-type checklist", in one
  commit, with `conformance/roundtrip/routing-criteria/` as its fixture
  holding a nested `AndExpression` and an `OrExpression` if the console
  writes one.
- The builder offers a typed TypeScript helper for expressions (the
  recursive union is expressible in TypeScript) that writes the same JSON the
  console does; codegen inverts to it, and refuses anything the helper would
  not write byte for byte.
- The schema clause validates the expression recursively with `$defs`, as
  strictly as the sweep shows the service is, and no more (owner decision 3).
- HCL writes `Expression` with `jsonencode`, and a
  `conformance/hcl/roundtrip/` case holds it.
- The `Name` and `Value` bounds and the five proficiency values are recorded
  in the catalog only if the sweep shows the service enforcing them at
  create; otherwise they are the builder's checks and actions.md says so.
  (The page's five discrete values, not a range: corrected 2026-10-05.)

## Evidence

One sweep, the next numbered rule, per tasks/README.md, "The evidence rule
for this phase"; and:

- an `OrExpression` (the page does not list it);
- `ProficiencyLevel` 0.5, 2.5 (inside the range but not one of the five
  values), 5.5 and an integer, and an attribute name the instance has not
  predefined;
- `Steps` as a JSONPath;
- the type in a contact flow, a module and a customer queue flow.

## Sandbox prerequisites and cost

- One predefined attribute (`awscc_connect_predefined_attribute`; awscc
  only). Owner action. Free.
- Exercising with a match needs a user with a proficiency
  (`awscc_connect_user.user_proficiencies`); the showcase's concern.

## Both repositories

- [x] ADR 0009 merged first (`63694bb`, #33).
- [x] flow-as-code, checklist lines 1 to 10, in one commit.
- [x] Probe inputs under `conformance/flow-language/probes/45/`, run on
      2026-10-13 (see "Evidence" under "Record").
- [ ] Provider: re-vendor, oracles re-recorded, a `json` attribute nested in a
      list of objects handled by `flowmodel.attribute()` (lines 11 to 14);
      the provider commit recorded here.

## Record (2026-10-12)

Implemented on branch `feat/d07-routing-criteria`, first stacked on
`feat/d03-customer-profiles` (#48) at `ebda6e3`, because D06, built beside
it, had no branch on origin when #49 was opened. On 2026-10-12 it was
rebased onto `feat/d06-cases` (#50) at `67d677a`, as tasks/README.md orders
Phase D (D02, D05, D03, D06, then D07). The rebase renumbered nothing (D06
takes rule 44, this task 45). It put rule 44 before 45 in actions.md and
D06's line before this one in the probes README, raised the modeled count
and the census table's Developer Guide row to 51, kept both groups' entries
in `catalog.json`, its copy and the 0.3 schema, and regenerated the skill
reference from the merged catalog. Later the same day the stack was
rebased onto D01's recheck (#44 at `007f9a7`), and this branch onto D06's
new head `14a4b72`, which carries D06's review repairs. Only the studio's
UI tests conflicted, both sides adding at the end of the file. D06's new
head still holds the passthrough queue token in an `UpdateRoutingCriteria`
attribute condition (the fixture is unchanged since `67d677a`); this
branch's move to `CompleteOutboundCall` applied over it, and the `generic-only` golden and D01's recheck goldens
(`phase-d-refs` under `hcl/emit`, `roundtrip` and `emit-tf`, and the
export goldens) pass unchanged. One
commit for the type, then this record, each green on `npm run build`,
`npm test`, `npm run lint` and `npm run typecheck`:

1. `feat(core): model UpdateRoutingCriteria with its expression as typed helpers`

The action page and the admin guide's Set routing criteria block page were
read again on 2026-10-12 and say what the table above says; rule 45 in
`conformance/flow-language/actions.md` quotes them. With D06's three Cases
types beneath it, the builder now models 51 of the 61 Types.

### The Type spelling is in doubt

(Settled on 2026-10-13: the service refuses `UpdateRoutingCriteria` and
takes `UpdateContactRoutingCriteria`, and the type was renamed; see
"Evidence". The record below is as it stood before the sweep.)

The search for a published flow carrying the type found two that do not
spell it the page's way. An AWS sample
(`aws-samples/sample-apj-sup-sa` at `1f164c3`,
https://github.com/aws-samples/sample-apj-sup-sa/blob/1f164c387f4ebc504920e368e664882b6916ea02/connect/multi-tenant-agentic-contact-center/connect-routing/lib/flows.ts)
writes
`UpdateContactRoutingCriteria` and says in a comment that Connect rejects
`UpdateRoutingCriteria` as an action type; it also writes the whole of
`RoutingCriteria` as a JSONPath. A third-party library
(`mgaffigan/pulumi-amazon-connect` at `05a26ef`,
https://github.com/mgaffigan/pulumi-amazon-connect/blob/05a26ef747118fe685f4ffadfb99ab3d5afd2af2/docs/wire-format-checks.md)
records the same refusal
in a table of `CreateContactFlow` rejections whose other rows
(`UnTagContact`, Wait's `TimeoutSeconds`) match rules 28 and 22, and writes
`ProficiencyLevel` as the string `"4.0"` and `DurationInSeconds` as the
string `"30"`. Neither is a create recorded here, so the catalog keeps the
page's Type, as the evidence rule requires, and the type's name is one
`ActionType` entry and one catalog key, so a rename is mechanical. The
first two probes of rule 45 (`routing-required-set-alone` and
`routing-contact-type-set-alone`) settle it, and `PENDING.md` says to rerun
the set under the other spelling if the page's is refused. Until then a
document carrying `UpdateContactRoutingCriteria` is an unknown type and
round-trips as a GenericBlock. These two sources are why the
spelling probes exist, and the spelling is the first open question of this
task. A rename on create evidence also touches D00's census (rule 40) and
the 61-Type denominator, since the Developer Guide page would name a Type
the service does not take; rule 40 is left as it is until then.

### What the type records, and why

- `RoutingCriteria` a required object of `Steps`, a required list of
  objects marked `dynamic`, the first list to carry the flag D01 added. Each
  step's `Expression` is a required `json` value and its `Expiry` an
  optional object of `DurationInSeconds`, an `integerString`: ADR 0009 left
  the kind to a console export, none was taken, and every other seconds
  field the console writes is a decimal string, as the third-party
  library's emitter also writes it.
- Flow types `CONTACT_FLOW`, `CUSTOMER_QUEUE`, `AGENT_TRANSFER`,
  `QUEUE_TRANSFER` and `MODULE` (the page's four, plus a module by the note
  above `IN_MODULE`); every channel, so no `channels`. `next` and the
  catch-all are required.
- The bounds, the levels, the operator and the admin guide's limits are the
  builder's: `attributeCondition` holds `Name` and a static `Value` to 1 to
  64 characters and the level to the five, `and` takes one to eight
  requirements, `or` one to three requirements or ANDs, an OR only at the
  top, and the class requires an expiry on every step but the last. None
  is in the catalog or the schema (owner decision 3).

### The helper, the integer spelling, and codegen

`attributeCondition(name, value, level)`, `and(...)` and `or(...)` build
the Flow language objects, typed as `RoutingExpression`. Arguments are
positional so that codegen's printer, which gains a call node, never meets
an object argument Prettier would hug; every shape tried was checked
against Prettier, and the roundtrip test holds the fixture to a fixed
point. The level is written as a JSON integer: ADR 0009 records that `2.0`
cannot survive a parse, and the admin guide's examples write integers.
Codegen inverts an expression only to calls whose rebuilt value equals the
source in canonical bytes; a document's normal form sorts every object's
keys, so key order is not part of that test, and anything else (a string
level, a numeric expiry, `NotAttributeCondition`, the `Range` operator, an
OR inside an AND) stays generic.

### Schema clause

The clause holds JSON types only, recursively through
`$defs/routingExpression`: `RoutingCriteria` an object or a JSONPath (the
AWS sample's form, which no probe has refused), `Steps` a list of objects
or a JSONPath, `Expiry` an object, and `AttributeCondition`,
`AndExpression` and `OrExpression` an object and two lists of expressions.
`conformance.test.ts` has a rejection case for each part, and each was
checked to pass the schema with that part deleted.

### Studio

A `steps` field kind edits `RoutingCriteria.Steps`: each step's expression
in the JSON editor the `json` kind uses and its expiry in seconds (empty
for a step that never expires), with add and remove; a mode select switches
to a JSONPath. Adding a step after one that never expired gives that step
30 seconds, so the block stays typed. The palette's default is one step of
one requirement on the admin guide's example attribute.

### The passthrough fixture

D06 left the fixture's queue token in `UpdateRoutingCriteria`, which this
task models. The rebase onto D06 moved it to the `UserToUserInformation` of
`CompleteOutboundCall`'s `VoiceConnector` form, with the connector's ARN
and both users JSONPaths, and the `generic-only` golden follows. That form
stays generic after D04 models `CompleteOutboundCall`'s caller-id form
(owner decision 4), so no later task in this phase has to move the token
again; its value is a slot for a token, not a claim about what the
connector's user-to-user information carries. The flow token stays in
`StartOutboundChatContact`, still unmodeled at this point in the stack,
which D04 re-authors when it models that type. Rule 45 records the move.
The type carries no reference, so D06's reference-key rule (HCL README
rules 11 and 20) and its `requiredWhenValue` reading in `builderErrorsFor`
do not reach it; `builderErrorsFor` gives the catch-all alone for both of
the group fixture's actions.

### Group fixture and goldens

`conformance/roundtrip/routing-criteria` holds a target queue set by
JSONPath, the steps read from a Lambda's response by a JSONPath and, on
error, three typed steps (an OR of an AND and a requirement, an AND of two
requirements, a requirement whose value is a JSONPath and which never
expires), then the transfer. Its HCL golden is `awaits-provider`; the
typed block writes each expression with `jsonencode`, and the JSONPath
`Steps` is a `generic` block, as ADR 0009 says. The task asks for an
`OrExpression` "if the console writes one": the admin guide says OR is
available only when set dynamically, so the console likely writes none;
the fixture holds one statically because ADR 0009 names `or`, and
`routing-or` puts that to the service.

### Evidence

Run on 2026-10-13, 17:10 to 17:12 UTC, on the sandbox (us-west-2), after
the sandbox-features root (provider repository,
`acceptance/sandbox-features`) put a predefined attribute of three values
on the instance; the preferred-agent probes named one of its users. The 40
inputs in `conformance/flow-language/probes/45/` gave 23 accepted and 17
refused; `results.json` holds both runs `PENDING.md` asked for, and
`PENDING.md` is gone. Rule 45's last bullet quotes every result.

- The Type. `routing-required-set-alone` under the page's
  `UpdateRoutingCriteria` was refused "Invalid Action type", and
  `routing-contact-type-set-alone`, the same content under
  `UpdateContactRoutingCriteria`, accepted. The other 38 inputs were
  switched to the accepted name and run. The catalog key, `ActionType`,
  the class (`UpdateContactRoutingCriteria`), the HCL block
  (`update_contact_routing_criteria`), the schema clause, the fixtures,
  the HCL golden, the studio and the skill reference were renamed in one
  commit. The census keeps 61 Types and 56 on the Developer Guide's pages:
  the page documents this Type under a name the service refuses, which
  actions.md's table now says.
- What the builder wrote and the service refuses: an `OrExpression` at the
  top of a step (`routing-or`, `routing-or-four`) and `Steps` as a
  JSONPath (`routing-steps-jsonpath`). `or(...)` is removed, `Steps` is no
  longer `dynamic` in the catalog, the class takes a list only, the
  studio's steps editor no longer offers a JSONPath for the steps, and
  codegen leaves either form generic. The group fixture's Lambda form is
  now the whole of `RoutingCriteria` as a JSONPath, which the service
  accepted, as a generic block, and its first step an AND in place of the
  OR. ADR 0009 carries an amendment saying so.
- What the 0.3 clause now holds, each refused: no criteria, no or empty
  steps, a step without its `Expression`, a NOT at the top of a step, an
  empty or JSONPath expiry, and the levels 0.5 and 5.5.
- What the service accepted beyond the builder: the level 2.5 and the
  string `"4.0"`, nine requirements in an AND, a 65-character name and
  value, an attribute and value the instance lacks, a numeric expiry, a
  first step with no expiry, the `Range` operator, an OR inside an AND and
  both preferred-agent forms. Each stays the builder's stricter check or
  a generic form.
- The flow types stand: refused in customer hold and customer whisper
  flows, accepted in the other five probed.

### Review (2026-10-12)

The confirmed findings on #49 (at `b17fd55`), each repaired:

- The AWS sample was cited at its `main` branch; `ae5f4b9` had already
  pinned it at `1f164c3`.
- No probe removed a required key. `routing-no-criteria`,
  `routing-no-steps` and `routing-expiry-empty` now do, beside
  `routing-no-expression`, and rule 45 names each against its Required
  mark.
- Rule 45 said the admin guide makes a proficiency range dynamic-only. It
  limits only OR and NOT to the dynamic form and allows a range beside
  the `>=` operator; the quote, the probe's grouping and the codegen
  test's comment are corrected.
- The admin guide's preferred-agent requirement was neither read nor
  probed. Rule 45 records it with its 10-agent limit and the
  UpdateContactRoutingData API's `Match` shape (and that reference's
  looser bounds); `routing-preferred-agent` and
  `routing-preferred-agent-jsonpath` send it, and the helpers, codegen and
  the schema leave it generic until the sweep.
- The steps inspector showed a numeric `DurationInSeconds` as never
  expiring, and showed the whole of `RoutingCriteria` as a JSONPath as an
  empty list that any edit replaced. It now reads a number, and shows and
  edits the whole-criteria JSONPath as a third form, replaced only when
  the author picks another; a UI test holds each.
- This record now said the branch was not yet rebased onto D06 and what
  that rebase would change; the rebase has since been made (above).
- `routing-name-65` and `routing-value-65` are also unknown names: no
  65-character name exists on the instance. `PENDING.md` and rule 45 say
  how to read them against the two unknown probes.
- `routing-or-four` and `routing-or-inside-and` are static ORs and mean
  nothing if `routing-or` is refused; rule 45 and `PENDING.md` say so,
  and that a JSONPath's content cannot be tested at create.
  `routing-and-eight` joins `routing-and-nine` as its control.
- The Types table said the console writes `OrExpression`, which no export
  shows; it now names the admin guide's examples and the API reference.

### Not done here

- A console export of the block (owner decision 8), which would show the
  level's and the expiry's stored spelling. The Type and the static OR are
  settled by the sweep.
- The review round tasks/README.md asks of each group.
- The provider re-vendor and oracles (checklist lines 11 to 14), after the
  merge commit exists: `flowmodel.attribute()` has to build a `json` field
  inside a list of objects as a string attribute, and its block is
  `update_contact_routing_criteria`. No catalog entry carries `dynamic` on
  a list any more, so D01's provider handling of it has no entry to meet.
