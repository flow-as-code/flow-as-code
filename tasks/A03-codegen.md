# A03 Codegen (FlowDoc -> TypeScript)

Deliverables: idiomatic, byte-stable TS emission per SPEC (stable naming, @keep comments, GenericBlock passthrough); normalization pass; roundtrip conformance fixtures.
Acceptance: CI roundtrip job green: synth(codegen(doc)) deep-equals doc for every fixture; codegen twice is byte-identical; generated code passes repo ESLint untouched.

## Notes (2026-08-31, implementation)

- Landed as `packages/core/src/codegen.ts` with the roundtrip suite in `roundtrip.test.ts` and unit coverage in `codegen.test.ts`. Fixtures: `conformance/roundtrip/{appointment-line,unknown-actions,after-call-survey,compare-only,edge-cases}`.
- Output style matches `src/__fixtures__/appointment-line.ts`: one factory, inline block constructions in doc order. Because synth emits declaration order (ADR-0003), no separate normalization pass exists; codegen(synth(code)) is byte-stable in one cycle.
- Every modeled inversion is verified by re-synthesizing the constructed block and comparing against the source Action; any mismatch falls back to GenericBlock, which keeps the round-trip lossless even for malformed modeled shapes. Fixture docs are kept in synth normal form (see conformance/README.md); a doc outside normal form (for example a missing empty `Errors` array) still generates but re-synthesizes to the normal form.
- `roundtrip.test.ts` imports and executes the generated sources through Vitest's transform (moduleSpecifier `../index.js`), so the roundtrip runs without a prior build. ESLint and Prettier conformance are asserted programmatically against the repo configs.
- CI covers the roundtrip through the full `npm test`; `npm run test:roundtrip` runs just this suite.
- @keep supports line comments (`// ... @keep`) attached to a block construction by id or to the export function. Block comments and comments whose block id disappears are dropped by design.
