# D01 FlowDoc 0.3, catalog vocabulary, provider and oracle prep

Phase D, contract. Gated on D00 (the census names every ref type the new
Types need) and on ADR 0008 (below), both merged. Nothing in D02 to D09
starts before this merges. As planned on 2026-10-04 and amended on review
the next day, this task was also gated on C11 released (which carries C03,
whose `channels` field is the channel vocabulary every group here extends),
on the release rather than on C03's merge, because changesets are consumed
all at once and `release.yml` refuses leftovers: this task's changeset on
main before C11's release would have made C11's release the one that
writes FlowDoc 0.3. On 2026-10-05 the owner decided that Phase C and
Phase D ship together as one npm minor (tasks/README.md, owner decision 9),
so there is no C11 release to protect: C03 is on main (#26, `eb68746`),
C11 is folded into D10, and the gate is gone. The probe runner and the ADR
landed ahead of the former gate, as the plan allowed.

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
  refuse 0.3 documents. Nothing is released by this task. The next release
  that consumes these changesets is D10's, which consumes every Phase C
  changeset still under `.changeset/` in the same run (owner decision 9,
  2026-10-05: one minor for both phases, no C11 release before this merges).
- The provider work lands on its main, unreleased, at this task's re-vendor
  ("Provider tooling" above), on top of the Phase C re-vendor
  (`feat/revendor-phase-c`, head `34dda2f`, merged to the provider's main
  unreleased); its commits are recorded in this file. D10 releases it.

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

## Record (2026-10-05)

Implemented on branch `feat/d01-flowdoc-0.3` from main at `fe3e3d6` (#42),
ungated by the owner decision of 2026-10-05 (tasks/README.md, "How it
relates to Phase C", as amended by #43; the gate paragraph at the top of
this file is the one #43 rewrites). Four commits, one per concern, each
green on `npm run build`, `npm test`, `npm run lint` and `npm run
typecheck`:

1. `feat(core): FlowDoc 0.3 with the five Phase D reference types` is the
   format bump and every reader in this repository.
2. `feat(core): export inventory and ARN parsing for the FlowDoc 0.3 types`.
3. `feat(core): catalog vocabulary for the Phase D types`.
4. `feat(hcl): awaits-provider goldens, with the first carrying a casefield
key`.

The full suite failed before the bump landed whole (519 tests across 41
files with `FLOWDOC_VERSION` still at `0.2`, the migration cases, the
version sweep and the save gate among them), which is the proof the new
tests can fail; the vocabulary's checks are each proven by a mutation in
`catalog.test.ts`.

### Format

- `conformance/schema/flowdoc-0.3.schema.json` is 0.2 with the token
  pattern, the `refs[].type` enum and the description strings changed, and
  nothing else; `flowdoc-0.1` and `flowdoc-0.2` are held byte for byte by a
  SHA-256 in `packages/core/src/conformance.test.ts` ("keeps the 0.1 and 0.2
  schemas frozen"). No per-type clause was added: the group tasks add theirs
  under owner decision 3.
- `migrateFlowDoc` reads 0.1, 0.2 and 0.3 and returns 0.3;
  `SUPPORTED_FLOWDOC_VERSIONS` is `["0.1", "0.2", "0.3"]`. `conformance/migrate/`
  gained `minimal-0.2` and `with-meta-0.2` (the latter carrying
  `description` and `meta.sourceKind`, what 0.2 added, to show the bump
  keeps them); the 0.1 cases' expected outputs are re-recorded at 0.3; the
  migration test asserts every output names `FLOWDOC_VERSION` and that each
  input is valid at its own version and invalid at 0.3. `invalid.json`
  swaps `0.3` for `0.4`.
- 170 JSON fixtures and 12 TypeScript test files moved to `"0.3"`;
  `tests/flowdocVersion.test.ts` sweeps for `0.1` and `0.2`, with
  `examples/vendored/` skipped for the reason beside the other skips (the
  snapshot is written by `scripts/sync-example.mjs` from one satellite
  commit and never edited in place; C07's test reads it through
  `migrateFlowDoc`; D10 records when it moves). `core@0.2` stamps in goldens
  became `core@0.3`, since the stamp is the format version
  (docs/01-flowdoc-spec.md).
- `docs/06-terraform-provider.md` carries the 0.3 row with "none released;
  D10" in the provider column; `tests/flowdocVersion.test.ts` holds the
  table.
- "migrates every 0.2 document holding an unmodeled type and validates it at
  0.3" in `conformance.test.ts` takes each fixture that holds one of the
  unmodeled types back to 0.2, validates it there, migrates, and validates at
  0.3 (owner decision 3), skipping only `conformance/export/phase-d-refs`,
  which holds tokens no 0.2 document could.
- `docs/01-flowdoc-spec.md`, "Versioning" and "Contract artifacts", say what
  0.3 added and why; invariant 4 is restated to cover a key (ADR 0008);
  `packages/core/SPEC.md` has the FlowDoc and Export entries.

### Ref types

The five in the table above, as named there. Not added: a `user` for
`RouteContactToAgent` and a `segment` for `CheckSegmentMembership` (D00's
census). Both Types were refused by the service on 2026-10-05 as "Invalid
Action type" and their parameter keys are unknown until a console export
(tasks/D00, "Pending"); a token type for a resource no known key holds would
freeze a name the format might never use. The risk is recorded in docs/01:
if D09 models either with a resource id, that is a 0.4 bump at the cost 0.3
paid (a migration case, every reader in both repositories, a provider minor
before the npm one). `AuthenticateParticipant`'s Cognito pool is the same
case. A `voiceconnector` type is not added (owner decision 4).

### Every reader, this repository

- core: `TOKEN_PATTERN`, `Refs.tasktemplate`, `Refs.casetemplate`,
  `Refs.casefield`, `Refs.assistant`, `Refs.phonenumber` (none writes an
  alias), `RefType`; `catalog.json`'s `refTypes` (both copies).
- core export: `CONNECT_ARN_REF_TYPES` and its inverse gain `task-template`
  and `phone-number`; `parseConnectArn` reads the `phone-number/<id>` form
  beside the managed-view form (the service reference's ARN formats, read
  2026-10-05 from `servicereference.us-east-1.amazonaws.com/v1/{connect,cases,wisdom}`:
  `arn:aws:connect:<region>:<account>:phone-number/<id>`,
  `arn:aws:connect:<region>:<account>:instance/<id>/task-template/<id>`,
  `arn:aws:cases:<region>:<account>:domain/<id>/template/<id>` and
  `/field/<id>`, `arn:aws:wisdom:<region>:<account>:assistant/<id>`);
  `parseCasesArn` and `parseAssistantArn` read the two other services'
  ARNs. The inventory gains four optional lists (`taskTemplates`,
  `phoneNumbers`, `casesDomain` with its templates and fields, `assistants`),
  the client interface four optional methods, and the SDK adapter
  `ListTaskTemplates` (page maximum 100), `ListPhoneNumbersV2` (`InstanceId`
  for an id, `TargetArn` for an instance ARN), `ListIntegrationAssociations`
  with `IntegrationType=CASES_DOMAIN` to find the domain and then the Cases
  `ListTemplates` and `ListFields`, and Amazon Q in Connect `ListAssistants`.
  The last three use `@aws-sdk/client-connectcases` and
  `@aws-sdk/client-qconnect`, optional peers of `@flow-as-code/core` loaded
  by dynamic import and taken as `cases` and `qconnect` on
  `createConnectInventoryClient`; without them the adapter offers no
  `describeCasesDomain` or `listAssistants`. The reverse map names a phone
  number by its description or else its digits. The API pages are cited in
  `export.ts`; `conformance/export/phase-d-refs/` holds the recorded shapes
  and a flow holding every new kind. Not wired: the CLI's `export` builds
  the Connect client only (`packages/cli/src/aws.ts`); D05 and D06 wire the
  two optional clients when they model the actions, and D06 adds the
  id-keyed lookup a `CaseRequestFields` key needs, since a bare field id
  matches no ARN-keyed entry.
- `materialize` and `simulate` are token-driven through `parseToken` and
  needed no change for a token in a value; resolving a token in a map key is
  D06's (ADR 0008), as is lint's `walkStrings` visiting keys.
- cdk: `TokenBinder` gains optional `tasktemplate`, `casetemplate`,
  `casefield`, `assistant` and `phonenumber`; `bindRef` calls them as it
  calls `flow`; the scaffold writes each when a document in the set needs it
  (`scaffold.test.ts` covers all five and their order).
- hcl: `REF_KEY` is the thirteen types; `ADDRESS_SUGAR` gains
  `aws_connect_phone_number.<label>.arn` (the one new type with a
  hashicorp/aws resource exporting `arn`, checked 2026-10-05 against the
  registry page cited in `contract.ts`); the other four are key-form only,
  as lex bots and views are, recorded in `address-sugar.json` and README
  rule 21. No reader or writer code changed for the vocabulary: `keyPatterns`
  and `groups` change no HCL shape, `dynamic` on a list is written as the
  typed list or generic as rule 11 already says for a JSONPath in a typed
  position, and the rule for a reference in a map key lands with D06's
  typed `create_case` block (ADR 0008).
- cli: `loadDocs` and the bridge read `SUPPORTED_FLOWDOC_VERSIONS` and the
  packaged schema copies; `npm run sync:schema` copies the 0.3 schema;
  `tests/packaging.test.ts` lists it.
- studio: `validate.ts` compiles all three schemas and validates a file
  against the one its version names; `refUsage.ts`'s sidebar order,
  `refMap.ts`'s address hints (a variable for the four without a
  hashicorp/aws resource) and `offlineScan.ts`'s allowed `$id` list know the
  types; `RefPicker` and `refValues` needed nothing, since none carries an
  alias.
- Skill: the hand-written reference list in
  `plugins/flow-as-code/skills/author-connect-flows-hcl/SKILL.md`; the
  generated action reference is unchanged (no catalog entry changed) and
  `--check` passes.

### Catalog vocabulary

Each described in actions.md, "Machine-readable form", typed in
`catalog.ts`, validated by `catalogProblems` and proven by a mutation:

- `channels` on an unmodeled entry (the whitelist admits it; an unknown key
  still fails; an unknown channel or an empty list fails on either kind of
  entry). `channelRestriction` reads any entry, so
  `channel-restricted-action` reports a generic block once its page is
  recorded.
- `requiredWhenValue: { key, equals }` on an error, read by
  `requiredErrorsFor` through the new `requiredErrorsOf(errors, parameters)`
  (exported, so the provider's recorder and the lint port read one thing).
  Fails on a key that is no parameter, a value the enum lacks, or doubling
  with `required` or `requiredWhenKey`. A JSONPath in the parameter requires
  nothing. The first entry carrying it (D06's `CreateCase`) lands with the
  lint fixture.
- `keyPatterns` on a map, anchored regular expression sources beside `keys`;
  fails on a non-map or an unanchored or invalid pattern.
- Group alternatives as `groups` on a constraint, in place of `keys`, chosen
  over `shapes` because a shape keys off a parameter's value and these
  alternatives key off presence, which `constraints` already express. A
  constraint carries one form, at least two alternatives, no empty group and
  no key in two groups. `constraintViolations(constraints, values)`
  (exported) is the one reading of both forms, unit-tested on
  `GetCustomerProfile`'s shape.
- The path form `A.*~` in `paths.ts`: `readPath` returns a hit per key at
  `A.<key>~` whose value is the key string; `isCatalogPath` accepts `*~`
  and refuses `~` on a named segment or doubled.
- `dynamic` on a `list` (ADR 0009) accepted; on an `object`, `map` or
  `json` refused.
- No `number` kind (ADR 0009).

### HCL goldens before the provider release

`packages/hcl/src/validate.test.ts` learns `"validate": "awaits-provider"`:
`tofu validate` runs over validated cases only, the pin count runs over
cases with a `validate/` directory, a `pass` case must have one and an
`awaits-provider` case must not, and one assertion holds that at least one
such case exists until D10 removes it. `conformance/hcl/README.md`
describes both values. `conformance/hcl/roundtrip/casefield-key/` is the
first: every 0.3 reference type as the generic blocks that hold them, a
`casefield` token as a map key and as a list item, each bound in `refs`
(awscc resources for the four without a hashicorp/aws one). The provider's
conformance runner plans every round-trip golden, so this case fails that
runner until the provider's main reads 0.3 (below).

### Evidence

No live listing was run: the resources the listings need (a task template,
a Cases domain with a template and a field, an assistant, a claimed number)
are owner actions under "Sandbox prerequisites" and were not provisioned,
and this session made no AWS calls. The address forms are taken from the
service reference's ARN formats and the API reference pages, both read on
2026-10-05 and cited in `export.ts`; the recorded fixture shapes follow the
pages' response syntax. One live listing per API, its output kept with ids
replaced, is pending on the owner's resources and is recorded here when it
runs; D05 and D06 settle whether `TaskTemplateId`, `CaseTemplateId` and the
`CaseRequestFields` keys hold an ARN or a bare id on the wire.

### Release hygiene

Two changesets: `flowdoc-0-3.md` (every package, minor; says older tools
refuse a 0.3 document and that the provider that reads 0.3 is upgraded
first) and `catalog-vocabulary-phase-d.md` (core, minor). Nothing is
released here; D10 consumes them with Phase C's.

### The next provider batch

Lands on the provider's main on top of `feat/revendor-phase-c` (`34dda2f`)
merged unreleased, then re-vendors this PR's merge commit with
`scripts/sync-conformance.sh <sha>`. The lead opens that PR; its commits are
recorded here when they exist.

- `internal/flowdoc/refs.go` `TokenPattern`: the thirteen types, as
  `TOKEN_PATTERN` spells them.
- `internal/schema/schema.go` `Versions`: `{"0.1", "0.2", "0.3"}`;
  `regexp.go` and `serialize.go` wherever they name `0.2`; the embedded
  schema set gains `flowdoc-0.3.schema.json`; migration returns 0.3 for 0.1
  and 0.2 (`TestOracleMigrateFlowDoc` re-recorded).
- `internal/export/arn.go`: the `phone-number/<id>` form, `task-template` in
  the keyword tables, and `parseCasesArn` and `parseAssistantArn`;
  `reversemap.go`: the four lists, a phone number named by description or
  digits; `connectapi/inventory.go` and the fake: `ListTaskTemplates`,
  `ListPhoneNumbersV2`, `ListIntegrationAssociations(CASES_DOMAIN)` with the
  Cases `ListTemplates` and `ListFields`, `ListAssistants`, each optional in
  the sense export.ts gives them; `export-oracle.mjs` re-recorded over
  `conformance/export/phase-d-refs`.
- The documented IAM policy gains `connect:ListTaskTemplates`,
  `connect:ListPhoneNumbersV2`, `connect:ListIntegrationAssociations`,
  `cases:ListTemplates`, `cases:ListFields` and `wisdom:ListAssistants`.
- `internal/flowdoc/catalog.go`'s strict parser: the unmodeled struct gains
  `Channels []string \`json:"channels,omitempty"\``beside`Source`;
`CatalogError`gains`RequiredWhenValue *struct{ Key, Equals string }
  \`json:"requiredWhenValue,omitempty"\``; `CatalogElement`gains`KeyPatterns []string \`json:"keyPatterns,omitempty"\``;
`CatalogConstraint.Keys`becomes`omitempty`and the struct gains`Groups
  [][]string \`json:"groups,omitempty"\``; a test loads a catalog carrying
  each and one carrying an unknown field (refused, as now).
- `flowmodel.attribute()`: `dynamic` on a `list` (the attribute stays a
  list; a JSONPath in that position makes the action generic, rule 11);
  `keyPatterns` and `groups` change no attribute.
- `RequiredErrorsFor` reads `requiredWhenValue` as `requiredErrorsOf` does
  (`parameters[key] == equals`, a string compare, so a JSONPath requires
  nothing); `internal/lint`'s error-branches port follows. A
  `ConstraintViolations` port of `constraintViolations` lands when D03's
  lint or schema work first calls it.
- `ReadPath`: the `*~` segment, a hit per key at `A.<key>~` whose value is
  the key string; `TestOracleReadPath` re-recorded over a map.
- `conformance_test.go`'s `len(ModeledTypes()) != 35` derives its count from
  the vendored catalog.
- `REF_SUGAR_UNSUPPORTED_TYPE` versus `REF_EXPRESSION_REFUSED`: the provider
  refuses every address, so nothing changes for it unless it reads
  `address-sugar.json` to pick the code; if it does, `aws_connect_phone_number`
  is now listed.
- `internal/flowdoc/testdata/catalog-oracle.mjs` is replaced by the recorder
  below, which records every per-type field `oracle_test.go` checks and
  the value-dependent form per parameter value the catalog names, so a new
  type is re-recorded and never hand-edited; `oracle_test.go` reads
  `requiredErrorsByParameters` in place of `requiredErrorsForChat`.
- The vendored `conformance/hcl/roundtrip/casefield-key` case fails the
  provider's conformance runner until `TokenPattern` and the `refs` key
  pattern know the five types, which the first item does; it stays
  `awaits-provider` here until D10 pins the release.

The recorder, in full (the provider's
`internal/flowdoc/testdata/catalog-oracle.mjs`; `node catalog-oracle.mjs
<flow-as-code checkout> ts-oracle.json [--write]` after `npm run build`
there):

```js
// Copyright 2026 The flow-as-code Authors
// SPDX-License-Identifier: Apache-2.0
// Re-records every per-type catalog fact oracle_test.go checks in
// ts-oracle.json from @flow-as-code/core's own catalog functions, plus
// catalogOrder, keeping every other recorded value, and prints which types
// changed so the diff can be read before it is committed. A new type is
// re-recorded here, never hand-edited. Build flow-as-code first (npm run
// build), then:
//
//   node catalog-oracle.mjs <flow-as-code checkout> ts-oracle.json [--write]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repo = resolve(process.argv[2]);
const path = process.argv[3];
const write = process.argv.includes("--write");
const core = await import(pathToFileURL(repo + "/packages/core/dist/index.js").href);
const o = JSON.parse(readFileSync(path, "utf8"));
const changed = [];

/**
 * The parameter objects requiredErrorsFor is recorded over for a type: the
 * empty object, then one per conditional error the catalog names. A
 * requiredWhenKey error is recorded with its key present (null, as the
 * chat form was); a requiredWhenValue error with its key at the value and
 * at a value that is not it, so both readings are oracled. Sorted by the
 * JSON of the parameters, so the recording is stable.
 */
function parameterCases(type) {
  const entry = core.modeledEntry(type);
  const cases = new Map([["{}", {}]]);
  for (const e of entry?.transitions.errors ?? []) {
    if (e.requiredWhenKey !== undefined) {
      cases.set(JSON.stringify({ [e.requiredWhenKey]: null }), { [e.requiredWhenKey]: null });
    }
    if (e.requiredWhenValue !== undefined) {
      const { key, equals } = e.requiredWhenValue;
      cases.set(JSON.stringify({ [key]: equals }), { [key]: equals });
      cases.set(JSON.stringify({ [key]: `not-${equals}` }), { [key]: `not-${equals}` });
    }
  }
  return [...cases.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

// Own keys only: the oracle deliberately records `constructor`, a type no
// catalog holds, to show every reader uses Object.hasOwn as catalogEntry does.
const own = (table, key) => (Object.hasOwn(table, key) ? table[key] : undefined);
const types = new Set([...Object.keys(o.perType), ...Object.keys(core.actionCatalog.actions)]);
for (const type of [...types].sort()) {
  const entry = own(o.perType, type) ?? {};
  const restrictions = own(core.FLOW_TYPE_RESTRICTIONS, type);
  const next = {
    ...entry,
    modeled: core.modeledEntry(type) !== undefined,
    requiredErrors: core.requiredErrors(type),
    requiredErrorsByParameters: parameterCases(type).map(([, parameters]) => ({
      parameters,
      errors: core.requiredErrorsFor(type, parameters),
    })),
    builderErrors: core.builderErrors(type),
    minConditions: core.minConditionsFor(type),
    conditionsKind: core.conditionsKind(type) ?? null,
    nextRule: core.nextRule(type) ?? null,
    holdsParticipant: core.holdsParticipant(type),
    textBodyPaths: [...core.textBodyPaths(type)],
    announcePaths: [...core.announcePaths(type)],
    recordingEnablerPath: core.recordingEnablerPath(type) ?? null,
    refPaths: core.refPathsOf(type),
    restrictions: restrictions === undefined ? null : [...restrictions],
    unrestricted: core.FLOW_TYPE_UNRESTRICTED.includes(type),
    terminal: core.TERMINAL_ACTIONS.includes(type),
    actionType: Object.values(core.ActionType).includes(type),
    channels:
      core.channelRestriction(type) === undefined ? null : [...core.channelRestriction(type)],
  };
  delete next.requiredErrorsForChat;
  if (JSON.stringify(next) !== JSON.stringify(entry)) changed.push(type);
  o.perType[type] = next;
}
const order = core.modeledTypes();
if (JSON.stringify(order) !== JSON.stringify(o.catalogOrder)) changed.push("catalogOrder");
o.catalogOrder = order;
const head = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
o.generatedFrom = `flow-as-code ${head}, packages/core/dist`;
console.log(JSON.stringify(changed));
if (write) writeFileSync(path, JSON.stringify(o, null, 2) + "\n");
```

`oracle_test.go`'s `perType` loop then checks `requiredErrorsByParameters`
(each case's `errors` against `RequiredErrorsFor(typ, parameters)`) and
`channels` (against the port of `channelRestriction`, null when absent), and
`TestOraclePerTypeTables`' `len(perType) != len(Catalog().Actions)+2`
becomes a count over the catalog's types alone once the two synthetic
entries the `+2` stands for are recorded under their own key, or stays as
is if they remain in `perType`.

### Not done here

- The live listings (above) and the probe runner's first live run (the
  next sweep).
- The CLI's `export` wiring of the Cases and Q in Connect clients (D05,
  D06).
- `materialize`, `walkStrings` and the HCL rule for a reference in a map
  key (D06, per ADR 0008).
- The tasks/README.md order table and CLAUDE.md, which #43 amends; this
  record names the gate as #43 leaves it.
