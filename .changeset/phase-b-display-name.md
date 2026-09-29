---
"@flow-as-code/core": minor
"@flow-as-code/cdk": minor
"@flow-as-code/tf": minor
"@flow-as-code/hcl": minor
---

FlowDoc gains an optional `displayName`: the name Connect shows when it is not the slug in `name`. `name` stays the slug that names files and references; `displayName` is what a deploy names the Connect resource, and every path now uses it (`connectName(doc)`): the CDK construct's `Name`, `emitTf`'s `name`, and `@flow-as-code/hcl`'s new `display_name` attribute. Export writes it whenever the instance's name is not the slug it assigns, so a console flow called "Main Line" is exported as `name: "main-line"`, `displayName: "Main Line"`, and deploying the export keeps its name. The builder takes it as `FlowConfig.displayName` (1 to 127 characters, not blank).
