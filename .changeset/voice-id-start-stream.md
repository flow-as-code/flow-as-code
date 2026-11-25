---
"@flow-as-code/core": minor
"@flow-as-code/studio": minor
---

Model `StartVoiceIdStream` (the Set Voice ID block's streaming action, tasks/D08): a new `StartVoiceIdStream` block with `next` and the catch-all and no parameters, read back by codegen, typed in HCL as `start_voice_id_stream {}`, and in the studio's palette labeled "(ended)". Voice ID ended on 2026-05-20, but the service still accepts the action at create (rule 48 in `conformance/flow-language/actions.md`), so the block is deployable and not exercisable. Lint reports it outside the voice channel and in a hold flow, and the 0.3 schema refuses any parameter on it, as the service does. `CheckVoiceId` stays generic: the service refuses it in every shape tried.
