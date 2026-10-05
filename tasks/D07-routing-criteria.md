# D07 `UpdateRoutingCriteria`, and an ADR on the recursive expression

Phase D, engine. Gated on D01. No new ref type: predefined attribute names
are portable strings.

## Type

Devguide page fetched 2026-10-04:
https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateroutingcriteria.html.

| Parameter                 | Shape                                                                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RoutingCriteria.Steps[]` | static or dynamic (a JSONPath for the whole list)                                                                                                                                                                                   |
| `Steps[].Expression`      | a tagged union: `AttributeCondition` {`Name` 1 to 64, `Value` 1 to 64, `ProficiencyLevel` float 1.0 to 5.0, `ComparisonOperator` `NumberGreaterOrEqualTo`} or `AndExpression[]` (the console also writes `OrExpression`), recursive |
| `Steps[].Expiry`          | {`DurationInSeconds`}, static                                                                                                                                                                                                       |
| Errors (page)             | `NoMatchingError`                                                                                                                                                                                                                   |
| Restrictions (page)       | inbound, customer queue, transfer to agent and transfer to queue flows; all channels                                                                                                                                                |

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
- The `Name` and `Value` bounds and the proficiency range are recorded in the
  catalog only if the sweep shows the service enforcing them at create;
  otherwise they are the builder's checks and actions.md says so.

## Evidence

One sweep, the next numbered rule, per tasks/README.md, "The evidence rule
for this phase"; and:

- an `OrExpression` (the page does not list it);
- `ProficiencyLevel` 0.5, 5.5 and an integer, and an attribute name the
  instance has not predefined;
- `Steps` as a JSONPath;
- the type in a contact flow, a module and a customer queue flow.

## Sandbox prerequisites and cost

- One predefined attribute (`awscc_connect_predefined_attribute`; awscc
  only). Owner action. Free.
- Exercising with a match needs a user with a proficiency
  (`awscc_connect_user.user_proficiencies`); the showcase's concern.

## Both repositories

- [ ] ADR 0009 merged first.
- [ ] flow-as-code, checklist lines 1 to 10.
- [ ] Probe inputs under `conformance/flow-language/probes/<rule>/`.
- [ ] Provider: re-vendor, oracles re-recorded, a `json` attribute nested in a
      list of objects handled by `flowmodel.attribute()` (lines 11 to 14);
      the provider commit recorded here.
