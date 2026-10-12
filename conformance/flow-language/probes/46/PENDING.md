# Rule 46: not run yet

These are the inputs for the outbound sweep (tasks/D04). They were written
on 2026-10-12 and have not been put to the service: the sandbox's AWS
credentials had expired, and the claimed DID and the probe flow the sweep
names are created by a sandbox root that had not been applied (tasks/D04,
"Sandbox prerequisites and cost"). Until the run, every error branch,
`NextAction`, required key, spelling and flow type rule 46 records for the
outbound types is the pages' reading, not the service's.

## What the instance needs

Nothing beyond the instance for `CheckOutboundCallStatus`: its probes name
no resource. The sandbox has no outbound campaigns (owner decision 6), so
`status-required` and `status-required-set-alone` run there are also the
probes of an instance without campaigns that tasks/D04 asks for; record
them as such. If either is refused as an invalid action type, the type
stays generic until the campaigns gate is opened, and rule 46 says so
(rule 37 saw "Invalid Action type" for a feature the instance lacked).

`CompleteOutboundCall`'s probes name the sandbox's one claimed US DID
(owner decision 7), by number and by id; the sandbox root claims it and
never releases it. `complete-caller-id-unclaimed` uses the fictional
`+15555550100`, which no instance can claim, and `complete-voice-connector`
an invented Chime voice connector ARN (`vc/fac-probe-invented`), so neither
needs a resource.

## Placeholders

The run fills `{{ACCOUNT}}`, `{{REGION}}` and `{{INSTANCE}}` as the README
says, and these names from the environment:

| Placeholder      | Filled from        | What it names                                    |
| ---------------- | ------------------ | ------------------------------------------------ |
| `{{DID_NUMBER}}` | `PROBE_DID_NUMBER` | the claimed DID in E.164 form                    |
| `{{DID_ID}}`     | `PROBE_DID_ID`     | the claimed DID's phone number id, in its ARN    |

When the set has run, its `results.json` replaces this file, rule 46 records
what the service said, and the catalog changes only where a result says so.
