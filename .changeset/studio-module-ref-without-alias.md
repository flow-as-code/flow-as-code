---
"@flow-as-code/studio": minor
---

The reference picker's "new reference…" takes a module without an alias: leave the alias prompt blank to write `${cdref:module:<name>}`, which runs the module's current content. Cancelling the alias prompt abandons the new reference. An alias that is not a slug is still refused.
