# A04 Synth sandbox and watch core

Deliverables: `flow-cli synth` executing a TS builder file in a sandboxed child process (no network, cwd-jailed fs) via tsx; chokidar watch engine with the sourceHash dirty guard from the FlowDoc spec; conflict states surfaced as structured events (the studio consumes them).
Acceptance: editing the demo .flow.ts updates its FlowDoc in under 1s; simultaneous edits on both sides produce a conflict event, never a silent overwrite.

## Status (2026-09-01)

Landed in `packages/cli/src/{synth,synth-runner,watch}.ts`. Two deliverable clauses are narrower than written, and the header of `synth.ts` records why: file reads are not jailed (`--allow-fs-read=*`, because scoped read permissions break tsx's tsconfig discovery), and Node 20 and 22 have no network permission at all, so no network jail exists on the CI-supported runtimes (https://nodejs.org/api/permissions.html). What the sandbox does enforce depends on the runtime. On every runtime: a stripped environment, cwd pinned to the source directory, and process isolation. On Node 22.13 and later, where `--permission` is stable, also: writes denied outside a private temp directory and child processes denied. On Node 20, and on Node 22 before 22.13, `synth.ts` passes no permission flags at all, so neither denial applies there; that covers the Node 20 lane of CI and the runtime floor CLAUDE.md states. `watch.test.ts` covers the under-1s re-sync and the conflict-without-overwrite cases; SECURITY.md carries the user-facing statement.

## The Node floor moved to 22.12 (2026-09-04)

The runtimes named above have changed. Node 20 went end of life on 2026-04-30 and is no longer supported or gated; `engines.node` is `>=22.12` and CI runs 22, 24, and 26. Nothing in the sandbox changed, but two of the statements above now read differently: the runtimes with no network permission are 22 and 24 rather than 20 and 22 (`--allow-net` arrived in Node 25, so the 26 lane does have one), and the lane that passes no permission flags at all is 22.12 rather than Node 20, since `--permission` is stable only from 22.13. SECURITY.md and the header of `synth.ts` carry the current wording.
