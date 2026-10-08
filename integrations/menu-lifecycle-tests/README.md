# Native menu continuation tests

Run `node integrations/menu-lifecycle-tests/run-tests.mjs` from the repository root.

The runner bundles the reviewed production `nextSentence.ts` with the locked
esbuild dependency. Redux subscription, stage rendering and script execution
boundaries use controlled substitutes; the actual continuation/input gate is
executed. The tests cover six overlays, nested overlays, one deferred natural
completion, manual-input races, title cancellation, scene/session changes and
ordinary native progression. They do not prove Pixi rendering or audible output.

The round-six policy keeps animation and audio clocks running behind menus.
Story advancement waits; after the last overlay closes, a pending natural
completion advances at most once if the exact scene position and session are
still current. A manual next wins over a queued completion. Title/new-game/load
invalidates the old request. Clicking a covered stage cannot settle performances
or emit a game input event.

Before the patch, 14 of 15 cases failed. Raw local red/green evidence is retained
under the ignored `docs/evidence/local/round6/` directory.
