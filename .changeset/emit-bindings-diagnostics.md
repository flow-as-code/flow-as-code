---
"@flow-as-code/cli": minor
"@flow-as-code/hcl": minor
"@flow-as-code/tf": minor
---

`flow-cli emit --target flowascode` refuses a reference the address map does not cover: it exits 1, writes nothing, and lists each key with the documents that make it, because the `null` binding it used to write validates and was refused only at plan time. `--allow-unbound` keeps the old behavior for a partial map. On either Terraform target an address map key no reference in the set uses is now a warning on stderr (`--strict` makes it an error); it used to be dropped in silence. `--target tf` still exits 0 on an unbound reference, since its `TODO_MISSING_ADDRESS_*` placeholder fails `validate`. The emitted `versions.tf.example` asks for the flowascode provider at `~> 0.1`, the range the tutorials and examples give, instead of `>= 0.1`. `emitFlowascode` and `emitTf` return `unbound` and `unusedMapKeys` beside `files`.
