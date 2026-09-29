---
"@flow-as-code/hcl": patch
---

`toFlowDoc` reads a number or bool where the provider's attribute is a string, a map of strings or a list of strings as the string Terraform converts it to (`text = 5` reads as `"5"`), so the reader and the provider read one file to one document; an object or tuple there is refused, and a number whose JavaScript string differs from Terraform's is refused with a request to quote it.
