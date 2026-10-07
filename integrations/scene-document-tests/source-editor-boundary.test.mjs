import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = name => import(pathToFileURL(path.join(process.env.SOURCE_EDITOR_TEST_BUNDLE, `${name}.mjs`)));
const { bindSourceEditor } = await load('sourceEditor');
const { SceneDocument } = await load('sceneDocument');
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const original = '\uFEFF; header\r\nsay:原文; author  \r\n';
const api = { KeyMod: { CtrlCmd: 2048, Shift: 1024 }, KeyCode: { KeyZ: 56, KeyY: 55, KeyS: 49 }, editor: { CursorChangeReason: { Explicit: 3 } } };
function emitter() {
  const listeners = new Set();
  return { subscribe: fn => { listeners.add(fn); return { dispose: () => listeners.delete(fn) }; }, fire: value => { for (const fn of [...listeners]) fn(value); }, count: () => listeners.size };
}
function fakeEditor() {
  let value = '';
  const events = Object.fromEntries(['onDidCompositionStart', 'onDidCompositionEnd', 'onDidChangeModelContent', 'onDidChangeCursorSelection', 'onDidPaste', 'onDidDispose'].map(name => [name, emitter()]));
  const domListeners = new Map();
  const actions = new Map();
  let writes = 0;
  const model = {
    getValue: () => value,
    setValue: text => { value = text.replace(/\r\n/g, '\n'); writes++; events.onDidChangeModelContent.fire({ isFlush: true, changes: [] }); },
  };
  const dom = {
    addEventListener: (name, fn) => { if (!domListeners.has(name)) domListeners.set(name, new Set()); domListeners.get(name).add(fn); },
    removeEventListener: (name, fn) => domListeners.get(name)?.delete(fn),
  };
  const editor = {
    ...Object.fromEntries(Object.entries(events).map(([name, event]) => [name, event.subscribe])),
    getContainerDomNode: () => dom, getModel: () => model,
    updateOptions: () => {}, saveViewState: () => ({ cursor: 'same' }), restoreViewState: () => {},
    addAction: action => { actions.set(action.id, action); return { dispose: () => actions.delete(action.id) }; },
    getTargetAtClientPoint: () => ({ range: range(2, 5, 5) }),
    executeEdits: (_source, edits) => apply(edits),
  };
  function apply(changes, flags = {}) {
    const lines = value.split('\n');
    const offset = (line, column) => lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0) + column - 1;
    const patches = changes.map(change => ({ start: offset(change.range.startLineNumber, change.range.startColumn), end: offset(change.range.endLineNumber, change.range.endColumn), text: change.text }));
    for (const patch of patches.sort((a, b) => b.start - a.start)) value = value.slice(0, patch.start) + patch.text.replace(/\r\n/g, '\n') + value.slice(patch.end);
    events.onDidChangeModelContent.fire({ changes, isUndoing: false, isRedoing: false, isFlush: false, isEolChange: false, ...flags });
  }
  function fireDom(name, init = {}) {
    const event = { key: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, cancelable: true, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...init };
    for (const fn of [...(domListeners.get(name) ?? [])]) fn(event);
    return event;
  }
  return { editor, events, model, apply, fireDom, actions, writes: () => writes, listeners: () => [...domListeners.values()].reduce((n, set) => n + set.size, 0) + Object.values(events).reduce((n, event) => n + event.count(), 0) };
}
function range(line, start, end) { return { startLineNumber: line, startColumn: start, endLineNumber: line, endColumn: end }; }
function edit(h, text, start = 5, end = 5) { h.fake.apply([{ range: range(2, start, end), text }]); }
async function harness(initial = original) {
  let stored = null;
  const calls = [];
  const transport = { read: async () => ({ text: initial, revision: A }), save: async text => { calls.push(text); return { text, revision: B }; } };
  const document = new SceneDocument(transport, { read: () => stored, write: text => { stored = text; }, clear: () => { stored = null; } });
  await document.load();
  const fake = fakeEditor();
  const binding = bindSourceEditor(fake.editor, api, document);
  return { document, fake, binding, calls, transport, stored: () => stored };
}

test('source typing coalesces and Ctrl Z, Ctrl Shift Z and Ctrl Y use the shared history', async () => {
  const h = await harness();
  edit(h, 'A'); edit(h, 'B', 6, 6);
  const typed = original.replace('say:', 'say:AB');
  assert.equal(h.document.getSnapshot().text, typed);
  const undo = h.fake.fireDom('keydown', { key: 'z', ctrlKey: true });
  assert.equal(undo.prevented, true);
  assert.equal(undo.stopped, true);
  assert.equal(h.document.getSnapshot().text, original);
  h.fake.fireDom('keydown', { key: 'Z', ctrlKey: true, shiftKey: true });
  assert.equal(h.document.getSnapshot().text, typed);
  h.document.undo();
  h.fake.fireDom('keydown', { key: 'y', ctrlKey: true });
  assert.equal(h.document.getSnapshot().text, typed);
  assert.equal(h.fake.model.getValue(), typed.slice(1).replace(/\r\n/g, '\n'));
  h.binding.dispose();
});

test('graph changes use the same context-menu undo and redo even after model replacement', async () => {
  const h = await harness();
  h.document.edit(original.replace('原文', '图形修改'));
  await h.fake.actions.get('makenovel.documentUndo').run();
  assert.equal(h.document.getSnapshot().text, original);
  await h.fake.actions.get('makenovel.documentRedo').run();
  assert.ok(h.document.getSnapshot().text.includes('图形修改'));
  h.binding.dispose();
});

test('native undo/redo content never applies the native stack text and restores raw BOM and EOL', async () => {
  const h = await harness();
  edit(h, 'A'); edit(h, 'B', 6, 6);
  const typed = h.document.getSnapshot().text;
  h.fake.apply([{ range: range(2, 5, 6), text: '' }], { isUndoing: true });
  await Promise.resolve();
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.fake.model.getValue(), original.slice(1).replace(/\r\n/g, '\n'));
  h.fake.apply([{ range: range(2, 5, 5), text: 'WRONG' }], { isRedoing: true });
  await Promise.resolve();
  assert.equal(h.document.getSnapshot().text, typed);
  assert.equal(h.fake.model.getValue(), typed.slice(1).replace(/\r\n/g, '\n'));
  h.binding.dispose();
});

test('cancelable native history beforeinput navigates once without inserting native changes', async () => {
  const h = await harness();
  edit(h, 'A');
  const undo = h.fake.fireDom('beforeinput', { inputType: 'historyUndo' });
  assert.equal(undo.prevented, true);
  assert.equal(h.document.getSnapshot().text, original);
  h.fake.fireDom('beforeinput', { inputType: 'historyRedo' });
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:A'));
  h.binding.dispose();
});

test('composition buffers all changes, blocks actions and becomes one undo step on completion', async () => {
  const h = await harness();
  const writesBefore = h.fake.writes();
  h.fake.events.onDidCompositionStart.fire();
  edit(h, 'n'); edit(h, 'ni', 5, 6); edit(h, '你', 5, 7);
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().isComposing, true);
  assert.equal(h.document.canPreview(), false);
  assert.equal(h.document.hasUnsavedChanges(), true);
  assert.equal(await h.document.save(), false);
  assert.equal(h.document.undo(), false);
  for (const key of ['s', 'z', 'y']) assert.equal(h.fake.fireDom('keydown', { key, ctrlKey: true }).prevented, true);
  const enter = h.fake.fireDom('keydown', { key: 'Enter', isComposing: true });
  assert.equal(enter.prevented, false);
  assert.equal(enter.stopped, true);
  assert.equal(h.fake.fireDom('keyup', { key: 'Enter', isComposing: true }).stopped, true);
  h.binding.syncSnapshot();
  assert.equal(h.fake.writes(), writesBefore);
  h.fake.events.onDidCompositionEnd.fire();
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:你'));
  assert.equal(h.document.getSnapshot().isComposing, false);
  assert.equal(h.calls.length, 0);
  assert.equal(JSON.parse(h.stored()).text, h.document.getSnapshot().text);
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().canUndo, false);
  h.binding.dispose();
});

test('pending save acknowledgement cannot flush the composition model or erase its final draft', async () => {
  const h = await harness();
  edit(h, 'A');
  let complete;
  h.transport.save = () => new Promise(resolve => { complete = resolve; });
  const pending = h.document.save();
  const submitted = h.document.getSnapshot().text;
  h.fake.events.onDidCompositionStart.fire();
  edit(h, '候选', 6, 6);
  const composingText = h.fake.model.getValue();
  complete({ text: submitted, revision: B });
  await pending;
  assert.equal(h.fake.model.getValue(), composingText);
  assert.equal(h.document.getSnapshot().isComposing, true);
  h.fake.events.onDidCompositionEnd.fire();
  assert.equal(h.document.getSnapshot().text, submitted.replace('say:A', 'say:A候选'));
  assert.equal(h.document.getSnapshot().revision, B);
  assert.equal(h.document.getSnapshot().status, 'dirty');
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, submitted);
  assert.equal(h.document.getSnapshot().status, 'saved');
  h.binding.dispose();
});

test('paste is discrete and subsequent uninterrupted typing coalesces separately', async () => {
  const h = await harness();
  edit(h, 'A');
  h.fake.fireDom('paste'); edit(h, 'P', 6, 6); h.fake.events.onDidPaste.fire();
  edit(h, 'B', 7, 7); edit(h, 'C', 8, 8);
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:AP'));
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:A'));
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original);
  h.binding.dispose();
});

test('newline and explicit cursor movement break source typing groups', async () => {
  const h = await harness();
  edit(h, 'A');
  h.fake.events.onDidChangeCursorSelection.fire({ reason: 3 });
  edit(h, 'B', 6, 6); edit(h, 'C', 7, 7);
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:A'));
  h.fake.fireDom('keydown', { key: 'Enter' });
  edit(h, '\r\n', 6, 6);
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:A\r\n'));
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:A'));
  h.binding.dispose();
});

test('dispose preserves the last composition buffer exactly once and removes all listeners', async () => {
  const h = await harness();
  h.fake.events.onDidCompositionStart.fire();
  edit(h, '中文');
  h.binding.dispose();
  h.binding.dispose();
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:中文'));
  assert.equal(h.document.getSnapshot().isComposing, false);
  assert.equal(h.fake.listeners(), 0);
  assert.equal(h.fake.actions.size, 0);
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().canUndo, false);
});

test('unexpected model flush cannot create an independent source draft', async () => {
  const h = await harness();
  h.fake.model.setValue('say:unrelated model value;');
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().canUndo, false);
  assert.equal(h.fake.model.getValue(), original.slice(1).replace(/\r\n/g, '\n'));
  h.binding.dispose();
});

test('native history invoked during composition cannot replace the composition buffer', async () => {
  const h = await harness();
  edit(h, 'A');
  const before = h.document.getSnapshot().text;
  h.fake.events.onDidCompositionStart.fire();
  edit(h, 'n', 6, 6);
  h.fake.apply([{ range: range(2, 6, 7), text: '' }], { isUndoing: true });
  await Promise.resolve();
  assert.equal(h.document.getSnapshot().text, before);
  assert.equal(h.document.getSnapshot().isComposing, true);
  assert.ok(h.fake.model.getValue().includes('say:An'));
  edit(h, '你', 6, 7);
  h.fake.events.onDidCompositionEnd.fire();
  assert.equal(h.document.getSnapshot().text, before.replace('say:A', 'say:A你'));
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, before);
  h.binding.dispose();
});

test('selected text replacement and a one-character drop each stay separate from later typing', async () => {
  const h = await harness();
  edit(h, 'A');
  edit(h, 'B', 6, 8);
  edit(h, 'C', 7, 7);
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original.replace('原文', 'AB'));
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:A'));
  const drop = h.fake.fireDom('drop', { dataTransfer: { getData: () => 'D' }, clientX: 0, clientY: 0 });
  assert.equal(drop.prevented, true);
  edit(h, 'E', 6, 6);
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:DA'));
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original.replace('say:', 'say:A'));
  h.binding.dispose();
});
