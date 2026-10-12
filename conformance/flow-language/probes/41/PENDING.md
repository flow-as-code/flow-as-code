# Rule 41: not run yet

These are the inputs for the contact-state sweep (tasks/D02). They were
written on 2026-10-12 and have not been put to the service: the sandbox's
AWS credentials had expired, and the instance had neither live media
streaming enabled nor a Lambda function associated as `MESSAGE_PROCESSOR`,
which the media streaming and media processing probes need (tasks/D02,
"Sandbox prerequisites and cost"). Until the run, every error branch,
`NextAction` and flow type rule 41 records for these types is the pages'
reading, not the service's.

The run fills `{{ACCOUNT}}`, `{{REGION}}` and `{{INSTANCE}}` as the README
says, and two names from the environment:

| Placeholder                    | Filled from                     | What it names                                                          |
| ------------------------------ | ------------------------------- | ---------------------------------------------------------------------- |
| `{{MESSAGE_PROCESSOR_NAME}}`   | `PROBE_MESSAGE_PROCESSOR_NAME`  | a Lambda function the instance has associated as `MESSAGE_PROCESSOR`  |
| `{{UNASSOCIATED_LAMBDA_NAME}}` | `PROBE_UNASSOCIATED_LAMBDA_NAME` | a Lambda function in the same account and Region it has not associated |

When the set has run, its `results.json` replaces this file, rule 41 records
what the service said, and the catalog changes only where a result says so.
