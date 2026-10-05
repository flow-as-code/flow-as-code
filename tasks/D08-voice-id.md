# D08 Voice ID: `CheckVoiceId`, `StartVoiceIdStream` (gated)

Phase D, engine. Gated on D01 and on a probe. Amazon Connect Voice ID stopped
accepting new customers on 2025-05-20, and "After May 20, 2026, you will no
longer be able to use Amazon Connect Customer Voice ID"
(https://docs.aws.amazon.com/connect/latest/adminguide/amazonconnect-voiceid-end-of-support.html;
actions.md rule 30). The action pages still exist, so the service may still
accept a flow containing them; nobody has checked. Under owner decision 2
this task first learns which.

## Types

Devguide pages fetched 2026-10-04.

| Type                 | Parameters                                                                        | Conditions                                                                                                                                                          | Errors (page)                                 | Restrictions (page)                     | Size     |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------- | -------- |
| `StartVoiceIdStream` | none                                                                              | none                                                                                                                                                                | `NoMatchingError` ("if no condition matches") | voice only; not hold flows              | S, gated |
| `CheckVoiceId`       | `CheckVoiceIdOption`: `enrollmentStatus`, `voiceAuthentication`, `fraudDetection` | operands depend on the option (Enrolled, Not enrolled, Opted out, Authenticated, Not authenticated, Inconclusive, High risk, Low risk); wire spellings undocumented | `NoMatchingError`                             | voice only (otherwise the Error branch) | M, gated |

Pages:
https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkvoiceid.html,
https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-startvoiceidstream.html.

## Acceptance criteria

- The probe runs first and its result is recorded as a numbered rule:
  `StartVoiceIdStream` alone, and `CheckVoiceId` with each option, created on
  the sandbox (which has never had Voice ID), with the date and message.
- If every create is refused: actions.md records the refusal and the end of
  support, the catalog entries stay `modeled: false` with `channels` and the
  refusal noted, the census (D00) lists both outside the denominator with
  that reason, and the task closes. Nothing else changes.
- If creates are accepted: both types are modeled per tasks/README.md, "The
  per-type checklist", with conditions per option as a `shapes` form, the
  operand spellings taken from what the service accepts (each candidate
  spelling probed, since no export exists), and actions.md marking both
  "deployable; not exercisable: the service ended on 2026-05-20". The studio
  palette labels them as ended.
- Either way, `UpdateContactData`'s Voice ID fields (modeled since B01g) get
  the same note in actions.md, and rule 37's record that they were refused on
  an instance without Voice ID is cross-referenced.

## Evidence

The probe above, with inputs kept. If accepted, the full sweep per
tasks/README.md, "The evidence rule for this phase", and every operand
spelling candidate for each option.

## Sandbox prerequisites and cost

None can be met: a Voice ID domain (`awscc_voiceid_domain`, with a KMS key)
cannot be used after 2026-05-20, and the account was not a Voice ID customer
before 2025-05-20 as far as anyone has recorded (unconfirmed: the session was
expired on 2026-10-04). The probe runs on the sandbox as it is. Cost: none.

## Both repositories

- [ ] The probe rule and inputs, whichever way it goes.
- [ ] If modeled: flow-as-code checklist lines 1 to 10, per type; provider
      lines 11 to 14; the provider commit recorded here.
- [ ] If not: the catalog note, D00's census and the skill reference
      regenerated; provider re-vendor only if `conformance/` changed.
