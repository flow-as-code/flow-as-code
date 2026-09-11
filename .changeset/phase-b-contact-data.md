---
"@flow-as-code/core": minor
"@flow-as-code/studio": minor
---

Model the contact-data actions: `TagContact` (up to six user-defined tags, no error branch), `UnTagContact` (static keys), and `UpdateContactTextToSpeechVoice` (a Polly voice with an optional engine and speaking style, each static or a JSONPath), each as a builder block, a codegen inverter, a catalog entry, FlowDoc 0.2 schema constraints, and an insertable studio block.
