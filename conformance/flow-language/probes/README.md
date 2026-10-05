# Create probes

The inputs behind the numbered rules in `actions.md`, kept so that a rule can
be re-run and its reading checked. Rule 37 records that its inputs were not
kept and what that cost; from Phase D on, every sweep's inputs live here
(tasks/README.md, "The evidence rule for this phase").

```
probes/<rule>/<name>.json       one probe: { description, type, content }
probes/<rule>/results*.json     what the service said, one entry per probe run
```

`<rule>` is the number of the `actions.md` rule the inputs are evidence for
(`40`, the catalog census). A set recorded before its rule is written takes
the id of the task that will write it, and that task renames the directory to
the number when the rule lands: `d08-voice-id` is such a set, because its
rule is D08's to write and the numbers free when it was recorded (39, 40)
went to C04's stored-input rule and D00's census.

A results file is `results.json`, or `results-<run>.json` with the UTC date
and the Region in the name (`results-2026-10-05-us-west-2.json`) when a set
is run more than once; the runner's `--results <file>` names it, and reads
no file of that shape as a probe.

## An input

`type` is the Connect flow type the probe is created as (`CONTACT_FLOW`,
`CUSTOMER_QUEUE`, `CUSTOMER_HOLD`, ...) or `MODULE` for a flow module.
`content` is the Flow language content exactly as sent, except that every
account id, instance id and resource id is a placeholder:

| Placeholder    | Filled from                          |
| -------------- | ------------------------------------ |
| `{{ACCOUNT}}`  | `AWS_ACCOUNT_ID`                     |
| `{{REGION}}`   | `AWS_REGION` or `AWS_DEFAULT_REGION` |
| `{{INSTANCE}}` | `CONNECT_INSTANCE_ID`                |
| `{{NAME}}`     | `PROBE_NAME` (any other name)        |

So a queue ARN in a probe reads
`arn:aws:connect:{{REGION}}:{{ACCOUNT}}:instance/{{INSTANCE}}/queue/{{QUEUE_ID}}`
and is filled from `PROBE_QUEUE_ID` and the three well-known variables at run
time. A committed input or results file never carries a 12-digit number or a
UUID; `tests/probeCreate.test.ts` refuses one that does, and the runner
scrubs every filled value out of a service message before writing it.

## Running a set

```
AWS_PROFILE=<profile> AWS_REGION=<region> CONNECT_INSTANCE_ID=<id> \
  node scripts/probe-create.mjs conformance/flow-language/probes/<rule> [--only <name>]... [--results <file>] [--dry-run]
```

The runner creates each probe as PUBLISHED under the name
`hh-probe-<rule>-<name>`, deletes an accepted flow at once and confirms the
deletion with a describe call that must return `ResourceNotFoundException`,
and records a refusal with its exception and problem messages. It refuses to
start while any flow or module named `hh-probe-*` or `fac-probe-*` (the
prefix hand-run probes have used) exists on the instance, so a leftover from
an interrupted run is noticed and not mistaken for this run's.
`--dry-run` prints the filled inputs without calling AWS. It is never run by
`npm test` or `npm run build`, and nothing here is run against an instance by
CI.

## A results entry

```json
{
  "probe": "start-stream",
  "description": "...",
  "flowType": "CONTACT_FLOW",
  "region": "us-east-1",
  "at": "2026-10-05T16:49:50Z",
  "recordedBy": "scripts/probe-create.mjs",
  "result": "accepted",
  "cleanup": "deleted; DescribeContactFlow returned ResourceNotFoundException"
}
```

A refused entry carries `exception` and `problems` (the service's problem
messages, or its one message when it lists none) in place of `cleanup`. A set
recorded by hand before the runner existed says so in `recordedBy`. The entry
keeps the Region and the UTC time and never the account or instance id, the
rule every record in `actions.md` follows.

The provider vendors all of `conformance/` and so embeds these files beside
`actions.md`; it does not read them.
