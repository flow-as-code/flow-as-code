# ADR-0005: An owned auto-layout replaces dagre

Status: accepted, 2026-09-11

## Context

Synth, export, materialization and the studio all fill in a position for any
action that has none, and codegen omits a document's layout when it equals
that auto-layout, so the generated TypeScript carries only hand placement.
Phase B gives a document a second authored companion, `<name>.flow.tf`, and
the same rule applies per action: a `position` block is written only where
the action sits somewhere other than where auto-layout would put it. The
Terraform provider reads those files without this package, so it has to
compute the same positions or it cannot tell an omitted position from a moved
one.

Until now the positions came from dagre, a JavaScript layout library. Its
output depends on float arithmetic, tie-breaking inside a network-simplex
ranking and an ordering heuristic that the library documents only as code.
Three ways were considered: port dagre to Go and prove the two agree to the
integer (thousands of lines, and a proof that would have to be repeated on
every dagre release), let the provider write no `content.Metadata` when a
position is missing (every hand-written `.flow.tf` would then deploy with no
console layout, which is the provider's main use), or replace dagre with an
algorithm small enough to specify and pin with fixtures.

## Decision

The third. `packages/core/src/layout.ts` implements the layered algorithm
written down in `conformance/layout/README.md`: depth-first discovery from
`StartAction` with back edges dropped, longest-path ranks, discovery order
within a rank, unreachable actions past the deepest rank in document order,
integer coordinates from four constants. `conformance/layout/<case>/` pins it,
and every implementation runs those cases.

## Consequences

Every fixture and golden that carried dagre coordinates was regenerated once,
and the hosted demo's screenshot was retaken. Flows that were auto-arranged
look plainer than dagre made them, because the algorithm does not minimise
edge crossings; hand placement is untouched, and the studio still persists
it. `@flow-as-code/core` now has no runtime dependency at all.

Document order is part of the input: the same graph declared in a different
order may lay out differently. That is deliberate, and it is what ADR-0003
already says about order everywhere else.
