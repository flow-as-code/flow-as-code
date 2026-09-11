---
"@flow-as-code/core": minor
"@flow-as-code/studio": minor
---

Model the participant actions: `MessageParticipantIteratively` (a loop of text, SSML, prompt or S3 audio messages, with an optional interrupt every so many seconds and an optional catch-all, holding the participant with no next action as the console's hold flows do), each as a builder block, a codegen inverter, a catalog entry, FlowDoc 0.2 schema constraints, and an insertable studio block. The catalog gained `waits`, and `terminal-blocks` accepts an action that holds the participant with nothing wired as an end, so the console's own hold and queue flows lint clean.
