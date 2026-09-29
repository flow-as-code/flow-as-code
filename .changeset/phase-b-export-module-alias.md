---
"@flow-as-code/core": patch
---

Export keeps the alias or version a flow invokes a module through: `flow-module/<id>:prod` exports as `${cdref:module:<name>@prod}` rather than the bare module, so deploying the export no longer switches the flow to the unaliased module. A qualifier that is not a slug (`$LATEST`) keeps the bare token. `reverseMapOfResourceMap` keys an aliased entry by the ARN exactly as bound, so two aliases of one module stay apart.
