---
"@flow-as-code/hcl": patch
---

The reader treats a resource attribute or an action's `next` set to `null` as unset, as Terraform does. Configuration written by `terraform plan -generate-config-out` (which writes `settings = null` on a flow, `next = null` on a terminal action, and every other optional attribute) now reads once its `refs` hold addresses; it was refused with `FLOW_WITH_SETTINGS`. The provider already read it this way. New conformance case: `hcl/parse/null-attributes`.
