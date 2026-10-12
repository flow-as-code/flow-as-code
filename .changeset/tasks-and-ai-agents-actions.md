---
"@flow-as-code/core": minor
"@flow-as-code/hcl": patch
"@flow-as-code/studio": minor
---

Model the task actions (tasks/D05). `CreateTask` (Create task: `name`, a `flow` reference or JSONPath, a `tasktemplate` reference, or both, `description`, string `attributes`, and `delaySeconds` (1 to 518400, written as a decimal string, or a JSONPath) or a `scheduledTime` JSONPath, never both, with `next` and the catch-all) is unrestricted by flow type and channel; its 0.3 schema clause holds `ContactFlowId` to a token or a JSONPath and `TaskTemplateId` to a token, since the page says the template is static. A `CreateTask` carrying `References`, a static `ScheduledTime` or a numeric `DelaySeconds` stays a generic block until their stored form is recorded. The HCL writer and reader take it as the typed `create_task` sub-block, which no published flowascode provider accepts until the release that carries it. The `unknown-actions` passthrough fixture holds `StartOutboundChatContact` and `UpdateCustomerProfile` in place of `CreateTask`, carrying its flow and queue tokens. The service has not yet been asked about these types (rule 42 in `conformance/flow-language/actions.md` is probe pending), so their required keys, branches and spellings are the AWS pages' reading.
