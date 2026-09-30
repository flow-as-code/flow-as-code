# C08 Hosted-studio example picker

Phase C, studio. Gated on C07 (the snapshot exists) and C01 (the demo tests
are reliable). The hosted studio statically imports one demo,
`conformance/demo/appointment-line.flowdoc.json`
(`packages/studio/src/store/demoStore.ts`), and `demoStore.test`,
`demo-bundle.test` and `demo-boot.test` pin it. This task lets the hosted
studio open the vendored showcase as well, without changing what it opens by
default and without adding anything to the npm package.

## Acceptance criteria

- Selection by URL hash: `#example=<id>` picks an example at boot, with ids
  `appointment-line` and `hollow-hour`. No hash, or an unknown id, opens
  `appointment-line`; an unknown id says so in the page rather than failing
  silently. A hash works on any static host and under any subpath, needs no
  server rewrite, and changes no request the page makes.
- A picker in the read-only toolbar, in the demo build only, lists the
  examples and switches by setting the hash. Switching discards nothing,
  because the demo persists nothing.
- The showcase is loaded by a dynamic `import()` behind `DEMO_BUILD`, so it is
  its own chunk in `dist-demo/` and absent from the regular studio build. A
  test builds the npm studio (`packages/studio/dist/`) and asserts that no
  file in it carries the showcase's chunk or any FlowDoc name from the
  snapshot. The appointment line stays a static import, so the default path
  loads nothing extra.
- An `initialDoc` option on the demo store (or the studio state that opens
  the first document) makes `hh-hotline-main` the document the showcase opens
  on; `appointment-line` keeps today's behavior.
- The CSP is unchanged: `connect-src 'none'`, `script-src 'self'` plus the
  `'unsafe-eval'` A14 recorded for ajv. `demo-bundle.test` scans the new
  chunk like every other emitted file, with the same allow-list, and passes
  without widening it.
- `demo-boot.test` boots the built artifact once per example id, and once
  with an unknown id, with every network entry point replaced by a throwing
  spy, and asserts the document on the canvas each time.
  `demoStore.test` covers the selection and the fallback. Each shown red by a
  mutation (the showcase imported statically, the hash ignored, an unknown id
  throwing).
- `SOURCE_PATHS` in `scripts/build-site.mjs` names
  `examples/vendored/hollow-hour/` in the same commit as the import, as C02's
  test requires.
- Copy that names the one demo is updated: `DEMO_DESCRIPTION` in
  `packages/studio/vite.config.ts`, `READ_ONLY_MESSAGE` if it names the flow,
  the narrow-screen notice if it does, the site's `llms.txt`, and
  `docs/05-hosted-demo.md`, which also records the chunk's size.
- A runtime check in Chrome against the assembled site, served from the root
  and under a prefix: both examples render, the picker switches between
  them, the export preview works on a showcase flow, the console is clean,
  and every request is same-origin. Recorded here with its date.
- The studio's npm package gets no changeset from this task unless its
  published files change, and the test above says they do not.
