---
"@flow-as-code/core": patch
"@flow-as-code/studio": patch
"@flow-as-code/cli": patch
---

`Compare` now writes `Transitions.NextAction`, a copy of its `NoMatchingCondition` target, as the Connect console does. Connect refuses a `Compare` without one ("Action is missing required property. Path: Actions[0].Transitions.NextAction"), so every `Compare` the builder or the studio wrote before this was refused at create (checked live on 2026-09-30; `conformance/flow-language/actions.md`, rule 38). Codegen reads a `Compare` back as the typed class only when its `NextAction` equals the `NoMatchingCondition` target; a document without one, or with another target, round-trips as a `GenericBlock`. A `.flow.ts` synthesizes the fixed document as it stands; a FlowDoc or `.flow.tf` that holds a `Compare` needs the `NextAction` (`next` in HCL) added. In the studio, wiring a `Compare`'s no-match branch now draws its next path with it, as on a DTMF menu or a percentage split.
