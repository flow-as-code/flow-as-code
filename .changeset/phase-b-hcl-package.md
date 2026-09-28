---
"@flow-as-code/hcl": minor
"@flow-as-code/core": patch
---

New package `@flow-as-code/hcl`, the HCL side of the flowascode companion (ADR-0007). This release ships its syntax layer: a lossless parser for the HCL native syntax (`parse` and `print` reproduce any file byte for byte), `format`, which writes exactly what `terraform fmt` and `tofu fmt` write, `evaluateLiteral`, and `quote` and `unquoteLiteral` by the contract's string rule. It is browser-safe. `@flow-as-code/core`'s `PACKAGE_NAMES` gains `hcl`.
