---
"@flow-as-code/hcl": minor
"@flow-as-code/cli": minor
---

`flow-cli emit --target flowascode` (and `emitFlowascode`) writes `outputs.tf` beside `flows.tf`: for every flow and module, `<name>_arn` and `<name>_document_sha256` (`sha256()` of the resource's `flowdoc`, the document with its references still tokens), named by FlowDoc name so a promotion gate reading `terraform output` keeps its names when a resource address changes. A flow and a module sharing a name are refused, since they would share an output. The studio's flowascode export carries the file too. `--target tf` writes no outputs; docs/03 says why.
