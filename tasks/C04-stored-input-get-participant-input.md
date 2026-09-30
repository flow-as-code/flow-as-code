# C04 Stored-input `GetParticipantInput` in the typed builder

Phase C, engine. `GetParticipantInput` has two forms (actions.md, and the
comment on `GetParticipantInputConfig` in `packages/core/src/blocks.ts`). The
builder writes only the menu form: `parameters()` always sets
`StoreInput: "False"`, and codegen's inverter returns `undefined` for any other
value (`packages/core/src/codegen.ts`). So a stored-input block, which collects
digits such as a callback number or an account number, is a GenericBlock in
every `.flow.ts`. The catalog and the HCL view already type it; the TypeScript
view is the one that does not.

With `StoreInput: "True"` the page says the digits are stored,
`InputValidation` is required, and there are no conditions.
https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html

## Acceptance criteria

- A typed builder form for stored input, as a new class or a discriminated
  config on `GetParticipantInput` (the choice and its reason recorded here),
  whose output is byte-identical to what the console writes for the same
  block. It models the parameters the action page documents for the stored
  form: the prompt (`Text`, `SSML` or `PromptId`), `InputTimeLimitSeconds`,
  `StoreInput`, and `InputValidation` with its phone-number and custom-digit
  variants. Anything carrying `Media`, `InputEncryption` or
  `DTMFConfiguration` still parses to a GenericBlock and round-trips verbatim.
- Its error branches are the ones the catalog records for the stored form,
  and the constructor refuses a config that omits a required one. If the
  catalog is missing a fact the builder needs about the stored form, the fact
  is added on the evidence rule's terms (a create refused or accepted, dated,
  in actions.md rule 37) before the builder relies on it.
- Codegen inverts the stored form to the new call, verified by constructing
  the block and comparing bytes as for every modeled type; a document the
  constructor would refuse stays generic.
- Fixtures: a `conformance/roundtrip/` case with each `InputValidation`
  variant, so `synth(codegen(doc))` equals the document and a second codegen
  pass is byte-stable; codegen goldens updated; the existing menu-form
  fixtures unchanged byte for byte.
- `conditional-shape` and `error-branches` behave as before on both forms;
  their fixtures pass unchanged.
- The studio's inspector and palette offer the stored form wherever they
  offer per-type fields for the menu form, with a test; if they do not, that
  is recorded here.
- If `conformance/` changed, the provider re-vendors it and its oracles are
  re-recorded; the provider commit is recorded here. If the catalog changed,
  the skill reference is regenerated in the same commit.
- A changeset for `@flow-as-code/core` and for any package whose output moved.
