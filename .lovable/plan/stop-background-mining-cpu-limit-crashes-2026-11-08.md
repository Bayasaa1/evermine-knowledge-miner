# Stop background mining CPU-limit crashes

## Confirmed issue
Published mining requests repeatedly fail with “Worker exceeded CPU time limit.” The current worker loads large results for up to 50 jobs and combines mining, repeated finalization, rescue, timing repair, re-mining, journal reviews and topic growth in one request. Idle maintenance alone loads results for 40 videos and transcripts for 200 videos. Timing interpolation also repeatedly scans untimed runs, which can amplify CPU work on long transcripts.

Reducing only the four-minute deadline or returning an early response would not reliably fix this. A local preview cannot reproduce the published processing limit.

## Changes
1. Load only lightweight candidate fields; fetch the large chunk/results data only for the selected job. Keep atomic claims, pause/stop handling and the existing six-minute stale lease.
2. Process one mining checkpoint per request. Save its result and next index before any optional work; preserve every previously saved checkpoint and the customer's chosen AI/key behavior.
3. Give finalization its own bounded pass. Avoid rebuilding the entire partial Brain after each background checkpoint; progress remains visible from the saved job. Keep final vault, subtitle, version and project-card creation automatic and recoverable.
4. Split idle maintenance into small persisted work units. Run only one rescue, timing repair, flagged-part repair, review batch or topic-growth unit per invocation, with lightweight selection and a durable cursor so later videos are not starved. Use database leases to prevent overlapping maintenance. Keep all existing automatic capabilities, owner scoping and terminal provider-error behavior.
5. Optimize timing interpolation to avoid repeated array scans while preserving current timestamp calculations and every original subtitle word. Add equivalence and long-transcript regression tests.

## Protection and verification
- Do not delete, rename, merge or relocate videos, projects or personas. Do not reset completed results or spend Lovable AI credits.
- Preserve scheduled callback authentication; inspect the existing schedule before any schedule change. Do not replace reliable awaited checkpoints with detached background promises.
- Run all existing tests, plus bounded-work, overlapping-run, finalization-recovery and timing-equivalence tests.
- Verify job checkpoint and vault readback with a real authorized job. Confirm published CPU-limit failures stop after deployment; report this as unverified until the updated published worker has actually run.

## Technical details
Keep orchestration on the existing TanStack cron route and mining/finalization modules. Maintenance leases/cursors require an application-table migration with RLS/grants and regenerated client types. Avoid large JSON reads in candidate scans; hydrate only the chosen work item. Topic growth must not run inside checkpoint finalization. Keep the existing schedule cadence unless inspection proves a separate change is necessary.

## Already completed
Minimized chat bubbles now have a visible touch-accessible close button. A signed-in real-room test confirmed removal without navigation and persistence after reload on phone and desktop; all 104 tests pass.