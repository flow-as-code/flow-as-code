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

## Record (2026-10-05)

Done on branch `feat/c04-stored-input-get-participant-input`. Every
criterion that lives in this repository is met; the provider re-vendor is
pending (below).

- The form is a discriminated config on the one `GetParticipantInput` class,
  not a second class: `store` in place of `branches`. A block maps one-to-one
  onto an Action (blocks.ts, first comment), and the console, the catalog and
  the HCL view each have one `GetParticipantInput`, so the TypeScript view has
  one too, with the two shapes told apart where they differ, the config
  object, as `UpdateContactTargetQueue` tells a queue from an agent. The
  menu-form config is unchanged, so existing `.flow.ts` sources compile and
  generate byte-identically.
- The API, written for a collect-address module that keeps a postcode or a
  house number and retries through a `Loop`:

  ```ts
  new GetParticipantInput({
    id: "ask-postcode",
    text: "Enter the five digit postcode, then press pound.",
    timeoutSeconds: 10,
    store: { maxLength: 5 },
    next: "lookup-district",
    onError: "bye",
  });
  new GetParticipantInput({
    id: "ask-callback",
    prompt: Refs.prompt("callback-number"),
    timeoutSeconds: 15,
    store: { phoneNumber: { format: "Local", countryCode: "US" } },
    next: "set-callback",
    onInvalidNumber: "bad-number",
    onError: "bye",
  });
  ```

  The digits land in `$.StoredCustomerInput`. `maxLength` is a positive
  integer; `format` is `"Local"` or `"E164"`; `countryCode` is two upper-case
  letters and required with `"Local"` (the page). The constructor refuses
  anything else, a `store` with both or neither validation, a menu property
  on the stored form, and a phone number without `onInvalidNumber`.

- Evidence added (actions.md, rule 39): a read-only `DescribeContactFlow` of
  the two "Sample secure input" flows on the sandbox instance (us-west-2)
  shows the service holding `"MaximumLength": "20"`, a decimal string, with
  `NextAction` as the success path, `NoMatchingError` as the only branch and
  `Conditions` empty. The catalog had `MaximumLength` as `integer` from the
  page's "A number"; it is `integerString` now, as `InputTimeLimitSeconds`
  is, and the builder writes the string. No sample flow carries a
  `PhoneNumberValidation`, so the position of `InvalidPhoneNumber` against
  the catch-all is the console's catch-all-last convention
  (`TransferContactToQueue`), not an observed order; a console export with
  the other order would stay a GenericBlock, losslessly. The catalog lists
  `InvalidPhoneNumber` as a builder branch now, before the catch-all, and
  `builderErrorsFor(action)` (catalog.ts) narrows the union to the form an
  action is in; the studio wires from it.
- The stored form requires `onInvalidNumber` with a phone number as the menu
  form requires its three: every branch a form documents is required config
  (docs/adr/0002). Whether the service refuses a phone validation without the
  branch was not probed (the page says the branch "must be defined only if",
  not "must be defined if"); the catalog keeps `required: false` on it.
- Codegen inverts the stored form only in the exact shape the class writes,
  verified by construction as for every type. Fallbacks tested: `Media`,
  `InputEncryption`, `DTMFConfiguration`, a missing `InputValidation`, both
  or neither validation, an unknown key, a `MaximumLength` that is a number,
  `"05"`, `"0"`, `"5.0"`, empty or a JSONPath, an unknown `NumberFormat`, a
  `Local` number without `CountryCode` or with one that is not two upper-case
  letters, a condition, a menu-form branch, a missing or extra error, the
  errors out of order, `InvalidPhoneNumber` on a length validation, and no
  `NextAction`.
- Fixtures: `conformance/roundtrip/stored-input` (a length, a local phone
  number with its country code and `InvalidPhoneNumber` branch, an E.164
  number; Text, PromptId and SSML bodies) and `conformance/hcl/roundtrip/stored-input`
  (the golden, bindings and validate stubs; `tofu validate` passes against
  provider 0.1.1, whose `maximum_length` number attribute the golden's `= 5`
  satisfies). `dtmf-menu`, `repeated-key` and every `conditional-shape` and
  `error-branches` fixture are unchanged byte for byte and pass. No codegen
  golden file changed; the menu form's generated source is identical.
- Studio: a stored-input block in the class's shape is typed (no demotion
  marker), the inspector edits its body and timeout as it does the menu's,
  its primary drag means the next action and its error drag the catch-all
  (then `InvalidPhoneNumber` on a phone number, wired before the catch-all).
  Not offered: editing the validation itself (maximum length, phone format,
  country), and a palette insert of the stored form; the palette's
  `GetParticipantInput` is the menu form, and a stored block is authored in
  the `.flow.ts` or `.flow.tf`. Recorded here as the criterion allows.
- The skill reference is regenerated in the same commit as the catalog.
- Changeset: `.changeset/stored-input-get-participant-input.md` (core minor;
  hcl, studio and cli patch, since the HCL reader's value for
  `maximum_length` and the studio's gestures moved).
- Pending, next batch: `conformance/` changed (the catalog's `MaximumLength`
  kind and `InvalidPhoneNumber` flag and order, two new fixtures), so the
  provider re-vendors it (`scripts/sync-conformance.sh`), re-records its
  oracles, and reads `maximum_length` by the new kind. Its commit is to be
  recorded here when it lands.
