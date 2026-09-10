[![flow-as-code](https://flow-as-code.dev/logo.png)](https://flow-as-code.dev/)

# @flow-as-code/core

```
npm i @flow-as-code/core
```

Apache-2.0, Node 22.12 or newer. The five packages version together and are
released as a set, so keep them at matching versions.

Site and docs: <https://flow-as-code.dev/>. This package on npm:
<https://www.npmjs.com/package/@flow-as-code/core>.

The engine. Typed builder and synthesizer, FlowDoc interchange (docs/01-flowdoc-spec.md), lint engine, codegen (FlowDoc to idiomatic TypeScript), export from live instances, and the simulate scenario format, runner, and reporters. No CDK dependency; references are abstract `${cdref:type:name}` tokens materialized by `@flow-as-code/cdk` (CloudFormation tokens), `@flow-as-code/tf` (templatefile variables), or a resource map (`flow-cli render`).

## Export

`exportInstance(client, options)` turns a live Amazon Connect instance into FlowDocs, and TypeScript alongside them when asked. `exportFlow(content, reverseMap, options)` does one flow from its Flow language JSON. An ARN with no entry in the instance inventory is a hard error listing every unknown ARN at once.

The client is an interface, so the whole path is testable offline against the recorded fixtures in `conformance/export/`. `createConnectInventoryClient` adapts an `@aws-sdk/client-connect` client to it and owns pagination and the 2 rps throttle budget. It loads the SDK with a dynamic import, so importing `@flow-as-code/core` never requires the optional peer dependency.

## Simulate

There is no Amazon Connect API called Simulate. The operations are the TestCase family, and a scenario has to be created on the instance as a published test case before it can run. See SPEC.md, which records the corrections, and `src/simulate.ts`, which cites the doc URL for every shape.

A scenario is authored as an ordered list of steps (`conformance/schema/scenario-0.1.schema.json`); `compileScenario` lowers it to the Connect Testing language graph that `CreateTestCase` takes. `runScenarios` owns the create, execute, poll, collect, delete lifecycle within the documented limits: 5 concurrent, 100 in flight including the running 5, and a 5-minute hard cap per scenario. `junitReport` and `jsonReport` are byte-deterministic for the same run.

Live paths are gated on `FLOW_TEST_INSTANCE_ARN` and, for simulate, `FLOW_TEST_SIMULATE=1`. `npm test` never touches an AWS account. The export half is read-only (`List*` and `Describe*` only); everything that writes takes its own opt-in, including `@flow-as-code/cdk`'s deploy test (`FLOW_TEST_DEPLOY=1`), which `npm run test:integration` also runs.

### What CI runs and what an operator runs

The `sandbox integration` job in `.github/workflows/integration.yml` sets `FLOW_TEST_INSTANCE_ARN` and `FLOW_TEST_DEPLOY` only, so it covers exactly two things: the whole-instance live export in `src/integration.test.ts`, and `@flow-as-code/cdk`'s A07 live deploy. It runs only on a push to `main` or a `workflow_dispatch`, and only when the `CONNECT_SANDBOX_ENABLED` repository variable is set.

The other two `describe` blocks in `src/integration.test.ts`, the simulate suite and the lossless export of the deployed demo flow, are gated on `FLOW_TEST_SIMULATE` and `FLOW_TEST_RESOURCE_MAP` and skip in that job by design. Both need a superset stack deployed first (the demo flow's hours, queues, Lambda, and the Lambda's integration association) and a resource map written from that stack's outputs, neither of which a stateless CI job can produce. They stay an operator run; `tasks/A06-export-and-simulate.md` records the procedure, the exact command, and the results of each session.
