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

## CI runs (2026-10-05)

`gh run list --repo flow-as-code/flow-as-code --workflow ci.yml --branch main`
shows, from the fix's merge (#21, 2026-10-01 00:10 UTC) onward:

| Run                                                                   | Commit    | Push                  | Created (UTC)    | Result    |
| --------------------------------------------------------------------- | --------- | --------------------- | ---------------- | --------- |
| https://github.com/flow-as-code/flow-as-code/actions/runs/36794773178 | `03e149c` | merge of #20          | 2026-10-01 00:09 | cancelled |
| https://github.com/flow-as-code/flow-as-code/actions/runs/36794797898 | `7f47603` | merge of #21, the fix | 2026-10-01 00:10 | cancelled |
| https://github.com/flow-as-code/flow-as-code/actions/runs/36794827383 | `cb09ee6` | merge of #22          | 2026-10-01 00:10 | success   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/36795832942 | `1462963` | merge of #23          | 2026-10-01 00:22 | success   |

The runs for #20 and #21 themselves were cancelled when the next merge
started: `ci.yml` sets `cancel-in-progress: true` on a group keyed by the
ref, so three merges within a minute leave only the last one running. A
cancelled run counts neither way. The criterion asks for three consecutive
green runs on main after the merge; two are recorded here and none has failed
since, so the criterion is not met yet and waits on one more. The next push to
main is the third: record its run id and result here, and close the task on a
green one. Nothing in this section claims more than `gh run list` shows.

`CLAUDE.md`'s CI line already read "green on main again" when these runs were
checked; the same change that records them here cites the two runs on that
line, so the claim there is the one `gh run list` supports.

## Closed (2026-10-05)

The third consecutive green run on main after the fix is 37344998368, the
merge of #25 (`940af58`, created 2026-10-05 16:59 UTC). With 36794827383 and
36795832942 above, that is the three the criterion asks for, and the task is
closed on it. `CLAUDE.md`'s CI line cites that run.

Every run on main from that one to the end of the day, from the same
`gh run list` command, so the record is what the command shows and not a
summary of it:

| Run                                                                   | Commit    | Push         | Created (UTC)    | Result    |
| --------------------------------------------------------------------- | --------- | ------------ | ---------------- | --------- |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37344998368 | `940af58` | merge of #25 | 2026-10-05 16:59 | success   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37345362127 | `eb68746` | merge of #26 | 2026-10-05 17:01 | success   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37345797787 | `fac6f1a` | merge of #16 | 2026-10-05 17:05 | success   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37347679736 | `e77b52c` | merge of #24 | 2026-10-05 17:20 | success   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37348473632 | `1b674b1` | merge of #27 | 2026-10-05 17:26 | cancelled |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37348490241 | `3bd04c4` | merge of #28 | 2026-10-05 17:26 | success   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37350067962 | `19fe7e1` | merge of #30 | 2026-10-05 17:39 | cancelled |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37350251604 | `78ea9bf` | merge of #33 | 2026-10-05 17:41 | failure   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37353272145 | `f737583` | merge of #36 | 2026-10-05 18:05 | success   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37353765499 | `8322121` | merge of #29 | 2026-10-05 18:09 | success   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37373432430 | `02bae32` | merge of #37 | 2026-10-05 21:02 | cancelled |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37373477595 | `4ef9c91` | merge of #31 | 2026-10-05 21:02 | failure   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37375455463 | `8b00b1b` | merge of #39 | 2026-10-05 21:22 | success   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37377059015 | `db3fc9b` | merge of #40 | 2026-10-05 21:37 | success   |
| https://github.com/flow-as-code/flow-as-code/actions/runs/37377884054 | `78b0a87` | merge of #35 | 2026-10-05 21:44 | success   |

The cancelled runs are `cancel-in-progress` again: each was superseded by a
merge within a minute. The two failures are not this task's defect, and
neither is intermittent:

- 37350251604 (#33) failed `npm test` in every job on two cases in
  `tests/probeCreate.test.ts` ("committed probe sets > 40"): #30 (the D00
  census) had landed probe set 40 ninety seconds earlier in a shape the
  runner's test refuses (`AuthenticateParticipant.json: missing
"description"`), and the two were green separately but not together. #36
  (`f737583`, 18:05 UTC) put the probes in the runner's shape; the next run
  passed. Main was red for 24 minutes.
- 37373477595 (#31) is recorded as `failure` because six of its seven jobs
  were cancelled at 21:18 UTC, after fifteen minutes queued with no runner
  assigned and no step run; the one job that ran, `build / node 22`, passed
  every step. No merge cancelled it: the next push to main (#39) came four
  minutes after the cancellation, and its run passed.

## Known timing-sensitive tests (2026-10-05)

Three tests failed on timing on 2026-10-05, never on main. They are recorded
here so the next red run on one of them is read as known and not as new, and
so a follow-up deflakes them with evidence rather than a retry. This is a
record of what was seen, not a claim in `CLAUDE.md`; see C11, which carries
the follow-up.

- `packages/cli/src/bridge/server.test.ts`, "studio bridge: repeated canvas
  saves under the watcher > recognizes its own writes, so three saves in a
  row stay in sync". Failed on `build / node 24` only, in the first attempt
  of run 37345013618 (the Dependabot PR #16, which changes nothing the test
  touches); the other six jobs passed, and attempt 2 passed in full. Its
  wall time on the failing run was 1721 ms.
- `packages/cli`'s simulate subprocess case (C14), and
- `watch`'s sub-second re-sync case:
  both seen on a teammate's local run on 2026-10-05 with `npm run lint` and
  `npm run typecheck` executing beside the suite, which starves the
  sub-second waits those tests make; each passed alone. No CI run has shown
  either.
