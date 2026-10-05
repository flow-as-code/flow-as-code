# ADR-0008: Cases field ids are `casefield` references, usable as map keys

Status: accepted, 2026-10-05 (owner decision 5's default, tasks/README.md,
"Phase D", "Owner decisions"; implemented by D06 on the format D01 ships)

## Context

The three Cases actions (`CreateCase`, `GetCase`, `UpdateCase`) name a case's
fields by id. `CaseRequestFields` is a map whose keys are field ids and whose
values are the field values, static or JSONPath, and `GetCase` also takes
`CaseResponseFields`, a list of field ids to read back
(https://docs.aws.amazon.com/connect/latest/devguide/createcase.html and its
siblings; https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html).
A field id is a UUID that belongs to one Cases domain, and an instance has one
domain, so the dev, qa and prod instances of a deployment each carry their own
id for what an author thinks of as the same field. A flow written against the
dev domain does not deploy against the prod one unless the ids are bound per
environment. The showcase's invariant is that its environments differ only in
bindings, and that invariant is what FlowDoc tokens exist to keep.

Every token mechanism in the repository is written for values. Invariant 4 of
`docs/01-flowdoc-spec.md` says a token "occupies an entire field value"; the
catalog's path grammar (`packages/core/src/paths.ts`) names a top-level key,
a key inside an object, a key inside every list element, and `A.*`, every
value of a map; `materialize`'s `resolveDeep` swaps whole string values and
copies keys through; lint's `walkStrings` visits values; the schema's
`refField` is applied to parameter values; the HCL contract's rule 11 writes
a `map` as an object literal with its keys in byte order and says nothing
about what a key may be; and the provider's `flowmodel.attribute()` makes a
`map` a `MapAttribute` of strings, whose keys Terraform does not type. Only
the refs index (`collectRefs` in `refs.ts`) is already indifferent: it scans
the serialized content for tokens, so a token in a key would be indexed today.

Three shapes were weighed.

- A `casefield` reference type, with tokens standing as map keys and as list
  items, and a path form that names the keys of a map.
- Literal ids, recorded as an accepted limitation: the flow carries the UUID,
  and a multi-environment user keeps one document per environment or
  rewrites the keys outside the tooling.
- A FlowDoc-level alias table: the content carries a readable alias as the
  key, a per-document table maps alias to id, and materialization substitutes.

## Decision

The reference type. `casefield` joins the token grammar in FlowDoc 0.3
(`${cdref:casefield:priority}`), with the slug rules every type has; the
`@` suffix has no meaning for it and `Refs.casefield(name)` never writes one.
A `casefield` token may stand as a whole map key in `CaseRequestFields` and as
a whole item of `CaseResponseFields`, and invariant 4 is restated to cover a
key: a token occupies an entire key or value and is never interpolated.

The catalog names key positions with a new path form, `A.*~`, every key of
the map at `A`, so `CreateCase`'s refs are `CaseRequestFields.*~` and
`GetCase`'s add `CaseResponseFields[]`, which the grammar already reads as
every item of a list. `readPath` returns a hit per key whose value is the key
string, so `REFERENCE_FIELDS`, export, lint and the studio read keys through
the one table they read values through. The trailing `~` is the property-name
operator of JSONPath Plus, borrowed rather than invented.

What each reader does with it, implemented in D06 on D01's format:

- `materialize` resolves a key that parses as a token exactly as it resolves
  a value, anywhere in the content, and the provider's port does the same.
  Resolution stays token-driven, not path-driven, so a key and a value are
  handled by one rule.
- Export's inventory gains the Cases `ListFields` call for the domain the
  instance's `CASES_DOMAIN` integration association names, and maps each id
  back to a token by the field's name. A field id is not a Connect ARN, so
  `parseConnectArn` is not the way in; the catalog path is.
- Lint's `walkStrings` visits keys as well as values, so `no-unresolved-token`
  reports a malformed token in a key and `no-literal-arn` sees every string.
  A literal UUID in a key is not refused by anything: the service accepts it,
  it is not an ARN, and it round-trips as authored. D06 adds a warning only if
  its sweep shows the service validating ids at create.
- The 0.3 schema's `CreateCase`, `GetCase` and `UpdateCase` clauses constrain
  `CaseRequestFields` with `propertyNames`, a token of the type or a plain id,
  and `CaseResponseFields` items the same way.
- HCL writes the key as the reference key, `"casefield:priority" = "high"`,
  and `conformance/hcl/README.md` gains the rule for a reference in a map key;
  `refs` binds it as any key is bound (`awscc_cases_field.priority.field_id`).
  The provider's map attribute is unchanged; its reader checks a key at a
  key-ref path against `REF_KEY` and binds it through `refs`, and its
  serializer writes it back.
- The studio's inspector offers the field picker for keys, the same
  `RefPicker` it offers for values.

Literal ids were not taken because the limitation lands on exactly the users
the tooling is for: anyone with more than one instance, which is every
promote-across-environments setup and the showcase. The ids are not ARNs, so
`no-literal-arn` would not even name the problem. The alias table was not
taken because a per-environment table is a binding, and bindings already
have a home (the reference map, the CDK binder, the HCL `refs` map); a second
substitution grammar would need its own picker, its own export, its own
provider code and its own lint, to do what tokens do.

## Consequences

`casefield` is one of the five reference types FlowDoc 0.3 adds in one bump
(D01), and renaming or removing it afterwards would be a second format change,
which the plan rules out; this ADR is merged before that bump so the set it
freezes is final. The `*~` form is catalog vocabulary: `isCatalogPath` accepts
it, `catalog.test.ts` gains a mutation, and the provider's `flowmodel` learns
it before the re-vendor.

A document that references a case field cannot be deployed to an instance
without a Cases domain, as a document that references a queue cannot be
deployed to one without that queue; the error is the same unbound-reference
error. Export of a Cases flow needs the Cases `ListFields` permission beside
the Connect `List*` calls, and the provider's documented IAM policy says so.

The first HCL golden carrying a `casefield:` key lands in D01 as the first
`"validate": "awaits-provider"` case (tasks/README.md, "HCL goldens before
the provider release"), because the published provider's `refs` key pattern
does not know the type until D10's release.
