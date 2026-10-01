# C01 CI green on main again

Phase C, baseline. The last CI run on main, 36742854426 (2026-09-30, the
merge of #19), failed in the `emit-tf goldens / tofu 1.7.0` job with every
test passing: Vitest reported one unhandled error, `ReferenceError: window is
not defined`, and attributed it to `packages/studio/tests/demo-boot.test.tsx`.
The previous run on main (36740035513) passed the same file, so the failure
is intermittent: something the test schedules outlives its environment's
teardown.

## Acceptance criteria

- The cause is named in this file: which callback, timer, worker or
  microtask reaches for `window` after happy-dom is torn down, and why the
  order varies between runs.
- The fix removes the late access (awaits or cancels it before teardown)
  rather than defining `window` globally or filtering the unhandled error in
  the Vitest config. `dangerouslyIgnoreUnhandledErrors` stays off.
- The failure is reproduced before the fix, by a loop over the file or a
  forced ordering, and the same loop passes after it; the command and counts
  are recorded here.
- Three consecutive CI runs on main are green after the merge, with their
  run URLs recorded here.
- `CLAUDE.md`'s "Where things stand" line about CI states what `gh run list`
  shows once this lands.

## Assumptions

- The error is a test-harness defect, not a defect in the built demo: the
  runtime check in A14 and the live site show a clean console.

## Notes (2026-09-30)

What landed, against each criterion. Not closed: the CI criteria wait on a
push and a merge.

- **Cause.** The two boot tests (`tests/demo-boot.test.tsx`,
  `tests/bundle-boot.test.tsx`) import the built bundle, which mounts its own
  React root and carries its own copy of React. The tests detached `#root`,
  which stops nothing. Vitest leaves node's timers in place under happy-dom,
  so the app's lint debounce (a 200 ms `setTimeout`) could fire after the
  test had passed; the render it scheduled, through node's `setImmediate`,
  committed after the environment had deleted `window`, and react-dom's
  commit (`getActiveElementDeep`) threw `ReferenceError: window is not
defined`, reported against the file. The order varies with runner speed:
  on a fast runner the debounce fires inside the test's own waits.
- **Fix** (`fix(studio): unmount on pagehide ...`). `src/main.tsx` unmounts
  the app on a `pagehide` that is not entering the back/forward cache, so
  every effect cleanup runs: the lint debounce and watchdog timers, the lint
  worker, the bridge subscription. The boot tests fire `pagehide` through
  `discardBuiltPage` (`tests/appHarness.tsx`), which asserts the app
  unmounted and waits until the bundle's FiberRoot has no pending lanes and
  no scheduled callback. Nothing defines `window` globally and
  `dangerouslyIgnoreUnhandledErrors` stays off.
- **Reproduction** (a forced ordering, from the review of this branch on
  2026-09-30). In a scratch clone with the built bundle's `setTimeout`
  instrumented to count timers still pending at test end: without the
  `pagehide` unmount and with the boot test's post-mount wait cut to 50 ms or
  150 ms, one bundle timer of 200 ms (the lint debounce) is outstanding when
  the test ends, which is the window in which the late render runs. With the
  fix, none is outstanding at 50, 150 or 300 ms. Separately, against the old
  bundle both boot tests fail on `discardBuiltPage`'s unmount assertion, and
  pass after the rebuild. A loop over the file was not used: the failure did
  not reproduce locally in a loop, because a fast machine fires the debounce
  inside the test.
- **CI runs.** None yet: the branch has not been pushed. Record three
  consecutive green runs on main after the merge, with their URLs, here.
- **CLAUDE.md.** Its CI line still says main is red pending this task, which
  is what `gh run list` shows until the merge. Restore "is green" in the same
  change that records the three runs above, not before.
