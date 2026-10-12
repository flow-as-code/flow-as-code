---
"@flow-as-code/core": minor
"@flow-as-code/hcl": patch
"@flow-as-code/studio": minor
---

Model the Customer Profiles actions (tasks/D03). `AssociateContactToCustomerProfile` (Associate contact to profile: `profileId` and `contactId`, each static or a JSONPath, with `next` and the catch-all) writes its two ids in `ProfileRequestData` and an empty `ProfileResponseData` list, the shape the console writes. It is unrestricted by flow type and channel. The HCL writer and reader take it as the typed `associate_contact_to_customer_profile` sub-block, which no published flowascode provider accepts until the release that carries it. The service has not yet been asked about these types (rule 43 in `conformance/flow-language/actions.md` is probe pending), so their required keys, branches and spellings are the AWS pages' and published flows' reading.
