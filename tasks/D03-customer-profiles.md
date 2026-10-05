# D03 Customer Profiles: six types

Phase D, engine. Gated on D01 (map key patterns and group alternatives are
its vocabulary) and on a Customer Profiles domain linked to the sandbox
instance. No new ref type: the domain is the instance's integration, not a
parameter.

## Types

Devguide pages fetched 2026-10-04, interactions category
(https://docs.aws.amazon.com/connect/latest/devguide/interactions.html).

| Type                                        | Parameters                                                                                                                                                                                           | Errors (page)                                             | Open question                                                          | Size   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| `AssociateContactToCustomerProfile`         | `ProfileRequestData` {`ProfileId`, `ContactId`} (both required), `ProfileResponseData` {}                                                                                                            | `NoMatchingError`                                         | none                                                                   | S      |
| `CreateCustomerProfile`                     | `ProfileRequestData`: about 55 named optional fields plus `Attributes.x`; `ProfileResponseData`: the same names; outputs at `$.Customer`                                                             | `NoMatchingError`                                         | the page's `{ "FirstName", ... }` is not valid JSON; an export decides | M      |
| `UpdateCustomerProfile`                     | as `CreateCustomerProfile`                                                                                                                                                                           | `NoMatchingError`                                         | as above                                                               | M      |
| `GetCustomerProfile`                        | `ProfileRequestData`: `IdentifierName` plus `IdentiferValue` (sic), or `SearchCriteria[]` {`IdentifierName`, `IdentifierValue`} with `LogicalOperator` `AND` or `OR`; `ProfileResponseData` as above | `MultipleFoundError`, `NoneFoundError`, `NoMatchingError` | the key spelling; the two forms                                        | M      |
| `GetCustomerProfileObject`                  | `ProfileId`, `ObjectType` required; `UseLatest` true or false, or `IdentifierName` plus `IdentifierValue`; about 90 response keys (`Asset*`, `Order*`, `Case*`, `*Attributes.x`)                     | `NoneFoundError`, `NoMatchingError`                       | the group constraint; the key list                                     | M      |
| `GetCalculatedAttributesForCustomerProfile` | `ProfileId`; response `CalculatedAttributes._average_hold_time`, `._frequent_caller`, `.x`                                                                                                           | `NoneFoundError`, `NoMatchingError`                       | wildcard keys                                                          | S to M |

Restrictions: none listed on the devguide pages; the admin guide's block
says all channels and all flow types
(https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html).

## Acceptance criteria

- The six types are modeled per tasks/README.md, "The per-type checklist",
  one commit each, with `conformance/roundtrip/customer-profiles/` as the
  group fixture.
- The `ProfileRequestData` and `ProfileResponseData` shapes are taken from a
  console export of each block, committed (ids replaced) under
  `conformance/flow-language/exports/`, not from the page's malformed
  example. Where export and page differ, the catalog follows the export and
  the service, and actions.md records the page's form.
- `IdentiferValue` (the page's spelling) and `IdentifierValue` are each put
  to the service, as `UnTagContact` was (rule 28); the catalog uses the
  spelling the service accepts, and if both are accepted, the console's.
- Map keys: named keys are listed with D01's key vocabulary and `Attributes.x`
  style keys use its key pattern; the HCL view writes both (a
  `conformance/hcl/roundtrip/` case holds one of each).
- The two `GetCustomerProfile` forms and the two `GetCustomerProfileObject`
  forms use D01's group alternatives; the builder refuses both or neither,
  the schema clause matches, and the studio's inspector clears one form when
  the other is set (as the recording block's fields do).
- Required errors follow the sweep, not the page; a type the service
  accepts without one of its page's errors records it optional.
- Studio: the response-data field lists are selectable, not free text, for
  the named keys; free keys for the pattern.

## Evidence

One sweep, the next numbered rule, per tasks/README.md, "The evidence rule
for this phase", for each type; and:

- the identifier spelling probe above;
- each group alternative given both and neither;
- a create on an instance with no Profiles domain linked (to learn whether
  the create validates the domain; rule 37 found that a missing feature
  yields "Invalid Action type");
- `CreateCustomerProfile` with an unknown named key, to learn whether the
  key list is enforced at create.

## Sandbox prerequisites and cost

- A Customer Profiles domain, encrypted with a KMS key, one per instance,
  linked through an integration whose `Uri` is the instance ARN
  (https://docs.aws.amazon.com/connect/latest/adminguide/enable-customer-profiles.html).
  Owner action.
- For `GetCustomerProfileObject`: an object type with one object. For
  `GetCalculatedAttributesForCustomerProfile`: one calculated attribute
  definition, and the Connect service-linked role allowed
  `ListCalculatedAttributeDefinitions` and `GetCalculatedAttributeForProfile`.
  Owner action (IAM).
- Cost: profiles holding only Connect data are free; a profile with imported
  data or custom attributes costs $0.005 on each day it is used, plus $0.005
  per 100 objects
  (https://aws.amazon.com/products/connect/customer/pricing/appendix/). A KMS
  key about $1 a month. Creates alone use no profile.
- The console exports above are owner actions (decision 8) unless a browser
  session is available.

## Both repositories

- [ ] flow-as-code, checklist lines 1 to 10, per type.
- [ ] Console exports committed with ids replaced.
- [ ] Probe inputs under `conformance/flow-language/probes/<rule>/`.
- [ ] Provider: re-vendor, oracles re-recorded, key-pattern and group
      vocabulary exercised by its conformance run (lines 11 to 14); the
      provider commit recorded here.
