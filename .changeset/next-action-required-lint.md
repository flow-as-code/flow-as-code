---
"@flow-as-code/core": patch
"@flow-as-code/studio": patch
"@flow-as-code/cli": patch
---

New lint rule `next-action-required` (error): a non-terminal modeled action whose catalog `next` is `required` or `mirrors:*` must carry a `NextAction`. Connect's refusal is "Action is missing required property. Path: Actions[N].Transitions.NextAction" (checked on every non-terminal modeled type probed, 2026-09-30; `conformance/flow-language/actions.md`, rule 38, lists them). For the fifteen non-terminal types not probed, the rule follows the catalog, which marks `next` `required` (or `mirrors:*`) because the builder writes one; that Connect refuses them without one is assumed, not checked. The rule checks presence only, since Connect accepted every target tried. For a `Compare` or another type whose builder mirrors a branch, the message names that branch's target to copy. It does not report `MessageParticipantIteratively`, which Connect accepts either way. `flow-cli lint` and the studio's lint panel report it.
