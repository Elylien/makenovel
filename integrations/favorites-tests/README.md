# Favorite data regression

`npm.cmd run test:favorites` bundles the production data module with the locked native parser. The harness replaces storage, compatibility preflight, time/context boundaries and Web Locks; it exercises snapshot identity, encoded resource paths, durable acknowledgements, stale sessions, corrupt envelopes, version isolation, write ordering and read-only fallback. It never runs a game or rewrites author source.

`npm.cmd run test:save-compatibility` independently exercises the real shared byte-validation helper against controlled manifest/file responses, including changed audio, version/session changes, preview isolation and the 32 MiB limit. This is separate from the favorite module's preflight substitute.

`npm.cmd run test:favorites-ui` bundles the production UI and audition helper with a deterministic hook/media harness. It checks pending writes, stale effects, filter/order, controls, keyboard/composition boundaries, mute ownership, audition cancellation and URL cleanup. It is not a browser renderer or a system IME.

Actual player interactions and listening/Windows boundaries must be recorded separately. See `docs/PLAYER_FAVORITES.md` for the user-facing behavior and `docs/TESTING.md` for current evidence.
