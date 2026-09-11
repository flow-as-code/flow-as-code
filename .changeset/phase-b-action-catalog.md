---
"@flow-as-code/core": minor
---

Add the machine-readable action catalog (`conformance/flow-language/catalog.json`, shipped as `catalog/catalog.json` inside the package) with `actionCatalog`, `catalogEntry`, `modeledEntry`, `requiredErrors`, `textBodyPaths`, `announcePaths` and `recordingEnablerPath`; `snakeCaseKey`, the one rule between a Flow language key and its HCL attribute name; `readPath` and `isCatalogPath` for dotted paths into Parameters; and `refPathsOf` and `readRefPath`. `REFERENCE_FIELDS` keys are now catalog paths (unchanged for every field modeled so far). The `error-branches`, `prompt-length-3000` and `recording-consent-before-record` rules read the catalog; their findings on the modeled set are unchanged.
