---
"@flow-as-code/core": minor
"@flow-as-code/cli": minor
---

Simulate gains an offline dry run and a library entry point. `flow-cli simulate --dry-run <scenarios> <flows> [--resource-map <file> | --address-map <file>]` checks a scenario suite against a directory of FlowDocs with no instance, no credentials and no SDK: the entry flow is in the set, every token is referenced by the set or keyed in the map (an `emit` address map serves, since only keys are read), every `expect-prompt` is a text some block plays (SSML read as its spoken words, `$.Attributes.<name>` filled from what the scenario sets or asserts), and every `send-dtmf` answers a keypad prompt with a key its conditions take. Any problem exits 1 with every problem listed; what the dry run does not do (execute Lambdas, evaluate conditions, follow branches, read recorded prompts, model the voice transcript) is written in the CLI README and docs/08-simulate.md. The checks are `@flow-as-code/core`'s new `dryRunScenario(scenario, docs, options)`, with `conformance/simulate/dry-run/` as the contract.

`@flow-as-code/cli/simulate` is a new subpath export (also re-exported from the package root) carrying `scenarioProblems`, `loadScenarios`, `resolveScenarioPaths`, `dryRunSimulate`, `runSimulate` and `simulateCommand`, so a consumer's tests no longer reach into `dist/` for them.

`expect-queue` accepts `queue: "${cdref:queue:...}"` as an alternative to `name`: the token is resolved through the resource map like every other and asserted against `$.Queue.ARN`, so a scenario names the queue the way the flow does rather than by console name. An additive change within scenario 0.1; every existing scenario stays valid. The map must hold the queue's ARN, not its bare id, for this step. `expect-transfer` already took a token.

`conformance/simulate/appointment-lookup-transfer` no longer presses a key: the demo flow has no keypad block, and the dry run reports a key no block reads.
