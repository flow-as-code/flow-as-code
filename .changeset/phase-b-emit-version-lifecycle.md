---
"@flow-as-code/hcl": patch
---

`emitFlowascode` writes `lifecycle { create_before_destroy = true }` on every module version resource. Connect refuses to delete a version an alias points at, so without it the first change to an aliased module failed to apply.
