# A05 Materialization backends

Deliverables: materializeWithMap (strict, all missing keys at once) and materializeWithBinder (opaque strings pass through untouched); layout/refs/meta stripped from deployable output.
Acceptance: binder path preserves a CloudFormation-style token string exactly; map path leaves no `${cdref:`; fixtures added.

## Status (2026-09-01)

Landed in `packages/core/src/materialize.ts` with `serializeContent` for the deployable bytes. Fixtures: `conformance/materialize/{demo-with-map,binder-passthrough}`, byte-compared in `materialize.test.ts`, which also covers the all-missing-keys-at-once error, the untouched binder passthrough, and the layout projection into `content.Metadata`.
