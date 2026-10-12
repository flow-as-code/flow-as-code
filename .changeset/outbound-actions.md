---
"@flow-as-code/core": minor
"@flow-as-code/hcl": patch
"@flow-as-code/studio": minor
---

Model the outbound actions (tasks/D04). `CheckOutboundCallStatus` (Check call progress) takes `onStatus`, one path for each of `CallAnswered`, `VoicemailBeep`, `VoicemailNoBeep` and `NotDetected` it branches on, written as Equals conditions in that order, and the catch-all, which its NextAction mirrors. It has no parameters, is unrestricted by flow type, and is restricted to the voice channel (the admin guide's block). The HCL writer and reader take it as the typed `check_outbound_call_status` sub-block, which no published flowascode provider accepts until the release that carries it. The service has not yet been asked about these types (rule 46 in `conformance/flow-language/actions.md` is probe pending), so their required keys, branches and flow types are the AWS pages' reading. They are deployable at most: a live contact needs outbound campaigns or SMS messaging, neither of which the project's sandbox enables.
