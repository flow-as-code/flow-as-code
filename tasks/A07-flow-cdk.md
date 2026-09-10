# A07 flow-cdk TokenBinder and FlowSet

Deliverables: per packages/cdk/README.md, including module version publish and alias repoint; snapshot tests of synthesized CloudFormation.
Acceptance: a CDK app deploying the demo flow to a sandbox instance succeeds with zero resource-map input; repointing a module alias updates referencing flows without content changes; Campaign-only flow-version constraint verified against current docs and cited.

## Implementation notes (2026-08-31)

Acceptance restated and status:

- Snapshot tests of synthesized CloudFormation: done (`packages/cdk/src/flow-set.test.ts`, aws-cdk-lib/assertions plus Vitest snapshots).
- Module version publish and alias repoint: done. Each module gets a ContactFlowModuleVersion whose logical ID embeds a canonical content hash, plus one ContactFlowModuleAlias per alias name the doc set pins (default `live`). A module content change replaces the version and repoints the alias; the repoint test asserts the referencing ContactFlow resource is deep-equal across the bump.
- Repointing updates referencing flows without content changes: done, by resolving `${cdref:module:name@alias}` to the alias ARN token, never the version.
- Campaign-only flow-version constraint: verified against https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateContactFlowVersion.html and cited verbatim in `flow-set.ts`; full flows update content in place.
- Live deploy to a sandbox with zero resource-map input: implemented as `src/integration.test.ts`, gated on `FLOW_TEST_INSTANCE_ARN` plus `FLOW_TEST_DEPLOY=1` (skipped otherwise; deploys demo flow, router flow, and a versioned module via the AWS CLI, then tears down). The second gate was added after an A06 live-export run pointed `npm run test:integration` at an instance for the read-only export half and this test attempted a deploy as a side effect. Green live run recorded 2026-09-02; see below.

## Live deploy update (2026-09-01)

Two live runs against the sandbox instance, each fixed in the commit named:

- The first failed at CreateChangeSet because the account was never CDK-bootstrapped: `DefaultStackSynthesizer` injects a reference to the `/cdk-bootstrap/.../version` SSM parameter. Commit b5079f0 switched the stack to `CliCredentialsStackSynthesizer`, which is correct for an asset-free stack shipped with `aws cloudformation deploy`, so the demo needs no bootstrap step in any account.
- The second got past the change set and failed on the module resource with "JSON field is missing or null for field name: settings": Connect requires a top-level `Settings` object in module content, and no fixture carried one. Commit 536370f models `Settings` in the FlowDoc schema, synth, serialize, materialize, and codegen, and regenerates the flow-tf module goldens and the flow-cdk module snapshot.

A green operator run after 536370f is not recorded in this repository as of 2026-09-01. That run happened the next day: see "Live deploy verified (2026-09-02)" below, which is what closed it.

## Live deploy attempt (2026-09-02, morning)

Attempted and not run. The sandbox session was expired: `sts get-caller-identity` returned `ExpiredToken`, and the sandbox helper's `DescribeInstance` returned `ExpiredTokenException` and refused before touching anything. Nothing was deployed, nothing was deleted, and no `flow-as-code-*` stack was created or left behind, because no call reached the account.

## Live deploy verified (2026-09-02)

Green, on the first attempt, against the sandbox instance on a fresh session. This closes the outstanding operator run: nothing in the deploy path was refused by the service, and no code changed.

Command shape. The instance ARN comes from the operator's sandbox wrapper, which is the only thing that supplies `FLOW_TEST_INSTANCE_ARN`; `FLOW_TEST_DEPLOY=1` is the write opt-in the test requires on top of it.

```
FLOW_TEST_INSTANCE_ARN=<sandbox instance arn> FLOW_TEST_DEPLOY=1 \
  npx vitest run --project @criticaldynamics/flow-cdk integration
```

Result: 1 test file, 1 test, passed. The test itself took 98.8 s, which is the whole `aws cloudformation deploy` plus the `delete-stack` and `stack-delete-complete` wait in its `finally`. No CDK bootstrap step was needed or performed, confirming the `CliCredentialsStackSynthesizer` choice: the synthesized template carries no `/cdk-bootstrap/.../version` SSM lookup and no asset, so `aws cloudformation deploy` runs on the caller's own credentials in a never-bootstrapped account.

What that run recorded is the pass and the duration, and nothing more: the test discards the AWS CLI's stdout when the deploy succeeds, and it deletes the stack in its `finally`, so no stack events and no per-resource status survive it. The resource inventory below is therefore from the inspection stack of the next section, deployed from the same synthesized template under the same stack name.

The inspection stack, as `flow-as-code-a07-integration`, carried ten resources, all `CREATE_COMPLETE`: an IAM role and an inline-code Lambda, a `LAMBDA_FUNCTION` integration association, an hours of operation, a standard queue, the demo flow `appointment-line` and the `callback-router` flow as `AWS::Connect::ContactFlow`, and the `callback-offer` module as `AWS::Connect::ContactFlowModule` with one `ContactFlowModuleVersion` and one `ContactFlowModuleAlias`. Evidencing that inventory for the test's own run would take a `describe-stack-resources` call before the `finally` deletes the stack, which is how this listing was produced. Keeping the deploy's own stdout would not do it: `aws cloudformation deploy` prints three progress lines and no per-resource output.

### What the deployed content was asserted to be

Deploy success only proves Connect accepted the content. So the stack was deployed a second time from the template the test had synthesized, left up, and read back with `DescribeContactFlow` and `DescribeContactFlowModule`. The check was structural, not a byte comparison: for each of the three documents, the deployed JSON was walked in parallel against the document's canonical token form (`serializeContent(materializeWithBinder(doc, r => r.token))`), and every leaf had to be equal except at the positions where the token form holds a `${cdref:...}` token, which were treated as free variables and the deployed value there recorded as that token's binding.

What that pins down and what it leaves free: every object's key set, every action `Identifier`, `Type`, and `Transitions` target, every literal parameter value, and every `Metadata` position the layout projects into content were compared literally and matched. The positions holding the four `${cdref:...}` tokens were not compared literally, only required to hold a scalar the walk could record as a binding; what resolved into them is the subject of the last two bullets below. A byte comparison is impossible in principle on a materialized document, because deploying resolves every reference: the deployed content holds a real ARN at each of those positions and the document holds the token.

- Zero differences outside the token positions, in all three documents. Every key, every action, every transition, and the `Metadata` positions the layout projects into content came back exactly as materialization emits them.
- `appointment-line` and `callback-router` came back `Type: CONTACT_FLOW`, matching each document's `connectType`, and `State: ACTIVE`. The module came back `State: active`, `Status: published`.
- Four references resolved, each to a real resource of the right kind: `${cdref:hours:main-line}` to the stack's hours of operation, `${cdref:queue:appointments}` to its standard queue (found in `ListQueues` with `QueueTypes=STANDARD`), `${cdref:lambda:appointment-lookup}` to a function `ListLambdaFunctions` reports as associated with the instance, and `${cdref:module:callback-offer@live}` to the module alias.
- The alias assertion, which is the acceptance criterion about repointing: the value the invoking flow carries is byte-equal to the `AWS::Connect::ContactFlowModuleAlias` resource's ARN and is not the `AWS::Connect::ContactFlowModuleVersion` resource's ARN. `DescribeContactFlowModuleAlias` reports that alias as `Name: live`, `Version: 1`, and `ListContactFlowModuleVersions` reports exactly one published version. So the flow points at the alias, and repointing the alias is what would move it.

Both ARNs are the module ARN with a colon qualifier, which is easy to confuse: the version's qualifier is the ordinal (`.../flow-module/<module-id>:1`) and the alias's is the alias id (`.../flow-module/<module-id>:<alias-id>`). An assertion that looks for an `/alias/` path segment passes for neither. https://docs.aws.amazon.com/connect/latest/APIReference/API_DescribeContactFlowModuleAlias.html

### One documented normalization did not apply, and that is worth knowing

`Parameters` was present on every action of the deployed content, including the four parameterless ones across the three documents (two in `appointment-line`, one in `callback-router`, one in `callback-offer`). So the omitted-`Parameters` behaviour recorded in `packages/core/SPEC.md` and `conformance/export/omitted-parameters/` did not fire here.

That is consistent rather than contradictory: `DescribeContactFlow` returns what was written, and CloudFormation wrote our `"Parameters": {}` verbatim. The omission is a property of flows authored in the console, which is where the 20 stock sample flows came from and why 7 of them exposed it during the A06 export work. A flow this repo deploys and reads back does not need the fill-in; a flow the console wrote does. `exportFlow` has to keep filling it in either way.

### Teardown

`delete-stack` plus `stack-delete-complete`, 33 s. Baseline confirmed after it, and it matches the baseline recorded before the run: 20 contact flows, 0 contact flow modules, 0 test cases, 0 `flow-as-code-*` stacks.

Evidence, all outside the repository. The vitest run log, the inspection deploy log, the teardown log and the closing baseline hold no ARN of any kind. The stack resource listing, the module alias dump and the content comparison output do hold ARNs, and in each of the three the account id is masked to `<account>` and the instance id to `<instance-id>`. No ARN, account id, instance id, or stack output value is recorded here.

## What CI covers

The `sandbox integration` job in `.github/workflows/integration.yml` sets `FLOW_TEST_DEPLOY=1`, so this test is one of the two things that job runs (the other is the whole-instance export half of A06). The job is gated on the `CONNECT_SANDBOX_ENABLED` repository variable and on the event, so it runs only on a push to `main` or a `workflow_dispatch`, never on a pull request. Until that variable is set on a real remote, the deploy has no automated coverage and an operator run is the only path to a green result. One such run is recorded above.

What the operator run proves and the test does not: the test asserts the deploy exited zero, not that the deployed content matches the materialized document. The structural comparison above was established with a throwaway script against a stack left up on purpose. Folding that assertion into `integration.test.ts`, so CI checks it too, is the obvious next step and is not done.
