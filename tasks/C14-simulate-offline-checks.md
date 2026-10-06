# C14 Simulate: a library entry point and an offline dry run

Phase C, simulate. The showcase checks its scenarios offline in its own tests,
and had to reach into the CLI's build output to do it:
`node_modules/@flow-as-code/cli/dist/simulate.js` for `scenarioProblems`,
which the package does not export. There is no command that validates a
scenario against a flow set without an instance, and a scenario cannot name
the queue it expects a transfer to by token.

## Acceptance criteria

- `scenarioProblems` (and whatever else a consumer needs to validate a
  scenario) is exported from a documented entry point, `@flow-as-code/core`
  or the CLI package's `exports`, and the CLI uses that export itself.
- `flow-cli simulate --dry-run <scenario> <flows dir>` validates the scenario
  (schema and cross-field rules), resolves every token against the set and a
  resource map or address map, and checks each `expect-prompt` and
  `send-dtmf` against the flows' prompts and keypad conditions, with no AWS
  call and no credentials. It exits non-zero on any problem and prints each.
- `expect-transfer` (and any step that names a queue) accepts a
  `${cdref:queue:...}` token, resolved like the rest.
- The scenario schema under `conformance/` changes only by a versioned
  addition; the provider re-vendors if it moved.
- `docs/` describes the dry run beside the live run, including that it does
  not execute Lambdas or evaluate conditions on attribute values.
- A changeset for each package whose surface moved.

## Record (2026-10-05)

- Entry point: `@flow-as-code/cli/simulate` is a new subpath export, the
  fourth beside `./synth`, `./watch` and `./bridge`, and the package root
  re-exports it (`src/index.test.ts` holds the root to the union of the four).
  It carries `scenarioProblems`, `loadScenarios`, `resolveScenarioPaths`,
  `dryRunSimulate`, `runSimulate`, `simulateCommand` and the types; the bin
  calls `simulateCommand`, so the command and the export are one code path.
  The set-level check is `@flow-as-code/core`'s `dryRunScenario(scenario,
docs, { resourceMap })` (`packages/core/src/scenario-check.ts`), kept in
  core because it takes parsed objects and needs no ajv; the schema half stays
  in the CLI, which ships the schema copy. The showcase's
  `tests/envScenarios.test.ts` can replace its `dist/simulate.js` import with
  `@flow-as-code/cli/simulate` once it moves its pin (its own repository).
- Dry run: `flow-cli simulate --dry-run <scenarios> <flows...> [--resource-map |
--address-map]`. The flows paths are read as one set, since a scenario runs across a flow and the modules it calls wherever they live (the showcase keeps `seasonal/` beside `flows/`); this is the opposite of C15's lint and emit, where each argument is its own set, and both READMEs say which is which. Two paths holding the same document are refused. Checks, in `packages/cli/README.md` "Dry run" and
  `docs/08-simulate.md`: entry flow in the set; an event's resource (and a
  substitution's production resource) referenced by the set; every other
  token referenced or keyed in the map, either map, keys only; `expect-prompt`
  against `Text`, spoken `SSML` and `Messages[]` of every document, module
  included, with `$.Attributes.<name>` filled from the scenario's initial
  attributes and `Equals` asserts, `contains` case-insensitive, `similarTo`
  held to half its words; `send-dtmf` against the `GetParticipantInput`
  conditions (or `StoreUserInput`, any key) of the nearest preceding prompt.
  Documented as not done: Lambdas, conditions on attribute values, branches,
  recorded prompts, the voice transcript. `--instance`, `--format` (any value, the live run's default included; commander no longer supplies one, and the help text names junit as the live default) and `--out`
  are refused with `--dry-run`; a live run without `--instance` is refused
  with the dry-run form named. No AWS call: the subprocess tests run with the
  SDK import denied, as the live-path tests already did.
- Fixtures: `conformance/simulate/dry-run/` (a keypad flow and a module, a
  map showing each key form once, seven cases with exact
  `expected.problems.json`), listed in `conformance/README.md` under the
  TypeScript-only `simulate` family. `packages/core/src/scenario-check.test.ts`
  runs them plus mutations (no map, each key form, whitespace and case, an
  unknown attribute value, a storing input, a recorded prompt, an empty set);
  `packages/cli/src/simulate.test.ts` runs the same cases through
  `dryRunSimulate`, `simulateCommand` and the built bin, and checks the
  canonical suite clean against `conformance/demo`. Shown red: with `dryRunScenario`
  mutated to accept any key (`accepted.push(step.value)` before the check),
  the `keypad-wrong-key` fixture test and the storing-input test fail in core
  ("expected [] to deeply equal [{ path: 'steps[4].value', ... }]"), and the
  CLI's subprocess test fails on exit 0 ("expected +0 to be 1"); restored,
  all pass.
- Queue by token: `expect-transfer` already took a `${cdref:queue:...}` token
  (schema `$defs/queueToken`; the showcase's S2 uses it), so the gap was
  `expect-queue`, which took a console name only. It now takes `queue` as an
  alternative to `name`, exactly one, compiled to an Assert on `$.Queue.ARN`
  (a documented system attribute beside `$.Queue.Name`,
  https://docs.aws.amazon.com/connect/latest/adminguide/connect-attrib-list.html)
  with the token as Operand, resolved by `resolveScenario` with every other
  token. Additive within scenario 0.1: the schema's `expect-queue` entry says
  so with the date, every scenario valid before stays valid, and the invalid
  fixtures are unchanged. New canonical case `conformance/simulate/queue-by-token`
  with its compile golden; `CASES` in both test files is four.
- Fixture correction: `appointment-lookup-transfer` pressed `1` with no keypad block in the demo flow. The service ignored it (the scenario passed live, `tasks/A06-export-and-simulate.md`), the dry run reports it, and the canonical suite should dry-run clean against the sets it is written for, so the step is removed and the golden regenerated. The compiled DtmfInput SendInstruction keeps a golden: the new canonical case `conformance/simulate/keypad-press`, written for the dry-run flow set (`keypad-line` has the keypad block), compiled to its `expected.testcase.json`, named in `conformance/README.md`, and dry-run clean against `conformance/simulate/dry-run/flows` by the subprocess test, which checks every canonical case against the set it is written for. `CASES` is five in both test files; a unit test holds the DtmfInput shape as well. The core test that read the SendInstruction shape from the transfer case reads `chat-greeting` too.
- Docs: `docs/08-simulate.md` (on the site as `/docs/simulate/`), the CLI
  README's "Dry run" subsection and its "Importing it", the core README's
  simulate paragraph, `conformance/README.md`. Changeset
  `.changeset/simulate-dry-run.md` (`core` and `cli`, minor; the set is fixed,
  so every package moves together).
- Pending, live: the `$.Queue.ARN` Assert has not been executed against an
  instance. Evidence needed: one `flow-cli simulate` run of
  `conformance/simulate/queue-by-token` against the sandbox (an operator
  step, since CreateTestCase writes), recorded here with its date and the
  execution record's assertion result. Until then the README, docs/08-simulate.md and the schema's `expect-queue` description
  say the form compiles and resolves, not that it passed. The map must hold
  the queue's ARN, not a bare id, for this step; that is also to be confirmed
  by the same run.
- Pending, provider: `conformance/schema/scenario-0.1.schema.json` moved
  (additive), so the provider repository re-vendors `conformance/` at the
  merge commit (`scripts/sync-conformance.sh`). The `simulate` family is
  TypeScript only, so no oracle re-records; the manifest does. Recorded here
  with the provider commit when it lands, in the Phase C release batch.

- Review of PR #31 (2026-10-05), addressed on the branch: the tag-stripping regex code scanning flagged is a linear `spokenText` pass with the pathological and nested-tag inputs pinned; the DtmfInput golden is the `keypad-press` case above; the dry run takes several flows paths; `--format` is refused with `--dry-run` whatever its value; the ARN form's unverified status is in the README, docs/08 and the schema; the subprocess test's title no longer counts the cases.

## Status (2026-10-05)

Merged to main in #31 (`4ef9c91`, 2026-10-05 21:02 UTC). Its run,
37373477595, is recorded as a failure because six of its seven jobs were
cancelled after fifteen minutes queued with no runner; the one that ran,
`build / node 22`, passed, and the next run on main (37375455463, #39)
passed in full. C01 records it. The provider re-vendor above is still
pending and is C11's.

- Provider re-vendor landed: terraform-provider-flowascode #10, merge commit d69bd14 (2026-10-06), vendoring flow-as-code 78b0a87 (conformance identical to main at fe3e3d6), unit and sandbox acceptance lanes green. Unreleased by owner decision: it ships with Phase D as the next minor (D10).
