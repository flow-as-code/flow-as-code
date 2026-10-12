# Rule 47: not run yet

These are the inputs for the census additions sweep (tasks/D09). They were
written on 2026-10-12 and have not been put to the service: the sandbox's
AWS credentials had expired. Until the run, every error branch,
`NextAction`, flow type and spelling rule 47 records for the types below is
the reading of the page or the console export it was modeled from, not the
service's.

## What the instance needs

- `load-*`: nothing beyond the instance. The admin guide's Get stored
  content page says to enable email "before using this option"; rule 40's
  create of the type was accepted on an instance whose email setting was
  not recorded, so if a `load-*` probe is refused with a message naming
  email, rerun it on an instance with email enabled and record both runs.

## Placeholders

The run fills `{{ACCOUNT}}`, `{{REGION}}` and `{{INSTANCE}}` as the README
says. No `load-*` probe needs any other.

## Reading results that depend on another

- `load-required-set-alone` sends `Parameters` empty, as rule 40's run did,
  and `load-required` the page's `ContentType`. If the first is refused
  naming `ContentType`, the catalog marks it required and rule 40's reading
  of its own run is corrected beside it.
- `load-content-type-unknown` and `load-content-type-jsonpath` say whether
  the 0.3 schema clause, which holds `ContentType` to `EmailMessage`, is
  what the service enforces (owner decision 3). If either is accepted, the
  clause loosens to what was accepted.

When the set has run, its `results.json` replaces this file, rule 47 records
what the service said, and the catalog changes only where a result says so.
