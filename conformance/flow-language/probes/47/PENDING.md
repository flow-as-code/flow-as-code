# Rule 47: not run yet

These are the inputs for the census additions sweep (tasks/D09). They were
written on 2026-10-12 and have not been put to the service: the sandbox's
AWS credentials had expired. Until the run, every error branch,
`NextAction`, flow type and spelling rule 47 records for the types below is
the reading of the page or the console export it was modeled from, not the
service's.

## What the instance needs

- `load-*`: nothing beyond the instance. The admin guide's Get stored
  content page says to enable email "before using this option"; rule 40's
  create of the type was accepted on an instance whose email setting was
  not recorded, so if a `load-*` probe is refused with a message naming
  email, rerun it on an instance with email enabled and record both runs.
- `third-*`: nothing beyond the instance. A create dials no number, so no
  claimed number and no outbound calling allowance is needed. The one
  static number, in `third-static-number`, is `+15555550100`, in the range
  reserved for fiction.
- `route-keys`: a customer queue flow; nothing else is known to be needed.
  The Interrupt agent page names no prerequisite. Run it on the sandbox
  (us-west-2), not the us-east-1 development instance rule 40 used.
- `segment-keys` and `authenticate-nested-keys`: a Customer Profiles domain
  on the instance (tasks/D03's, owner decision 7). The Authenticate
  Customer page also asks for the customer authentication capability and a
  Cognito user pool; a create may not check either, and a refusal naming
  one is recorded as such.
- `dtmf-buffer-*`: nothing, except `dtmf-buffer-stop-store-encrypted`,
  which needs an encryption key id and a key the instance accepts for
  `InputEncryption`, as the Store customer input block's encryption does.

## Placeholders

The run fills `{{ACCOUNT}}`, `{{REGION}}` and `{{INSTANCE}}` as the README
says. Only `dtmf-buffer-stop-store-encrypted` needs more:

| Placeholder             | Filled from                | What it names                                       |
| ----------------------- | -------------------------- | --------------------------------------------------- |
| `{{ENCRYPTION_KEY_ID}}` | `PROBE_ENCRYPTION_KEY_ID`  | the key id the instance's input encryption uses     |
| `{{ENCRYPTION_KEY}}`    | `PROBE_ENCRYPTION_KEY`     | the public key (certificate) that encrypts the input |

## Reading results that depend on another

- `load-required-set-alone` sends `Parameters` empty, as rule 40's run did,
  and `load-required` the page's `ContentType`. If the first is refused
  naming `ContentType`, the catalog marks it required and rule 40's reading
  of its own run is corrected beside it.
- `load-content-type-unknown` and `load-content-type-jsonpath` say whether
  the 0.3 schema clause, which holds `ContentType` to `EmailMessage`, is
  what the service enforces (owner decision 3). If either is accepted, the
  clause loosens to what was accepted.
- `third-required-set-alone` sends `ContinueFlowExecution` `"False"` with
  the catch-all alone, the form the catalog requires least of, and
  `third-required` the kept export's `"True"` form with all three
  branches. `third-end-all-branches`, `third-end-no-catch-all` and
  `third-end-no-next` read only against an accepted
  `third-required-set-alone`: if that is refused naming `CallFailed` or
  `ConnectionTimeLimitExceeded`, both are required in either form, the
  catalog's shape loses its condition, and the builder's `"False"` form
  writes them too.
- `third-continue-no-call-failed`, `third-continue-no-timeout` and
  `third-continue-no-catch-all` repeat the showcase's VERIFY 16.8 removals
  of 2026-09-30, recorded in that repository and not here; a different
  result here is recorded beside that one, not over it.
- `third-static-number` settles whether the builder may take a static
  destination (tasks/D09). `third-continue-lowercase` and
  `third-time-limit-number` say whether the schema clause's spellings are
  the service's; `third-time-limit-zero`, `third-time-limit-600` and
  `third-time-limit-jsonpath` look for a bound and a dynamic form the
  export does not show.

- `route-keys`, `segment-keys` and `authenticate-nested-keys` model
  nothing. Each is expected to be refused, and what matters is the
  message: a refusal naming a parameter shows the Type exists on that
  instance and names a key, which rule 47 records; the types stay generic
  until a console export shows their shapes (owner decision 8).
- `dtmf-buffer-enable` is the control for the other buffer probes. If it
  is refused naming `InputTimeLimitSeconds` or `StoreInput`, the buffer
  form shares the menu form's requirements, and the catalog's shapes need
  no new form for it.

When the set has run, its `results.json` replaces this file, rule 47 records
what the service said, and the catalog changes only where a result says so.
