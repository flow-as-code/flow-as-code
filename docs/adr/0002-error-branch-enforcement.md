# ADR-0002: Error branches are required config properties

Status: accepted, 2026-08-31

## Context

Task A01 requires that "an unwired error branch is a type error". Two obvious
implementations exist, and they interact badly with a different non-negotiable.

A fluent builder (`flow.play(...).then(...).onError(...)`) can enforce wiring at
the type level only through phantom types or builder-state threading, where each
call returns a different type carrying what has been wired so far.

That collides with the codegen requirement: "Codegen output must be idiomatic,
diffable TypeScript that a human would plausibly have written." State-threaded
fluent chains are not what a human writes, and they are painful to emit and to
diff.

## Decision

Blocks are classes taking a single config object. Error branches are **required
properties** on that object.

```ts
new TransferContactToQueue({
  id: "transfer",
  next: "hang-up",
  onQueueAtCapacity: "announce-busy",
  onError: "apologize",
});
```

Mutually exclusive parameters use discriminated unions, so supplying both
`text` and `ssml`, or both `queue` and `agent`, is also a compile-time error.

## Consequences

Omitting a required property is a genuine `tsc` error, verified in both
directions in `packages/core/src/synth.test.ts`: removing a
`@ts-expect-error` produces TS2345, and an unnecessary one produces TS2578, so
the assertions cannot rot into no-ops.

Codegen emits plain object literals, which diff cleanly line by line.

The escape hatch is untyped by necessity. `GenericBlock` models actions we do
not know, so we cannot know their error sets either. The `error-branches` lint
rule is the backstop there.

Blocks map one-to-one onto Actions for the same reason. A block that expanded
into several Actions could not be reliably recognized on the way back, which
would break the round-trip invariant. "Transfer to queue" is therefore two
blocks, `UpdateContactTargetQueue` and `TransferContactToQueue`, because that is
what Connect actually models.
