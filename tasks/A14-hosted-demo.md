# A14 Hosted read-only studio demo

Split out of A13 so it is not blocked on the naming decision. Deliverables: static build of flow-studio with the A00b demo FlowDoc baked in, read-only, deployed to static hosting.
Acceptance: the build makes no network calls (verified by loading it with the network disabled); no telemetry; the demo flow renders, including at least one GenericBlock; no npm package name appears in the deployed artifact.

## Shipped (2026-09-01)

Everything except the hosting deploy. Build, stubs, verification, and host requirements are in docs/05-hosted-demo.md.

- `npm run build:demo` (root, delegating to `vite build --mode demo` in flow-studio) writes `packages/studio/dist-demo/`, gitignored, with relative asset paths so it serves from any static host or subpath. `npm run build` produces it after the regular studio build.
- Read-only: `DocStore.readOnly`, `ReadOnlyStore`, and `PreviewExportSink` in flow-studio. The toolbar hides Save and every file gesture, shows a "Read-only demo" badge, and "Export as..." renders CDK, Terraform, and raw JSON as text in the dialog. No persistence of any kind; reload restores the pristine demo.
- No network: the demo build swaps `bridgeStore.ts` (the studio's only network client) and flow-core's `package-names.ts` for stubs under `src/demo/`, drops the modulepreload polyfill (the only other `fetch(`), and prepends a Content-Security-Policy meta tag with `connect-src 'none'`. `tests/demo-bundle.test.ts` scans every emitted file for network primitives, absolute URLs outside an exact-match allow-list, and the npm package name; `tests/demo-boot.test.tsx` boots the built artifact with every network entry point replaced by a throwing spy; `tests/demoStubs.test.ts` holds the stubs to the export surface of what they replace. All mutation-tested.
- One indirection point for package names: `packages/core/src/package-names.ts` (own commit), consumed by codegen, the flow-cdk scaffold, the flow-tf banner, and the CLI's studio asset lookup. The demo overrides it with the RFC 2606 scope `@example`; `grep -ri criticaldynamics packages/studio/dist-demo` is empty.
- Runtime check done in Chrome against the artifact served under a subpath: all requests same-origin, console clean after selecting the GenericBlock (`enable-logging`, `UpdateFlowLoggingBehavior`), opening the inspector, and exporting Terraform and CDK in-page. The check found that ajv needs `'unsafe-eval'` in `script-src`, which the static tests could not see; the CSP carries it with the reason in `vite.config.ts`.

## Shipped (2026-09-04): the deploy

GitHub Pages, from the repository, with the landing page at the apex and the demo under `/studio/`. Details in docs/05-hosted-demo.md.

- `site/index.html` is a hand-authored landing page: one file, inline CSS, no external font, no external script, no analytics, no build step of its own. It links to the studio as `./studio/`, so the tree serves from the apex and from any subpath. `site/CNAME` holds the apex.
- `npm run build:site` (scripts/build-site.mjs) assembles `dist-site/`: `site/*` at the root, then a byte copy of `packages/studio/dist-demo/*` under `studio/`. It exits non-zero, naming `npm run build`, when `dist-demo/` is missing, incomplete, or older than the studio and core sources, so a deploy cannot publish a stale canvas. The full build is what it asks for, because `npm run build:demo` alone fails on a clean checkout.
- `.github/workflows/pages.yml` builds and deploys on push to main and on `workflow_dispatch`, with `contents: read`, `pages: write`, `id-token: write` and a non-cancelling `pages` concurrency group. The job is gated on `github.event.repository.visibility == 'public'`, so it was SKIPPED rather than failed while the repository was private and enabled itself when the repository was flipped public. It deploys now; see "Live (2026-09-09)" below.
- `tests/site.test.ts` assembles the tree with the real script and asserts: the landing page loads no subresource and carries no absolute URL outside a link a reader clicks; every internal link is relative and resolves to a file that exists, one of them being `studio/index.html`; `CNAME` is the apex and nothing else; `studio/index.html` and `studio/assets/` are present; and every copied studio file is byte-identical to `dist-demo/`. All mutation-tested, including the assembler's own missing and stale gates.
- Runtime check done in Chrome on 2026-09-04 against the assembled tree, served from the root and again under a prefix. Both pages rendered, the studio link worked, the canvas showed the eleven nodes with the read-only badge and no Save or file download, the export preview produced CDK and Terraform, the console was clean, and every request was same-origin.

## Operator actions (recorded 2026-09-04, all four closed 2026-09-09)

These four were open as operator actions, not commits. All four are done.

1. Flip the repository to public. Done. `gh api repos/flow-as-code/flow-as-code` reports `visibility: public`.
2. Set the Pages source to GitHub Actions. Done. `gh api repos/flow-as-code/flow-as-code/pages` reports `build_type: workflow`.
3. Add the apex DNS records and set `flow-as-code.dev` as the custom domain. Done. The same call reports `cname: flow-as-code.dev` and `protected_domain_state: verified`.
4. Enable Enforce HTTPS. Done. `https_certificate.state` is `approved` and `https_enforced` is `true`; `curl http://flow-as-code.dev/` answers 301 to `https://flow-as-code.dev/`.

## Live (2026-09-09)

The demo is deployed and serving. Verified on the live domain on this date, by `gh api` for the Pages configuration and `curl` for the responses, and in a browser for what the page actually renders.

- https://flow-as-code.dev/ serves the landing page. 200.
- https://flow-as-code.dev/studio/ serves the read-only studio. 200.
- Browser pass on the live domain: all eleven demo nodes render, the read-only badge is present, Save and the FlowDoc download are absent, the export preview works, the console is clean, and every network request is same-origin (eight assets plus the lint worker).
- The Pages workflow ran green at `main` (15f8886): https://github.com/flow-as-code/flow-as-code/actions/runs/34369711711 . The visibility gate in `pages.yml` no longer skips it, because the repository is public.

One known and deliberate 404: `/favicon.ico`. `packages/studio/tests/demo-bundle.test.ts` forbids any href in the studio's HTML that is not `./assets/...`, so no icon link is emitted. It is a test-enforced choice, not a defect.

The landing page's mobile layout is argued from its CSS and has not been observed at a narrow viewport.
