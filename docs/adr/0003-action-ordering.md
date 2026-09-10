# ADR-0003: Synth preserves declaration order

Status: accepted, 2026-08-31

## Context

FlowDoc invariant 1 requires stable action ordering. Two candidates: a canonical
order derived from the graph (breadth-first from `StartAction`), or the order the
author declared blocks in.

## Decision

Synth emits declaration order.

## Consequences

Reachability order interleaves error handlers into the happy path. On the demo
flow it produces `welcome, check-hours, apologize, announce-closed,
set-working-queue, ...`, because `apologize` is an error target of `welcome`.
That is not how a person writes a flow, so codegen would emit code that reads
wrong, against the codegen non-negotiable.

Declaration order also makes `codegen(synth(code))` byte-stable with no
normalization pass rather than one, since nothing is reordered in either
direction.

Determinism still holds: declaration order is part of the input, so the same
input yields byte-identical output.

Reachability order is still useful for lint's `reachable-blocks` rule and for
comparing two flows that are semantically identical but declared differently. It
stays available as the exported `canonicalOrder`, just not applied by synth.
