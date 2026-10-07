import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const load = name => import(pathToFileURL(path.join(process.env.SCENE_DOCUMENT_TEST_BUNDLE, `${name}.mjs`)));
const { SceneDocument, parseScenePath } = await load('sceneDocument');
const { applySourceEdits } = await load('sourceEdits');
const { splitToArray, mergeToString, replaceLineRange, sceneBody, mergeSceneLines } = await load('graphText');
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(raw = null) {
  let stored = raw;
  let disk = { text: '旁白:磁盘原文;', revision: A };
  const calls = [];
  const transport = {
    read: async () => ({ ...disk }),
    save: async (text, expectedRevision) => { calls.push({ text, expectedRevision }); disk = { text, revision: B }; return { ...disk }; },
  };
  const storage = { read: () => stored, write: value => { stored = value; }, clear: () => { stored = null; } };
  const document = new SceneDocument(transport, storage);
  return { document, transport, storage, calls, stored: () => stored, setDisk: value => { disk = value; } };
}
const savedDraft = (text, revision = A) => JSON.stringify({ version: 1, text, revision });

test('initial loading blocks edits and preview; overlapping loads share one read', async () => {
  const h = harness();
  const read = deferred();
  let reads = 0;
  h.transport.read = () => { reads++; return read.promise; };
  const first = h.document.load();
  const second = h.document.load();
  assert.equal(reads, 1);
  assert.equal(first, second);
  h.document.edit('too early');
  assert.equal(h.document.getSnapshot().text, '');
  assert.equal(h.document.canPreview(), false);
  read.resolve({ text: 'loaded', revision: A });
  await first;
  assert.equal(h.document.canPreview(), true);
});

test('local editing remains a draft until an explicit revision-checked save', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('新对白');
  assert.equal(h.calls.length, 0);
  assert.equal(h.document.canPreview(), false);
  assert.equal(JSON.parse(h.stored()).text, '新对白');
  assert.equal(await h.document.save(), true);
  assert.deepEqual(h.calls, [{ text: '新对白', expectedRevision: A }]);
  assert.equal(h.document.canPreview(), true);
  assert.equal(h.stored(), null);
});

test('same-revision refresh retains local drafts; clean refresh loads external changes', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('local');
  await h.document.load();
  assert.equal(h.document.getSnapshot().text, 'local');
  assert.equal(h.document.getSnapshot().status, 'dirty');
  h.document.edit('旁白:磁盘原文;');
  h.setDisk({ text: 'external', revision: B });
  await h.document.load();
  assert.equal(h.document.getSnapshot().text, 'external');
  assert.equal(h.document.getSnapshot().revision, B);
  assert.equal(h.document.canPreview(), true);
});

test('external changes conflict with a local draft and block its write', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('local');
  h.setDisk({ text: 'external', revision: B });
  await h.document.load();
  assert.equal(h.document.getSnapshot().status, 'conflict');
  assert.equal(h.document.getSnapshot().text, 'local');
  assert.equal(await h.document.save(), false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.document.canPreview(), false);
});

test('draft recovery uses its original revision and detects intervening disk writes', async () => {
  const same = harness(savedDraft('recovered'));
  await same.document.load();
  assert.equal(same.document.getSnapshot().status, 'dirty');
  assert.equal(same.document.getSnapshot().text, 'recovered');
  const changed = harness(savedDraft('recovered'));
  changed.setDisk({ text: 'external', revision: B });
  await changed.document.load();
  assert.equal(changed.document.getSnapshot().status, 'conflict');
  assert.equal(changed.document.getSnapshot().revision, A);
  assert.equal(JSON.parse(changed.stored()).text, 'recovered');
});

test('recovery equal to current disk content becomes saved even after a revision change', async () => {
  const h = harness(savedDraft('matching'));
  h.setDisk({ text: 'matching', revision: B });
  await h.document.load();
  assert.equal(h.document.getSnapshot().status, 'saved');
  assert.equal(h.document.getSnapshot().revision, B);
  assert.equal(h.stored(), null);
});

test('new edits during save survive its acknowledgement and need a second save', async () => {
  const h = harness();
  await h.document.load();
  const write = deferred();
  h.transport.save = (text, expectedRevision) => { h.calls.push({ text, expectedRevision }); return write.promise; };
  h.document.edit('submitted');
  const pending = h.document.save();
  assert.equal(h.document.save(), pending);
  h.document.edit('typed while saving');
  write.resolve({ text: 'submitted', revision: B });
  assert.equal(await pending, false);
  assert.equal(h.document.getSnapshot().text, 'typed while saving');
  assert.equal(h.document.getSnapshot().status, 'dirty');
  assert.equal(h.document.canPreview(), false);
  assert.deepEqual(JSON.parse(h.stored()), { version: 1, text: 'typed while saving', revision: B });
  h.transport.save = async (text, expectedRevision) => { assert.equal(expectedRevision, B); return { text, revision: C }; };
  assert.equal(await h.document.save(), true);
  assert.equal(h.document.getSnapshot().text, 'typed while saving');
});

test('conflicting save preserves edits made during the request and stays blocked', async () => {
  const h = harness();
  await h.document.load();
  const write = deferred();
  h.transport.save = () => write.promise;
  h.document.edit('submitted');
  const pending = h.document.save();
  h.document.edit('newer');
  write.reject(Object.assign(new Error('disk changed'), { code: 'REVISION_CONFLICT' }));
  assert.equal(await pending, false);
  assert.equal(h.document.getSnapshot().status, 'conflict');
  assert.equal(h.document.getSnapshot().text, 'newer');
  assert.equal(JSON.parse(h.stored()).text, 'newer');
});

test('I/O save failure keeps the draft and original revision available for retry', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('draft');
  h.transport.save = async () => { throw new Error('disk full'); };
  assert.equal(await h.document.save(), false);
  assert.equal(h.document.getSnapshot().status, 'error');
  assert.equal(JSON.parse(h.stored()).revision, A);
  h.transport.save = async (text, expectedRevision) => { assert.equal(expectedRevision, A); return { text, revision: B }; };
  assert.equal(await h.document.save(), true);
});

test('refresh in progress blocks saves and its result cannot replace newer local input', async () => {
  const h = harness();
  await h.document.load();
  const read = deferred();
  h.transport.read = () => read.promise;
  const refreshing = h.document.load();
  h.document.edit('saved later');
  assert.equal(await h.document.save(), false);
  assert.equal(h.calls.length, 0);
  read.resolve({ text: 'stale read', revision: A });
  await refreshing;
  assert.equal(h.document.getSnapshot().text, 'saved later');
  assert.equal(h.document.getSnapshot().revision, A);
  assert.equal(h.document.canPreview(), false);
  assert.equal(await h.document.save(), true);
  assert.equal(h.document.getSnapshot().revision, B);
});

test('refresh failure keeps the new draft available for a later explicit save', async () => {
  const h = harness();
  await h.document.load();
  const read = deferred();
  h.transport.read = () => read.promise;
  const refreshing = h.document.load();
  h.document.edit('saved later');
  assert.equal(await h.document.save(), false);
  read.reject(new Error('old refresh failed'));
  await refreshing;
  assert.equal(h.document.getSnapshot().text, 'saved later');
  assert.equal(h.document.getSnapshot().status, 'error');
  assert.equal(await h.document.save(), true);
  assert.equal(h.document.getSnapshot().status, 'saved');
});

test('a disk-reload completion cannot overwrite an acknowledged concurrent save', async () => {
  const h = harness();
  await h.document.load();
  const read = deferred();
  h.transport.read = () => read.promise;
  h.document.edit('save me');
  const reloading = h.document.reloadDisk();
  const saving = h.document.save();
  await new Promise(resolve => setImmediate(resolve));
  read.resolve({ text: 'older reload', revision: A });
  await Promise.all([reloading, saving]);
  if (h.calls.length) {
    assert.equal(h.document.getSnapshot().text, 'save me');
    assert.equal(h.document.getSnapshot().revision, B);
  } else {
    assert.equal(h.document.getSnapshot().text, 'older reload');
  }
});

test('typing during explicit reload keeps the new input', async () => {
  const h = harness();
  await h.document.load();
  const read = deferred();
  h.transport.read = () => read.promise;
  h.document.edit('before reload');
  const reloading = h.document.reloadDisk();
  h.document.edit('typed during reload');
  read.resolve({ text: 'external', revision: B });
  await reloading;
  assert.equal(h.document.getSnapshot().text, 'typed during reload');
  assert.equal(h.document.canPreview(), false);
});

test('unrecognized recovery data is preserved and remains visibly warned', async () => {
  const raw = '{"version":99,"text":"draft from another version"}';
  const h = harness(raw);
  await h.document.load();
  assert.equal(h.stored(), raw);
  assert.notEqual(h.document.getSnapshot().recoveryWarning, '');
});

test('failed browser draft storage warns while preserving editable in-memory text', async () => {
  const h = harness();
  await h.document.load();
  h.storage.write = () => { throw new Error('storage quota'); };
  h.document.edit('valuable draft');
  assert.equal(h.document.getSnapshot().text, 'valuable draft');
  assert.notEqual(h.document.getSnapshot().recoveryWarning, '');
  assert.equal(h.document.canPreview(), false);
});

test('filesystem scene paths retain literal percent characters and Chinese names', () => {
  assert.deepEqual(parseScenePath('/games/中文 100%/game/scene/a%20b.txt'), { gameName: '中文 100%', path: 'game/scene/a%20b.txt' });
  assert.throws(() => parseScenePath('/templates/demo/game/scene/a.txt'));
});

function change(startLineNumber, startColumn, endLineNumber, endColumn, text) {
  return { range: { startLineNumber, startColumn, endLineNumber, endColumn }, text };
}
test('source edits preserve BOM and all untouched mixed-EOL bytes', () => {
  const raw = '\uFEFF; untouched  \r\n旁白:原文;\nfuture:keep -x=1;\r\n尾巴;';
  const result = applySourceEdits(raw, [change(2, 4, 2, 6, '新文')]);
  assert.equal(result, '\uFEFF; untouched  \r\n旁白:新文;\nfuture:keep -x=1;\r\n尾巴;');
});
test('multiple source edits use original offsets rather than shifted positions', () => {
  const raw = '\uFEFFfirst\r\nsecond\nthird\r\n';
  const result = applySourceEdits(raw, [change(1, 1, 1, 6, '1'), change(3, 1, 3, 6, 'long third')]);
  assert.equal(result, '\uFEFF1\r\nsecond\nlong third\r\n');
});
test('source edits spanning a CRLF map Monaco columns onto original byte ranges', () => {
  const raw = '\uFEFFabc\r\ndef\nkeep\r\n';
  assert.equal(applySourceEdits(raw, [change(1, 3, 2, 2, 'X\nY')]), '\uFEFFabX\nYef\nkeep\r\n');
});
test('graphical helper preserves mixed-EOL and BOM through a local line replacement', () => {
  const raw = '\uFEFF; comment\r\n旁白:原文;\nunknown:x;\r\n';
  const lines = splitToArray(raw);
  assert.equal(mergeToString(lines), raw);
  assert.equal(mergeToString(replaceLineRange(lines, { startLine: 1, endLine: 1 }, ['旁白:新文;'])), '\uFEFF; comment\r\n旁白:新文;\nunknown:x;\r\n');
});

test('deleting or reordering the first graphical sentence cannot remove or relocate the document BOM', () => {
  const raw = '\uFEFF; first\r\n旁白:second;\r\n';
  const lines = splitToArray(sceneBody(raw));
  assert.equal(mergeSceneLines(lines.slice(1), raw), '\uFEFF旁白:second;\r\n');
  assert.equal(mergeSceneLines([lines[1], lines[0], lines[2]], raw), '\uFEFF旁白:second;\r\n; first\r\n');
});

test('graphical insertion retains absence of BOM in a plain UTF-8 document', () => {
  const raw = '旁白:原文;\n';
  assert.equal(mergeSceneLines(['; inserted', ...splitToArray(sceneBody(raw))], raw), '; inserted\n旁白:原文;\n');
});
