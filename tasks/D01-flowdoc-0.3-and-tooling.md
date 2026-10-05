# D01 FlowDoc 0.3, catalog vocabulary, provider and oracle prep

Phase D, contract. Gated on C11 released (which carries C03, whose
`channels` field is the channel vocabulary every group here extends), on
D00 (the census names every ref type the new Types need) and on ADR 0008
(below). Nothing in D02 to D09 starts before this merges. The gate is on
the release, not on C03's merge, because changesets are consumed all at
once and `release.yml` refuses leftovers: this task's changeset on main
before C11's release would make C11's release the one that writes FlowDoc
0.3 (tasks/README.md, "How it relates to Phase C", amended 2026-10-05).
Only the probe runner and the ADR, which change no format, may land ahead
of the gate as commits of their own.

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

Names are settled in this task and recorded in the spec.
`docs/adr/0008-case-field-ids.md` is written and merged under this task,
before the format bump commit: the options (a `casefield` ref type with
tokens as map keys, a new path form; literal ids as an accepted limitation;
a FlowDoc-level alias table), what each costs in core, HCL, the studio,
export and the provider, and the decision (owner decision 5; default: the
ref type). The table above is final only once the ADR is merged, so 0.3
never ships a token the ADR then renames or removes; D06 implements the
decision. (Moved here from D06 on 2026-10-05.) A `voiceconnector`
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
  gains `minimal-0.2` and `with-meta-0.2` with their exact output bytes, and
  the existing `minimal-0.1` and `with-meta-0.1` expected outputs (today the
  bytes a 0.1 input becomes, a 0.2 document) are re-recorded at 0.3 in the
  same commit; the migration test asserts every case's output names
  `FLOWDOC_VERSION`.
- Every fixture moves to `"0.3"` and `tests/flowdocVersion.test.ts` sweeps so
  no 0.2 literal returns outside `conformance/migrate/`. The sweep's
  exclusions gain `examples/vendored/`, with the reason beside the others:
  the snapshot is written by `scripts/sync-example.mjs` from one satellite
  commit and never edited in place (CLAUDE.md), the satellite cannot write
  0.3 until D10's npm release, and C07's test reads it through
  `migrateFlowDoc`. D10 records when the snapshot moved to 0.3.
- `docs/06-terraform-provider.md`, "Versions and compatibility", gains a row
  whose FlowDoc column is `0.3` and schema file
  `flowdoc-0.3.schema.json`, with the provider column reading "none
  released; D10", because `tests/flowdocVersion.test.ts` holds the table to
  `FLOWDOC_VERSION` and the provider version is read from the registries at
  D10, not predicted. D10 replaces the column with the version read.
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
  `schema/schema.go` (`Versions`, today `0.1` and `0.2`), `regexp.go` and
  `serialize.go` (which name 0.2); any data source that needs a sibling for
  a new type; the IAM policy in its docs for the new List calls.
- the vendored showcase snapshot (`examples/vendored/`, C07): its lint test
  reads each document through `migrateFlowDoc`, so a 0.2 snapshot lints
  against the current catalog without an edit; held by the sweep exclusion
  above.
- `docs/06-terraform-provider.md`'s compatibility table, as above.

### Catalog vocabulary

Each item is described where the catalog's fields are, has a
`catalog.test.ts` mutation proving the check can fail, a
`conformance/hcl/README.md` rule if it changes the HCL shape, and Go support
in the provider before the re-vendor.

- `channels` (from C03) on unmodeled entries too, so restrictions can be
  recorded before a type is modeled. `catalog.test.ts`'s unmodeled-entry
  key whitelist (`category,doc,modeled`, plus D00's `source`) gains it, with
  a mutation that still fails on an unknown key; the provider's unmodeled
  struct in `internal/flowdoc/catalog.go` learns it.
- An error required by a parameter's value (`CreateCase`: `ContactNotLinked`
  only when `LinkContactToCase` is `"true"`). `requiredErrorsFor` in
  `packages/core/src/catalog.ts` keys `requiredWhenKey` off presence
  (`parameters[key] !== undefined`), so this is a new field, read by
  `requiredErrorsFor` (which `error-branches` calls) and by the provider's
  `internal/lint` port, with fixtures.
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
  it records today), so a new type is re-recorded, never hand-edited. Its
  `requiredErrorsForChat` (today `requiredErrorsFor(type, { ChatBehavior:
null })`, one fixed parameter object) becomes a recorded
  `requiredErrorsFor(type, params)` for each parameter value the catalog
  names (for `CreateCase`, `LinkContactToCase` `"true"` and `"false"`), so
  the value-dependent form is oracled, never hand-written.
- `conformance_test.go`'s `len(ModeledTypes()) != 35` derives its count from
  the vendored catalog instead of a literal.
- The provider's schema and serializer read and write 0.3.
- The provider merges 0.3 reading, the extended recorder and the catalog
  vocabulary to its main at this task's re-vendor, unreleased; its release
  is D10's dispatched tag. From then until D10 the provider's main reads 0.3
  while the registries serve 0.1.x, and each group's re-vendor (checklist
  line 11) lands on that main. `provider-drift.yml` is a canary for that
  window, not a gate. (Decided 2026-10-05; the earlier text kept the work on
  a branch, which left D02 to D09's re-vendors nowhere to land.)

### HCL goldens before the provider release

tasks/README.md, "HCL goldens before the provider release", is implemented
here: `packages/hcl/src/validate.test.ts` learns `"validate":
"awaits-provider"` (skip `tofu validate`, count pins only over cases with a
`validate/` directory, hold that an `awaits-provider` case has none and a
`pass` case has one), `conformance/hcl/README.md` describes both values, and
a `conformance/hcl/roundtrip/` case carrying a `casefield:` ref key (or
whichever new key the ADR settles) is the first to use it, so the mechanism
is exercised before any group needs it.

### Probe tooling

- `scripts/probe-create.mjs`: given a probe input under
  `conformance/flow-language/probes/<rule>/`, fills the placeholders
  (account, instance, Region, resource ids) from the environment, calls
  `CreateContactFlow` (or the module call) as PUBLISHED, prints the result
  with the UTC time, deletes what it created and confirms the deletion with a
  describe call. It is never run by `npm test` or `npm run build`; a unit test
  covers placeholder filling offline, and a test refuses a committed probe
  input carrying a 12-digit account id or an instance UUID.
- Landed ahead of the gate on 2026-10-05 (branch `docs/phase-d-prep`), as
  this task allows: `scripts/probe-create.mjs`, `tests/probeCreate.test.ts`
  (a stubbed client; the SDK's paginators insist on a real one, so the runner
  pages by `NextToken` itself) and `conformance/flow-language/probes/README.md`,
  the convention. The runner reads the instance id from `CONNECT_INSTANCE_ID`,
  the Region from `AWS_REGION`, the account from `AWS_ACCOUNT_ID` and any other
  placeholder from `PROBE_<NAME>`, appends to `results.json` (or a
  `--results results-<date>-<region>.json`) beside the inputs with every
  filled value scrubbed back to its placeholder, and refuses to start while
  an `hh-probe-*` or `fac-probe-*` flow or module exists. It has not been run live;
  the first live run is the next sweep. The Voice ID probes of 2026-10-05
  (tasks/D08, "Record") are the first set under the convention, recorded by
  hand before the runner existed. ADR 0008 landed the same day.

### Release hygiene

- Changesets for every package whose behaviour changed, saying older tools
  refuse 0.3 documents. Nothing is released by this task; C11 has released
  before it merges (the gate above), so the next release that consumes
  these changesets is D10's.
- The provider work lands on its main, unreleased, at this task's re-vendor
  ("Provider tooling" above); its commits are recorded in this file. D10
  releases it.

## Evidence

No catalog error branch, condition or shape changes in this task, so no
sweep. The ref types' address forms are read from the List API pages (URLs
recorded in `export.ts` comments) and checked against one live listing per
API on the sandbox, its output kept with ids replaced.

## Sandbox prerequisites and cost

The listings need the resources to exist: a task template, a Cases domain
with a template and a field, an AI agents assistant, a claimed phone number
(owner decision 7). Owner actions. Cost: the DID at about $0.90 a month and
a customer-managed KMS key, if one is used, at its monthly key charge
(https://aws.amazon.com/kms/pricing/, about $1 a month per key); the rest
is free while idle.

## Both repositories

The checklist in tasks/README.md, "The per-type checklist", applies to the
format and vocabulary rather than to a type: lines 1, 3, 5, 6, 9 and 10 for
flow-as-code, all of 11 to 14 for the provider.
