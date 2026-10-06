---
"@flow-as-code/core": minor
---

The action catalog's vocabulary grows for the Phase D types, before any entry uses it: `channels` on an unmodeled entry, an error's `requiredWhenValue` (a branch required by a parameter's static value, read by `requiredErrorsFor` and so by the `error-branches` rule), a map's `keyPatterns` beside `keys`, a constraint's `groups` (alternatives that are each several keys, read by the new `constraintViolations`), `dynamic` on a `list`, and the catalog path form `A.*~` naming every key of a map, which `readPath` returns as a hit per key whose value is the key. `requiredErrorsOf` and `constraintViolations` are exported from `@flow-as-code/core`; `channelRestriction` now reads an unmodeled entry too. Nothing changes for a document until a type carries one of these.
