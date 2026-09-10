# Promote one flow across two environments

One FlowDoc, deployed to a dev environment and a prod environment, on both
deploy paths, with no per-environment ARN table anywhere.

This is the claim the rest of the repository makes in prose (`README.md`,
`docs/adr/0004-prior-art-aws-l2-cdk-library.md`), demonstrated with commands you
can run. `tests/promoteAcrossEnvironments.test.ts` runs the same inputs on
every push and holds the claim itself: the two emitted trees differ in exactly
one file, that file carries only its own environment's addresses, and no
emitted byte is an ARN. The outputs pasted below are transcripts of a real run,
not assertions, so read them as illustration and trust the test for the claim.

## What is here

Inputs only. Everything the tools generate is written into `build/` or
`cdk.out/`, both gitignored, by the commands below.

```
flows/appointment-line.flowdoc.json   the flow, written once
refs.dev.tfmap.json                   dev's terraform ADDRESSES, one per reference
refs.prod.tfmap.json                  prod's terraform addresses, same references
terraform/dev/                        your own dev configuration: provider, resources
terraform/prod/                       your own prod configuration: provider, remote state
cdk/app.ts                            one CDK app, two stacks, two binders
```

The flow is the demo appointment line: it checks hours of operation, invokes a
Lambda to look up an appointment, and transfers to a queue. It refers to those
three resources by name, never by ARN:

```
${cdref:hours:main-line}
${cdref:lambda:appointment-lookup}
${cdref:queue:appointments}
```

Run everything below from this directory, with the workspace built once from the
repository root (`npm ci && npm run build`). `npx flow-cli` then resolves to the
workspace copy.

## Step 1: the flow is written once

```
npx flow-cli lint flows/
```

```
No findings.
```

A literal ARN in authored content fails a hard lint rule, so this document could
not carry one even if someone pasted it in. There is one copy of it, and both
environments below read that copy.

## Step 2: the Terraform path

Emit the same document twice, once per environment, changing nothing but the
address map:

```
npx flow-cli emit flows/ --target tf --address-map refs.dev.tfmap.json  --out build/dev
npx flow-cli emit flows/ --target tf --address-map refs.prod.tfmap.json --out build/prod
```

Each writes five files. Now compare the two trees:

```
diff -r build/dev build/prod
```

```
diff -r build/dev/flow_refs.tf build/prod/flow_refs.tf
10,12c10,12
<     hours_main_line_arn           = aws_connect_hours_of_operation.main_line.arn
<     lambda_appointment_lookup_arn = aws_lambda_function.appointment_lookup.arn
<     queue_appointments_arn        = aws_connect_queue.appointments.arn
---
>     hours_main_line_arn           = data.terraform_remote_state.platform.outputs.main_line_hours_arn
>     lambda_appointment_lookup_arn = data.terraform_remote_state.platform.outputs.appointment_lookup_arn
>     queue_appointments_arn        = data.terraform_remote_state.platform.outputs.appointments_queue_arn
```

That is the whole difference between the two environments: one file, `flow_refs.tf`,
holding three addresses. `flows.tf`, `variables.tf`, `versions.tf.example` and
the rendered flow template `flows/appointment-line.flow.tftpl` are byte-identical,
because the template refers to `local.flow_refs` by variable names derived from
the tokens, not from whatever the addresses resolve to.

Neither tree contains an ARN:

```
grep -ril "arn:aws" build/ || echo "no ARN in either tree"
```

```
no ARN in either tree
```

### That table is not the table we said we would delete

`--address-map` takes a table, and the launch post says the mapping table is the
thing we wanted to delete. Both are true, because they are not the same table.

The thing being deleted is a table of ARNs: "the queue I mean" to "the ARN it has
in this account, this region, this instance", maintained by hand, one row per
environment per resource, wrong the day someone recreates a queue.

`refs.dev.tfmap.json` is a table of pointers into IaC that already exists. Its
values are Terraform addresses of resources your own configuration manages, and
they are not per-environment values at all: they are per-environment
_configurations_. `emitTf` enforces the distinction rather than trusting it.
`checkExpression` (`packages/tf/src/emit.ts`) refuses any value matching
`/arn:aws/i` outright, so this file cannot decay into an ARN table:

```
Cannot emit terraform:
  - address for ${cdref:queue:appointments} is a literal ARN (arn:aws:connect:...); map to a terraform address instead
```

(the ARN is elided here; the tool prints it in full, on one line)

The two paths differ here because the two tools differ. In CDK the flows and the
resources are objects in one program, so the app already holds the reference and
there is nothing to name: the binder just hands over `queue.attrQueueArn`. HCL
has no equivalent, so something has to name the address in text. That, and only
that, is why one path takes a map and the other takes none.

### Deploy it

The emitted files are not a root module on their own: they carry no provider, no
backend and no credentials, deliberately. Your configuration supplies those and
the resources the addresses point at. `terraform/dev/` and `terraform/prod/` are
that half, and they are where the two environments actually differ:

- `terraform/dev/` creates the hours, the queue and the Lambda, so
  `refs.dev.tfmap.json` points at resources in the same root module.
- `terraform/prod/` creates none of them. A platform team manages them and
  publishes their ARNs as outputs, so `refs.prod.tfmap.json` points at
  `data.terraform_remote_state.platform.outputs.*`.

Assemble each root module and check it with the real tool:

```
cp terraform/dev/*.tf  build/dev/
cp terraform/prod/*.tf build/prod/

(cd build/dev  && tofu init -backend=false -input=false && tofu validate)
(cd build/prod && tofu init -backend=false -input=false && tofu validate)
```

```
Success! The configuration is valid.
Success! The configuration is valid.
```

`tofu plan` and `tofu apply` need credentials for the target account and the
instance id (`TF_VAR_connect_instance_id`, which the emitted `variables.tf`
declares and nothing in this repository has a value for).

## Step 3: the CDK path

There is no map here at all. `FlowSet` takes a `TokenBinder`, and each binder
returns the ARN of a resource the CDK app itself knows about, so the ARNs come
from the thing that created or imported them.

`cdk/app.ts` is what `flow-cli emit flows/ --target cdk` scaffolds, edited the
way its own banner sanctions. The scaffold writes one `const binder: TokenBinder`
at module level, because the common case is one environment; promoting means
moving that constant into the stack so each stack binds its own resources. The
two stacks then differ the way real environments do:

- `DevFlowStack` creates the hours, the queue and the Lambda. Its binder returns
  construct attributes (`queue.attrQueueArn`), which synthesize to `Fn::GetAtt`.
- `ProdFlowStack` creates none of them and imports the platform team's exports.
  Its binder returns `Fn.importValue(...)`, which synthesizes to `Fn::ImportValue`.

Each stack's instance ARN is read at deploy time from an SSM parameter in the
target account, so no instance ARN is committed either.

```
npx tsx cdk/app.ts
```

That synthesizes both stacks into `cdk.out/` (in a real project this file is your
`bin/app.ts` and the CDK CLI runs it). What the two templates hold:

```
grep -o '"connect-platform-[a-z-]*"' cdk.out/AppointmentLine-prod.template.json | sort -u
```

```
"connect-platform-appointment-lookup-arn"
"connect-platform-appointments-queue-arn"
"connect-platform-main-line-hours-arn"
```

```
grep -c 'Fn::ImportValue' cdk.out/AppointmentLine-dev.template.json
```

```
0
```

Dev has none, because it binds its own resources. And neither template names a
Connect ARN:

```
grep -il "arn:aws:connect" cdk.out/*.template.json || echo "no Connect ARN in either template"
```

```
no Connect ARN in either template
```

The flow content itself is the same text in both templates, with three holes: the
test asserts that the literal text around the bound values is byte-identical
between the two stacks and that all three bound values differ.

## Step 4: the test that holds this

From the repository root:

```
npx vitest run --project repo tests/promoteAcrossEnvironments.test.ts
```

```
Test Files  1 passed (1)
     Tests  12 passed | 2 skipped (14)
```

It reads the files in this directory, emits both Terraform trees, asserts the
difference set is exactly `["flow_refs.tf"]`, asserts each `flow_refs.tf` holds
its own environment's addresses and no ARN, and synthesizes the CDK app to
compare the two stacks.

The two skipped tests are step 2's `tofu validate`, which needs a real `tofu` and
a provider download. They are gated on `RUN_TOFU_VALIDATE=1`, like every other
test in this repository that runs the real tool, and the `emit-tf` CI job sets it:

```
RUN_TOFU_VALIDATE=1 npx vitest run --project repo tests/promoteAcrossEnvironments.test.ts
```

```
Test Files  1 passed (1)
     Tests  14 passed (14)
```

## What this example does not do

Five things are worth saying plainly, because the walkthrough above could be read
as claiming them.

**Nothing here diffs two environments against each other.** `flow-cli diff` is
always local documents against one live instance (`--instance <arn>`), so
"is prod behind dev" is two runs and a human reading two outputs. There is no
command that answers it, and this example does not add one.

**A partial address map succeeds.** `emit --target tf` with a map missing a
reference does not fail. It writes `TODO_MISSING_ADDRESS_<variable>` into
`flow_refs.tf` and exits 0; the failure arrives later, at `tofu validate`, as an
undefined reference naming the token. That is deliberate (a loud placeholder
beats a half-written tree), but it means a CI job that emits without validating
will not catch a map that has fallen behind the flow. Emitting this example's
document against a map holding only `hours:main-line` exits 0 and writes:

```
    # TODO: no terraform address for ${cdref:lambda:appointment-lookup}.
    lambda_appointment_lookup_arn = TODO_MISSING_ADDRESS_lambda_appointment_lookup
```

`conformance/emit-tf/demo-incomplete-map/` is that case as a fixture.

**The CDK scaffold is single-environment.** `flow-cli emit --target cdk` writes
one module-level `const binder`, which a two-environment app has to edit. The
scaffold's banner sanctions exactly that ("yours to keep: re-running the command
overwrites this file, so move it or rename it once you have edited it"), but the
generator does not offer a two-environment shape, and `cdk/app.ts` is a hand
edit rather than generated output.

**The two CDK templates differ because these two stacks differ.** Dev creates its
resources and prod imports them, which is realistic and is what makes the
difference visible in synthesized JSON. If both environments created their
resources the same way, the two templates would be identical text, and the
difference would live entirely in the account each stack deploys into, where no
test in this repository can see it. The Terraform half is the stronger proof for
that reason: two trees, on disk, differing in one file.

**Nothing here is deployed.** No command above reaches AWS or needs credentials
(`tofu init` talks to the provider registry and nothing else). The live half
needs an instance ARN and a Connect instance per environment; the CDK package's
`src/integration.test.ts` is the piece that has been run against a real instance.
