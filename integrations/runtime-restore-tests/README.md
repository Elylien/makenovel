# Native restore regression harness

Run `node integrations/runtime-restore-tests/run-tests.mjs` from the repository root after installing the locked WebGAL dependencies.

The runner bundles the production SceneManager, native snapshot/save/quick-load/backlog/flowchart paths, scene call/return controllers, start/title transitions and PerformController. The restore preflight uses the installed native `webgal-parser` with asset collection and no network preload callback. Tests substitute compatibility/network/storage/renderer boundaries to control failures and response order. The compatibility validator and persistent storage adapter require their separate tests; these tests do not claim browser, GPU, audio, Electron durability or Windows offline acceptance.

Coverage includes:

- Preflight failure leaves the current scene, stage, backlog, GUI visibility and running performances untouched; a synchronous renderer rejection rebuilds the prior native state.
- Last request wins across delayed restores and quick-slot reads; title, start and reset invalidate stale completions without unlocking a newer request.
- Current, parent call-frame and nested backlog pointers are checked against native parsed sentence counts. Backlog must use the same metadata and preflight as ordinary saves.
- Native call/return mutates the frame stack only after source retrieval and parsing succeeds; return values and parent locals restore once.
- Saves retain click-time data, validate before publication, keep the old visible slot on persistence failure and suppress superseded requests.
- Flowchart snapshots include compatibility metadata and current locals, and do not publish after a failed version gate.
- Old deferred perform retries cannot advance a replacement session.
- Start waits for runtime bootstrap before fetching or mutating the stage; repeated starts and title cancellation keep the newest session authoritative.
- Production preview command dispatch and legacy `JMP` mark the page before author variables or scripts run, preventing manual and quick saves at the compatibility boundary. Read-only preview queries keep persistence enabled. The separate compatibility suite covers the marker remaining latched through later initialization.
- Editor preview registration keeps the author's original `Game_key` as its routing identity while player storage retains its versioned namespace.
- Automatic font-optimization setup and read-only queries retain player persistence; explicit text-read overrides and author script commands still mark the page before changing stage semantics.

Ordinary scene switches temporarily reject restore admission. Failures during preflight do not stop an active performance; it may finish naturally while input waits for validation. Rebuilding native state after a synchronous commit error cannot roll back arbitrary external plugin effects. These are conservative runtime guards, not cross-version save migration.

The additional UI harness runs with `node integrations/runtime-restore-tests/run-ui-tests.mjs`. It calls the production Save, Load and BottomControlPanel component event handlers using React hook, JSX and service boundaries, so deferred success and failure are observable without a browser. It checks that success sounds/settings writes occur only after completion, malformed preview payloads remain renderable and asynchronous slot-read rejection is handled. Browser focus, layout, real sound playback and accessibility remain separate checks.

Flowchart regressions also cover disabled storage and namespace changes during initialization, persistence and snapshot reads. Cleanup waits for in-flight persistence, uses a captured nonempty namespace, and reports failures instead of silently clearing current UI state.
