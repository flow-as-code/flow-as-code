---
"@flow-as-code/core": patch
---

The action catalog gains a fifth category, `other`, for the Types no Developer Guide category page lists, and a `source` field saying where each such Type is documented (`adminguide` or `console-export`; absent means the Developer Guide). Five unmodeled entries are added: `RouteContactToAgent`, `LoadContactContent`, `AuthenticateParticipant`, `CheckSegmentMembership` and `TransferParticipantToThirdParty`. Nothing changes for documents: they still parse as generic blocks. `ActionCategory` and the new `CatalogSource` type are exported from `@flow-as-code/core`.
