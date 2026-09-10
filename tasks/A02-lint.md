# A02 Lint engine and rules

Deliverables: rule engine with stable ids; the rules from flow-core SPEC (nine when this task was written on 2026-08-31; eleven as of 2026-09-01); conformance/lint fixtures for each; JSON and human reporters; browser-safe build (the studio runs it in a worker).
Acceptance: all fixtures green; engine runs in Node and in a Vitest browser-like environment with no fs imports.

## Status (2026-09-01)

Landed in `packages/core/src/lint/`: engine, `toText` and `toJson` reporters, and eleven rules (see packages/core/SPEC.md for the list), each with pass and fail fixtures under `conformance/lint/<rule-id>/`. The browser-safe build is the `@criticaldynamics/flow-core/lint` entry point; `lint-browser-safe.test.ts` walks its import graph and fails on any Node builtin or third-party import. `flow-cli lint --format text|json` exposes the reporters and exits 1 on an error-severity finding.
