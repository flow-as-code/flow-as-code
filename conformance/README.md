# Conformance suite

Cross-language and cross-tool contract. The future Go provider vendors this
directory and must pass identically.

```
schema/flowdoc-0.2.schema.json    machine-readable FlowDoc definition (current version)
schema/flowdoc-0.1.schema.json    the previous version, frozen; migrate inputs validate against it
migrate/<case>/input.flowdoc.json a document at an older version
migrate/<case>/expected.flowdoc.json the exact bytes migrateFlowDoc turns it into
migrate/invalid.json              versions no build reads, which must be refused
layout/README.md                  the auto-layout algorithm every implementation assigns to unplaced actions
layout/<case>/doc.flowdoc.json    a document whose actions the algorithm lays out
layout/<case>/expected.layout.json the positions it must produce, byte-exact
flow-language/actions.md          Connect action types, shapes, and cited doc URLs
flow-language/catalog.json        the same facts as data; a second implementation generates its schema from it
flow-language/probes/<rule>/<name>.json  a create probe behind a numbered rule, every id a placeholder (probes/README.md)
flow-language/probes/<rule>/results.json what the service said to each probe, with the UTC time and Region
demo/appointment-line.flowdoc.json  the canonical demo flow
lint/README.md                    fixture format and the rule for adding one
lint/<rule-id>/pass-*.json        FlowDoc producing no finding for the rule
lint/<rule-id>/fail-*.json        FlowDoc plus expected findings [{rule, blockId, messageIncludes}]
roundtrip/<case>/doc.flowdoc.json codegen->synth must reproduce the doc (modulo meta)
emit-tf/<case>/case.json          emitter case description, inputs, and validate expectation
emit-tf/<case>/<name>.flowdoc.json  optional; input documents a case does not borrow from demo/ or roundtrip/
emit-tf/<case>/address-map.json   optional; reference key -> terraform address expression
emit-tf/<case>/expected/          golden .tf and .tftpl output tree, byte-compared
emit-tf/<case>/validate/          optional test-only providers and stub resources
materialize/<case>/doc.flowdoc.json      input FlowDoc for a materialization case
materialize/<case>/map.json              token -> resolved value (map backend cases)
materialize/<case>/binder.json           token -> opaque binder output (binder backend cases)
materialize/<case>/expected.content.json deployable content golden, byte-compared
export/<case>/inventory.json             recorded instance inventory (the List* responses)
export/<case>/flows/<id>.json            DescribeContactFlow Content, verbatim live Flow language
export/<case>/flows/<id>.saved.json      content of a flow that has never been published
export/<case>/expected/<name>.flowdoc.json  exported FlowDoc golden
export/<case>/expected/<name>.flow.ts    codegen golden for that FlowDoc
export/<case>/expected-error.json        {unknownArns, interpolatedArns} for a case that must fail
hcl/README.md                            the HCL contract: a FlowDoc as a flowascode resource and back
hcl/address-sugar.json                   resource addresses the TypeScript parser rewrites to a reference key
hcl/roundtrip/<case>/case.json           description, the document (relative path), options, validate expectation
hcl/roundtrip/<case>/bindings.json       reference key -> terraform address; a key absent here is unbound
hcl/roundtrip/<case>/expected.flow.tf    the resource, byte-exact, a `tofu fmt` fixed point
hcl/regenerate/<case>/doc.flowdoc.json   a document whose companion is rewritten (TypeScript only)
hcl/regenerate/<case>/previous.flow.tf   the companion before the rewrite
hcl/regenerate/<case>/expected.flow.tf   the companion after: carried values, kept comments, normalized sugar
hcl/parse/<case>/input.flow.tf           a hand-written resource, fmt or not
hcl/parse/<case>/expected.flowdoc.json   the document it reads to
hcl/parse/<case>/expected.sidecar.json   what the file carried beside the document: refs, lint, tags, instance id, normalizations
hcl/refuse/<case>/input.flow.tf          a resource both implementations refuse
hcl/refuse/<case>/expected-error.json    {code, path?, messageIncludes?}; the code is the cross-language field
schema/scenario-0.1.schema.json          machine-readable simulate scenario definition
simulate/<case>/scenario.json            authored simulate scenario
simulate/<case>/expected.testcase.json   compiled CreateTestCase input, tokens still in place
simulate/invalid/scenarios.json          scenarios that must be rejected, with finding paths
simulate/dry-run/flows/*.flowdoc.json    the flow set the offline dry run checks scenarios against
simulate/dry-run/resource-map.json       the map it resolves tokens the set lacks through (keys only)
simulate/dry-run/cases/<case>/scenario.json  a valid scenario held against that set
simulate/dry-run/cases/<case>/expected.problems.json  the [{path, message}] dryRunScenario must report, [] for a clean case
simulate/report/run.json                 a simulation run
simulate/report/expected.junit.xml       JUnit reporter golden, byte-compared
simulate/report/expected.report.json     JSON reporter golden, byte-compared
```

An export case's `flows/<id>.json` is what `DescribeContactFlow` returned, so a
literal ARN there is the point: it is the input side of export. Only the
`expected/*.flowdoc.json` goldens are authored FlowDocs, and those stay
ARN-free. `flows/<id>.saved.json` stands in for a flow that has never been
published: describing it without the `$SAVED` alias throws
ContactFlowNotPublishedException, as the API does.

A simulate `expected.testcase.json` keeps `${cdref:...}` tokens: compilation and
token resolution are separate steps, so the golden never carries an ARN. The
compiled `Content` shape is the one artifact here that no offline test can
confirm, because CreateTestCase validates it server-side.

The canonical simulate cases target `demo/appointment-line.flowdoc.json`,
except `keypad-press`, written for `simulate/dry-run/flows/` (the one flow
set here with a keypad block), which is the golden for a compiled DtmfInput
SendInstruction; every canonical case dry-runs clean against the set it is
written for. A simulate dry-run case is a scenario the schema and
`validateScenario` both accept, held against `dry-run/flows/` with `dry-run/resource-map.json`: the
findings must equal `expected.problems.json` exactly, path and message. The
map's values are never read, only its keys, which is why the fixture shows
each of the three key forms once.

An emit-tf case is a whole emitter run. `case.json` carries a `description`, a
`docs` array of FlowDoc paths relative to the case directory (a case may point
at `../../demo/` or `../../roundtrip/` rather than copy a document), optional
`options` passed to the emitter, and `validate`, which is `pass`, `fail`, or
`skip`. `address-map.json`, when present, becomes `options.addressMap`. The
emitted files must equal `expected/` byte for byte, so the tree also pins the
file set: an added or dropped output file fails the case. `unbound` and
`unusedMapKeys` say what the run reports beside its files: the reference keys
the set resolves nowhere (placeholders here, `null` bindings in the hcl emit
cases) and the address map keys no reference in the set uses; the TypeScript
tests hold both, and a provider that emits may too.

`validate/` is not emitter output. It holds the minimum provider configuration
and stub resources a `terraform validate` or `tofu validate` run needs for the
emitted addresses to resolve, and every file in it says so at the top. A case
marked `pass` must validate clean with those files present; a case marked `fail`
must fail, which is how the TODO placeholders for unmapped references are proved
to be loud rather than silently deployable. Those runs need a real binary and a
provider download, so they are gated behind `RUN_TOFU_VALIDATE=1` and run in
CI's emit-tf job. The goldens themselves are compared on every run.

A materialize case carries `map.json` or `binder.json`, never both. Binder
cases apply the file as a token -> output lookup so the opaque values are
recorded in the fixture. Literal ARNs are legal in `map.json` and in
`expected.content.json`: producing them is the point of materialization. They
remain forbidden in every authored FlowDoc, `doc.flowdoc.json` included.

Every rule, builder feature, codegen case, and emitter case lands with fixtures
in the same commit.

Roundtrip fixtures are FlowDocs in synth normal form: declaration-ordered
Actions, `Errors` and `Conditions` arrays present (possibly empty) on every
non-terminal action, `{}` transitions on terminal actions, sorted keys, and a
`layout` covering every action. A provider generates code from `doc.flowdoc.json`,
executes it, synthesizes the result, and must get the same document back
(ignoring `meta`). The cases cover the demo flow (`appointment-line`), a
flow of entirely unmodeled action types with tokens inside parameters
(`unknown-actions`), a module invoking another module by alias
(`after-call-survey`), a flow where Compare is the only
user of `jsonPath` (`compare-only`, so the import is emitted for it), the
same Compare with a `NextAction` that is a condition's target rather than
the `NoMatchingCondition` copy the class writes, which the service accepts
and which must stay GenericBlock (`compare-unmirrored-next`), a flow
of `GetParticipantInput` menus with Text, SSML and PromptId bodies
(`dtmf-menu`), a `GetParticipantInput` whose key branches twice, which the
builder refuses and so must stay GenericBlock (`repeated-key`), edge cases
(SSML, PromptId refs, Compare branches, JSONPath refs, hand-placed
layout, an explicit start, and a modeled Type that must fall back to
GenericBlock), a module of the contact-routing actions
(`contact-routing`: queue-to-queue transfer to a queue token, to an agent
queue by JSONPath, and with no parameter, a shape the page allows without
saying where the contact goes, a terminal transfer to an agent, a routing
priority and a queue time adjustment, a non-terminal action with no error
branch, a callback number
set from a JSONPath with its two named errors and no catch-all, and a
callback contact in its full form, with a queue, a creation flow and a caller
ID, and in its minimal one), a flow of the flow-control actions
(`flow-control`: a Loop whose continue path is a back edge, a Wait with both
events and its conditional ParticipantNotFound branch, a percentage split in
the console's threshold form, a flow attribute set in the console's `{ Value }`
form with its catch-all, a
staffing check and a queue-depth check in the order of the console's default
queue transfer export, and a
queue metric load with a static channel and one with a dynamic channel); a
flow of the contact-data actions (`contact-data`: a tag set with a dynamic
value, a tag removal, a voice change with a static and a dynamic engine, a
contact data update with every Voice ID field and a minimal one, and an event
hook set to a flow token and one set by JSONPath); a customer queue flow of
the participant actions (`participant`: a loop of prompts in every message
kind with an interrupt, one that holds the contact with nothing wired, and a
Lex V2 bot with intents, session attributes and a timeout, plus a bare one,
and a view shown with data, a hidden transcript and a time limit, plus a bare
one); and a flow of the recording block (`recording-analytics`: voice
recording of both participants with IVR recording, a voice-only form, a
screen-only form (the service takes one form per block), and the chat
analytics form the builder leaves generic, with its third error); and a flow
of the stored-input form of `GetParticipantInput` (`stored-input`: digits
kept by length, a local phone number with its country code and its
`InvalidPhoneNumber` branch, and an E.164 number, with Text, PromptId and
SSML bodies; the menu form stays in `dtmf-menu`).

An HCL case is a companion file and the document it stands for.
`conformance/hcl/README.md` is the contract both the TypeScript writer and
the Go provider implement; every `roundtrip` golden is a `tofu fmt` fixed
point, checked by a gated test, and an ungated test holds each case's
document, bindings and block names to the rest of `conformance/`.

The demo flow itself is the synth fixture: `packages/core/src/synth.test.ts`
builds it with the typed builder and compares the result against
`demo/appointment-line.flowdoc.json`.

## What a second implementation must pass

The Go provider vendors this directory at a pinned commit. Each family below
is one of two kinds, and `tests/conformanceIndex.test.ts` holds this list to
the directories that exist, so a new family cannot land without being
classified here.

Both implementations:

- `schema`: the FlowDoc schemas; the mutation cases in
  `packages/core/src/conformance.test.ts` are the rejections to reproduce.
- `flow-language`: `catalog.json` is the source a second implementation
  generates its schema and lint tables from; `actions.md` is its prose, and
  `probes/` holds the inputs behind its numbered rules, which the provider
  embeds and does not read.
- `lint`: every rule's pass and fail fixtures, findings matched by rule,
  block and message fragment.
- `materialize`: deployable content from a document and a reference map.
- `layout`: the auto-layout positions, byte-exact.
- `export`: the `expected/*.flowdoc.json` half (the `.flow.ts` goldens are
  TypeScript only).
- `roundtrip`: at the FlowDoc level, every document in synth normal form.
- `hcl`: `roundtrip`, `parse` and `refuse` (its `regenerate` cases and
  `address-sugar.json` are TypeScript only).
- `demo`: the canonical document, which the other families borrow.

TypeScript only:

- `emit-tf`: the `@flow-as-code/tf` emitter's goldens.
- `simulate`: scenario compilation and reporting.
- `migrate`: 0.1 documents and the bytes `migrateFlowDoc` turns them into.

The round-trip rule for HCL, stated in full in `hcl/README.md` rule 26: for
every `hcl/roundtrip` case, reading the golden produces the case's document
(modulo `meta`) and its bindings, writing the document with those bindings
produces the golden byte for byte, and the golden is a `terraform fmt` fixed
point. Whether an action was written as a typed sub-block or as `generic` is
not part of the invariant.

Fixtures are data, not source: they are excluded from ESLint and Prettier so
that goldens stay byte-stable. The assertions that guard this directory live in
`packages/core/src/conformance.test.ts`.
