# Pre-write backup initialization wiring

Run `node integrations/save-initialization-tests/run-tests.mjs`.

The 16 tests bundle the **production** `infoFetcher.ts`, `saveBackup.ts`, `storageController.ts` and `savesController.ts` together, and separately bundle production `initializeScript.ts`, `templateLoader.ts` and `useConfigData.ts`. The async database, Redux/React effect boundaries, config parser/network response, rendering services, flowchart manager and version-verification outcome are controlled doubles. Manifest hashing and snapshot validation are covered separately; this suite deliberately tests the initialization wiring rather than recreating that protocol.

Verified boundaries:

- While compatibility verification or backup readback is pending, storage remains disabled and user normalization, slot reads, fast-save setup and flowchart initialization do not begin.
- A successful backup is written and read back before storage is enabled; user data, fast save, slot zero, flowchart and render then occur in that order.
- Backup quota errors, damaged readback and readback I/O failures keep native storage disabled, retain the original keys and still resolve the render/config startup path. The final debounced persistence does not bypass the disabled barrier.
- A missing-manifest outcome uses only the isolated unverified namespace for settings; legacy user state, opaque old slots and flowchart data stay unchanged in both the original namespace and their backup.
- A native user-data read failure after backup disables subsequent startup writes and still resolves render.
- An empty namespace initializes without an empty backup or collecting unrelated-game values.
- Verified config text replaces the earlier axios response before runtime config, visible properties and persisted initialization config are derived.
- The production bootstrap does not load a playable scene, template or animation while `infoFetcher` is pending. It awaits the animation loads and the production template loader's pending style requests before releasing runtime initialization and binding preview/input services.
- Verified animation table, animation data, template JSON and template styles are consumed from the verification cache without a second network request.
- Bootstrap information/animation failures disable persistence, resolve the render fallback and release the initialization barrier.
- The host render callback removes itself after its first call, matching `index.html`. Later animation or opening-scene failures keep storage disabled, preserve the original error and finish startup without an unhandled rejection.
- The actual config hook can update title/background/logo/BGM properties but cannot replace the assigned storage namespace or reload legacy user/slot state. A changed original Game_key marks the session invalid and preserves the namespace rather than adopting the other key.

These are executable connection tests, not a real browser/Electron database test or a claim that the canvas/input/audio gameplay was visually inspected under each injected failure.
