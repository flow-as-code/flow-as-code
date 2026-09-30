# C10 Simulate: Lex substitution and mock responses

Phase C, live AWS. Gated: this task starts only if the owner puts Lex into
the showcase's scope. Lex is a stretch there, the keypad interview is the
baseline, and nothing else in this phase depends on this task. If the gate
does not open, this task moves to the next phase unchanged.

The simulate harness (`packages/core/src/simulate.ts`, A06) substitutes
queues, hours and Lambda functions. Connect's test-case language also
documents substituting a Lex bot and mocking its response, which the harness
does not write. A flow that routes on a Lex intent therefore cannot be
simulated here without a real bot alias in the target instance.
https://docs.aws.amazon.com/connect/latest/devguide/testing-language-actions-override-system-behavior.html

## Acceptance criteria

- The harness writes the documented Lex substitution and mock response for
  `ConnectParticipantWithLexBot`, with the doc URL in a comment next to the
  code, as A06 did for the others.
- Fixtures under `conformance/simulate/`: the test case the harness writes
  for a flow that branches on an intent, compared byte for byte.
- A live probe against the sandbox instance, operator-run with valid
  credentials: the test case is accepted and the flow takes the mocked
  intent's branch. Recorded here with its date and the service's response,
  identifiers masked. A mock the service rejects is recorded the same way
  (A06 records a rejected `CheckHours` mock response), and the harness does
  not claim what the service refused.
- The documented limits still hold: 5 concurrent, 100 queued, 5-minute
  duration, and every scenario ends its test.
- The provider re-vendors `conformance/` if the fixture lands there.
