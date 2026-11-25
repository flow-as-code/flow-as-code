---
"@flow-as-code/core": minor
---

`UpdateContactRoutingCriteria` takes `criteria: jsonPath("$.External.RoutingCriteria")` in place of `steps`, the whole of `RoutingCriteria` as a JSONPath, which the service accepts (an AWS sample's form for criteria read from a Lambda's response). Codegen reads that form back as a typed block where it used to write a `GenericBlock`, so a `.flow.ts` holding one changes on its next regeneration, and the studio's "all of the routing criteria from a JSONPath" now works on a typed block instead of being refused. Passing both `steps` and `criteria`, or a `criteria` that is not a JSONPath, throws. In HCL the form is still a `generic` block.
