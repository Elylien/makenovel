# Native storage ordering and initialization barrier

Run `node integrations/save-storage-tests/run-tests.mjs`. The runner bundles the production `storageController.ts` and `savesController.ts`, preserving their asynchronous code, queues, debounce, cloning and normalization. It replaces localforage, Redux dispatch, WebGAL identity and the compatibility-status boundary with controlled test doubles. The unlock cases additionally run the four native script handlers and the native user-data reducer, with audio and rendering boundaries replaced. These 35 checks do not claim real IndexedDB, Electron flush or crash durability acceptance.

The checks cover:

- Slot and fast-save failures do not dispatch success; same-key writes commit in order only after storage acknowledges them, and one failure does not poison the queue.
- Values are cloned when requested. Reads wait for earlier queued writes; a late normal-slot read cannot overwrite a newer write. A superseded fast-save read rejects instead of returning an obsolete snapshot to the restore caller.
- Every native read/write checks the enabled flag, captured namespace and storage epoch. Old queued work cannot enter a new namespace; a late result cannot dispatch into it. The epoch also handles A→B→A and disable→enable initialization cycles.
- Explicit operations reject and report failures. Their returned promises have rejection handlers attached, so historical fire-and-forget menu callers do not create unhandled rejections; callers that await them still receive the failure.
- Debounced and background user persistence skip while initialization is disabled and do not replay those calls after the backup barrier opens.
- `bgm`, `changeBg`, `unlockBgm` and `unlockCg` keep their native in-memory unlocks while preview storage is disabled, perform no disk access in that state, and persist through the versioned controller when enabled.
- Legacy keys are refused even if a caller mistakenly enables storage; new verified namespaces and isolated unverified settings namespaces are recognized.
- User-data normalization writes before committing its Redux replacement. Failed writes preserve memory and original stored content. Late reads/normalization cannot reset newer local user state.

An already-started localforage write cannot be cancelled after the database has accepted it. A subsequent namespace/epoch change prevents its UI commit and prevents later queued writes from starting, but does not roll back that earlier write. Initialization must complete its pre-write backup before enabling these paths. Other direct native storage writers require their own barrier checks.
