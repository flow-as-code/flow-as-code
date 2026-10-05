# D08 Voice ID: `CheckVoiceId`, `StartVoiceIdStream` (gated)

Phase D, engine. Gated on D01 and on a probe. Amazon Connect Voice ID stopped
accepting new customers on 2025-05-20, and "After May 20, 2026, you will no
longer be able to use Amazon Connect Customer Voice ID"
(https://docs.aws.amazon.com/connect/latest/adminguide/amazonconnect-voiceid-end-of-support.html).
actions.md rule 30 records the same end date from a different page's
sentence ("you will no longer be able to access Voice ID on the Amazon
Connect Customer console", set-voice-id.html). The action pages still
exist, so the service may still
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
  refusal noted, the census (D00) counts both in the denominator as "not
  modeled: refused <date> <message>" (owner decision 2 as reworded
  2026-10-05; the definition of done's first bullet), and the task closes.
  Nothing else changes.
- If creates are accepted: both types are modeled per tasks/README.md, "The
  per-type checklist", with conditions per option as a `shapes` form, the
  operand spellings taken from what the service accepts (each candidate
  spelling probed, since no export exists), and actions.md marking both
  "deployable; not exercisable: the service ended on 2026-05-20". The studio
  palette labels them as ended.
- The two branches above are read per type (2026-10-05, from the record
  below): one type was accepted and the other refused in every shape tried,
  so `StartVoiceIdStream` takes the accepted branch and `CheckVoiceId` the
  refused one.
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

## Record (2026-10-05)

The probe ran on 2026-10-05, 16:49 to 16:51 UTC, in us-east-1, by hand with
the AWS CLI before `scripts/probe-create.mjs` existed, on the showcase's
TypeScript-first dev instance rather than the sandbox this task names;
neither has a Voice ID domain, and none can be created since 2026-05-20, so
the difference does not bear on the reading. Every probe was a `CONTACT_FLOW`
named `hh-probe-voiceid-*`, deleted at once; a `ListContactFlows` after the
run found none left (no describe call was made, which the runner now does).
The inputs and `results.json` are under
`conformance/flow-language/probes/d08-voice-id/`, the first set under the
convention of tasks/README.md, "The evidence rule for this phase"; they carry
no ids, so nothing was replaced. The directory takes the rule's number when
this task writes it.

- `StartVoiceIdStream` with `Parameters` `{}`, a `NextAction` and
  `NoMatchingError`: accepted, 16:49:50Z. The service still accepts the Type
  at create after the end of support.
- `CheckVoiceId` with `CheckVoiceIdOption` `enrollmentStatus`: refused in
  every shape tried, each `InvalidContactFlowException`.
  - One `Equals` `Enrolled` condition with `NoMatchingError` and
    `NoMatchingCondition`: "Invalid Action error. Error: NoMatchingCondition,
    Path: Actions[0]" and "Invalid Action property value. Path:
    Actions[0].Transitions.Conditions", 16:49:54Z. `NoMatchingCondition` is
    not a branch the Type takes.
  - With `NoMatchingError` only: `Conditions` empty (16:50:14Z), one `Equals`
    `Enrolled` (16:50:16Z), `ENROLLED` (16:50:18Z), the page's three operands
    `Enrolled`, `Not enrolled`, `Opted out` (16:50:44Z) and `ENROLLED`,
    `NOT_ENROLLED`, `OPTED_OUT` (16:50:46Z): each "Invalid Action property
    value. Path: Actions[0].Transitions.Conditions".

Reading. The refusal names the `Conditions` path, not the Type, so an instance
without Voice ID knows the Type (rule 37's `UpdateContactData` precedent came
back "Invalid Action type", a different message); the service validates
`Conditions` against a shape or an operand set the page does not spell, and
the empty list is refused too, so some condition is required. No tried
spelling hit it, and no export can show it: the console cannot build the
block without a Voice ID domain, and a domain cannot be created. Whether a
domain would change what the service accepts cannot be learned either.

What it means for this task. `StartVoiceIdStream` is modeled on this evidence
per the checklist, deployable and not exercisable, after its own sweep with
the runner (the required set alone was accepted; `NoMatchingError` removed
alone and the Type without `NextAction` were not probed, and the voice-only
and not-in-hold-flows restrictions were not put to the service). `CheckVoiceId`
stays `modeled: false`, counted in D00's census as "not modeled: refused
2026-10-05, Invalid Action property value. Path:
Actions[0].Transitions.Conditions", with `channels` recorded and the refusal
noted in the catalog, unless an older export surfaces with the shape.
