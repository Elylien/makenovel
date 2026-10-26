# Native playback mode combinations

Run `node integrations/playback-mode-tests/run-tests.mjs` after installing the locked runtime dependencies and applying its reviewed patches. Do not run during parser/runtime rebuilds.

The bundle executes the production `autoPlay`, `fastSkip`, `nextSentence`, `PerformController`, `setAnimation`, argument utilities and animation end-state functions together. Tests use a deterministic event-loop clock and boundary doubles for the store, script executor, stage manager and renderer. The native `next` flag is passed through the real animation command, but this suite starts at the already-executed animation: it does not independently prove the script executor's immediate `-next` chain.

Coverage includes finite animation completion, auto reading delay, newly introduced blockers, fast settlement versus dialogue advance, unread/forced fast, menu/backlog/flowchart covers, mode cancellation and animation/session cleanup. One legacy `-continue` case covers shared deferred continuation invalidation; it does not expand the finite director form's accepted syntax.

These are execution/lifecycle tests, not visible interpolation, real browser timers, persistent save restoration, actual history/flowchart navigation, audio, Windows package or IME acceptance. The session-cleanup test invokes the same stop/cleanup operations explicitly and does not replace the existing native loadGame integration suite.
