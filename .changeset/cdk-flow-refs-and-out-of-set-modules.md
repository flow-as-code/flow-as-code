---
"@flow-as-code/cdk": minor
---

`FlowSet` resolves a `${cdref:flow:name}` whose flow is in the set to that flow's ARN, with a dependency, as it already did for a module's alias; the binder's `flow()` is only called for a flow outside the set. Documents are created in one dependency order over flows and modules, and a flow reference cycle fails at synth naming the cycle. `TokenBinder` gains an optional `module(name, alias)` for a module outside the set, bound per environment, instead of `FlowSet` refusing the reference; without it synth fails naming the token and both remedies. The scaffold writes `flow`, `module` and `view` methods only for names the set does not hold.
