import { readFile } from 'node:fs/promises';
import { applyDialogueEdits, inspectScene } from './source-roundtrip.mjs';

const source = await readFile(new URL('./fixtures/rain-scene.txt', import.meta.url));
const snapshot = inspectScene(source);
const result = applyDialogueEdits(source, {
  expectedHash: snapshot.hash,
  edits: [{ nodeId: 'rain.opening', text: '雨停之后，一起回家吧。🌧️' }],
});
console.log(JSON.stringify({
  operation: 'in-memory-only; no file was written',
  beforeHash: result.beforeHash,
  afterHash: result.afterHash,
  changes: result.changes,
}, null, 2));
