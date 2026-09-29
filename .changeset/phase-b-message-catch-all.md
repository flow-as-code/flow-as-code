---
"@flow-as-code/core": minor
---

`MessageParticipant`'s catch-all is optional. The service accepts the action without `NoMatchingError`, and a full export of an instance's default and sample flows carries 59 messages with no error branch, which `error-branches` reported as errors (2026-09-29; `conformance/flow-language/actions.md`, rule 37). `MessageParticipantConfig.onError` is now optional and wired only when given, and a message without the branch reads back as a typed `MessageParticipant` rather than a GenericBlock, so codegen of console flows writes `new MessageParticipant({ text, next })` where it wrote a GenericBlock. Every other branch the catalog requires was confirmed required the same day, each removed on its own and refused by the service.
