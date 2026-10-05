---
"@flow-as-code/cli": patch
"@flow-as-code/core": patch
---

The studio bridge answers an error no route expected with the fixed line `Internal bridge error.` and logs the error itself, stack included, on the terminal that runs `flow-cli studio` (`startStudioServer` takes an `onError` callback for it); the error's text used to be the response body. `materializeWithMap` scans for a token left inside a longer string in one linear pass, where a run of `${cdref:` openings with no close used to cost quadratic time.
