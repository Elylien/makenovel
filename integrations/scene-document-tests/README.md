# Scene document regression tests

```powershell
node.exe integrations/scene-document-tests/run-tests.mjs
node.exe integrations/scene-document-tests/run-message-tests.mjs
```

This uses the locked Terre checkout's existing esbuild to bundle the actual frontend TypeScript modules into ignored `.scratch/scene-document-tests/`, then executes Node's built-in test runner. No new package or lockfile is required.

The tests cover explicit revision-checked saving, draft recovery, external-change conflicts, failures and retries, edits during in-flight saves, stale refresh/reload completions, storage failures, literal filesystem names, and BOM/mixed-EOL preservation in source and graphical helper edits. They exercise state and text mechanisms; browser input/IME, Monaco events, actual disk transactions, and preview behavior require their own integration evidence.

The shared `sceneDocumentRegistry.ts` owns browser sessions and API transport; `useSceneDocument.ts` subscribes to that registry. Pure state tests intentionally bundle `sceneDocument.ts` directly. `editorPreviewClient.ts` depends on the registry's `canPreviewDocuments()` mutation barrier; the registry has no import back to the preview client or React hook. The barrier conservatively checks all documents opened in this page, including retained drafts from closed tabs. Query messages remain available. This is a scene-document boundary, not revision-checked saving for JSON resources or template files.

The separate message tests bundle the actual JSON-resource and template-editor components with small React/network boundary doubles, invoke their registered message callbacks, and execute the actual Monaco iframe script in a Node VM with an editor double. They verify exact origin and window-source checks, payload types, exact outbound target origins, and suppression of writes caused by programmatic snapshot loads. These tests do not replace a browser rendering test.
