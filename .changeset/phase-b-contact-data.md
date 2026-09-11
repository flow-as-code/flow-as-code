---
"@flow-as-code/core": minor
"@flow-as-code/studio": minor
---

Model the contact-data actions: `TagContact` (up to six user-defined tags, no error branch), `UnTagContact` (static keys), `UpdateContactTextToSpeechVoice` (a Polly voice with an optional engine and speaking style, each static or a JSONPath), `UpdateContactData` (name, description, language, customer id, references, the Voice ID settings and the target contact, in the page's string spellings), and `UpdateContactEventHooks` (one event hook to a flow, the first map-valued reference), each as a builder block, a codegen inverter, a catalog entry, FlowDoc 0.2 schema constraints, and an insertable studio block.
