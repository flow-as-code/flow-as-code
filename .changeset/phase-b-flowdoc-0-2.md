---
"@flow-as-code/core": minor
"@flow-as-code/cli": minor
"@flow-as-code/cdk": minor
"@flow-as-code/tf": minor
"@flow-as-code/studio": minor
---

FlowDoc 0.2. The format gains the `view` reference type (`Refs.view(name, version?)`, version in the alias slot), `meta.sourceKind` (`ts` or `tf`), and an optional top-level `description` that the builder, `synth`, codegen and export all carry. `migrateFlowDoc` reads 0.1 and 0.2 and returns 0.2; the CLI, the studio, `FlowSet` and `emitTf` migrate every document on the way in, and the CLI and the studio validate a file against the schema of the version it names first. `synth()` and `exportFlow()` stamp `core@0.2`; `flow-cli synth`, `export` and the studio bridge stamp `meta.sourceKind`. `TokenBinder` gains an optional `view(name, version?)`.
