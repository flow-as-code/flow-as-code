# @flow-as-code/tf: Terraform/OpenTofu emitter

One-way in v1: FlowDoc in, HCL out. Reverse (HCL to FlowDoc) is deferred; it requires HCL evaluation and is a later provider-era feature.

`examples/promote-across-environments/` is this emitter run twice over one document with two address maps, which is what the per-environment story looks like end to end.

## Output shape (per flow set)

- `flows/<name>.flow.tftpl`: the materializable content with each `${cdref:type:name}` rewritten as a templatefile variable `${queue_front_desk_arn}`.
- `flows.tf`: `aws_connect_contact_flow` / `aws_connect_contact_flow_module` resources with `content = templatefile("${path.module}/flows/<name>.flow.tftpl", local.flow_refs)`. Corrected 2026-08-31: the path must be `${path.module}`-relative or the output breaks the moment it is consumed as a Terraform module, since `templatefile` resolves a bare relative path against the calling module's directory.
- `flow_refs.tf`: a `locals { flow_refs = { queue_front_desk_arn = aws_connect_queue.front_desk.arn, ... } }` scaffold. Emitter fills entries it can infer from a provided address map (`--address-map refs.tfmap.json`, mapping ref name to terraform address); everything else is emitted with a `# TODO` and a placeholder so `terraform validate` fails loudly rather than applying garbage.
- Module versions/aliases: emit `awscc_connect_contact_flow_module_version` and `awscc_connect_contact_flow_module_alias` resources (hashicorp/awscc v1.74.0+, 2026-03-04) with a comment noting full-flow versioning is Campaign-only per current AWS docs.
- `variables.tf`: one `connect_instance_id` variable the resources reference, emitted unless `instanceIdExpression` supplies the instance from an address you already manage (`conformance/emit-tf/hostile-text` covers the omission).
- Provider blocks are NOT emitted; the user owns providers/backends. `versions.tf.example` documents the required providers (aws >= 5.0; awscc >= 1.74 only when the set contains a module, since only the module version and alias resources need it) and the `>= 1.7.0` core constraint; the `.example` suffix keeps it out of `terraform init`, and the header says to copy what is needed.

## Rules

- Deterministic file output; stable variable naming (`<type>_<name-with-underscores>_arn`).
- Never emit a literal ARN. Never emit provider credentials or backend config.
- OpenTofu and Terraform parity: emit nothing Terraform 1.8+/OpenTofu 1.7+ do not both support. The OpenTofu end of that promise is one constant, `CORE_VERSION_FLOOR` in `packages/tf/src/emit.ts`: it is what every `versions.tf.example` declares as `required_version`, and CI's emit-tf job runs the gated suite against it and against a current release, asserted by an ungated test so the matrix cannot stop covering the floor.

## Corrections found by running the emitter (2026-08-31)

A single shared `local.flow_refs` does not survive a set that emits a module another document in the set invokes. The module alias address lives in the map, and the resources rendered from the map depend on it, so both Terraform and OpenTofu reject the cycle:

```
Error: Cycle: awscc_connect_contact_flow_module_version..., local.flow_refs (expand), ...
```

Addresses that point at resources the emitter itself renders are therefore emitted per document, as `merge(local.flow_refs, { ... })`, and only user-supplied addresses live in the shared local. `local.flow_refs` remains the scaffold the user edits.

Terraform identifiers may not begin with a digit, but FlowDoc names may (`SLUG_PATTERN` permits it). A name like `2fa-line` produced `resource "aws_connect_contact_flow" "2fa_line"`, which OpenTofu rejects with "Invalid resource name". Such names are prefixed with an underscore. Collision-free, because no slug contains one.

## How the gated tests check a template render (2026-09-04)

The reference-implementation check used to drive `tofu console` through a pipe. On the first CI run that ever reached it, every call hung for its full timeout. `opentofu/setup-opentofu@v1` installs a wrapper by default (input `tofu_wrapper`, default true) that runs the binary through `@actions/exec` without passing `options.input`, so the child's stdin is a pipe nothing ever writes to or closes; the console evaluates a piped script only at EOF, and EOF never arrived. The version was not the variable: with that stdio the console hangs on OpenTofu 1.7.0 and 1.12.6 alike, and with a pipe that closes both answer in about 30ms.

`tofuEvaluateString` in `packages/tf/src/__fixtures__/tofu.ts` replaces it. It writes the expression into an `output` block, runs `tofu apply -auto-approve -input=false` (the directory has no providers, so the apply is offline, needs no credentials, and writes local state into a temp dir) and reads the value back with `tofu output -raw`. No REPL, nothing reading stdin, identical on both versions. The value still crosses the CLI boundary base64-encoded: that is what makes it byte-exact for awkward content, which `conformance/emit-tf/hostile-text` exists to prove.
