# Player backup boundary

`node integrations/save-backup-tests/run-tests.mjs` bundles the production `saveBackup.ts` and runs its 35 tests against an asynchronous key/value storage double. It does not initialize WebGAL, drive IndexedDB, or claim browser/Electron durability acceptance.

The production API accepts the existing default localforage instance without changing its driver or database:

```ts
const scope = { projectId, legacyGameKey, legacyGameName };
await preserveBeforeInitialization(localforage, scope); // MUST precede getStorageAsync and all writers
const archive = await captureSaveBackup(localforage, scope);
const text = JSON.stringify(archive);
await verifySaveBackup(JSON.parse(text), scope); // validation only, never imports or restores
```

`projectId` is optional for an unsealed project. Such a scope includes its original `Game_key` group and the exact `makenovel-unverified-v1:<SHA-256 of legacyGameKey>` settings key derived internally with WebCrypto. The same settings key remains included after the project is sealed. No caller-supplied unverified namespace or unverified slot/flowchart key is accepted. Empty/invalid keys and reserved MakeNovel storage prefixes are rejected; the caller must not initialize writers after a failed pre-write copy.

## Archive and coverage

The v1 archive has a checksummed payload: creation timestamp, reason, scope, sorted original-key records, and preserved pre-initialization archives. SHA-256 covers canonical JSON of the whole payload. It detects damage; it does not authenticate a publisher. Export validation checks the scope, allowed key patterns, duplicate keys, tagged-value schemas and every retained checksum. There is no active-store import API.

Captured groups include the original user data (globals, read history, settings, unlocks), every numbered save key actually present (including slots beyond the currently visible page), fast save, flowchart progress and all flowchart snapshots. Older FastSaveKey/FastSaveActive keys are included only when the caller knows the original game name. All exact `makenovel-v1:<projectId>:<64 lowercase hex hash>` namespaces for the same project are included. Other project IDs and prefix neighbors are excluded. Legacy keys contain no authenticated project identity; an old Game_key collision cannot be resolved retrospectively.

Tagged values preserve null, undefined, sparse arrays, JSON objects/primitives, exceptional numbers, bigint, Date, ArrayBuffer/views, Blob, Map and Set. Unknown player-data versions and damaged primitive contents are retained without interpreting or normalizing them. Circular data, unsupported object classes, File metadata and symbol/custom-array properties reject the copy rather than silently losing data. This is a copy of values exposed by localforage, not a byte-level database backup or a graph-identity serialization protocol.

Pre-initialization copies use fresh `makenovel-backup-v1` UUID keys, are read back and checked before success, and never replace/delete any existing key. An unchanged complete record set can reuse a previously verified copy. Changed sets append a copy; there is no automatic expiry. Manual export includes copies from before a project was sealed and other versions of the same project; nesting is limited to one level. Corrupt retained copies are not silently omitted from export.

## Limits

- Startup must await the pre-write barrier. Two reads detect observed concurrent key/value changes but do not create a cross-tab transaction; pause other instances during export.
- Quota, permission, serialization and readback failures reject; callers must surface the error and stop subsequent initialization writes. No cleanup is attempted.
- Browser storage clearing, origin/profile changes and abnormal host failure remain outside this module. Downloaded backups are user-controlled copies; validation alone does not restore play progress.
- Bounds: 10,000 selected records/copies, 100 encoded nesting levels, 256 MiB of canonical JSON characters. Oversized/unsupported data stays untouched.
- Integration still needs the actual initialization order, real localforage and visible export/download verification. These tests use a boundary double and do not grant those checks automatically.
