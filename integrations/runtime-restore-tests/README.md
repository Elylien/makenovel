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

The Round 14 runner also executes four preview/storage integration cases in a separate bundle. They keep the compatibility validator, SceneManager, native parser, preview command dispatch, sync-scene handler and load transaction real in the same module session. Network, transport, renderer and sentence advancement remain controlled boundaries. These cases cover rejected loads preserving preview state and releasing the restore lock, the page-scoped latch surviving reinitialization, fresh-page recovery, font/query exemptions and cancellation of an in-flight load by a newer author preview. The runner prints two TAP summaries; sum their totals (66 + 4 at Round 14).


Round 16 adds 17 flowchart cases (83 core + 4 preview integration = 87): retain transient first-dialogue requests, consume permanent errors once, reject stale scene/session/namespace/storage epochs and reinitialization, wait for initialization, avoid duplicate persistence, and cancel pending requests when progress is cleared while allowing a new scene entry. The shared readiness gate does not queue explicit player saves. A retry needs a later safe native commit or the existing initialization-completion call; animation completion alone does not trigger it. A storage write already started cannot be rolled back. Actual player history/flowchart/quick-save restoration is recorded separately in the Round 16 browser evidence.
