---
"@flow-as-code/studio": patch
---

The studio unmounts when its page is discarded (a `pagehide` that is not entering the back/forward cache), so the lint worker, its timers and the bridge subscription are closed by their own cleanups rather than left to the browser. A page kept in the back/forward cache is untouched and restores as it was.
