# A06 Export and simulate harness

Deliverables: export per SPEC (instance inventory, ARN reverse-map to refs, FlowDoc + codegen output, hard error listing unknown ARNs); simulate scenario format, compiler, client, and scenario runner within documented limits (5 concurrent, 100 in flight including the running 5, 5 min), with JUnit and JSON reporters.
Acceptance: export of a sandbox instance's demo flow re-synthesizes losslessly; simulate runner executes a 3-scenario suite against a sandbox with JUnit output.

## Status

Landed in flow-core: `src/export.ts`, `src/simulate.ts`, `src/aws.ts`, with fixtures in `conformance/export/`, `conformance/simulate/`, and `conformance/schema/scenario-0.1.schema.json`. SPEC.md is corrected in the same commit; see below for what was wrong.

The CLI halves are wired as `flow-cli export`, `flow-cli simulate`, and `flow-cli diff` (packages/cli/README.md), tested offline through a client seam over the same fixtures.

The lossless criterion is met offline and asserted in CI: `materializeWithMap(demo, map)` then `exportFlow(content, reverseMapOfResourceMap(map))` reproduces `conformance/demo/appointment-line.flowdoc.json` byte for byte. The `conformance/export/demo-instance` fixture runs the same property through the whole `exportInstance` path, recorded-inventory and all.

Both live criteria are met as of 2026-09-01: the deployed demo flow exported through `flow-cli export` equal to the demo document modulo `meta`, and the three-scenario suite passed five consecutive times through the integration test (runs 6 to 10, after `after-hours-message` moved to chat) and once through `flow-cli simulate` with JUnit output. A 2026-09-02 re-check repeated both with the integration test asserting PASSED: five more consecutive passes, one deliberate failure to show the assertion bites, and the CLI again. The three sessions are recorded below.

## What CI covers, and what it does not

The `sandbox integration` job in `.github/workflows/integration.yml` sets `FLOW_TEST_INSTANCE_ARN` and `FLOW_TEST_DEPLOY`, and nothing else. So it covers the whole-instance live export (`packages/core/src/integration.test.ts`, first `describe`) and flow-cdk's A07 live deploy. It does not cover either acceptance criterion of this task on its own: the lossless export of the deployed demo flow and the three-scenario simulate suite are gated on `FLOW_TEST_SIMULATE` and `FLOW_TEST_RESOURCE_MAP`, which the job deliberately does not set, so both `describe` blocks skip there.

They skip because a stateless job cannot produce their inputs. Both need the superset stack of the Deploy section below already up on the instance (hours `Main Line` and `Closed`, queues `Appointments` and `Overflow`, the `appointment-lookup` Lambda and its integration association) and a resource map written from that stack's outputs. That deploy, and the six-token map, are the operator's part; the sessions recorded below are how this task's acceptance is met. Keeping it an operator run also keeps CI from creating and deleting test cases on an instance where a simulated contact can reach a live agent.

## What the API research changed

The task and SPEC.md were both written against an API that does not exist.

1. **There is no Simulate API.** No Connect operation is named Simulate, StartFlowSimulation, or StartFlowTest. The real family is eleven TestCase operations, all present in `@aws-sdk/client-connect` 3.1122.0. https://docs.aws.amazon.com/connect/latest/APIReference/API_Operations.html
2. **A scenario is a server-side resource.** `StartTestCaseExecution` runs a _published_ test case and takes only a `TestCaseId`, so there is no submit-and-run call. The runner creates with `Status=PUBLISHED`, executes, polls `GetTestCaseExecutionSummary`, collects `ListTestCaseExecutionRecords`, and deletes.
3. **Inputs and expectations are not API fields.** They are the Connect Testing language inside the opaque `Content` string, a graph of Observations rather than an ordered list. The scenario format stays the ordered list the SPEC describes because it is a better authoring format; `compileScenario` lowers it.
4. **Export cannot discover Lambda or Lex through integration associations.** `ListIntegrationAssociations` has no `LAMBDA_FUNCTION` and no `LEX_BOT` in its `IntegrationType` enum. `ListLambdaFunctions` and `ListBots` are the operations that work.
5. **Two ARN keywords lie.** A contact-flow-module is `flow-module` in the ARN and an hours-of-operation is `operating-hours`. A reverse map keyed on the IAM resource-type name resolves neither, which under the SPEC's own rule turns into a spurious unknown-ARN error.
6. **Never-published flows 404.** `DescribeContactFlow` throws `ContactFlowNotPublishedException` unless the id carries the `$SAVED` alias, so an exporter that walks `ListContactFlows` hard-fails on any draft.
7. **A simulated contact can reach a live agent** if the test does not end before a queue transfer. Ending the test is now a default and the validator enforces it.

## What was run against a live instance (2026-09-01)

Both acceptance criteria were exercised against the dedicated sandbox instance (us-west-2, `@aws-sdk/client-connect` 3.1122.0) with an SSO session. Nothing from that run is checked in beyond what `SPEC.md` and the fixtures record; the instance, account, stack outputs, and JUnit file stay outside the repo.

### Deploy

1. A throwaway CDK app outside the repo instantiated flow-cdk's `FlowSet` from the built package (`packages/cdk/dist`) with `conformance/demo/appointment-line.flowdoc.json` as its source and a binder for its three refs, inside a `Stack` using `CliCredentialsStackSynthesizer`. The same stack declared the superset of resources the three scenarios need, named so a live export slugs back to the demo document's own refs: hours of operation `Main Line` (open all day, UTC) and `Closed` (an empty config, never open), queues `Appointments` and `Overflow`, a `nodejs20.x` Lambda `appointment-lookup` returning `appointmentFound: "false"`, and its `LAMBDA_FUNCTION` integration association, which the flow depends on.
2. `app.synth()` wrote the template, and `aws cloudformation deploy --stack-name flow-as-code-a06-simulate --template-file <template> --capabilities CAPABILITY_IAM` created it.
3. A resource map was written from the stack outputs: the six tokens `${cdref:flow:appointment-line}`, `${cdref:hours:main-line}`, `${cdref:hours:closed}`, `${cdref:queue:appointments}`, `${cdref:queue:overflow}`, and `${cdref:lambda:appointment-lookup}` to their ARNs.

### Run

```
FLOW_TEST_INSTANCE_ARN=<instance arn> FLOW_TEST_SIMULATE=1 \
FLOW_TEST_RESOURCE_MAP=<map.json> FLOW_TEST_JUNIT_OUT=<junit.xml> \
npx vitest run --project @criticaldynamics/flow-core integration
```

That runs the three `describe` blocks in `packages/core/src/integration.test.ts`: the whole-instance live export, the lossless export of the deployed demo flow, and the three-scenario simulate suite with the JUnit report. The three vitest tests, not the three scenarios, all passed in the recorded run: the simulate test's bar at the time was that no scenario ERRORED, and one of the three scenarios FAILED (item 4 below). Since the 2026-09-02 re-check the test asserts that every scenario PASSED.

### What it showed

1. Export: every flow on the instance exported and re-exported losslessly except the two that fail by design on an unknown ARN, the stock `Sample Lambda integration` flow (a Lambda in an AWS-owned account) and the stock `Sample after contact work flow` (an AWS-managed view whose ARN carries `aws` in the account segment). The second was a defect: the digits-only ARN pattern let that ARN through as prose. It is fixed and recorded in `conformance/export/unknown-arns/`.
2. Export of the demo: the deployed demo flow came back equal to `conformance/demo/appointment-line.flowdoc.json` modulo `meta`, layout positions included.
3. Simulate: the compiled `Content` was accepted by `CreateTestCase` for all three scenarios, and every execution reached Connect's evaluator; none ERRORED. The Testing language documentation was wrong about the `Utterance` property name, the `Exists` operator, a `FlowId` with a `DestinationPhoneNumber`, an empty `ActionParameters` on an override, `MockResponse` for `CheckHoursOfOperation`, and the shape of `InitializationData`; `SPEC.md` (Simulate) lists each finding, and the compiler, validator, schema, and fixtures now encode what the service accepted. Each rejection came back as `InvalidTestCaseException` with `problemDetails[].message`, which the adapter now folds into the error.
4. Results per scenario, from the recorded JUnit report: `chat-greeting` PASSED (9 s) and `appointment-lookup-transfer` PASSED (14 s) with its queue substitution accepted by `CreateTestCase`; the recorded run does not show which queue the simulated contact reached, because the execution record reports the authored `QueueId` and working-queue name, not the substitute. `after-hours-message` FAILED (67 s) with `OBSERVE_EVENT` on its closed-message observation: the hours check was observed and the closed message never arrived. A probe with the same substitution that expected the open branch's Lambda instead was not satisfied either. Six executions in all waited for the closed message under the substitution (two suite runs and four `InitializationData` probes); it arrived in two, the first suite run and one probe, and both then failed on the attribute assert because the attribute shape they carried reads back empty. The `$.Attributes.locale` assert passed in a separate probe that waited for the welcome message once `InitializationData` had the right shape. No run in this session had the after-hours scenario PASS end to end; the second session below found out why and changed the scenario.
5. IAM: no `AccessDenied` was seen with the sandbox SSO session, so the only action names the run is known to depend on are the ones the adapter calls (listed in `SPEC.md`); a least-privilege policy has not been tested.
6. Regional availability: the TestCase operations are available in us-west-2. No other region was tried.

## What was run against a live instance (2026-09-01, second session)

The open item from the first session was worked the same evening against the same sandbox instance and stack, from a fresh worktree on the integration branch. Times are PDT. Raw output stayed outside the repo; what follows is the scrubbed record.

### Preflight (23:03)

`sts get-caller-identity`, `DescribeInstance` (alias `flow-as-code-sbx-*`, us-west-2), `ListTestCases` (0), and `ListStacks` (only `flow-as-code-a06-simulate`, `UPDATE_COMPLETE`) were checked before anything mutating. The resource map from the first session still matched the stack outputs.

### Five consecutive integration runs, scenario as first authored (voice)

The same command as the first session, run five times back to back (23:04 to 23:10, about 45 to 100 s each). vitest exited 0 every time and all three `describe` blocks passed, the whole-instance export with its narrowed unknown-ARN tolerance included (the two stock samples were the only failures, in all five runs and in the five later ones). Per-scenario outcomes from the JUnit reports:

| run | after-hours-message                                  | appointment-lookup-transfer                          | chat-greeting |
| --- | ---------------------------------------------------- | ---------------------------------------------------- | ------------- |
| 1   | FAILED 68 s, `OBSERVE_EVENT` on the closed message   | PASSED 14 s                                          | PASSED 10 s   |
| 2   | PASSED 18 s                                          | PASSED 15 s                                          | PASSED 9 s    |
| 3   | FAILED 61 s, `OBSERVE_EVENT` on the closed message   | FAILED 8 s, `INITIALIZATION_FAILURE`, 0 observations | PASSED 9 s    |
| 4   | PASSED 18 s                                          | PASSED 15 s                                          | PASSED 10 s   |
| 5   | FAILED 9 s, `INITIALIZATION_FAILURE`, 0 observations | PASSED 14 s                                          | PASSED 11 s   |

Two different failures, so two diagnoses.

### Why the voice after-hours scenario fails, with evidence

The `EXECUTION_START` record carries the simulated `ContactId`, and `DescribeContact` answers for it immediately (`SearchContacts` lags by minutes). https://docs.aws.amazon.com/connect/latest/APIReference/API_DescribeContact.html Every after-hours contact from runs 1 to 4 and from the four executions of the scenario alone (below), passing and failing alike, looked the same from outside: `VOICE`, no queue, 12.1 to 12.6 s long, `DisconnectReason` `CONTACT_FLOW_DISCONNECT`, attributes `locale` and `testRun` set. Runs 1 to 3 and the first two alone executions were read that evening; run 4's contact and the last two alone executions had not reached `SearchContacts` by then and were read back on 2026-09-02, with the same shape. That is the closed branch every time (the open branch enqueues the contact and never disconnects it from the flow), so the hours substitution is honored on every execution and the first session's doubt about it is closed.

What differs is the `MessageReceived` event. In the passing executions its timestamp is about 6 s after the `CheckHoursOfOperation` event and about 0.9 s after the contact's own `DisconnectTimestamp`: on voice the event is emitted when playback of the prompt ends, and the flow's `DisconnectParticipant` comes first. In the failing executions the event never arrives and Connect fails the observation about 45 s after the contact ended. Four executions of the scenario alone (23:12 to 23:15) went PASSED, FAILED, FAILED, PASSED with the same contact shape, so concurrency is not the cause; over the evening 6 of 10 voice executions that waited for the closed message saw it. This is service behaviour, not ours, and a voice scenario cannot avoid it while the prompt is the last thing before the hangup.

Two probes ruled out the alternatives. A scenario that expected `TestCompleted` after the hours check passed in 55 s with the substitution (the event fired about 40 s after the disconnect), and with the substitution removed it also passed, after 304 s, with the contact sitting in the appointments queue from 8 s in until the 5-minute limit ended it and `CompletionReason.Type` `TIMEOUT` on a PASSED execution (23:21 to 23:26). `TestCompleted` therefore cannot tell the branches apart and is not a usable assertion. The same scenario over chat (23:27 to 23:28, five executions back to back) passed 5 of 5 in 7 s each, the closed message arriving as a text turn 0.6 s after the hours check and before the disconnect.

Decision: `conformance/simulate/after-hours-message` now enters over chat (`entryPoint.channel: "chat"`, no source phone number), with the same substitution, steps, and attribute assert, and its description says why. The golden `expected.testcase.json` was regenerated (`ChatEntryPointParameters`) and the offline entry-point test asserts `CHAT`. Nothing in the flow under test changed. The voice race is recorded in `SPEC.md` (Simulate, `MessageReceived`) so the next voice scenario is authored around it.

### Where the substituted transfer lands

A probe (23:19 to 23:20) ran the transfer scenario with the queue substitution and no `EndTest`, holding after the transfer observation: `DescribeContact` showed `QueueInfo` on the overflow queue, enqueued 0.2 s after the `TransferContactToQueue` event, and `GetCurrentMetricData` `CONTACTS_IN_QUEUE` counted 1 on overflow and nothing on appointments. https://docs.aws.amazon.com/connect/latest/APIReference/API_GetCurrentMetricData.html So the substitution redirects the contact, while the execution record keeps reporting the authored `QueueId` and working-queue name, as the first session saw. `StopTestCaseExecution` then ended the execution (`STOPPED`) but the contact stayed in the queue until a `StopContact` 40 s later. In the suite, `EndTest` on the transfer observation disconnects the contact before it is enqueued (no `QueueInfo`, `DisconnectReason` `OTHER`, about 9 s), which is why the safety default matters.

### INITIALIZATION_FAILURE

Runs 3 and 5, and one more probe run of the whole suite (23:16), each had one execution that `StartTestCaseExecution` accepted and Connect then reported FAILED with `FailureReasons` `["INITIALIZATION_FAILURE"]`, message "Failed to start execution of test case due to limit reached.", zero observations, and `ExecutionDurationMs` 0. That is 3 of 6 suite runs carrying two voice scenarios, never in the 6 later runs carrying one, never for a scenario run alone, and never with more than three executions in flight, so it is not the documented 5-concurrent or 100-queued limit and the admin guide names no other. The cause is not identified. The runner now treats it as a start that did not take: it reads the records, starts the same test case again under a fresh `ClientToken` (`<scenario>-retry-<n>`), shares the budget with the 402 retry (`startRetries`, default 3), appends a detail line per attempt, and reports the scenario FAILED with "The scenario was not evaluated." if the budget runs out. Offline tests cover all three paths and the integration test now refuses a FAILED result with zero observations. Mutation-tested: neutering the detection, the retry, and the per-attempt token each turned tests red. Neither the retry nor the refusal has fired live: no execution has failed to start in the 13 suite runs since (below and 2026-09-02).

### CLI, for real

- `flow-cli export --instance <arn> --out <dir>` (23:21, 15 s): exit 1, 19 of 21 flows written, the two stock samples reported by name for their unknown ARNs. `appointment-line.flowdoc.json` equals `conformance/demo/appointment-line.flowdoc.json` in `content`, `layout` (eleven positions), and `refs`, same key order; the only difference is `meta`, which the export fills and the demo omits. `flow-cli codegen` on the export was byte-equal to the `.flow.ts` the export wrote; `flow-cli synth` on that file (23:25) reproduced the export and the demo, `meta.sourceHash` included, and a second codegen was byte-equal to the first. No discrepancy.
- `flow-cli simulate --instance <arn> --resource-map <map> --junit <file>` on the conformance suite (23:31, 16 s): exit 0, `tests="3" failures="0"`, after-hours 9.7 s, transfer 14.7 s, chat 9.2 s. A throwaway scenario expecting a greeting the flow never sends: exit 1 after 302 s, `TIMED_OUT`, JSON report written, "1 of 1 scenario(s) did not pass". A suite with an unmapped token: exit 1 before any test case was created, "Cannot materialize: 1 unmapped token(s)".
- `flow-cli diff --instance <arn>` (23:38): the demo document unchanged, exit 0; a copy with one prompt edited, `changed` with the unified diff of that line, exit 1; a copy renamed to a flow that does not exist, `missing-live`, exit 1; no `--instance`, an unknown flag, and a fictional instance, exit 2 each. All as packages/cli/README.md documents; the README did not need a change.

### Five consecutive integration runs, scenario over chat

Runs 6 to 10 (23:39 to 23:43, back to back, about 45 s each): vitest exit 0, every scenario PASSED every time. after-hours-message 9.5, 9.8, 9.6, 9.6, 9.6 s; appointment-lookup-transfer 13.9, 13.3, 13.3, 14.0, 13.2 s; chat-greeting 9.0, 8.6, 9.1, 9.0, 9.0 s. No `INITIALIZATION_FAILURE` in these runs.

### Teardown (23:44)

`ListTestCases` was already empty (the runner deletes on every path). `delete-stack flow-as-code-a06-simulate` and `wait stack-delete-complete` returned 0. After: 20 flows (the stock samples), 0 modules, 0 test cases, no `flow-as-code-*` stack.

## What was run against a live instance (2026-09-02, re-check)

A review of the second session's record found claims the persisted output did not support (run counts, a timing range, a contacts log short of one run, exit codes only ever echoed to the terminal). The record above is corrected, and the parts worth re-running were re-run against the same sandbox instance from a fresh worktree, with the integration test's PASSED assertion in place. Times are PDT.

### Preflight and contacts read-back (00:20 to 00:22)

Identity, `DescribeInstance` (alias `flow-as-code-sbx-*`), 20 flows, 0 modules, 0 test cases, no `flow-as-code-*` stack. `SearchContacts` over run 4's window and the alone-execution window of 2026-09-01 returned what the evening's log had missed: run 4's after-hours contact (12.2 s) and the third and fourth alone executions (12.6 s and 12.1 s), each `VOICE`, no queue, `CONTACT_FLOW_DISCONNECT`, `locale` and `testRun` set. Read-only; folded into the second session's record above.

### Deploy (00:23)

The 2026-09-01 template (kept outside the repo) redeployed as `flow-as-code-a06-simulate` with `aws cloudformation deploy`, `CREATE_COMPLETE` in 70 s, and the resource map regenerated from the stack outputs (six tokens).

### Five consecutive integration runs, PASSED asserted (00:24 to 00:29)

Same command as before, five times back to back, about 45 s each: vitest exit 0 every time, all three `describe` blocks passed, every scenario PASSED every time. after-hours-message 9.5 to 9.6 s, appointment-lookup-transfer 13.2 to 16.1 s, chat-greeting 8.5 to 9.2 s. The whole-instance export's assertion, no flow failed for any reason other than an ARN outside the instance's account, held in each run (vitest does not echo the test's warning naming the skipped flows; the CLI export below names the two stock samples). No `INITIALIZATION_FAILURE`.

### The assertion can fail (00:30)

One run with the closed-message expectation of `after-hours-message` changed on disk to a text the flow never sends. vitest exit 1: `scenarios that did not pass: after-hours-message: FAILED (1 of 3 observations failed.)`, with `OBSERVE_EVENT` on the closed-message observation. The JUnit report was written before the assertion ran (`failures="1"`, the failing `COMPLETION` record inside it) because the test now writes it first. The contact took the closed branch and the flow disconnected it (`DescribeContact`: chat, no queue, 4.8 s, `CONTACT_FLOW_DISCONNECT`), and Connect failed the pending observation right after, 10.6 s into the scenario by the runner's clock, so nothing was left in a queue; the other two scenarios PASSED in the same run. The fixture was restored from git before anything was committed.

### CLI, exit codes persisted (00:31 to 00:38)

Each exit code was written to a file beside the command's output. `export --instance <arn> --out <dir>`: exit 1 in 15 s, 19 of 21 flows written, the two stock samples named; `appointment-line.flowdoc.json` equal to the demo document modulo `meta`, eleven positions. `simulate` on the conformance suite with `--format junit`: exit 0 in 15 s, `tests="3" failures="0"`, after-hours 9.7 s, transfer 13.9 s, chat 9.1 s. A suite with an unmapped token: exit 1 in 2 s, no test case created. The wrong-greeting scenario with `--format json`: exit 1 after 301 s, `TIMED_OUT`, "1 of 1 scenario(s) did not pass". `diff --instance <arn>`: unchanged 0, one prompt edited 1, a document with no live flow 1; no `--instance` 2, an unknown flag 2, a fictional instance 2. `ListTestCases` was empty after the CLI runs.

### Teardown (00:39)

`delete-stack flow-as-code-a06-simulate` and `wait stack-delete-complete` returned 0. After: 20 flows, 0 modules, 0 test cases, no `flow-as-code-*` stack.

## Open items

- The voice `MessageReceived` race is service behaviour. A voice scenario whose expected prompt precedes a hangup will fail about a third of the time; author it over chat or expect an earlier prompt. Nothing in the runner can fix it.
- `INITIALIZATION_FAILURE` "limit reached" on a fresh instance with three executions in flight has no identified cause. The runner retries it and the integration test refuses a result that was never evaluated; neither has been exercised live, only offline, because the failure has not recurred in the 13 suite runs with one voice scenario (2026-09-01 runs 6 to 10 and the 2026-09-02 re-check).
- `TestCompleted` fires only at the 5-minute limit when the contact is left in a queue, so a scenario must end on `EndTest`, as the compiler already forces.
- IAM: still only the SSO session; a least-privilege policy has not been tested.
- Flow logs: the sandbox has `CONTACTFLOW_LOGS` off and no log group, so nothing was read from CloudWatch and the instance was not changed to enable it.
