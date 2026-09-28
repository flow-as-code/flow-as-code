---
"@flow-as-code/cli": minor
"@flow-as-code/core": minor
---

`flow-cli` learns the `.flow.tf` companion. `codegen --to tf` writes a document as a `flowascode_contact_flow` resource (without `--to`, the kind the document's `meta.sourceKind` names), keeping an existing file's `@keep` comments, `refs` bindings and carried attributes; `synth` reads a `.flow.tf` back in process; `export --author tf` writes one per exported document; `emit --target flowascode` writes a document set for the flowascode provider; and the new `convert --to ts|tf` switches a document's companion, carrying `@keep` comments across and printing what the new companion does not carry. `@flow-as-code/core` exports `extractKeepComments`, and `codegen` takes `options.keep` in place of the comments `previous` holds.
