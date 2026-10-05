# ADR-0009: `UpdateRoutingCriteria`'s expression is a `json` value inside typed steps

Status: accepted, 2026-10-05 (the default D07 names; implemented by D07 on
the format D01 ships)

## Context

`UpdateRoutingCriteria` takes `RoutingCriteria.Steps`, a list of steps or a
JSONPath to one, and each step holds an `Expiry` (`DurationInSeconds`) and an
`Expression`. The expression is a tagged union: an `AttributeCondition`
(`Name`, `Value`, `ProficiencyLevel`, `ComparisonOperator`) or an
`AndExpression` holding a list of expressions, each of which may again be
either (the console also writes `OrExpression`). `ProficiencyLevel` is a
number with the five values 1.0 to 5.0, the only non-integer number in any
documented action
(https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateroutingcriteria.html,
fetched 2026-10-04).

Two things in the toolchain cannot hold that shape as it stands. The catalog
has no number kind other than `integer` and `integerString`, so a typed
`ProficiencyLevel` needs a `number` kind that every reader learns. And the
provider builds its resource schema from the catalog at runtime
(`flowmodel.attribute()`: an `object` is a `SingleNestedAttribute`, a `list`
of objects a `ListNestedAttribute`), and a Terraform schema is a finite tree:
a nested attribute cannot name itself, so a recursive union has no schema
form. The catalog's `json` kind exists for exactly this gap: an object the
contract makes no claim about, written as `jsonencode({...})` in HCL (rule 11)
and as a string attribute in the provider. Four modeled parameters use it
today (`ViewData`, the two analytics behaviors, the older recording action's
`AnalyticsBehavior`).

Four shapes were weighed.

- `Expression` as a `json` value, with the step and its `Expiry` typed and
  the `Steps` list marked `dynamic` for the JSONPath form.
- All of `RoutingCriteria` as one `json` value.
- A depth-limited typed shape: `AndExpression` and `OrExpression` unrolled
  as nested objects to some depth, deeper expressions falling to generic.
- A `number` kind added to the catalog, so that a typed shape could carry
  `ProficiencyLevel`.

## Decision

The first. In the catalog `RoutingCriteria` is an `object` whose `Steps` is a
`list` of objects, `dynamic` (a JSONPath may stand for the whole list), and
each step has `Expression`, kind `json`, required, and `Expiry`, an object
with `DurationInSeconds` (its integer kind, `integer` or `integerString`,
follows what a console export shows, as every integer field's did). No float
kind is needed, because the only float sits inside the `json` value.

What each view does with it, implemented in D07:

- The builder offers a typed helper for the expression, since TypeScript
  expresses the recursive union directly: `attributeCondition(...)`,
  `and(...)` and `or(...)` producing `RoutingExpression`, with
  `ProficiencyLevel` as the five-valued literal union. The helper writes the
  JSON the console writes, codegen inverts only what the helper would write
  byte for byte, and any other shape stays a GenericBlock, the rule every
  inverter follows.
- The 0.3 schema's clause validates the expression recursively through
  `$defs`, which JSON Schema allows where a Terraform schema does not. The
  `Name` and `Value` bounds and the five values enter the clause only on
  sweep evidence that the service enforces them at create (owner decision 3);
  otherwise they are the builder's checks and actions.md says so.
- HCL writes `expression = jsonencode({ ... })` with Flow language key
  spellings in byte order (rules 11 and 12); the step list and `expiry` are
  typed attributes around it. The `Steps` JSONPath form has no place in a
  list attribute, so an action using it is written as a `generic` block, as
  an `integer` holding a JSONPath is today (rule 11).
- The provider needs no new attribute kind: a `json` field inside a nested
  list object is a string attribute in that object, and `flowmodel`'s reader
  parses it where it already parses a top-level `json` field.
- The studio's inspector shows the expression as the JSON editor it shows
  `ViewData` in, inside a per-step list.

All of `RoutingCriteria` as `json` was not taken: it costs least, but it
makes the expiry and the step list opaque to the schema, to HCL and to the
inspector, for no gain, since the step is a plain object. A depth-limited
shape was not taken because the depth is arbitrary, each level is a copy of
the same three fields in the catalog and in the provider's schema, and a
console-built expression one level deeper than the limit silently becomes
generic. A `number` kind was not taken because the typed shape it would serve
is the one the provider cannot hold, and a kind costs a `catalog.test.ts`
mutation, an HCL rule, a provider attribute and a studio field for a single
value inside a value the contract already leaves opaque.

## Consequences

The expression is validated by the FlowDoc schema and the builder, not by the
Terraform schema; a wrong `ProficiencyLevel` in HCL is caught at plan time
only because the provider validates the computed `flowdoc` against the
schema, not by Terraform's own type check. That is the trade a `json` kind
makes everywhere it is used.

`content` is parsed JSON in every reader, so the spelling `2.0` becomes `2`
on the way through TypeScript and Go alike, and no catalog kind changes that.
Whether the service accepts the integer spelling is in D07's evidence list
(an integer beside 0.5, 2.5 and 5.5); if it refuses it, the builder's helper
cannot help, and the finding is recorded against the type rather than solved
in the format.

`dynamic` is existing vocabulary on scalar kinds (an `enum` or
`integerString` the page also lets a JSONPath stand in for); on a `list` it
is new, and D01 adds that case to `catalog.test.ts` and to the provider's
strict parser before the re-vendor. D07's fixture holds a nested
`AndExpression`, an `OrExpression` if the console writes one, and the
JSONPath form.
