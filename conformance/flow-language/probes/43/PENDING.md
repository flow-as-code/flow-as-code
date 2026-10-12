# Rule 43: not run yet

These are the inputs for the Customer Profiles sweep (tasks/D03). They were
written on 2026-10-12 and have not been put to the service: the sandbox's
AWS credentials had expired, and the Customer Profiles domain the sweep
needs is created by a sandbox root that had not been applied (tasks/D03,
"Sandbox prerequisites and cost"). Until the run, every error branch,
`NextAction`, required key, spelling and flow type rule 43 records for these
types is the pages' and the published flows' reading, not the service's.

## What the instance needs

The probes name no domain: a Customer Profiles domain is the instance's
integration, not a parameter. Before the run, the sandbox root's outputs
are checked against the instance:

| Sandbox root output     | What it is                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Profiles domain name    | the Customer Profiles domain, encrypted with a KMS key                                        |
| Profiles domain ARN     | the `Uri` of the instance's integration association, which links the domain to the instance |
| Object type             | an object type in the domain (`CTR` in the sandbox root) holding one profile object           |

`ListIntegrationAssociations` on the instance, filtered to
`CUSTOMER_PROFILES`, returns the domain ARN above when the link exists.

## Placeholders

The run fills `{{ACCOUNT}}`, `{{REGION}}` and `{{INSTANCE}}` as the README
says, and these names from the environment:

| Placeholder             | Filled from               | What it names                                                    |
| ----------------------- | ------------------------- | ---------------------------------------------------------------- |
| `{{PROFILE_ID}}`        | `PROBE_PROFILE_ID`        | a profile in the domain (a 32-character profile id)              |
| `{{OBJECT_TYPE}}`       | `PROBE_OBJECT_TYPE`       | the object type above, by name                                   |
| `{{OBJECT_IDENTIFIER}}` | `PROBE_OBJECT_IDENTIFIER` | a search key of that object type (its `ObjectTypeKeys` name)     |

## Order

`assoc-required` run before the domain is linked is the probe of an
instance with no Profiles domain that tasks/D03 asks for (rule 37 found that
a missing feature yields "Invalid Action type"); record that run as what it
was, and run the set again once the link exists.

When the set has run, its `results.json` replaces this file, rule 43 records
what the service said, and the catalog changes only where a result says so.
