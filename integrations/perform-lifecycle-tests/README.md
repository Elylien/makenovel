# Native perform lifecycle tests

Run `node integrations/perform-lifecycle-tests/run-tests.mjs` from the root.

The suite executes the production PerformController, StageStateManager and native
background/figure handlers with controlled clocks and renderer boundaries. The
18 cases cover continuation coalescing, batch unload reentrancy, startup/reset
cancellation, stale callbacks, exact state identity for parallel performances,
and independent enter/exit durations. It does not prove GPU animation frames.

Red regressions were recorded before each fix: the first lifecycle group had
seven failures, the four duration cases all failed, and two exact-identity cases
failed before the stage API change. Current suite results belong in TESTING.md.
