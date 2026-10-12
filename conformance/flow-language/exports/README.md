# Console exports

Flow language content the console wrote, kept as the evidence for a Type no
AWS page documents (tasks/README.md, Phase D, owner decision 8). A catalog
entry with `source` `console-export` points its `doc` at a file here. Every
account, instance and resource id is replaced by a placeholder or a
JSONPath, as in `probes/`.

| File                                       | Type                              | Provenance |
| ------------------------------------------ | --------------------------------- | ---------- |
| `transfer-participant-to-third-party.json` | `TransferParticipantToThirdParty` | See below. |

`transfer-participant-to-third-party.json` is not a file the console wrote
as it stands. It is the action `conformance/roundtrip/unknown-actions` held
from 2026-09-11 (commit `f2aad9f`, re-authored then "in the shapes the
console's sample flows export") until D09 modeled the Type on 2026-10-12,
with the destination number a JSONPath so that no number is committed, and
with a `DisconnectParticipant` added for its branches to reach. Rule 40 in
`actions.md` called that action the console export and recorded its create
accepted on 2026-10-05; the showcase repository's VERIFY 16.8 recorded the
same shape accepted, and each of its three errors removed alone refused, on
2026-09-30. A verbatim console export of the Transfer to phone number block
(owner decision 8) replaces this file when one is taken, and rule 47 records
any difference.
