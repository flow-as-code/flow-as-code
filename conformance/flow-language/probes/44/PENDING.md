# Rule 44: not run yet

These are the inputs for the Cases sweep (tasks/D06). They were written on
2026-10-12 and have not been put to the service: the sandbox's AWS
credentials had expired, and the Cases domain the sweep needs, with its
template and fields, is created by a sandbox root that had not been applied
(tasks/D06, "Sandbox prerequisites and cost"). Until the run, every error
branch, `NextAction`, required key, spelling and flow type rule 44 records
for these types is the pages' and the published flows' reading, not the
service's.

## What the instance needs

A Cases domain associated with the instance through
`CreateIntegrationAssociation` (`CASES_DOMAIN`), which needs Customer
Profiles first (tasks/D03's domain), with one template and two fields: a
text field and a single-select field with at least one option. Before the
run, the sandbox root's outputs are checked against the instance:

| Sandbox root output      | What it is                                                                 |
| ------------------------ | -------------------------------------------------------------------------- |
| Cases domain id and ARN  | the domain; `ListIntegrationAssociations` filtered to `CASES_DOMAIN` returns the ARN when the association exists |
| Case template id         | the template every create probe names                                       |
| Text field id            | a custom text field in the domain                                           |
| Single-select field id   | a custom single-select field, and one of its option values                  |

No probe names a flow: every Cases probe ends in its own `done` action, so
nothing on the instance is the target of a transfer. The `get-*` and
`update-*` probes read a case at run time, which a create does not, so no
case needs to exist.

## Placeholders

The run fills `{{ACCOUNT}}`, `{{REGION}}` and `{{INSTANCE}}` as the README
says, and these names from the environment:

| Placeholder                     | Filled from                           | What it names                                                    |
| ------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `{{CASES_DOMAIN_ID}}`           | `PROBE_CASES_DOMAIN_ID`               | the Cases domain associated with the instance                    |
| `{{CASE_TEMPLATE_ID}}`          | `PROBE_CASE_TEMPLATE_ID`              | the template in that domain                                      |
| `{{CASE_TEXT_FIELD_ID}}`        | `PROBE_CASE_TEXT_FIELD_ID`            | the custom text field                                            |
| `{{CASE_SELECT_FIELD_ID}}`      | `PROBE_CASE_SELECT_FIELD_ID`          | the custom single-select field                                   |
| `{{CASE_SELECT_OPTION}}`        | `PROBE_CASE_SELECT_OPTION`            | one option value of that field                                   |
| `{{MISSING_CASE_FIELD_ID}}`     | `PROBE_MISSING_CASE_FIELD_ID`         | a random UUID that names no field in the domain                  |
| `{{MISSING_CASE_TEMPLATE_ID}}`  | `PROBE_MISSING_CASE_TEMPLATE_ID`      | a random UUID that names no template in the domain               |

## Order

`create-required` run before the Cases domain is associated is the probe of
an instance with no Cases domain that tasks/D06 asks for (rule 37 found
that a missing feature yields "Invalid Action type"); record that run as
what it was, and run the set again once the association exists.

When the set has run, its `results.json` replaces this file, rule 44 records
what the service said, and the catalog changes only where a result says so.
