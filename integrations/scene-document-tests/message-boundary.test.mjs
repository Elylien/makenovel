import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const origin = 'http://127.0.0.1:3001';
for (const [moduleName, exportName, props] of [
  ['jsonResource', 'JsonResourceDisplay', { url: 'games/test/game/animation/a.json' }],
  ['templateEditor', 'default', { path: 'templates/test/template.html' }],
]) {
  test(`${moduleName} only accepts typed messages from its own same-origin iframe`, async () => {
    const sent = [];
    const childWindow = { postMessage: (...args) => sent.push(args) };
    const listeners = new Map();
    const h = { iframe: { contentWindow: childWindow }, ready: [], writes: [], cleanups: [] };
    globalThis.__messageHarness = h;
    globalThis.window = {
      location: { origin },
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
    };
    const module = await import(pathToFileURL(path.join(process.env.SCENE_DOCUMENT_TEST_BUNDLE, `${moduleName}.mjs`)));
    module[exportName](props);
    const receive = listeners.get('message');
    assert.equal(typeof receive, 'function');
    assert.equal(sent.length, 3);
    for (const [, targetOrigin] of sent) assert.equal(targetOrigin, origin);
    const message = (data, changes = {}) => receive({ origin, source: childWindow, data, ...changes });
    message({ type: 'valueChanged', value: 'foreign overwrite' }, { origin: 'https://example.com' });
    message({ type: 'valueChanged', value: 'other window overwrite' }, { source: {} });
    message({ type: 'editorReady' }, { origin: 'null' });
    for (const badPayload of [null, [], 'valueChanged', true, {}, { type: 'valueChanged' }, { type: 'valueChanged', value: {} }, { type: 'unknown', value: 'x' }]) message(badPayload);
    assert.equal(h.writes.length, 0);
    assert.equal(h.ready.length, 0);
    message({ type: 'editorReady' });
    assert.deepEqual(h.ready, [true]);
    message({ type: 'valueChanged', value: '' });
    message({ type: 'valueChanged', value: '正常编辑' });
    assert.deepEqual(h.writes.map(item => item.textFile), ['', '正常编辑']);
    await new Promise(resolve => setImmediate(resolve));
    for (const cleanup of h.cleanups) cleanup?.();
    assert.equal(listeners.has('message'), false);
    delete globalThis.window;
    delete globalThis.__messageHarness;
  });
}

test('Monaco frame refuses foreign parent messages and does not save programmatic loads', async () => {
  const html = await readFile(new URL('../../vendor/WebGAL_Terre/packages/origine2/public/monaco-iframe/monaco.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const source = scripts.find(script => script.includes("require(['vs/editor/editor.main']"));
  assert.ok(source);
  const sent = [];
  let value = '';
  let receive;
  let changed;
  const actions = [];
  const parent = { postMessage: (...args) => sent.push(args) };
  const model = { getFullModelRange: () => ({}) };
  const editor = {
    getModel: () => model,
    getValue: () => value,
    executeEdits: (_, edits) => { value = edits[0].text; changed?.(); },
    onDidChangeModelContent: fn => { changed = fn; },
  };
  runInNewContext(source, {
    require: (_, ready) => ready(),
    window: { parent, location: { origin }, addEventListener: (_, handler) => { receive = handler; } },
    document: { getElementById: () => ({}) },
    monaco: { editor: {
      create: () => editor,
      setModelLanguage: (_, language) => actions.push(['language', language]),
      setTheme: theme => actions.push(['theme', theme]),
    } },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0].type, 'editorReady');
  assert.equal(sent[0][1], origin);
  const message = (data, overrides = {}) => receive({ source: parent, origin, data, ...overrides });
  message({ type: 'setValue', value: 'foreign overwrite' }, { origin: 'https://example.com' });
  message({ type: 'setValue', value: 'other window overwrite' }, { source: {} });
  for (const badPayload of [null, [], 'setValue', {}, { type: 'setValue', value: {} }, { type: 'setLanguage', language: [] }, { type: 'setTheme', theme: null }]) message(badPayload);
  assert.equal(value, '');
  assert.equal(actions.length, 0);
  message({ type: 'setValue', value: 'loaded from disk' });
  assert.equal(value, 'loaded from disk');
  assert.equal(sent.length, 1, 'loading a snapshot must not emit a user edit');
  message({ type: 'setLanguage', language: 'json' });
  message({ type: 'setTheme', theme: 'vs-dark' });
  assert.deepEqual(actions, [['language', 'json'], ['theme', 'vs-dark']]);
  value = 'user edit';
  changed();
  assert.equal(sent.length, 2);
  assert.equal(sent[1][0].type, 'valueChanged');
  assert.equal(sent[1][0].value, 'user edit');
  assert.equal(sent[1][1], origin);
});
