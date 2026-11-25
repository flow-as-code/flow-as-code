---
"@flow-as-code/cdk": minor
---

The `aws-cdk-lib` peer range is now `^2.278.0`, up from `^2.267.0`. A project on aws-cdk-lib 2.267 to 2.277 that imports `FlowSet` gets an ERESOLVE from npm until it upgrades aws-cdk-lib to 2.278.0 or later. 2.278.0 is the first aws-cdk-lib release that bundles `minimatch` 11 (GHSA-g3hv-75wg-m249) and `brace-expansion` 5.0.12 or later (GHSA-q2hr-2g5m-vwhr). `constructs ^10.8.1` is unchanged, both peers stay optional, and the `/scaffold` subpath, which the CLI and the studio use, still loads neither.
