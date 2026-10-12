# Rule 42: not run yet

These are the inputs for the tasks and AI agents sweep (tasks/D05). They
were written on 2026-10-12 and have not been put to the service: the
sandbox's AWS credentials had expired, and the instance had no task
template, which the template probes need (tasks/D05, "Sandbox prerequisites
and cost"). Until the run, every error branch, `NextAction`, required key,
spelling and flow type rule 42 records for these types is the pages'
reading, not the service's.

The run fills `{{ACCOUNT}}`, `{{REGION}}` and `{{INSTANCE}}` as the README
says, and these names from the environment:

| Placeholder                    | Filled from                        | What it names                                                    |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| `{{TASK_FLOW_ID}}`             | `PROBE_TASK_FLOW_ID`               | a published contact flow on the instance, the flow a task runs   |
| `{{TASK_TEMPLATE_ID}}`         | `PROBE_TASK_TEMPLATE_ID`           | a task template on the instance                                  |
| `{{MISSING_TASK_TEMPLATE_ID}}` | `PROBE_MISSING_TASK_TEMPLATE_ID`   | a random UUID that names no task template on the instance       |

When the set has run, its `results.json` replaces this file, rule 42 records
what the service said, and the catalog changes only where a result says so.
