---
"@flow-as-code/core": minor
"@flow-as-code/hcl": patch
"@flow-as-code/studio": patch
"@flow-as-code/cli": patch
---

`GetParticipantInput` models the stored-input form: `store: { maxLength }` or `store: { phoneNumber: { format, countryCode? } }` in place of `branches`, with `next` as the success path, `onError` as the catch-all and, on a phone number, a required `onInvalidNumber`. The block writes what the console does (`StoreInput: "True"`, `InputValidation`, no conditions; `MaximumLength` as a decimal string, the spelling of the service's own sample secure input flows, read on 2026-10-05; `conformance/flow-language/actions.md`, rule 39), and codegen reads a document in that exact shape back as the typed class; a block carrying `Media`, `InputEncryption` or `DTMFConfiguration` stays a `GenericBlock`. The catalog records `MaximumLength` as `integerString` (it said `integer`), so the HCL reader now yields the string the service holds for `maximum_length = 8` and the writer accepts the console's spelling; `InvalidPhoneNumber` is a builder branch, listed before the catch-all. New fixtures `roundtrip/stored-input` and `hcl/roundtrip/stored-input`. In the studio a stored-input block is typed, its error handle offers the catch-all (and `InvalidPhoneNumber` on a phone number), and the inspector edits its body and timeout; its validation is not editable there yet.
