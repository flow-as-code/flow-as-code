# A00b Flow language reference, FlowDoc schema, demo flow

Deliverables: conformance/flow-language/actions.md recording, per Action type in the A01 block set, the exact `Type` string, `Parameters` shape, and `Transitions` shape, each with an AWS documentation URL; conformance/schema/flowdoc-0.1.schema.json; conformance/demo/appointment-line.flowdoc.json (neutral appointment line, no vertical branding) as the canonical fixture for A01 synth, A03 round-trip, A09 goldens, the studio, and the hosted demo.
Acceptance: the demo FlowDoc validates against the schema in CI; every action entry cites a live AWS doc URL; no `arn:aws:` appears anywhere in the fixture.

## Status (2026-09-01)

Landed. `packages/core/src/conformance.test.ts` validates the demo FlowDoc against the schema, asserts the schema rejects the shapes actions.md forbids, and validates every FlowDoc fixture under conformance/. The demo carries one unmodeled action so GenericBlock passthrough is exercised by the canonical fixture.
