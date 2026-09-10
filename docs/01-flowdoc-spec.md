# FlowDoc: the interchange format

A FlowDoc is one JSON file per flow or module. It is Amazon Connect Flow language, extended with tokens and tool metadata that Connect ignores-by-removal at materialization time.

## Structure

```json
{
  "flowdoc": "0.1",
  "kind": "flow | module",
  "name": "inbound-main",
  "connectType": "CONTACT_FLOW | CUSTOMER_QUEUE | ... | MODULE",
  "content": { "Version": "2019-10-30", "StartAction": "...", "Actions": [ ... ] },
  "layout": { "<actionId>": { "x": 0, "y": 0 } },
  "refs": [ { "token": "${cdref:queue:front-desk}", "type": "queue", "name": "front-desk" } ],
  "meta": { "generator": "core@0.1", "sourceHash": "sha256:..." }
}
```

- `content` is verbatim Flow language except that every ARN position holds a `${cdref:type:name}` token. Ref types: queue, hours, lambda, lex, prompt, flow, module. The token grammar (`TOKEN_PATTERN` in `packages/core/src/refs.ts`) is `${cdref:<type>:<slug>}` with an optional `@<slug>` alias suffix on any type; the builder's `Refs.module(name, alias)` always emits one (`${cdref:module:recording-consent@prod}`), and `@flow-as-code/cdk` and `@flow-as-code/tf` read it as the module alias to publish and point at. A module ref without an alias is bound by `@flow-as-code/cdk` to its default alias `live` and by `@flow-as-code/tf` to an address you supply, like any other external reference.
- A module's `content` also carries a top-level `Settings` object; a flow's does not. Connect requires it and rejects `CreateContactFlowModule` without one (see the `Settings` comment in `packages/core/src/flowdoc.ts`); it may be empty, and `synth()` emits `{}` by default. The schema documents the property but does not yet enforce its presence on a module.
- `layout` holds canvas positions keyed by action id. Synth assigns deterministic auto-layout (dagre) when absent; the studio persists user positions. Layout differences never affect flow behavior.
- `layout` is the single source of truth for position. Flow language carries positions of its own in `content.Metadata.ActionMetadata.<id>.Position`, so FlowDoc deliberately does **not** author `content.Metadata`; materialization projects `layout` into it. Two stores of the same fact would drift. Recorded 2026-08-31 from the Flow language example, https://docs.aws.amazon.com/connect/latest/devguide/flow-language-example.html
- `refs` is a derived index of every token in `content`; regenerated on save. The studio's ref pickers, the `@flow-as-code/cdk` scaffold, and the `no-unresolved-token` lint rule read it; materialization and the emitters walk `content` directly.
- `meta.generator` names the tool that wrote the file (`core@0.1` from `synth()`, `cli@<version>` from `flow-cli synth` and the studio bridge). `meta.sourceHash` is `sha256:<hex>` of the paired `<name>.flow.ts` bytes.
- The two stamps deliberately count different things and neither is written by hand. `core@0.1` is the FlowDoc **format** version: `synth()` and `export()` are pure functions of the format, their output is byte-identical across `@flow-as-code/core` releases, and the conformance goldens under `conformance/export/` hold those bytes, so a package version there would churn every golden at every release for no provenance gained. `cli@<version>` is the **package** version of `@flow-as-code/cli`, read from its manifest at runtime (`packages/cli/src/version.ts`), because flow-cli is the distributed tool and the question a committed document has to answer is which build wrote it. Do not read a package version out of `core@0.1`, and do not read a format version out of `cli@<version>`; the format version is the top-level `flowdoc` key in every case.
- Materialization (map or binder) replaces tokens, projects `layout` into `content.Metadata` so the flow lays out correctly in the Connect console, and drops the `layout`, `refs`, and `meta` keys themselves from deployable content.

## Invariants

1. Deterministic: same inputs, byte-identical FlowDoc (stable key order, stable action ordering).
2. Lossless for unknown blocks: any Action not modeled by the builder is preserved verbatim (GenericBlock) through studio edits and codegen.
3. `sourceHash` ties the FlowDoc to the builder file it was generated from, for the watch-mode dirty guard and the studio's conflict check.
4. A reference token occupies an entire field value and is never interpolated into a longer string. Connect requires the fields that hold references to be "either fully static or a single valid JSONPath identifier", so a partially substituted value is invalid. See conformance/flow-language/actions.md.
5. No more than 250 Actions per flow, and Identifiers are unique, at most 50 characters, and exclude the characters Connect reserves. Enforced by conformance/schema/flowdoc-0.1.schema.json.

## Versioning

`flowdoc: "0.1"` until the builder API stabilizes. There is no migration code yet; every version bump ships a migration in `@flow-as-code/core` plus fixtures.

## Contract artifacts

- `conformance/schema/flowdoc-0.1.schema.json` is the machine-readable form of this document. The future Go provider validates against it.
- `conformance/flow-language/actions.md` records the Connect action types, parameter shapes, and reference-bearing fields this format wraps, with a doc URL per entry.
- `conformance/demo/appointment-line.flowdoc.json` is the canonical demo used by synth, round-trip, emitter goldens, the studio, and the hosted demo.
