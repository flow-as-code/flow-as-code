---
"@flow-as-code/core": minor
---

`lint(docs, { disable })` refuses to disable a hard rule (`no-literal-arn`, `no-unresolved-token`) and throws naming it, instead of skipping it. A hard rule blocks a save, so skipping one was a way around the save gate; it is the refusal a `.flow.tf`'s `lint` block already makes.
