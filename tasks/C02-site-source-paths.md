# C02 The site's staleness inputs cover `conformance/demo/`

Phase C, baseline. `scripts/build-site.mjs` refuses to assemble the site when
`packages/studio/dist-demo/` is older than any file under `SOURCE_PATHS`,
"the inputs to `vite build --mode demo`". The list names the studio's and
core's sources but not `conformance/demo/`, although
`packages/studio/src/store/demoStore.ts` imports
`conformance/demo/appointment-line.flowdoc.json` into the bundle. An edit to
the demo flow with no rebuild publishes the old canvas today. C08 adds a second
such input.

## Acceptance criteria

- `SOURCE_PATHS` names `conformance/demo/`, with the comment above it saying
  why a directory outside the studio is an input.
- `tests/site.test.ts` gains a case that touches a file under
  `conformance/demo/` after the demo build and asserts that the assembler
  exits non-zero naming that file. Shown red with the path removed from the
  list.
- A test derives the demo build's inputs from what it actually reads (the
  JSON and module imports reachable from the demo entry that resolve outside
  `packages/studio/` and `packages/core/`) and fails when one of them lies
  outside every `SOURCE_PATHS` entry, so the next input added (C08's) cannot
  be missed the same way. Shown red by adding an import from an unlisted
  directory.
- The vendored snapshot's directory is added to the list in C08, in the same
  commit as the import that makes it an input, and the test above is what
  requires it.
- `docs/05-hosted-demo.md` says what the staleness check compares.
