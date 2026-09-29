---
"@flow-as-code/core": minor
"@flow-as-code/studio": minor
---

Model the contact-data actions: `TagContact` (up to six user-defined tags, with the catch-all the service requires although the page lists none), `UntagContact` (static keys; the service's spelling, the page's `UnTagContact` being refused on the wire), `UpdateContactTextToSpeechVoice` (a Polly voice with an optional engine in the console's capitalised spelling and an optional speaking style, each static or a JSONPath, and an optional catch-all), `UpdateContactData` (name, description, language, customer id, references, the Voice ID settings and an optional target contact, in the page's string spellings), and `UpdateContactEventHooks` (one event hook to a flow, the first map-valued reference), each as a builder block, a codegen inverter, a catalog entry, FlowDoc 0.2 schema constraints, and an insertable studio block.
