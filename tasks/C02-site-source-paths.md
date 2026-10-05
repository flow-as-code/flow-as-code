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

## Notes (2026-10-05)

What landed, against each criterion.

- **`SOURCE_PATHS`.** Names `conformance/demo/`, and also what the derived
  test below found on its first run against the list as it was: nineteen
  inputs outside every entry, one under `conformance/demo/`, two under
  `conformance/schema/` (the FlowDoc schemas `src/model/validate.ts`
  imports), one each under `packages/tf/src/` and `packages/cdk/src/` and
  fourteen under `packages/hcl/src/` (the export dialog bundles the three
  emitters). All five directories are in the list now, and the comment above
  it says why directories outside the studio are inputs. `SOURCE_PATHS` is
  exported and `main()` runs only when the script is the program, so the
  test reads the array the assembler uses rather than a copy.
- **The touch case.** `tests/site.test.ts`, "refuses to assemble when the
  demo flow is newer than dist-demo": sets the mtime of
  `conformance/demo/appointment-line.flowdoc.json` one minute into the
  future, runs the real assembler into a scratch directory, asserts that it
  exits non-zero with a message saying `dist-demo/ is stale`, naming the file
  and naming `npm run build`, and restores the mtime in `finally`. Red with
  `conformance/demo` removed from the list: `assembled over a demo flow newer
than dist-demo: expected true to be false`.
- **The derived case.** "compares dist-demo against every input the demo
  build reads": walks from `packages/studio/index.html` through its module
  script and every static import, re-export, dynamic `import()` and
  `new URL(..., import.meta.url)` reachable from it, follows
  `@flow-as-code/*` through each package's `exports` to the source its
  `dist/` was compiled from, and fails naming every reachable file under no
  `SOURCE_PATHS` entry. A specifier it cannot resolve throws rather than being
  skipped. Red with `conformance/demo` removed from the list, naming
  `conformance/demo/appointment-line.flowdoc.json`; red with an import of
  `conformance/roundtrip/unknown-actions/doc.flowdoc.json` added to
  `demoStore.ts`, naming that file; green on the tree as committed. The walk
  ignores the demo stubs in `vite.config.ts`, which only drop modules or swap
  in files already under `packages/studio/src`, so what it finds is a
  superset of what the demo bundles, never a subset.
- **C08.** Not this task's to discharge: the snapshot's directory joins the
  list in the C08 commit that adds the import, and the derived case is what
  fails until it does.
- **`docs/05-hosted-demo.md`.** The deploy section says what the check
  compares, with the list spelled out.

Done apart from the C08 criterion, which the derived test holds for C08.

## Status (2026-10-05)

Merged to main in #25 (`940af58`, 2026-10-05 16:59 UTC). Its CI run,
37344998368, is the one that closed C01. The C08 criterion stays with C08.
