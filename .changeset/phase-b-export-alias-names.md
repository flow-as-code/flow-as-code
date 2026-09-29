---
"@flow-as-code/core": patch
---

Export reads a flow's invocation of a module alias back as `${cdref:module:<name>@<alias name>}`. A flow invokes an alias as `<module ARN>:<alias id>`, the only form Connect runs as the alias, so `collectInventory` now lists each module's aliases (`ListContactFlowModuleAliases`, through a new optional `ConnectInventoryClient.listContactFlowModuleAliases`, which `createConnectInventoryClient` implements) and `buildReverseMap` maps each id to its name. A client without the method, or an alias name that is not a slug, keeps the id as the alias, with a warning for the latter. Export now needs `connect:ListContactFlowModuleAliases`.
