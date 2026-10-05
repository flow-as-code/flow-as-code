---
"@flow-as-code/hcl": minor
"@flow-as-code/tf": minor
"@flow-as-code/cli": minor
---

A module nothing in the set invokes can be released on its own: `flow-cli emit --module-alias module:greeting@live` (repeatable; `moduleAliases: { greeting: ["live"] }` on `emitFlowascode` and `emitTf`) writes the version and alias resources exactly as for a module a flow in the set invokes by alias, on both Terraform targets, and the flowascode target's `outputs.tf` adds `greeting_live_arn`, the value another root binds `module:greeting@live` to through its address map. A module not in the set, or an alias that is not a slug, is refused. A module neither invoked nor declared is written as before: its resource alone on `flowascode`, a version and no alias on `tf`. New conformance case `module-release` in both emitter families.
