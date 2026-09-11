---
"@flow-as-code/core": minor
"@flow-as-code/studio": minor
---

Model the contact-routing actions: `DequeueContactAndTransferToQueue` (queue-to-queue transfer in a customer queue flow) the terminal `TransferContactToAgent`, and `UpdateContactRoutingBehavior` (queue priority or time adjustment; the first modeled action with no error branch, so `error-branches` now reads the catalog's required flags rather than assuming a catch-all), `CreateCallbackContact` (a callback contact with its delays, attempt count, optional queue, creation flow and caller ID), and `UpdateContactCallbackNumber` (a JSONPath number with two named errors and no catch-all, both of which `error-branches` requires), each as a builder block, a codegen inverter, a catalog entry, FlowDoc 0.2 schema constraints, and an insertable studio block with its inspector fields.
