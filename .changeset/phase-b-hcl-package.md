---
"@flow-as-code/hcl": minor
"@flow-as-code/core": patch
---

New package `@flow-as-code/hcl`, the HCL side of the flowascode companion (ADR-0007). This release ships its syntax layer: a lossless parser for the HCL native syntax (`parse` and `print` reproduce any file byte for byte), `format`, which writes exactly what `terraform fmt` and `tofu fmt` write, `evaluateLiteral`, and `quote` and `unquoteLiteral` by the contract's string rule. It is browser-safe. `@flow-as-code/core`'s `PACKAGE_NAMES` gains `hcl`. The document layer follows: `fromFlowDoc` writes a FlowDoc as its `.flow.tf` companion, a `terraform fmt` fixed point, carrying bindings, carried attributes and `@keep` comments from the previous companion; `toFlowDoc` reads a companion back to its document and sidecar, rewriting listed resource addresses to reference keys and refusing everything else with the contract's error codes.
