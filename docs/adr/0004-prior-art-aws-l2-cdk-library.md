# ADR-0004: Prior art, and why this is not Amazon's L2 CDK library

Status: accepted, 2026-09-10

## Context

On 2026-07-21 the AWS Contact Center blog described an internal L2 CDK
construct library for Amazon Connect flows:
https://aws.amazon.com/blogs/contact-center/managing-amazon-connect-flows-as-code-with-aws-cdk/

It has a typed TypeScript builder, bidirectional TypeScript to Flow JSON
conversion, a centralized ARN mapping system for environment-specific
configuration, and a pluggable rule engine that validates flow structure and
dependencies at build time. That overlaps a large part of what this repository
does, and anyone evaluating this project will reasonably ask why it exists.

The post says Amazon is "exploring making the L2 construct library available as
an open-source repository". As of 2026-09-10 no repository or package name has
been published, so this is a comparison against a described design, not against
running code.

## Decision

Build it, and be explicit about the two differences that are real.

**Reference resolution.** The described library resolves references through a
centralized mapping table: the build reads the table and writes concrete ARNs
into the flow. Here, a reference is a `${cdref:type:name}` token that stays a
token through FlowDoc, codegen, synth and both emitters, and is expanded by the
IaC engine at deploy time, per environment. Lint fails on a literal `arn:aws:`
in authored content. See [ADR-0002](0002-error-branch-enforcement.md) for the
adjacent case of pushing a class of error to build time rather than deploy
time, and `docs/01-flowdoc-spec.md` for the token grammar.

The practical consequence is what `examples/promote-across-environments/`
demonstrates: the CDK path takes no map at all, and the Terraform path emits
trees for two environments that differ in exactly one file, `flow_refs.tf`.
`--address-map` is still a table, but its values are Terraform addresses of
resources the reader's own IaC already manages, not per-environment ARNs to
maintain by hand.

**Scope.** Three things this set has that the described library does not: a
visual editor over the same document the code produces, Terraform and OpenTofu
output alongside CDK, and a simulate-based test harness.

## Consequences

The comparison is against a design, not an implementation, and it goes stale
the moment Amazon publishes. Anything this repository claims about the
difference has to stay inside what the code proves, which today means the two
paths in `examples/promote-across-environments/` and the invariants in
`tests/promoteAcrossEnvironments.test.ts`. If the library ships and resolves
references the same way this one does, the first bullet stops being a
difference and this ADR should be superseded rather than quietly edited.
