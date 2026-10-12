# Rule 45: not run yet

These are the inputs for the routing criteria sweep (tasks/D07). They were
written on 2026-10-12 and have not been put to the service: the sandbox's
AWS credentials had expired, and the predefined attribute the sweep needs
is created by a sandbox root that had not been applied (tasks/D07, "Sandbox
prerequisites and cost"). Until the run, the Type spelling, every required
key, error branch, `NextAction`, spelling, limit and flow type rule 45
records for `UpdateRoutingCriteria` is the pages' reading, not the
service's.

## What the instance needs

One predefined attribute with one value (`awscc_connect_predefined_attribute`,
awscc only; the sandbox root names it `fac-sbx-lantern-certified`). The
probes name it through the two placeholders below, so nothing here depends
on its name. No user needs a proficiency in it: a create does not route a
contact.

## Placeholders

The run fills `{{ACCOUNT}}`, `{{REGION}}` and `{{INSTANCE}}` as the README
says, and these names from the environment:

| Placeholder                | Filled from                  | What it names                                   |
| -------------------------- | ---------------------------- | ----------------------------------------------- |
| `{{PREDEFINED_ATTRIBUTE}}` | `PROBE_PREDEFINED_ATTRIBUTE` | the predefined attribute above, by name          |
| `{{PREDEFINED_VALUE}}`     | `PROBE_PREDEFINED_VALUE`     | one of the values that attribute defines         |

## Order

Run `routing-required-set-alone` and `routing-contact-type-set-alone`
first. An AWS sample (aws-samples/sample-apj-sup-sa) and a third-party
library (mgaffigan/pulumi-amazon-connect) both say the service refuses
the page's Type `UpdateRoutingCriteria` as unknown and requires
`UpdateContactRoutingCriteria` (rule 45 quotes both). If the first is
refused with an unknown action type and the second accepted, every other
probe here is rerun with its `Type` changed to `UpdateContactRoutingCriteria`,
and the results file records both runs as what they were.

## What the runner cannot send

The page writes `ProficiencyLevel` as a float ("1.0, 2.0, 3.0, 4.0 and
5.0"). The runner parses each input and sends `JSON.stringify` of it, so a
JSON number `4.0` reaches the service as `4`. Every probe here therefore
sends the integer spelling, and `routing-level-string` sends the string
`"4.0"`. The literal `4.0` can only be put to the service by a hand-run
create whose content is written as text; record such a run beside the
others if it is made.

When the set has run, its `results.json` replaces this file, rule 45 records
what the service said, and the catalog changes only where a result says so.
