# Scene document regression tests

```powershell
node.exe integrations/scene-document-tests/run-tests.mjs
node.exe integrations/scene-document-tests/run-message-tests.mjs
node.exe integrations/scene-document-tests/run-source-editor-tests.mjs
node.exe integrations/scene-document-tests/run-graph-input-tests.mjs
```

This uses the locked Terre checkout's existing esbuild to bundle the actual frontend TypeScript modules into ignored `.scratch/scene-document-tests/`, then executes Node's built-in test runner. No new package or lockfile is required.

The tests cover revision-checked saving, bounded shared undo/redo, explicit recovery, external-change conflicts, edits during in-flight saves, stale reload completions, composition guards, independent browser recovery copies, storage failures, and BOM/mixed-EOL preservation. The vault tests use in-memory storage boundaries; real page closure and multiple-scene behavior require browser evidence.

The shared registry owns browser sessions and API transport; `useSceneDocument.ts` subscribes to it. The preview barrier checks documents opened for the current game, including retained drafts from closed editor tabs and active composition. Recovery copies are scoped to an opaque server workspace identity, file path and independent document owner. New client writes include expectedWorkspaceId; older clients that omit it retain only revision protection. This is a scene-document boundary, not a project filesystem recovery system or a transaction protocol for JSON/templates.

The source-input tests bundle the production `bindSourceEditor` boundary with a Monaco event/model double. They exercise composition buffering, keyboard/native history requests, paste grouping and disposal without importing a second editor implementation. They do not prove a particular Windows IME candidate window works; actual Chinese typing, Monaco rendering and shortcuts are separately recorded in UI evidence.

The graphical-input harness invokes the production TSX handlers with small React, form-value and debounce doubles. It checks pending input, composition completion/disposal and stale callback boundaries. This is an event-boundary regression suite, not native browser composition or candidate-window validation.

The separate message tests bundle the actual JSON-resource and template-editor components with small React/network boundary doubles, invoke their registered message callbacks, and execute the actual Monaco iframe script in a Node VM with an editor double. They verify exact origin and window-source checks, payload types, exact outbound target origins, and suppression of writes caused by programmatic snapshot loads. These tests do not replace a browser rendering test.
