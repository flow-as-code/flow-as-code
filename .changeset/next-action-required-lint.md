---
"@flow-as-code/core": patch
"@flow-as-code/studio": patch
"@flow-as-code/cli": patch
---

New lint rule `next-action-required` (error): a non-terminal modeled action whose type Connect refuses without a `NextAction` (the catalog's `next` is `required` or `mirrors:*`) must carry one. Connect's refusal is "Action is missing required property. Path: Actions[N].Transitions.NextAction" (checked on every non-terminal modeled type, 2026-09-30; `conformance/flow-language/actions.md`, rule 38). The rule checks presence only, since Connect accepts any target, and does not report `MessageParticipantIteratively`, which Connect accepts either way. `flow-cli lint` and the studio's lint panel report it.
