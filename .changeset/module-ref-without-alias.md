---
"@flow-as-code/core": minor
---

`Refs.module(name, alias?)` takes the alias as optional. Without one it writes `${cdref:module:<name>}`, which means the module's current content (the bare module ARN), the form for a module deployed together with the flows that invoke it. Codegen reads an `InvokeFlowModule` holding that token back as a typed `InvokeFlowModule` with `Refs.module("<name>")`, where it used to fall back to a `GenericBlock`; a `.flow.ts` exported or generated before this changes on its next regeneration. Calls with an alias are unchanged.
