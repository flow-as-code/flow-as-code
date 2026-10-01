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
