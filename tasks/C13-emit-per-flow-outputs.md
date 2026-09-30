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
