# A00a Repo hygiene and toolchain

Deliverables: git repository; .gitignore; Apache-2.0 LICENSE with an entity-neutral copyright holder; ESLint flat config, Prettier, and Vitest workspace configs; license-header script with check and fix modes; tsconfig project references; package manifests corrected (types and exports fields, flow-studio tsconfig, dagre on flow-core, tsx on flow-cli, @aws-sdk/client-connect as an optional peer); CI on a Node 20 and 22 matrix with an OpenTofu job and a variable-gated live-AWS job; lockfile.
Acceptance: `npm ci && npm run lint && npm run typecheck && npm run build && npm test` is green from a clean checkout on Node 20 and 22; CI passes with no AWS credentials configured.

## Status (2026-09-01)

Landed. `eslint.config.js` (ESLint 10, typescript-eslint 8), Prettier 3, Vitest 4 with one project per package plus a `repo` project for `tests/`, `scripts/license-headers.mjs` behind `npm run headers` and `npm run headers:fix`, `tsc -b` project references, and `package-lock.json`. CI (`.github/workflows/ci.yml`): `build / node 20`, `build / node 22`, and `build / node 24`, an `emit-tf goldens` job with `RUN_TOFU_VALIDATE=1`, a `sandbox integration` job gated on the `CONNECT_SANDBOX_ENABLED` repository variable and on the event (push to main or workflow_dispatch, never a fork pull request), and a `publish dry-run` job. The workflow is `permissions: contents: read` at the top level and every job carries a `timeout-minutes`. `engines.node` is `>=20.19`.

## The Node matrix moved (2026-09-04)

The matrix and the floor above are what was true on 2026-09-01. Node 20 reached end of life on 2026-04-30 and is no longer supported or gated: `engines.node` is `>=22.12` in all six manifests and CI runs `build / node 22`, `24` and `26`. The rest of the workflow shape recorded above is unchanged, and the job list as it ran on the published commit is in tasks/A13-release.md. Nothing else in this task moved.
