---
"@flow-as-code/tf": minor
---

An unaliased module reference (`${cdref:module:<name>}`) to a module the set emits now resolves to that module's `aws_connect_contact_flow_module.<name>.arn`, its bare ARN, which runs the module's current content. It used to go to the address map like an external reference. An address map entry for such a reference is now ignored, with a comment in `flow_refs.tf` saying so, as for an aliased one; a module outside the set still binds through the map.
