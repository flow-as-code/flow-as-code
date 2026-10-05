# C03 Channel-restricted actions: `Wait` and `ShowView` on voice

Phase C, contract. The catalog records where an action may appear by flow
type only. Two modeled actions carry a restriction by channel instead, and
lint says nothing about it:

- `Wait`: "This is supported in every type of flow, but is supported only by
  the chat channel." The catalog records `flowTypes: "unrestricted"`, which is
  right for flow types, so `action-allowed-in-flow-type` passes a `Wait` in a
  voice contact flow or a customer queue flow (actions.md rule 22).
  https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html
- `ShowView`: "This action is only supported on the chat channel." (actions.md
  rule 34).
  https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-showview.html

The showcase's draft put a `Wait` in a voice customer queue flow and it linted
clean. That is how the gap was found; it is not the evidence for the fix.

## Acceptance criteria

- The catalog gains a `channels` field for these two types, sourced from the
  action pages quoted above, with its meaning written where the catalog's
  other fields are described: absent means the page states no channel
  restriction. The in-package copy is refreshed by `npm run sync:schema`, and
  `catalog.test.ts` holds the field to `actions.ts` with a mutation that shows
  the check can fail.
- A lint rule (a new id, or a documented extension of
  `action-allowed-in-flow-type`) reports a channel-restricted action at
  severity `warning`, naming the channels the page allows and the doc URL. It
  is a warning because a contact flow's channel is decided by the contact, not
  by the document: an inbound flow may serve chat only, and FlowDoc does not
  record that. Fixtures under `conformance/lint/<rule-id>/`: a pass case with
  no restricted action, a fail case for each type, and a case in a module.
- Whether a document may declare its channel, so that a chat-only flow stops
  warning, is decided and recorded in this file. If the answer is a FlowDoc
  field, it goes through the format's versioning (`docs/01-flowdoc-spec.md`: a
  schema version and a migration on every read path), not a silent addition.
- The severity is raised to `error` only on the evidence rule's terms: a
  create the service refuses, recorded with its date and message in
  actions.md rule 37. A runtime observation (a voice contact taking the error
  branch in a simulate run) is recorded in rule 22 or 34 with its date, and
  does not by itself make the rule an error.
- The skill reference is regenerated (`node scripts/build-skill-reference.mjs`)
  in the same commit as the catalog change, and `tests/skills.test.ts` is
  green.
- The provider repository re-vendors `conformance/` at the merge commit and
  implements the rule so its conformance run passes identically; the provider
  commit is recorded here.
- The studio shows the warning like any other lint finding; no studio code
  changes unless a test shows otherwise.
- A changeset for `@flow-as-code/core`.

## Assumptions

- The action pages govern over the admin guide, as for the other restrictions
  recorded in actions.md. The admin guide's Wait block lists voice as
  supported "only in Inbound flow when the Keep running while waiting option,
  or the Set event-based wait option is selected", whose flow-language keys
  are undocumented; a `Wait` carrying them round-trips as a GenericBlock and
  is not checked.
- Unmodeled types with channel restrictions (for example
  `CreateWisdomSession`, voice only) are out of scope: their catalog entries
  carry `modeled: false` and nothing else to hang the field on.
