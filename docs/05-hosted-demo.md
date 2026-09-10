# Hosted read-only demo

A static build of `@flow-as-code/studio` with `conformance/demo/appointment-line.flowdoc.json` baked in. It runs from any static host, edits only in memory, makes no network request after its own assets load, and names no npm package. Task: tasks/A14-hosted-demo.md.

It is deployed and serving. https://flow-as-code.dev/ is the landing page and https://flow-as-code.dev/studio/ is this artifact, both from GitHub Pages, both over HTTPS with HTTP redirected to it. A visitor gets the demo appointment line on the canvas with no account and no sign-up: eleven blocks including the unmodeled `UpdateFlowLoggingBehavior` as a generic block, a working inspector, refs sidebar and lint panel, and "Export as..." rendering the Terraform and CDK output into the page. There is no Save and no FlowDoc download, because the store refuses writes. How that deploy is wired, and what any other host would need, are under Deploy below.

## Build

```
npm run build:demo
```

Runs `vite build --mode demo` in `packages/studio` and writes `packages/studio/dist-demo/` (gitignored, about 720 kB uncompressed: `index.html` plus eight hashed assets under `assets/`). `npm run build` at the root produces it too, after the regular studio build. The root build order is `tsc -b`, `vite build`, then `vite build --mode demo`, so the demo is always built from the same `@flow-as-code/core` output the CLI ships.

The regular build in `dist/` and the demo build in `dist-demo/` come from one `vite.config.ts` and one source tree. What differs is decided by the mode, in three places.

### The app knows it is the demo

`src/demoBuild.ts` exports `DEMO_BUILD = import.meta.env.MODE === "demo"`. Vite inlines the mode, so the flag is a compile-time constant and the regular build carries the other branch as dead code. `defaultStore` (`src/state/studio.tsx`) boots the demo through `ReadOnlyStore`, a wrapper whose `write` always refuses and whose `readOnly` flag the toolbar reads: Save, Open file, Open folder, and the FlowDoc download are hidden, a "Read-only demo" badge is shown, and dirty state is labelled "edited in this tab". The canvas, inspector, lint panel, and reference pickers work unchanged because the document in memory is the app's own copy. "Export as..." stays, with `PreviewExportSink` in place of the download and bridge sinks: the same file bundle every other sink receives is rendered as text inside the dialog, and the dialog says so. Nothing is downloaded or written.

There is no persistence of any kind, deliberately. The store is `MemoryStore` behind the wrapper, and the studio does not touch `localStorage`, `sessionStorage`, or IndexedDB anywhere (`grep -rn localStorage packages/studio/src` is empty). A reload restores the pristine demo.

### Two modules are swapped for stubs

`vite.config.ts` registers a small plugin, `flow-studio:demo-stubs`, only when the mode is `demo`, in the app bundle and (through `worker.plugins`) in the lint worker. It matches on the fully resolved module path, not on the import specifier, so the swap holds however the module is reached.

| Real module                                                 | Stub                                        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/package-names.ts` (or its `dist/` build) | `packages/studio/src/demo/package-names.ts` | The artifact must not name a package anyone can install (tasks/A14-hosted-demo.md). The stub keeps the same export surface (`PACKAGE_SCOPE`, `PACKAGE_NAMES`) with the RFC 2606 placeholder scope `@example`, so a CDK preview in the demo reads `import { FlowSet } from "@example/cdk"`.                                                                                                                                                                        |
| `packages/studio/src/store/bridgeStore.ts`                  | `packages/studio/src/demo/bridgeStore.ts`   | `BridgeStore` is the studio's only network client. It is unreachable in a static build (no `flow-cli studio` process injects a bridge description into the page), but unreachable code still carries `fetch(` and the long-poll loop, and the offline scan below would see it. The stub exports the same names (`BridgeStore`, `BridgeConflictError`, `servedByBridge`, `createBridgeStore`, `fetchBridgeInfo`), never finds a bridge, and cannot be constructed. |

`packages/core/src/package-names.ts` is the one indirection point for package names. Codegen, the `@flow-as-code/cdk` scaffold, the `@flow-as-code/tf` banner, and the CLI's studio asset lookup import their specifiers from it, so the 2026-09-03 rename to the `@flow-as-code` scope was one edit there plus the package manifests, and the demo build overrides it in one place. `tests/demoStubs.test.ts` compares the export surface of each stub with the module it replaces, because Vite resolves the swap by path with no type check across it; a value export missing from a stub would show up as a blank deployed page and nowhere else.

The demo also sets `build.modulePreload.polyfill` to false. The polyfill is the only other `fetch(` in the bundle; without it, browsers that lack native `<link rel="modulepreload">` do not preload.

### Relative paths and a Content-Security-Policy

`base` is `./` in demo mode, so `index.html` references every asset as `./assets/...` and the artifact serves from a domain root or from any subpath (the verification below serves it under `/demo/`).

The plugin prepends one `<meta http-equiv="Content-Security-Policy">` tag to `index.html`, because a static host may not let you set response headers:

```
default-src 'self'; connect-src 'none'; img-src 'self' data: blob:;
style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval';
worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'
```

`connect-src 'none'` is the runtime enforcement: a request the tests missed still fails in the browser. `'unsafe-inline'` for styles is what React Flow's inline `style` attributes (node positions, the viewport transform) need. `'unsafe-eval'` is there because ajv compiles the FlowDoc schema with `new Function`; the first runtime check of this build found a blank page and an `EvalError` in the console without it. It widens what the page's own scripts may do, not where scripts may come from or connect to. The reason the schema is not precompiled instead is recorded in the chunking comment at the top of `vite.config.ts`.

### A narrow viewport gets a notice, not a broken layout

The demo is what an announcement points at, and announcement traffic skews mobile. The studio is a three-column editor and it is not going to work on a phone, so below a breakpoint the first thing a visitor sees is a notice saying so (`src/components/NarrowNotice.tsx`).

The breakpoint is measured, not chosen from a list of device widths. The palette column (`w-52`) and the inspector (`w-72`) do not shrink, so with their borders they take a fixed 496px whatever the viewport is, and the canvas gets the rest. Measured in Chrome on the built artifact:

| viewport | canvas |
| -------- | ------ |
| 1096px   | 600px  |
| 896px    | 400px  |
| 764px    | 268px  |
| 696px    | 200px  |
| 636px    | 140px  |
| 556px    | 60px   |
| 496px    | 0px    |

A block node is `w-45`, 180px. So 676px is where the canvas can no longer show one whole block, and `NARROW_MAX_PX` is 700: that number with a little air around the node. Above it the layout is tight but honest; below it there is nothing to look at.

The notice is not a wall. Two controls close it for the rest of the visit, so the canvas stays reachable, and in this build a third link goes back to the site root as the relative href `../`, which resolves to the root wherever the tree is mounted, subpath included. It cannot be an absolute URL: `tests/demo-bundle.test.ts` refuses one anywhere in the bundle.

It keys off the viewport width, not the input device, so a small window on a laptop sees it too and widening the window takes it away with no reload. While it is up, `overflow: hidden` goes on both `<html>` and `<body>`: at a 390px viewport the document scrolls sideways to the shell's 496px, and measured in Chrome `scrollTo(500, 0)` still moved to `scrollX` 106 with only one of the two locked.

#### The local build says something different

The same component ships in `dist/`, which `flow-cli studio` serves over its bridge against a person's own `.flow.ts` files, and two of the sentences above are false there. That studio writes to disk, so "read-only demo" is a lie, and nothing sits above a bridge path, so `../` is not the project site. The width advice is true wherever the shell is squeezed, so it is unconditional; the read-only sentence and the site link are gated on `DEMO_BUILD`.

`DEMO_BUILD` and not `store.readOnly`, because both gated parts are claims about the artifact rather than about the open document: that this bundle has nowhere to save, which is exactly when `defaultStore` wraps the demo store read-only, and that it was built with `base: "./"` and copied to `/studio/` by `scripts/build-site.mjs`, which is the only reason `../` means anything. A read-only store answers the first and cannot answer the second at all. Being compile-time, the gate also keeps the sentence and the anchor out of the local bundle entirely. In their place a local visitor is told to widen the window past `NARROW_MAX_PX` and that their flow files are still there, and is offered no link away.

#### It is modal, and says so

The overlay is opaque, covers the viewport, and pins the page under it, so a sighted visitor cannot reach the canvas until it is closed. `role="dialog"` alone left everything reading the accessibility tree with a different deal: Tab went straight into the canvas the notice had just called unusable, and Escape did nothing. It now carries `aria-modal="true"`, takes focus when it appears, cycles Tab inside itself (pulling focus back if something outside took it), returns focus to the control that had it, and closes on Escape the way the two buttons do.

## Deploy

### Any static host

Copy the contents of `packages/studio/dist-demo/` to any static host: an S3 bucket behind CloudFront, GitHub Pages, Netlify, Cloudflare Pages, or a directory under nginx. Requirements on the host:

- Serve `index.html` for the directory and the files under `assets/` with their own paths. No rewrite rules are needed; the app has no client-side routes.
- Serve `.js` as `text/javascript` and `.css` as `text/css`. Module scripts and workers are refused by browsers under a wrong type.
- Any path prefix works. Nothing in the artifact assumes the root.
- Set no response headers that add origins. If the host adds its own CSP header, the stricter of the two applies, and the header must keep `'unsafe-eval'` in `script-src`.
- Do not attach analytics, a tag manager, or an injected script at the host layer. The whole point of the artifact is that it loads nothing else, and the meta CSP will block such injections anyway.

The hashed asset names change on every build that changes content, so caches can hold `assets/` for as long as they like; `index.html` should be revalidated.

### The project's own deploy: GitHub Pages

The published site is one tree with a hand-authored landing page at the root and this artifact under `/studio/`:

```
dist-site/
  index.html    site/index.html: one file, inline CSS, no external font or script
  CNAME         flow-as-code.dev
  favicon.ico   the mark at 16, 32 and 48, which is the icon of every page here
  favicon.svg   the same mark, following the reader's theme
  apple-touch-icon.png  180x180, opaque, for an iOS home screen
  mark.svg      the mark alone
  logo.svg      the lockup, mark and wordmark, for a light background
  logo-dark.svg the same, for a dark one
  logo.png      the banner the READMEs put at the top, which npm and GitHub can
                only reference by absolute URL, so it is served from here
  og.png        1200x630, the card a link preview shows
  studio/       a byte copy of packages/studio/dist-demo/
```

The icon files sit at the ROOT of the tree rather than in an assets directory,
and that is load bearing rather than tidy. A browser asks the ORIGIN for
`/favicon.ico` when a page declares no icon, and the studio page declares none:
`packages/studio/tests/demo-bundle.test.ts` forbids any `href` in that HTML that
is not `./assets/...`, so it cannot carry a `<link rel="icon">` at all. A file at
the root gives the landing page, every docs page and the studio the same icon
without editing one guarded byte of the artifact. The pages that can carry the
tags carry them, relative like every other link on this site.

`npm run build:site` (scripts/build-site.mjs) assembles it. The script copies and does nothing else. The artifact is already relocatable, so nothing under `studio/` is rewritten on the way in, and `tests/site.test.ts` compares every copied file with `dist-demo/` byte for byte so that a future rewrite cannot slip past the guards in `demo-bundle.test.ts`. The script refuses to assemble when `dist-demo/` is missing, incomplete, or older than the studio and core sources, and its message names `npm run build`. It refuses on the logo too, and there the check is content rather than timestamps: every generated file has to still carry the path data in `design/mark.mjs` and `design/wordmark.mjs`, each raster has to be the size its reader demands, and `favicon.ico` has to hold a 16 and a 32. A checkout gives every file the same mtime, so a date comparison would be flaky there and would still miss a hand edit. `design/README.md` is how the files are regenerated and why they are what they are. That is the full build on purpose: `npm run build:demo` alone fails on a clean checkout, because the studio resolves `@flow-as-code/core` to `packages/core/dist`.

`.github/workflows/pages.yml` runs `npm ci`, `npm run build`, `npm run build:site`, then `actions/configure-pages`, `actions/upload-pages-artifact` on `dist-site`, and `actions/deploy-pages`, on every push to main and on `workflow_dispatch`. Permissions are `contents: read`, `pages: write`, `id-token: write`. The concurrency group is `pages` with `cancel-in-progress: false`, because cancelling a deploy in flight can leave the Pages environment holding a half-applied deployment and the next push is seconds behind anyway. `npm run build:site` also runs in the CI build job, which is where the assembler and its staleness gate are exercised on a pull request, before a merge can publish a stale canvas.

The job is gated on `github.event.repository.visibility == 'public'`. GitHub Pages does not serve a private repository on a free plan, so the gate was written to SKIP rather than fail while the repository was private, and to start deploying by itself the moment the repository was flipped public. Both triggers carry the repository object in their payload, so this reads the live visibility rather than a variable someone has to remember to set. The repository is public now and the gate passes: the deploy of 15f8886 is run 34369711711, success.

The landing page links to the studio as `./studio/`, never `/studio/`, so the same tree serves correctly from a subpath as well as from the apex. That is not decoration: it is what a repository-scoped Pages URL (`https://<org>.github.io/<repo>/`) needs if the custom domain is ever dropped, and serving the tree under a prefix is part of the runtime check below.

Runtime check of the assembled tree, done on 2026-09-04 in Chrome against `dist-site/` served by a small `node:http` server that logs every request, first from the root and then from `/some/prefix/`. Both times: the landing page rendered and its button navigated to the studio; the canvas showed the eleven `appointment-line` nodes with the "Read-only demo" badge, "Export as..." as the only toolbar action, no Save and no file download, and a clean lint panel; the export dialog generated five Terraform files and one CDK file into the page, the CDK preview importing from `@example/cdk`; the console was empty; and every request the page made was to its own origin and path, ten of them under the prefix with `assets/` correctly resolved beneath it. The network list held two further entries, both the automation extension's own `chrome-extension://` script, which is the browser, not the page.

### How the domain and the Pages site are configured

Everything a commit can automate is automated. Four things were repository or DNS settings and are not in any commit. All four are done; this is the record, because the next person to move the domain needs it.

1. The repository is public. Pages cannot serve a private repository on the free plan, and the workflow's visibility gate stays skipped until it is.
2. The Pages source is GitHub Actions, set under Settings, Pages, Build and deployment, Source. With the source left at a branch, `actions/configure-pages` fails the run rather than deploying. `gh api repos/flow-as-code/flow-as-code/pages` reports this as `"build_type": "workflow"`.
3. The apex points at Pages and `flow-as-code.dev` is the custom domain. Four A records for `flow-as-code.dev` to 185.199.108.153, 185.199.109.153, 185.199.110.153, and 185.199.111.153, and four AAAA records to 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, and 2606:50c0:8003::153, with `flow-as-code.dev` entered as the custom domain in Settings, Pages. https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site . `dig flow-as-code.dev A` and `AAAA` return exactly those eight addresses, and the Pages API reports `"cname": "flow-as-code.dev"` with the certificate approved. The repository setting is what matters here: that page states that when publishing from a custom Actions workflow "no `CNAME` file is created, and any existing `CNAME` file is ignored and is not required". `site/CNAME` is deployed anyway, because it costs nothing, it is what a branch-based publish would read, and it keeps the apex written down next to the page that assumes it.
4. Enforce HTTPS is on, in Settings, Pages, which the same page notes can take up to 24 hours to become available after the certificate issues. The Pages API reports `"https_enforced": true`, and `curl -I http://flow-as-code.dev/` answers 301 to `https://flow-as-code.dev/`.

### Runtime check on the live domain

Done on 2026-09-09 in a browser against the deployed site, not a local server. The landing page served from https://flow-as-code.dev/ and its button reached https://flow-as-code.dev/studio/ ; the canvas showed the eleven `appointment-line` nodes with the "Read-only demo" badge, no Save and no FlowDoc download; the export preview rendered; the console was clean; and every network request was same-origin, eight assets plus the lint worker. `/favicon.ico` 404ed, because there was no icon at the root of the site yet and the studio ships no icon link of its own: `packages/studio/tests/demo-bundle.test.ts` forbids any `href` in its HTML that is not `./assets/...`, so the browser asks for the default path anyway. That request is the reason the icon files were put at the root of the tree rather than under an assets path; it is answered now.

## Verification

Two proofs, in the order they should be run. The first is a test and runs in CI; the second needs a browser.

### Static: the artifact has no way to make a request

```
npm run build:demo
npx vitest run --project @flow-as-code/studio tests/demo-bundle.test.ts tests/demo-boot.test.tsx tests/demoStubs.test.ts
```

`tests/demo-bundle.test.ts` reads every file in `dist-demo/` and asserts:

- every `src` and `href` in `index.html` is a relative `./assets/` path and the HTML contains no absolute URL;
- the CSP meta tag is present with `default-src 'self'`, `connect-src 'none'`, `script-src 'self'`, and `object-src 'none'`;
- no file contains a network primitive: `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts(`, `serviceWorker`;
- every absolute `http(s)://` string in every file is on the exact-match allow-list in `tests/offlineScan.ts`, and no CSS carries `url(http...)` or `@import` of a URL;
- no file mentions a published package name or the scope, both read from core's `PACKAGE_NAMES` and `PACKAGE_SCOPE`, while the `@example` placeholder is present;
- the demo flow (`appointment-line`) and its GenericBlock (`UpdateFlowLoggingBehavior`) are in the bundle, as is the "Read-only demo" badge text and the lint worker chunk.

The allow-list cannot be XML namespaces only. Bundled libraries carry string constants that are URLs without ever loading them: JSON Schema `$id` and vocabulary identifiers that ajv resolves against its own bundled meta-schemas, the `$id` of the FlowDoc schema, React's error-decoder link, React Flow's attribution link, the rolldown and Tailwind banners, and the AWS and Terraform registry citations that `@flow-as-code/tf` writes as comments into the HCL it emits. Each entry is an exact string; a new URL under a familiar origin does not pass because its prefix is familiar. The same list judges the regular build in `tests/bundle-offline.test.ts`, so the two cannot drift.

`tests/demo-boot.test.tsx` boots the built `dist-demo/assets/index-*.js` under happy-dom with `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and `navigator.sendBeacon` replaced by spies that throw, then asserts the demo rendered (title, badge, the GenericBlock's type), that Save and the FlowDoc download are absent and "Export as..." is present, and that no spy was called.

`tests/demoStubs.test.ts` holds the two stubs to the export surface of the modules they replace, and pins that the bridge stub never finds a bridge even when a bridge description is injected into the page.

Without `dist-demo/`, `demo-bundle.test.ts` fails one test naming `npm run build:demo` and the rest skip. Each guard was mutation-tested when it landed: disabling the swap turned the primitive scan and the package-name check red; restoring the modulepreload polyfill turned the primitive scan red on `fetch(`; dropping an export from the bridge stub turned the surface comparison red; setting the stub scope to the real one turned the package-name checks red; removing `connect-src 'none'` and the relative base turned the CSP and relocatability checks red.

`grep -ri @flow-as-code packages/studio/dist-demo` is empty after a build. The scope is matched with its leading `@` because the bare name is also the GitHub org and the schema `$id` host: the `$id` of the FlowDoc schema (`flow-as-code.dev`, from `conformance/schema`) is a schema identifier, not a package name, and is on the allow-list by exact match.

### Runtime: the browser makes no request

1. Serve `dist-demo/` from a local static server under a subpath, for example `python3 -m http.server` from the directory or a few lines of `node:http`. Do not use `vite preview` for this; its dev client is not the artifact.
2. Open the page in a browser with DevTools on the Network tab, "Disable cache" checked, and the console visible.
3. Confirm the canvas shows the eleven nodes of `appointment-line`, the "Read-only demo" badge, only "Export as..." in the toolbar, and a clean lint panel.
4. Click the `enable-logging` node. The inspector shows it as unmodeled (`UpdateFlowLoggingBehavior`) with its raw JSON.
5. Open "Export as...", export Terraform, then CDK. The dialog reports "Generated N file(s) to this page" and shows each file as text; the CDK preview imports from `@example/cdk`.
6. Reload. The selection and the dialog are gone and the demo is pristine.
7. Read the Network tab: every entry is the page's own origin and path (`index.html`, the JS and CSS chunks, and `lint.worker-*.js`; a `favicon.ico` request from the browser itself is a 404 on the same origin). Read the console: no errors. A CSP violation would appear here as a blocked request, so an empty console after the interactions above is the proof.

Done on 2026-09-01 with the artifact served under `http://127.0.0.1:4173/demo/` from a twenty-line `node:http` server that logs every request. The server log, the Network tab, and the console agreed: ten same-origin requests, nothing else, no errors. The one finding was the `'unsafe-eval'` requirement described above, which the static tests could not see and the first load did.

## What is not in this build

- No save, no bridge, no file writes, no file open. The read-only store refuses `write` and the toolbar does not offer it.
- No persistence. Edits live in the tab until reload.
- No hosting requirements of its own. The artifact is host-agnostic; this project happens to deploy it to GitHub Pages, and any static host will do.
