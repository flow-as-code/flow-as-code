[![flow-as-code](https://flow-as-code.dev/logo.png)](https://flow-as-code.dev/)

# @flow-as-code/tf

```
npm i @flow-as-code/tf
```

Apache-2.0, Node 22.12 or newer.

Site and docs: <https://flow-as-code.dev/>. This package on npm:
<https://www.npmjs.com/package/@flow-as-code/tf>.

Implements docs/03-tf-emitter.md. Deterministic HCL emission, `terraform validate`-clean when the address map is complete, loud TODO placeholders when it is not. Never emits literal ARNs, provider blocks, or backend config.

One-way in v1: FlowDoc in, HCL out. Reading HCL back into FlowDoc needs HCL evaluation and is deferred to the provider era.

## Use

```ts
import { emitTf, writeTf } from "@flow-as-code/tf";

const { files } = emitTf([doc], {
  addressMap: { "queue:front-desk": "aws_connect_queue.front_desk.arn" },
});

writeTf([doc], "infra/flows", { addressMap });
```

`emitTf` is pure: documents in, a relative path to content map out, sorted by path and byte-identical across runs. `writeTf` is the filesystem wrapper; it creates directories, overwrites the files it emits, and touches nothing else in the target directory.

`@flow-as-code/tf/emit` is the same emitter without the filesystem half. The package index re-exports `writeTf`, which imports `node:fs`, so a browser bundle (`@flow-as-code/studio`'s Terraform export) imports the subpath instead.

## Output

| File                      | What it holds                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `flows/<name>.flow.tftpl` | Deployable Flow language JSON, each reference replaced by a `templatefile` interpolation                      |
| `flows.tf`                | `aws_connect_contact_flow` / `aws_connect_contact_flow_module`, plus awscc module version and alias resources |
| `flow_refs.tf`            | `locals` holding the terraform address behind every reference                                                 |
| `variables.tf`            | The Connect instance id variable, unless `instanceIdExpression` supplies one                                  |
| `versions.tf.example`     | Required providers and versions, as an example; not loaded by either tool                                     |

Provider configuration, credentials, and backend configuration are yours. The emitter writes none of them, by rule.

## References

Every `${cdref:type:name}` token becomes a template variable named `<type>_<name>_arn`, hyphens as underscores, with a module alias folded in: `queue_front_desk_arn`, `module_survey_prod_arn`. Addresses come from three places, in this order:

1. **The document set itself.** A `${cdref:module:x@prod}` whose module `x` is emitted here resolves to `awscc_connect_contact_flow_module_alias.x_prod.contact_flow_module_alias_arn`; a `${cdref:flow:y}` whose flow `y` is emitted here resolves to that flow. An address map entry for one of these is ignored, and the emitted file says so on the line above.
2. **The address map.** Keys are a token (`${cdref:queue:front-desk}`), the token body (`queue:front-desk`, `module:survey@prod`), or the variable name (`queue_front_desk_arn`). Values are HCL address expressions. A literal ARN is refused, as is anything that would comment out or overrun its line. Entries matching no reference in the set are ignored, so one shared map can serve several flow sets.
3. **Nothing.** The entry becomes `TODO_MISSING_ADDRESS_<type>_<name>` with a `# TODO` naming the reference. That is an undeclared reference, so `terraform validate` and `tofu validate` fail loudly rather than an apply writing a broken flow.

Addresses of resources the set emits itself live in a per-document local (`merge(local.flow_refs, { ... })`) rather than in the shared map. Putting them in the shared map makes the map depend on the resources rendered from it, and both tools report that as a dependency cycle. Two flows that reference each other are still a cycle, because it is one.

## Escaping

The `.tftpl` body is JSON containing caller text, and caller text legitimately contains `${` and `%{`, the two sequences HCL reads as template introducers. Every one of them is escaped (`$${`, `%%{`) and only the emitter's own reference interpolations are left live. The substitution runs through unique sentinels chosen so they cannot collide with the document, so text that looks like a sentinel is caller text and stays caller text. `conformance/emit-tf/hostile-text` holds the fixture, and the gated tests render it with a real `tofu` and compare against a reference implementation of the template grammar.

## Versions and aliases

Flow versioning is not available: `CreateContactFlowVersion` "only supports creating versions for flows of type Campaign" ([API reference](https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateContactFlowVersion.html)). Flows update their content in place. Modules get `awscc_connect_contact_flow_module_version` and `awscc_connect_contact_flow_module_alias`, which is how a caller pins the module content it invokes. A version snapshots content at create time, so a module content change needs the version resource replaced for aliases to serve it.

## Tests

`npm test` runs the goldens in `conformance/emit-tf` and the unit tests. The tests that run a real `tofu init`, `tofu validate`, `tofu fmt`, and `tofu console` need the network and a few minutes on a cold provider cache, so they are gated behind `RUN_TOFU_VALIDATE=1`:

```sh
RUN_TOFU_VALIDATE=1 npx vitest run --project @flow-as-code/tf
```

CI runs them in the `emit-tf` job, and an ungated test asserts that the job still sets the variable. Regenerate goldens deliberately with `UPDATE_GOLDENS=1` and read the diff.
