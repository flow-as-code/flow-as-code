---
"@flow-as-code/core": patch
---

New lint rule `channel-restricted-action` (warning): an action whose page supports it on some channels only is reported wherever it appears, naming the channels and the page. Today that is `Wait` and `ShowView`, both chat only (the catalog's new `channels` field, absent where a page states no channel restriction). It is a warning rather than an error because a flow's channel is decided by the contact that reaches it, not by the document, which records no channel; disable it on a flow that serves chat alone. `flow-cli lint` and the studio's lint panel report it.
