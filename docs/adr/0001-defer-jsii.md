# ADR-0001: Defer jsii

Status: accepted, 2026-08-30

## Context

`@flow-as-code/cdk` could be published to PyPI, NuGet, and Maven through jsii, matching how
AWS ships construct libraries.

## Decision

No jsii until the builder API stabilizes.

## Consequences

TypeScript only for now. jsii constrains the API surface hard: no union types,
no structural typing, no generics in exported signatures. The builder leans on
all three, most visibly in the block config unions that make an unwired error
branch a compile-time error (see [ADR-0002](0002-error-branch-enforcement.md)).
Adopting jsii early would mean giving that up before we know whether the API is
right. Revisit once the block set stops changing.
