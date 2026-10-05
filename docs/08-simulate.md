# Simulate: the live run and the dry run

A scenario is an ordered list of what a simulated contact hears, sends and
reaches, authored once (`conformance/schema/scenario-0.1.schema.json`) and
run two ways. The live run executes it on an instance. The dry run holds it
against the FlowDocs it will run through, on a laptop or in CI, with no
instance at all. They answer different questions, and a suite needs both.

## The scenario

```json
{
  "scenario": "0.1",
  "name": "keypad-to-appointments",
  "entryPoint": { "channel": "voice", "flow": "${cdref:flow:keypad-line}" },
  "substitutions": [
    {
      "actionType": "TransferContactToQueue",
      "actionParameters": { "QueueId": "${cdref:queue:appointments}" },
      "substitute": "${cdref:queue:overflow}"
    }
  ],
  "steps": [
    { "kind": "expect-prompt", "contains": "Thanks for calling the keypad line" },
    { "kind": "expect-lambda", "lambda": "${cdref:lambda:caller-lookup}" },
    { "kind": "expect-prompt", "contains": "Welcome back, Mrs. Alder" },
    { "kind": "expect-prompt", "contains": "press 1" },
    { "kind": "send-dtmf", "value": "1" },
    { "kind": "expect-hours-check", "hours": "${cdref:hours:main-line}" },
    { "kind": "expect-transfer", "queue": "${cdref:queue:appointments}" },
    {
      "kind": "assert",
      "path": "$.Attributes.callerName",
      "operator": "Equals",
      "value": "Mrs. Alder"
    },
    { "kind": "expect-queue", "queue": "${cdref:queue:appointments}" }
  ]
}
```

Every resource is a `${cdref:type:name}` token, the same token the flow uses,
never an ARN and never a console name. `expect-transfer` and `expect-queue`
both take the queue's token; `expect-queue` may take `name` instead when the
console name is what the flow reports in `$.Queue.Name`. The token form of
`expect-queue` asserts on `$.Queue.ARN` and has not yet been executed against
an instance (the `name` form has); `tasks/C14-simulate-offline-checks.md`
records the run it waits on. The test ends after
the last step by default, so the simulated contact never reaches an agent;
the queue substitution above is the second safeguard AWS documents.

## The dry run

```
flow-cli simulate --dry-run scenarios/ flows/ seasonal/ --address-map refs/dev.tfmap.json
```

No AWS call, no credentials, no SDK. Every path after the scenarios is read
into one set, because a scenario runs across a flow and the modules it calls
wherever they live; this is the one command where two directories are not
two sets. The suite is validated (schema, then
the cross-field rules), and each scenario is then held against the set:

| It checks                                                        | Because otherwise                                |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| the entry flow is a document in the set                          | there is nothing to run                          |
| a resource an `expect-*` event waits on is referenced by the set | the event can never fire                         |
| every other token is referenced by the set or keyed in the map   | the live run would refuse the suite              |
| each `expect-prompt` is a text some block plays                  | the observation would wait five minutes and fail |
| each `send-dtmf` answers a keypad prompt with a key it takes     | the flow would take its no-match branch          |

Only the map's keys are read, so the address map `flow-cli emit` takes serves
as well as a resource map of ARNs, and a scenario whose tokens the set itself
references needs no map. A prompt that reads `$.Attributes.<name>` is heard
with the value the scenario starts the contact with or asserts, which is how
"Welcome back, Mrs. Alder" matches `Welcome back, $.Attributes.callerName.`
above. SSML is read as its spoken words; a module's text counts like a
flow's.

The dry run exits 1 listing every problem, as
`<scenario file>: <path in the scenario>: <what is wrong>`, so the suite is
fixed in one round. Exit 0 means nothing offline says a scenario cannot pass.

What it does not do, and why a clean dry run is not a passed scenario:

- It does not execute Lambdas. What `${cdref:lambda:caller-lookup}` returns,
  and so what `$.Attributes.callerName` holds, is the live run's to find out.
- It does not evaluate conditions on attribute values, and it does not follow
  the contact through branches. Every text in the set counts as something the
  set says, whichever branch plays it, so an expectation of the closed message
  passes the dry run of a scenario whose hours substitution keeps the line
  open.
- It does not read recorded prompts. A `PromptId` plays audio whose words are
  not in the document; a miss says how many such prompts the set has.
- It does not model the transcript. A voice `expect-prompt` is matched live
  against speech-to-text of the prompt, which drops punctuation and may spell
  numbers out ("press one" for "Press 1"). Expect a run of plain words from
  inside one sentence.

The checks are `@flow-as-code/core`'s `dryRunScenario(scenario, docs, options)`
and `@flow-as-code/cli/simulate`'s `dryRunSimulate(scenarios, flows, options)`
over files, so a consumer's own tests run the same checks the command does.
`conformance/simulate/dry-run/` is the contract: a two-document set, a map,
and one case per thing the check can say, each with the exact problems it
must report.

## The live run

```
flow-cli simulate scenarios/ --instance "$INSTANCE_ARN" --resource-map scenarios/dev.resources.json
```

The resource map holds the ARNs of the deployed resources, keyed any of the
three ways the CLI README's "Reference map keys" lists; a run with one
unmapped token creates nothing. Each scenario is compiled to the Connect
Testing language, created on the instance as a published test case, executed,
polled, collected and deleted, within the documented limits (5 concurrent,
100 in flight, 5 minutes per scenario). The report is JUnit or the
`flow-simulate-report/0.1` JSON; exit 0 only when every scenario `PASSED`.
https://docs.aws.amazon.com/connect/latest/adminguide/testing-simulation-execute-test-cases.html

The live run is the only one that knows what a Lambda returned, which branch
the contact took, what the transcript heard and whether the queue reached is
the one expected. It costs a deployed environment and AWS credentials, so it
is an operator step or a gated job, not a unit test. The dry run is the unit
test, and it is what catches the scenario written for a prompt the flow no
longer says before the live run spends five minutes timing out on it.

## Where each lives

| Concern                        | Where                                                                      |
| ------------------------------ | -------------------------------------------------------------------------- |
| scenario format and validation | `conformance/schema/scenario-0.1.schema.json`, `validateScenario`          |
| compilation to a test case     | `compileScenario`, goldens in `conformance/simulate/<case>/`               |
| offline checks                 | `dryRunScenario`, `conformance/simulate/dry-run/`                          |
| the runner and its limits      | `runScenarios`, `SIMULATE_LIMITS`                                          |
| reports                        | `junitReport`, `jsonReport`, `conformance/simulate/report/`                |
| the command, both runs         | `packages/cli/README.md`, "simulate"                                       |
| what was verified live, when   | `tasks/A06-export-and-simulate.md`, `tasks/C14-simulate-offline-checks.md` |
