# A08 CLI assembly

Deliverables: lint, render, codegen, synth, export, simulate, diff commands wired; `emit --target cdk` writing a FlowSet scaffold.
Acceptance: every README command exits 0 on the demo and non-zero with actionable messages on broken input; --help text complete.

## Status

Landed: `lint`, `codegen`, `synth` (A04), `render`, and `emit` for both targets,
one module per command under `packages/cli/src`, with `src/cli.test.ts`
spawning the built CLI so exit codes and stderr are asserted as shipped.

`export`, `simulate`, and `diff` were first registered as stubs that exit 64
(A06), as was `studio` (A11). `studio` landed with A11 on 2026-08-31
(tasks/A11-studio-roundtrip.md), and the three A06 commands are now wired
(`src/export.ts`, `src/simulate.ts`, `src/diff.ts`, with `src/aws.ts` as the
seam to the SDK). The exit-64 mechanism and `src/deferred.ts` are gone: nothing
is deferred any more.

## How export, simulate, and diff are tested without an instance

Every one of the three needs a live Amazon Connect instance to do anything
at all. The CLI commands themselves have not run against an account. The
flow-core functions they call (`exportInstance`, `runScenarios`) have:
`packages/core/src/integration.test.ts` ran against the sandbox instance
on 2026-09-01, and "Run" and "What it showed" in
`tasks/A06-export-and-simulate.md` record that run. What made the commands
wireable is a seam: each command takes its clients from a `LiveClients`
object that defaults to flow-core's SDK adapters over a real `ConnectClient`,
and the tests pass fixture-backed ones that replay `conformance/export/` and
`conformance/simulate/`. That runs every line of the commands offline, exit
codes included, and a loader hook in the subprocess tests stands in for an
uninstalled `@aws-sdk/client-connect`. The commands' own behaviour is
asserted; what the API did is recorded in A06's "What it showed", and what it
has not yet shown is A06's single "Open live item".

## Acceptance, as met

The acceptance line above is read as applying to the implemented set. Precisely:

- `lint`, `render`, `codegen`, and `emit` (both targets) exit 0 against a copy of
  `conformance/demo/appointment-line.flowdoc.json`.
- `export`, `simulate`, and `diff` exit 0 against the recorded fixtures and 1
  (2 for a `diff` that could not compare) on every failure path, asserted in
  `src/export.test.ts`, `src/simulate.test.ts`, and `src/diff.test.ts`.
- `studio` serves rather than exits: `src/studio.test.ts` asserts it binds
  127.0.0.1 on a free port, serves the built studio page, and rejects a bad
  `--port` or a missing directory before starting anything.
- `--help` is complete for the program and for every command, including each
  command's flags.
- Broken input exits non-zero with the offending path or token named: a path
  that does not exist, truncated JSON, a schema-invalid document, a resource map
  missing keys, an unknown `--target`, and an unknown `--format`.
- `emit --target tf` writes bytes identical to calling the flow-tf emitter
  directly, asserted against `conformance/emit-tf/demo-complete-map`.
- `emit --target cdk` writes a scaffold that passes `tsc --noEmit` with the
  workspace packages resolved the way a user's project resolves them.
- `flow-cli codegen` followed by `flow-cli synth` reproduces the demo document
  modulo `meta`.

## Notes

Documents are validated against the FlowDoc schema before any command reads
them. `conformance/` is not published, so `packages/cli/schema/` holds a
byte copy and `src/schema.test.ts` fails if the two drift; the copy has to be
refreshed in the same commit as any schema change.
