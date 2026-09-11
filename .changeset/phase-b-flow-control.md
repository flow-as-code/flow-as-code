---
"@flow-as-code/core": minor
"@flow-as-code/studio": minor
---

Model the flow-control actions: `Loop` (a 0 to 100 count, static or a single JSONPath, with its two fixed conditions and NextAction mirroring the done path) `Wait` (a timeout, static or a JSONPath, the events that may interrupt it, one condition per event, and `ParticipantNotFound` exactly when a bot participant is waited for), and `DistributeByPercentage` (branches as percentages, written as the console's chain of NumberLessThan thresholds), each as a builder block, a codegen inverter, a catalog entry, FlowDoc 0.2 schema constraints, and an insertable studio block. The catalog gained a `dynamic` marker for parameters whose page also accepts a JSONPath. In the studio, a block with fixed conditions (`CheckHoursOfOperation`, `Loop`) now gets them from drags on its primary handle, one operand at a time, and NextAction mirroring follows the catalog for every type that mirrors an error or a condition, so retargeting a `CheckHoursOfOperation`'s out-of-hours branch carries NextAction along instead of being refused.
