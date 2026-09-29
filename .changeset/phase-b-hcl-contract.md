---
"@flow-as-code/core": patch
"@flow-as-code/tf": patch
---

Add the HCL contract under `conformance/hcl/`: the rules for writing a FlowDoc as a `flowascode_contact_flow` or `flowascode_contact_flow_module` resource and reading it back, twelve byte-exact round-trip goldens that are `tofu fmt` fixed points, seven regeneration cases for what a rewrite carries and keeps, the address sugar the TypeScript parser rewrites, and the error codes both implementations raise. A structural test in core holds every case to the documents and the catalog; a gated test in tf runs `tofu fmt -check` over the goldens.
