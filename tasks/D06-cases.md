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

- [ ] ADR 0008 (merged under D01) followed.
- [ ] flow-as-code, checklist lines 1 to 10, per type.
- [ ] Export, materialize and HCL cases for the field-id decision.
- [ ] Probe inputs under `conformance/flow-language/probes/<rule>/`.
- [ ] Provider: re-vendor, oracles re-recorded, the value-dependent error
      ported to `internal/lint`, map-key refs in `flowmodel` and the
      serializer (lines 11 to 14); the provider commit recorded here.
