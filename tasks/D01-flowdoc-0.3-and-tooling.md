# D01 FlowDoc 0.3, catalog vocabulary, provider and oracle prep

Phase D, contract. Gated on C03 merged (its `channels` field is the channel
vocabulary every group here extends) and on D00 (the census names every ref
type the new Types need). Nothing in D02 to D09 starts before this merges.

Adding a reference type is a FlowDoc version change by precedent:
`docs/01-flowdoc-spec.md`, "Versioning", records 0.1 to 0.2 as "a version
bump alone" because 0.2 "added the `view` reference type". An older reader
(npm 0.2.x, provider 0.1.x) refuses a document carrying a token it does not
know. So one bump, landed first, carries every new ref type at once.

## Ref types

From the research of 2026-10-04 and D00's census:

| Proposed name  | Used by                                                        | Address form                                       | Inventory API                 |
| -------------- | -------------------------------------------------------------- | -------------------------------------------------- | ----------------------------- |
| `tasktemplate` | `CreateTask.TaskTemplateId`                                    | an id, possibly an ARN; an export settles which    | `ListTaskTemplates`           |
| `casetemplate` | `CreateCase.CaseTemplateId`                                    | a Cases template id (not a Connect ARN)            | Cases `ListTemplates`         |
| `casefield`    | map keys of `CaseRequestFields`, items of `CaseResponseFields` | a per-domain field id (owner decision 5)           | Cases `ListFields`            |
| `assistant`    | `CreateWisdomSession.WisdomAssistantArn`                       | a `wisdom` service ARN, not a Connect ARN          | Q in Connect `ListAssistants` |
| `phonenumber`  | `StartOutboundChatContact.SourceEndpoint.Address`              | `phone-number/<id>`, not nested under the instance | `ListPhoneNumbersV2`          |

Names are settled in this task and recorded in the spec. A `voiceconnector`
type is not added by default (owner decision 4). Any further ref type D00's
census shows (for example a Cognito pool for `AuthenticateParticipant`) is
added here too, or recorded as a later bump with its cost.

## Acceptance criteria

### Format

- `conformance/schema/flowdoc-0.3.schema.json` is derived from 0.2 with the
  new ref types in the token `pattern` and the `refs[].type` enum;
  `flowdoc-0.2.schema.json` is unchanged byte for byte (a test compares its
  hash). Per-type clauses for the newly modeled types are added to 0.3 only,
  by the group tasks, under owner decision 3.
- `migrateFlowDoc` reads 0.1 and 0.2 and returns 0.3; `conformance/migrate/`
  gains `minimal-0.2` and `with-meta-0.2` with their exact output bytes.
- Every fixture moves to `"0.3"` and `tests/flowdocVersion.test.ts` sweeps so
  no 0.2 literal returns outside `conformance/migrate/`.
- A test migrates every 0.2 document in the repository that holds one of the
  21 types as a generic block and validates it against 0.3.
- `docs/01-flowdoc-spec.md`, "Versioning" and "Contract artifacts", say what
  0.3 added and why.

### Every reader, both repositories

Each migrates on the way in, validates against the version a file names, and
knows the new types. The list, from the research; a reader found missing in
review is added here.

- core: `refs.ts` `TOKEN_PATTERN` and `Refs.*`; `flowdoc.ts` `RefType`;
  `export.ts` `CONNECT_ARN_REF_TYPES`, its inverse, `parseConnectArn` (the
  `phone-number/<id>` form beside the managed-view form; non-Connect ARNs for
  `wisdom` and Cases) and the inventory with the List APIs above;
  `materialize`; `simulate`.
- cdk: `binder.ts` `TokenBinder` (new members optional, as `view` was) and
  `scaffold.ts`.
- hcl: `contract.ts` `REF_KEY`, `ADDRESS_SUGAR` and
  `FLOWASCODE_PROVIDER_CONSTRAINT` (raised in D10, not here);
  `conformance/hcl/address-sugar.json` and `conformance/hcl/README.md`.
- cli: `loadDocs`, the bridge's `parseDoc`, `schema/` copies via
  `npm run sync:schema`.
- studio: `refMap.ts`, `refUsage.ts`, `RefPicker.tsx`, `refValues.ts`,
  `parseFlowDoc`.
- provider: `internal/flowdoc/refs.go` `TokenPattern`; `export/arn.go` and
  `reversemap.go`; `connectapi/inventory.go` and the fake;
  `schema/schema.go`, `regexp.go` and `serialize.go` (which name 0.2); any
  data source that needs a sibling for a new type; the IAM policy in its
  docs for the new List calls.

### Catalog vocabulary

Each item is described where the catalog's fields are, has a
`catalog.test.ts` mutation proving the check can fail, a
`conformance/hcl/README.md` rule if it changes the HCL shape, and Go support
in the provider before the re-vendor.

- `channels` (from C03) on unmodeled entries too, so restrictions can be
  recorded before a type is modeled.
- An error required by a parameter's value (`CreateCase`: `ContactNotLinked`
  only when `LinkContactToCase` is `"true"`); `requiredWhenKey` keys off
  presence, so this is a new field, read by `error-branches` in both
  implementations, with fixtures.
- Map key patterns (`Attributes.x`, `CalculatedAttributes.x` beside named
  keys).
- Group alternatives (`GetCustomerProfile`'s identifier pair or
  `SearchCriteria`; `GetCustomerProfileObject`'s `UseLatest` or identifier
  pair), as an extension of `exactlyOne` to groups of keys or by reusing
  `shapes`; the choice and its reason recorded here.
- Refs on map keys (owner decision 5), as a path form in
  `packages/core/src/paths.ts`, or the accepted limitation recorded.
- No `number` kind unless D07's ADR needs one.

### Provider tooling

- `internal/flowdoc/catalog.go`'s strict parser and `flowmodel.attribute()`
  accept every new field and kind; a provider test loads a catalog carrying
  each and one carrying an unknown field (refused, as now).
- `internal/flowdoc/testdata/catalog-oracle.mjs` records every per-type field
  `oracle_test.go` checks (`modeled`, `refPaths`, `restrictions`,
  `unrestricted`, `terminal`, `actionType`, `catalogOrder` as well as the ten
  it records today), so a new type is re-recorded, never hand-edited.
- `conformance_test.go`'s `len(ModeledTypes()) != 35` derives its count from
  the vendored catalog instead of a literal.
- The provider's schema and serializer read and write 0.3.

### Probe tooling

- `scripts/probe-create.mjs`: given a probe input under
  `conformance/flow-language/probes/<rule>/`, fills the placeholders
  (account, instance, Region, resource ids) from the environment, calls
  `CreateContactFlow` (or the module call) as PUBLISHED, prints the result
  with the UTC time, deletes what it created and confirms the deletion with a
  describe call. It is never run by `npm test` or `npm run build`; a unit test
  covers placeholder filling offline, and a test refuses a committed probe
  input carrying a 12-digit account id or an instance UUID.

### Release hygiene

- Changesets for every package whose behaviour changed, saying older tools
  refuse 0.3 documents. Nothing is released by this task.
- The provider work lands in its repository on a branch and is not released
  here; its commits are recorded in this file. D10 releases it.

## Evidence

No catalog error branch, condition or shape changes in this task, so no
sweep. The ref types' address forms are read from the List API pages (URLs
recorded in `export.ts` comments) and checked against one live listing per
API on the sandbox, its output kept with ids replaced.

## Sandbox prerequisites and cost

The listings need the resources to exist: a task template, a Cases domain
with a template and a field, an AI agents assistant, a claimed phone number
(owner decision 7). Owner actions. Cost: the DID at about $0.90 a month and
a KMS key at about $1 a month if a customer-managed key is used; the rest
is free while idle.

## Both repositories

The checklist in tasks/README.md, "The per-type checklist", applies to the
format and vocabulary rather than to a type: lines 1, 3, 5, 6, 9 and 10 for
flow-as-code, all of 11 to 14 for the provider.
