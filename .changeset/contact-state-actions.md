---
"@flow-as-code/core": minor
"@flow-as-code/hcl": patch
"@flow-as-code/studio": minor
---

Model the contact-state actions (tasks/D02). `ResumeContact` is a builder block (`next` and the catch-all, no parameters), a codegen inverter, a catalog entry and an insertable studio block; its catalog `channels` is `TASK`, read from the admin guide's Resume contact block page, so `channel-restricted-action` warns wherever it appears. The HCL writer and reader take it as the typed `resume_contact {}` sub-block, which no published flowascode provider accepts until the release that carries it. The `unknown-actions` passthrough fixture holds `LoadContactContent` and `StartVoiceIdStream` in place of the newly modeled types. The service has not yet been asked about these types (rule 41 in `conformance/flow-language/actions.md` is probe pending), so their required branches and flow types are the AWS pages' reading.
