import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const load = name => import(pathToFileURL(path.join(process.env.SCENE_DOCUMENT_TEST_BUNDLE, `${name}.mjs`)));
const { SceneDocument, parseScenePath } = await load('sceneDocument');
const { applySourceEdits } = await load('sourceEdits');
const { splitToArray, mergeToString, replaceLineRange, sceneBody, mergeSceneLines } = await load('graphText');
const { registerSceneNodes, editGraphicalStatement, confirmSpeakerDialogue, nativeRanges } = await load('graphEdits');
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(raw = null, historyOptions) {
  let stored = raw;
  let disk = { text: 'say:磁盘原文 -clear;', revision: A };
  const calls = [];
  const transport = {
    read: async () => ({ ...disk }),
    save: async (text, expectedRevision) => { calls.push({ text, expectedRevision }); disk = { text, revision: B }; return { ...disk }; },
  };
  const storage = { read: () => stored, write: value => { stored = value; }, clear: () => { stored = null; } };
  const document = new SceneDocument(transport, storage, undefined, historyOptions);
  return { document, transport, storage, calls, stored: () => stored, setDisk: value => { disk = value; } };
}
const savedDraft = (text, revision = A) => JSON.stringify({ version: 1, text, revision });

test('invalid core syntax keeps last saved file and draft, then applies the corrected version', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('wait:not-a-number;');
  assert.equal(h.document.getSnapshot().analysis.valid, false);
  assert.equal(await h.document.save(), false);
  assert.equal(h.calls.length, 0);
  assert.equal(JSON.parse(h.stored()).text, 'wait:not-a-number;');
  assert.equal(h.document.canPreview(), false);
  h.document.edit('wait:100;');
  assert.equal(await h.document.save(), true);
  assert.equal(h.document.canPreview(), true);
});

test('saved advanced code blocks preview without pretending it is an unsaved draft', async () => {
  const h = harness();
  h.setDisk({ text: 'futureFx:keep -opaque=1;', revision: A });
  await h.document.load();
  assert.equal(h.document.getSnapshot().status, 'saved');
  assert.equal(h.document.canPreview(), false);
  assert.equal(h.document.hasUnsavedChanges(), false);
  h.document.edit('futureFx:keep -opaque=1;\nsay:neighbor;');
  assert.equal(await h.document.save(), true);
  assert.equal(h.document.canPreview(), false);
  h.document.edit('futureFx:changed -opaque=1;\nsay:neighbor;');
  assert.equal(await h.document.save(), false);
  assert.equal(h.calls.length, 1);
  assert.equal(h.document.hasUnsavedChanges(), true);
});

test('duplicate node identity blocks saving before transport', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('say:first; @makenovel-node same\nsay:second; @makenovel-node same');
  assert.equal(await h.document.save(), false);
  assert.equal(h.calls.length, 0);
  assert.ok(h.document.getSnapshot().analysis.diagnostics.some(item => item.code === 'DUPLICATE_ID'));
});

test('register and graphical body edit preserve BOM, mixed EOL, spacing, comment and unknown neighbor', () => {
  const original = '\uFEFF; header\r\nsay: 原文   -speaker=凛  ; author  \nfutureFx:untouched -opaque=2;\r\n';
  const registered = registerSceneNodes(original).source;
  assert.equal(registered.split('\n').length, original.split('\n').length);
  assert.ok(registered.includes('futureFx:untouched -opaque=2;\r\n'));
  const edited = editGraphicalStatement(registered, 1, 'say:新文 -speaker=凛; serializer comment');
  assert.equal(edited, registered.replace(' 原文   ', ' 新文   '));
  const before = nativeRanges(registered).filter(item => !item.isLineBreakHolder);
  const after = nativeRanges(edited).filter(item => !item.isLineBreakHolder);
  assert.equal(after.length, before.length);
});

test('unknown command is readonly until explicit speaker confirmation and receives an inline ID', () => {
  const source = '凛:你好 -volume=80; 原注释\r\n';
  assert.throws(() => editGraphicalStatement(source, 0, 'say:改变;'));
  const result = confirmSpeakerDialogue(source, 0);
  assert.match(result, /^say:你好 -volume=80 -speaker=凛; 原注释; @makenovel-node node-/);
  assert.ok(result.endsWith('\r\n'));
  const sentence = nativeRanges(result)[0];
  assert.equal(sentence.commandRaw, 'say');
  assert.equal(sentence.args.find(arg => arg.key === 'speaker').value, '凛');
});

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
  h.document.edit('say:磁盘原文 -clear;');
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

test('shared document undo and redo navigate complete graph/source operations without writing disk', async () => {
  const h = harness();
  await h.document.load();
  const original = h.document.getSnapshot().text;
  const version = h.document.getSnapshot().historyVersion;
  assert.equal(h.document.getSnapshot().canUndo, false);
  assert.equal(h.document.undo(), false);
  h.document.edit('say:graph edit;');
  h.document.edit('say:source edit;');
  assert.equal(h.document.getSnapshot().historyVersion, version);
  assert.equal(h.document.undo(), true);
  assert.equal(h.document.getSnapshot().text, 'say:graph edit;');
  assert.equal(h.document.getSnapshot().historyVersion, version + 1);
  assert.equal(h.document.getSnapshot().canRedo, true);
  assert.equal(h.document.undo(), true);
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().status, 'saved');
  assert.equal(h.document.canPreview(), true);
  assert.equal(h.stored(), null);
  assert.equal(h.document.getSnapshot().canUndo, false);
  assert.equal(h.document.redo(), true);
  assert.equal(h.document.getSnapshot().text, 'say:graph edit;');
  assert.equal(h.document.redo(), true);
  assert.equal(h.document.getSnapshot().text, 'say:source edit;');
  assert.equal(h.document.getSnapshot().historyVersion, version + 4);
  assert.equal(h.document.getSnapshot().canRedo, false);
  assert.equal(h.document.redo(), false);
  assert.equal(h.calls.length, 0);
});

test('continuous source typing coalesces while graph transactions remain separate', async () => {
  const h = harness();
  await h.document.load();
  const original = h.document.getSnapshot().text;
  const clock = Date.now;
  let now = 10000;
  Date.now = () => now;
  try {
    h.document.edit('say:a;', { historyGroup: 'source-typing' });
    now += 200;
    h.document.edit('say:ab;', { historyGroup: 'source-typing' });
    now += 900;
    h.document.edit('say:abc;', { historyGroup: 'source-typing' });
    h.document.edit('say:graph;');
    h.document.edit('say:graph source;', { historyGroup: 'source-typing' });
    h.document.undo();
    assert.equal(h.document.getSnapshot().text, 'say:graph;');
    h.document.undo();
    assert.equal(h.document.getSnapshot().text, 'say:abc;');
    h.document.undo();
    assert.equal(h.document.getSnapshot().text, original);
    assert.equal(h.document.getSnapshot().canUndo, false);
  } finally { Date.now = clock; }
});

test('typing timeout, group switch and explicit boundary each start a new undo step', async () => {
  const h = harness();
  await h.document.load();
  const clock = Date.now;
  let now = 10000;
  Date.now = () => now;
  try {
    h.document.edit('first', { historyGroup: 'typing' });
    now += 1001;
    h.document.edit('second', { historyGroup: 'typing' });
    h.document.edit('third', { historyGroup: 'other-input' });
    h.document.breakHistoryGroup();
    h.document.edit('fourth', { historyGroup: 'other-input' });
    for (const expected of ['third', 'second', 'first']) {
      assert.equal(h.document.undo(), true);
      assert.equal(h.document.getSnapshot().text, expected);
    }
  } finally { Date.now = clock; }
});

test('a coalesced typing edit that returns to its starting text removes that empty step', async () => {
  const h = harness();
  await h.document.load();
  const original = h.document.getSnapshot().text;
  h.document.edit(original + 'x', { historyGroup: 'typing' });
  h.document.edit(original, { historyGroup: 'typing' });
  assert.equal(h.document.getSnapshot().canUndo, false);
  assert.equal(h.document.getSnapshot().status, 'saved');
});

test('editing after undo discards only the abandoned redo branch', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('first');
  h.document.edit('second');
  h.document.undo();
  h.document.edit('new branch');
  assert.equal(h.document.redo(), false);
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, 'first');
  h.document.redo();
  assert.equal(h.document.getSnapshot().text, 'new branch');
});

test('save retains history and forms a typing boundary; undo uses the latest byte revision', async () => {
  const h = harness();
  await h.document.load();
  const original = h.document.getSnapshot().text;
  h.document.edit('saved edit', { historyGroup: 'typing' });
  assert.equal(await h.document.save(), true);
  assert.equal(h.document.getSnapshot().canUndo, true);
  h.document.edit('after save', { historyGroup: 'typing' });
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, 'saved edit');
  assert.equal(h.document.getSnapshot().status, 'saved');
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().status, 'dirty');
  assert.equal(h.document.getSnapshot().revision, B);
  assert.equal(await h.document.save(), true);
  assert.deepEqual(h.calls[1], { text: original, expectedRevision: B });
  assert.equal(h.document.getSnapshot().canRedo, true);
});

test('undo during a pending save remains local and its response cannot overwrite it', async () => {
  const h = harness();
  await h.document.load();
  const original = h.document.getSnapshot().text;
  const write = deferred();
  h.transport.save = () => write.promise;
  h.document.edit('submitted');
  const saving = h.document.save();
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().status, 'saving');
  assert.equal(h.document.canPreview(), false);
  write.resolve({ text: 'submitted', revision: B });
  assert.equal(await saving, false);
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().status, 'dirty');
  assert.equal(JSON.parse(h.stored()).revision, B);
  h.document.redo();
  assert.equal(h.document.getSnapshot().text, 'submitted');
  assert.equal(h.document.getSnapshot().status, 'saved');
});

test('redo during a pending save can return to the acknowledged snapshot without losing later undo', async () => {
  const h = harness();
  await h.document.load();
  const write = deferred();
  h.transport.save = () => write.promise;
  h.document.edit('submitted');
  const saving = h.document.save();
  h.document.undo();
  h.document.redo();
  write.resolve({ text: 'submitted', revision: B });
  assert.equal(await saving, true);
  assert.equal(h.document.getSnapshot().status, 'saved');
  assert.equal(h.document.getSnapshot().canUndo, true);
});

test('undo and redo never clear an external revision conflict, including a return to old saved text', async () => {
  const h = harness();
  await h.document.load();
  const original = h.document.getSnapshot().text;
  h.document.edit('local');
  h.setDisk({ text: 'external', revision: B });
  await h.document.load();
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().status, 'conflict');
  assert.equal(h.document.canPreview(), false);
  assert.equal(await h.document.save(), false);
  h.document.redo();
  assert.equal(h.document.getSnapshot().status, 'conflict');
  assert.equal(h.calls.length, 0);
});

test('a rejected in-flight save retains both the undone text and a sticky conflict', async () => {
  const h = harness();
  await h.document.load();
  const original = h.document.getSnapshot().text;
  const write = deferred();
  h.transport.save = () => write.promise;
  h.document.edit('submitted');
  const saving = h.document.save();
  h.document.undo();
  write.reject(Object.assign(new Error('conflict'), { code: 'REVISION_CONFLICT' }));
  assert.equal(await saving, false);
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().status, 'conflict');
  h.document.redo();
  h.document.undo();
  assert.equal(h.document.getSnapshot().status, 'conflict');
});

test('the first undo after session recovery returns to the disk snapshot', async () => {
  const h = harness(savedDraft('recovered'));
  await h.document.load();
  assert.equal(h.document.getSnapshot().canUndo, true);
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, 'say:磁盘原文 -clear;');
  assert.equal(h.document.getSnapshot().status, 'saved');
  assert.equal(h.stored(), null);
  h.document.redo();
  assert.equal(h.document.getSnapshot().text, 'recovered');
  assert.equal(JSON.parse(h.stored()).text, 'recovered');
});

test('undo of a conflicted recovered draft shows current disk text while keeping the conflict', async () => {
  const h = harness(savedDraft('recovered', A));
  h.setDisk({ text: 'external', revision: B });
  await h.document.load();
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, 'external');
  assert.equal(h.document.getSnapshot().status, 'conflict');
  assert.equal(await h.document.save(), false);
});

test('same-revision refresh preserves history while a clean external reload resets it', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('draft');
  await h.document.load();
  assert.equal(h.document.getSnapshot().canUndo, true);
  h.document.undo();
  assert.equal(h.document.getSnapshot().canRedo, true);
  const version = h.document.getSnapshot().historyVersion;
  h.setDisk({ text: 'external', revision: B });
  await h.document.load();
  assert.equal(h.document.getSnapshot().text, 'external');
  assert.equal(h.document.getSnapshot().historyVersion, version + 1);
  assert.equal(h.document.getSnapshot().canUndo, false);
  assert.equal(h.document.getSnapshot().canRedo, false);
});

test('explicit disk reload clears both stacks and conflict provenance', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('first');
  h.document.edit('second');
  h.document.undo();
  h.setDisk({ text: 'external', revision: B });
  await h.document.reloadDisk();
  assert.equal(h.document.getSnapshot().text, 'external');
  assert.equal(h.document.getSnapshot().status, 'saved');
  assert.equal(h.document.getSnapshot().canUndo, false);
  assert.equal(h.document.getSnapshot().canRedo, false);
});

test('undo then redo during explicit reload cannot hide local activity from its stale completion', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('current draft');
  const read = deferred();
  h.transport.read = () => read.promise;
  const reloading = h.document.reloadDisk();
  h.document.undo();
  h.document.redo();
  read.resolve({ text: 'external', revision: B });
  await reloading;
  assert.equal(h.document.getSnapshot().text, 'current draft');
  assert.equal(h.document.getSnapshot().revision, A);
  assert.match(h.document.getSnapshot().message, /载入期间/);
  assert.equal(h.document.getSnapshot().canUndo, true);
});

test('undo and redo preserve BOM, mixed newlines, Unicode and a graph node identity exactly', async () => {
  const h = harness();
  const before = '\uFEFF;作者  \r\nsay:你好😀 -speaker=凛; @makenovel-node node-1\n';
  const after = before.replace('你好😀', '早上好🌦');
  h.setDisk({ text: before, revision: A });
  await h.document.load();
  h.document.edit(after);
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, before);
  h.document.redo();
  assert.equal(h.document.getSnapshot().text, after);
});

test('step limit drops oldest history and leaves all remaining transitions reversible', async () => {
  const h = harness(null, { maxSteps: 3 });
  h.setDisk({ text: '0', revision: A });
  await h.document.load();
  for (const value of ['1', '2', '3', '4', '5']) h.document.edit(value);
  for (const value of ['4', '3', '2']) {
    assert.equal(h.document.undo(), true);
    assert.equal(h.document.getSnapshot().text, value);
  }
  assert.equal(h.document.undo(), false);
  for (const value of ['3', '4', '5']) {
    assert.equal(h.document.redo(), true);
    assert.equal(h.document.getSnapshot().text, value);
  }
  assert.equal(h.document.redo(), false);
});

test('text budget stores sparse deltas instead of full copies of a large unchanged document', async () => {
  const h = harness(null, { maxTextBytes: 16, maxSteps: 100 });
  const prefix = '很长的原稿'.repeat(10000);
  h.setDisk({ text: prefix, revision: A });
  await h.document.load();
  for (let index = 1; index <= 10; index++) h.document.edit(prefix + 'x'.repeat(index));
  let undos = 0;
  while (h.document.undo()) undos++;
  assert.equal(undos, 8);
  assert.equal(h.document.getSnapshot().text, prefix + 'xx');
  let redos = 0;
  while (h.document.redo()) redos++;
  assert.equal(redos, 8);
  assert.equal(h.document.getSnapshot().text, prefix + 'xxxxxxxxxx');
});

test('an oversized change keeps its draft but removes unreachable older history', async () => {
  const h = harness(null, { maxTextBytes: 20 });
  h.setDisk({ text: 'base', revision: A });
  await h.document.load();
  h.document.edit('base x');
  assert.equal(h.document.getSnapshot().canUndo, true);
  const large = 'a replacement that exceeds the retained text budget';
  h.document.edit(large);
  assert.equal(h.document.getSnapshot().text, large);
  assert.equal(JSON.parse(h.stored()).text, large);
  assert.equal(h.document.getSnapshot().canUndo, false);
  h.document.edit(large + '!');
  assert.equal(h.document.undo(), true);
  assert.equal(h.document.getSnapshot().text, large);
});

test('history limit zero disables undo without disabling editing or persistence', async () => {
  const h = harness(null, { maxSteps: 0 });
  await h.document.load();
  h.document.edit('valuable draft');
  assert.equal(h.document.getSnapshot().text, 'valuable draft');
  assert.equal(h.document.getSnapshot().canUndo, false);
  assert.equal(JSON.parse(h.stored()).text, 'valuable draft');
});

test('explicit backup recovery adds one undo step without changing the disk baseline', async () => {
  const h = harness();
  await h.document.load();
  const original = h.document.getSnapshot().text;
  const version = h.document.getSnapshot().historyVersion;
  assert.equal(h.document.recoverDraft({ text: 'selected backup', revision: A }), true);
  assert.equal(h.document.getSnapshot().status, 'dirty');
  assert.equal(h.document.getSnapshot().revision, A);
  assert.equal(h.document.getSnapshot().historyVersion, version + 1);
  assert.equal(h.calls.length, 0);
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().status, 'saved');
  h.document.redo();
  assert.equal(h.document.getSnapshot().text, 'selected backup');
});

test('a stale selected backup keeps current revision and persists its stale provenance across refresh', async () => {
  const h = harness();
  h.setDisk({ text: 'current disk', revision: B });
  await h.document.load();
  assert.equal(h.document.recoverDraft({ text: 'old draft', revision: A }), true);
  assert.equal(h.document.getSnapshot().revision, B);
  assert.equal(h.document.getSnapshot().status, 'conflict');
  assert.equal(JSON.parse(h.stored()).revision, A);
  assert.equal(await h.document.save(), false);
  const restored = harness(h.stored());
  restored.setDisk({ text: 'current disk', revision: B });
  await restored.document.load();
  assert.equal(restored.document.getSnapshot().status, 'conflict');
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, 'current disk');
  assert.equal(h.document.getSnapshot().status, 'conflict');
  h.document.redo();
  assert.equal(await h.document.save(), false);
  await h.document.reloadDisk();
  h.document.edit('fresh draft');
  assert.equal(JSON.parse(h.stored()).revision, B);
});

test('backup text equal to disk is saved even when its old revision differs', async () => {
  const h = harness();
  h.setDisk({ text: 'current disk', revision: B });
  await h.document.load();
  assert.equal(h.document.recoverDraft({ text: 'current disk', revision: A }), true);
  assert.equal(h.document.getSnapshot().status, 'saved');
  assert.equal(h.document.getSnapshot().revision, B);
  assert.equal(h.document.getSnapshot().canUndo, false);
  assert.equal(h.stored(), null);
});

test('backup recovery refuses to replace dirty, unrecognized or conflicting local drafts', async () => {
  const dirty = harness();
  await dirty.document.load();
  dirty.document.edit('current local work');
  assert.equal(dirty.document.recoverDraft({ text: 'backup', revision: A }), false);
  assert.equal(dirty.document.getSnapshot().text, 'current local work');
  const unknown = harness('unknown recovery format');
  await unknown.document.load();
  unknown.document.undo();
  assert.equal(unknown.document.recoverDraft({ text: 'backup', revision: A }), false);
  assert.equal(unknown.stored(), 'unknown recovery format');
  const conflict = harness(savedDraft('older draft', B));
  await conflict.document.load();
  conflict.document.undo();
  assert.equal(conflict.document.recoverDraft({ text: 'backup', revision: A }), false);
});

test('backup recovery refuses pending read/save and malformed backup values', async () => {
  const h = harness();
  assert.equal(h.document.recoverDraft({ text: 'backup', revision: A }), false);
  await h.document.load();
  assert.equal(h.document.recoverDraft({ text: 'backup', revision: 'invalid' }), false);
  assert.equal(h.document.recoverDraft(null), false);
  const read = deferred();
  h.transport.read = () => read.promise;
  const loading = h.document.load();
  assert.equal(h.document.recoverDraft({ text: 'backup', revision: A }), false);
  read.resolve({ text: 'say:磁盘原文 -clear;', revision: A });
  await loading;
  const write = deferred();
  h.transport.save = () => write.promise;
  h.document.edit('submitted');
  const saving = h.document.save();
  h.document.undo();
  assert.equal(h.document.recoverDraft({ text: 'backup', revision: A }), false);
  write.resolve({ text: 'submitted', revision: B });
  await saving;
});

test('composition blocks shared save, history, reload, recovery and preview without consuming history', async () => {
  const h = harness();
  await h.document.load();
  const original = h.document.getSnapshot().text;
  h.document.edit('say:first;');
  h.document.undo();
  const before = h.document.getSnapshot();
  let reads = 0;
  h.transport.read = async () => { reads++; return { text: 'say:other;', revision: B }; };
  h.document.setComposing(true);
  assert.equal(h.document.hasUnsavedChanges(), true);
  assert.equal(h.document.canPreview(), false);
  assert.equal(h.document.redo(), false);
  assert.equal(h.document.undo(), false);
  assert.equal(await h.document.save(), false);
  await h.document.load();
  await h.document.reloadDisk();
  assert.equal(h.document.recoverDraft({ text: 'say:backup;', revision: A }), false);
  assert.equal(reads, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(h.document.getSnapshot().text, original);
  assert.equal(h.document.getSnapshot().historyVersion, before.historyVersion);
  h.document.setComposing(false);
  assert.equal(h.document.hasUnsavedChanges(), false);
  assert.equal(h.document.canPreview(), true);
  assert.equal(h.document.redo(), true);
  assert.equal(h.document.getSnapshot().text, 'say:first;');
});

test('read already pending when composition starts cannot replace the buffered baseline', async () => {
  const h = harness();
  await h.document.load();
  const read = deferred();
  h.transport.read = () => read.promise;
  const pending = h.document.load();
  h.document.setComposing(true);
  read.resolve({ text: 'say:external;', revision: B });
  await pending;
  assert.equal(h.document.getSnapshot().text, 'say:磁盘原文 -clear;');
  assert.equal(h.document.getSnapshot().revision, A);
  h.document.setComposing(false);
  await h.document.load();
  assert.equal(h.document.getSnapshot().text, 'say:external;');
  assert.equal(h.document.getSnapshot().revision, B);
});

test('reload already pending is ignored while composition is active', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('say:draft;');
  const read = deferred();
  h.transport.read = () => read.promise;
  const pending = h.document.reloadDisk();
  h.document.setComposing(true);
  read.resolve({ text: 'say:external;', revision: B });
  await pending;
  assert.equal(h.document.getSnapshot().text, 'say:draft;');
  assert.equal(h.document.getSnapshot().revision, A);
  h.document.edit('say:候选已确认;');
  h.document.setComposing(false);
  assert.equal(h.document.undo(), true);
  assert.equal(h.document.getSnapshot().text, 'say:draft;');
});

test('pending save acknowledgement preserves composition flag and final input remains a draft', async () => {
  const h = harness();
  await h.document.load();
  h.document.edit('say:submitted;');
  const save = deferred();
  h.transport.save = () => save.promise;
  const pending = h.document.save();
  h.document.setComposing(true);
  save.resolve({ text: 'say:submitted;', revision: B });
  assert.equal(await pending, true);
  assert.equal(h.document.getSnapshot().isComposing, true);
  assert.equal(h.document.canPreview(), false);
  assert.equal(h.document.hasUnsavedChanges(), true);
  h.document.edit('say:输入完成;');
  h.document.setComposing(false);
  assert.equal(h.document.getSnapshot().revision, B);
  assert.equal(h.document.getSnapshot().status, 'dirty');
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, 'say:submitted;');
  assert.equal(h.document.getSnapshot().status, 'saved');
});
