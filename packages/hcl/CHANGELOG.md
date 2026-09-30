# @flow-as-code/hcl

## 0.2.0

### Minor Changes

- 81780fb: FlowDoc gains an optional `displayName`: the name Connect shows when it is not the slug in `name`. `name` stays the slug that names files and references; `displayName` is what a deploy names the Connect resource, and every path now uses it (`connectName(doc)`): the CDK construct's `Name`, `emitTf`'s `name`, and `@flow-as-code/hcl`'s new `display_name` attribute. Export writes it whenever the instance's name is not the slug it assigns, so a console flow called "Main Line" is exported as `name: "main-line"`, `displayName: "Main Line"`, and deploying the export keeps its name. The builder takes it as `FlowConfig.displayName` (1 to 127 characters, not blank).
- 5538b55: New package `@flow-as-code/hcl`, the HCL side of the flowascode companion (ADR-0007). This release ships its syntax layer: a lossless parser for the HCL native syntax (`parse` and `print` reproduce any file byte for byte), `format`, which writes exactly what `terraform fmt` and `tofu fmt` write, `evaluateLiteral`, and `quote` and `unquoteLiteral` by the contract's string rule. It is browser-safe. `@flow-as-code/core`'s `PACKAGE_NAMES` gains `hcl`. The document layer follows: `fromFlowDoc` writes a FlowDoc as its `.flow.tf` companion, a `terraform fmt` fixed point, carrying bindings, carried attributes and `@keep` comments from the previous companion; `toFlowDoc` reads a companion back to its document and sidecar, rewriting listed resource addresses to reference keys and refusing everything else with the contract's error codes. `emitFlowascode` writes a set of documents as `flows.tf`, `variables.tf` and `versions.tf.example` for the flowascode provider, resolving the set's own flows, modules and module aliases. The reader refuses a redefined attribute (`DUPLICATE_ATTRIBUTE`) and one reference key bound to two addresses, and reads `null` as unset.

### Patch Changes

- 2a2ac57: `emitFlowascode` writes `lifecycle { create_before_destroy = true }` on every module version resource. Connect refuses to delete a version an alias points at, so without it the first change to an aliased module failed to apply.
- 17f0f3e: `toFlowDoc` reads a number or bool where the provider's attribute is a string, a map of strings or a list of strings as the string Terraform converts it to (`text = 5` reads as `"5"`), so the reader and the provider read one file to one document; an object or tuple there is refused, and a number whose JavaScript string differs from Terraform's is refused with a request to quote it.
- Updated dependencies [dfd5c3b]
- Updated dependencies [d0c8885]
- Updated dependencies [5b7db7a]
- Updated dependencies [4895560]
- Updated dependencies [40f33a7]
- Updated dependencies [f822c37]
- Updated dependencies [81780fb]
- Updated dependencies [1eeed56]
- Updated dependencies [07080eb]
- Updated dependencies [e3e131a]
- Updated dependencies [3f3f471]
- Updated dependencies [0ca35a6]
- Updated dependencies [2e9446a]
- Updated dependencies [5538b55]
- Updated dependencies [8ef9309]
- Updated dependencies [0282a03]
- Updated dependencies [ed22e85]
- Updated dependencies [e6ac8f3]
- Updated dependencies [b2d81ed]
  - @flow-as-code/core@0.2.0
