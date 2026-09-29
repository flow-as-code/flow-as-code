---
"@flow-as-code/core": minor
---

A twelfth lint rule, `conditional-shape`, and a catalog field it reads, `shapes`: the parameters, error branches and conditions an action must or must not carry given another parameter's static value. `GetParticipantInput` is the first: `StoreInput` `"True"` needs `InputValidation` and takes no conditions and no `NoMatchingCondition` or `InputTimeLimitExceeded` branch, and otherwise the `InputTimeLimitExceeded` branch is required and `InputValidation` and `InvalidPhoneNumber` are not allowed. A document the service would refuse at create now fails lint instead.
