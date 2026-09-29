---
"@flow-as-code/core": patch
---

`exportFlow` and `exportInstance` keep a module's `Settings` (its input and output parameters and transitions), which Connect returns inside the module's content; they were dropped, so a re-deployed export cleared them. An ARN inside `Settings` is tokenized like one in the actions. The warning about module fields FlowDoc does not model now fires only when the separate `Settings` field holds something or external invocation is enabled, rather than for every module.
