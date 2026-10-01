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
