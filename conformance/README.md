# Conformance suite

Cross-language and cross-tool contract. The future Go provider vendors this
directory and must pass identically.

```
schema/flowdoc-0.1.schema.json    machine-readable FlowDoc definition
flow-language/actions.md          Connect action types, shapes, and cited doc URLs
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
schema/scenario-0.1.schema.json          machine-readable simulate scenario definition
simulate/<case>/scenario.json            authored simulate scenario
simulate/<case>/expected.testcase.json   compiled CreateTestCase input, tokens still in place
simulate/invalid/scenarios.json          scenarios that must be rejected, with finding paths
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

An emit-tf case is a whole emitter run. `case.json` carries a `description`, a
`docs` array of FlowDoc paths relative to the case directory (a case may point
at `../../demo/` or `../../roundtrip/` rather than copy a document), optional
`options` passed to the emitter, and `validate`, which is `pass`, `fail`, or
`skip`. `address-map.json`, when present, becomes `options.addressMap`. The
emitted files must equal `expected/` byte for byte, so the tree also pins the
file set: an added or dropped output file fails the case.

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
(ignoring `meta`). The seven cases cover the demo flow (`appointment-line`), a
flow of entirely unmodeled action types with tokens inside parameters
(`unknown-actions`), a module invoking another module by alias
(`after-call-survey`), a flow where Compare is the only
user of `jsonPath` (`compare-only`, so the import is emitted for it), a flow
of `GetParticipantInput` menus with Text, SSML and PromptId bodies
(`dtmf-menu`), a `GetParticipantInput` whose key branches twice, which the
builder refuses and so must stay GenericBlock (`repeated-key`), and edge cases
(SSML, PromptId refs, Compare branches, JSONPath refs, hand-placed
layout, an explicit start, and a modeled Type that must fall back to
GenericBlock).

The demo flow itself is the synth fixture: `packages/core/src/synth.test.ts`
builds it with the typed builder and compares the result against
`demo/appointment-line.flowdoc.json`.

Fixtures are data, not source: they are excluded from ESLint and Prettier so
that goldens stay byte-stable. The assertions that guard this directory live in
`packages/core/src/conformance.test.ts`.
