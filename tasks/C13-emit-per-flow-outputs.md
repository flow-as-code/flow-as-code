# C13 Emit: per-flow outputs for a promotion gate

Phase C, emitters. A pipeline that promotes a flow set from one environment to
the next wants to compare what each environment is running, flow by flow,
without reading state files: "is prod running the document qa passed?". The
flowascode provider computes a `document_sha256` for each flow and module, and
each resource has an `arn`, but the emitter writes no outputs, so every root
that wants them writes its own, by hand, and has to change when a flow is
added or renamed. The showcase's promotion gate is deferred on this.

## Acceptance criteria

- `flow-cli emit --target flowascode` writes, beside `flows.tf`, an
  `outputs.tf` (or an opt-in flag for it; the choice and its reason recorded
  here) with one output per flow and module: its `document_sha256` and its
  `arn`, keyed by FlowDoc name so the output names do not change when a
  resource address does.
- The flat Terraform target either writes the equivalent from the attributes
  it has, or this file records why it does not.
- `examples/terraform-provider/` uses the outputs in its pipeline in place of
  anything hand-written, and `tests/terraformProviderExample.test.ts` holds it.
- The emit-tf lane validates the new file against the published provider.
- `conformance/hcl/` gains the file in its goldens; the provider re-vendors
  and passes, with its commit recorded here.
- A changeset for `@flow-as-code/hcl` and `@flow-as-code/cli`.

## Record (2026-10-05)

Done on branch `feat/c13-emit-per-flow-outputs`, stacked on C12. The
decisions, and the reason for each:

- **`outputs.tf` is written by default**, beside `flows.tf`, not behind a
  flag: `variables.tf` is written by default on the same reasoning (the
  files a root needs, ready to apply), and a consumer that wants only
  `flows.tf` copies only `flows.tf`, as the showcase's `scripts/emit.mjs`
  does. The CLI's flags are unchanged. The studio's "Terraform (flowascode
  provider)" export carries the file too, since it takes the emitter's
  bytes.
- **Two outputs per document, named by FlowDoc name:** `<name>_arn` (the
  resource's `arn`) and `<name>_document_sha256` (`sha256()` of the
  resource's `flowdoc`). The provider has no `document_sha256` attribute;
  `flowdoc` is the document with its references still tokens, so its hash is
  equal across environments that apply the same document and is known at
  plan time, which is what the example's hand-written output already used
  (`content_hash` hashes the content Connect holds, with each environment's
  ARNs in it). The names carry no `flow_`/`module_` prefix: they are the
  names the tutorials, the pipeline and the skill already read
  (`appointment_line_document_sha256`), and the identifier is the document's
  name, not its resource address, so a resource that moves keeps its
  outputs. A flow and a module sharing a name would share both outputs and
  the set is refused, naming the output (the same shape as the alias-label
  refusal); nothing else can collide, since a slug maps to one identifier.
  Rule 29 in `conformance/hcl/README.md`.
- **The flat Terraform target writes no `outputs.tf`.** `hashicorp/aws` has
  no attribute holding the document, only the rendered content with each
  environment's ARNs in it; the hash it could offer is of the emitted
  template file, emitter output rather than the document, and it would not
  match the flowascode target's for the same FlowDoc. A flat-target pipeline
  has the emitted files in version control to compare. docs/03 says so.
  Revisit if a flat-target user asks for the ARN outputs alone.
- **The example uses the emitter's file.** `examples/terraform-provider/
flows/outputs.tf` is now the emitter's output for the flow, byte for byte,
  held by `tests/terraformProviderExample.test.ts` beside the companion
  check; the pipeline and both environment roots read
  `appointment_line_document_sha256` as before, now from an emitted output.
  Tutorial 02 says where the file comes from.
- **The emit-tf lane validates the file**: `packages/hcl/src/validate.test.ts`
  materializes every `.tf` the emitter returns for each emit case with the
  case's stubs, so `outputs.tf` is initialized and validated against the
  published provider on OpenTofu 1.10 and current, and the example's lane
  validates the example's copy in the flows module.
- **Pending, the Phase C release batch:** the provider re-vendors
  `conformance/` (its runner reads `expected/flows.tf` only, so the new
  golden changes nothing it checks) and its commit is recorded here.

Changeset: `.changeset/emit-per-flow-outputs.md` (`@flow-as-code/hcl` and
`@flow-as-code/cli` minor).
