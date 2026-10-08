import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const load = name => import(pathToFileURL(path.join(process.env.DIRECTOR_SESSION_TEST_BUNDLE, `${name}.mjs`)));
const { createDirectorSession: open, editDirectorSession: edit, commitDirectorSession: commit } = await load('director');
const { SceneDocument } = await load('document');
const { nativeRanges } = await load('graph');
const runtime = await load('runtimeParser');
const runtimeParser = new runtime.default(undefined, name => name, [], runtime.SCRIPT_CONFIG);
const runtimeParse = source => runtimeParser.parse(source.replace(/^\uFEFF/, ''), 'director', 'director.txt').sentenceList;
const semantics = statements => statements.map(({ commandRaw, content, args, startLine, endLine }) => ({ commandRaw, content, args, startLine, endLine }));
const target = (session, command) => session.nodes.find(node => node.command === command);
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

async function documentFor(source) {
  let disk = { text: source, revision: A };
  let stored = null;
  const writes = [];
  const document = new SceneDocument({
    read: async () => ({ ...disk }),
    save: async (text, expectedRevision) => { writes.push({ text, expectedRevision }); disk = { text, revision: B }; return disk; },
  }, { read: () => stored, write: text => { stored = text; }, clear: () => { stored = null; } });
  await document.load();
  return { document, writes, stored: () => stored, disk: () => disk };
}

test('opening and cancelling leave the shared document, history and persistent draft untouched', async () => {
  const source = 'changeBg:day.svg -next;\nsay:原文;';
  const h = await documentFor(source);
  const before = h.document.getSnapshot();
  const session = open(before.text, 1, before.historyVersion);
  const local = edit(session, session.selectedNodeId, 'say:仅面板内修改;');
  assert.equal(session.source, source);
  assert.equal(session.changed, false);
  assert.equal(local.changed, true);
  assert.equal(h.document.getSnapshot(), before);
  assert.equal(h.document.getSnapshot().canUndo, false);
  assert.equal(h.stored(), null);
  assert.equal(h.writes.length, 0);
});

test('collects supported existing commands, comments and read-only wait up to the selected dialogue', () => {
  const source = [
    'say:上一句;', 'changeBg:day.svg -next;', '; 保留的独立注释', 'changeFigure:lin.svg -id=lin -left -next;',
    'changeFigureDiff:smile.svg -id=lin -next;', 'bgm:rain.wav -volume=55 -next;', 'playEffect:bell.wav -next;',
    'wait:500 -nobreak;', 'say:当前对白;', 'say:后一句;',
  ].join('\n');
  const session = open(source, 8, 0);
  assert.deepEqual(session.nodes.map(node => node.role), ['stage', 'comment', 'stage', 'stage', 'stage', 'stage', 'wait', 'dialogue']);
  assert.equal(session.nodes[0].startLine, 1);
  assert.equal(session.nodes.at(-1).startLine, 8);
  assert.equal(session.nodes.at(-1).nodeId, session.selectedNodeId);
  assert.equal(session.nodes.find(node => node.role === 'wait').editable, false);
  assert.equal(session.nodes.find(node => node.role === 'comment').raw, '; 保留的独立注释');
  assert.equal(session.source, source);
});

for (const [name, boundary] of [
  ['label', 'label:branch;'], ['branch', 'choose:左:left|右:right;'], ['variable', 'setVar:route=1;'],
  ['unsupported animation', 'setTransform:{"position":{"x":30}} -target=lin;'],
  ['conditional stage', 'changeBg:old.svg -when=flag==1 -next;'],
  ['conditional wait', 'wait:300 -when=flag==1;'],
  ['unknown parameter', 'changeBg:old.svg -future=opaque;'],
  ['unknown command', 'futureFx:opaque -future=kept;'],
  ['multiline command', 'changeBg:old.svg\n  -next;'],
]) {
  test(`does not cross a ${name} boundary`, () => {
    const source = `bgm:old.wav;\n${boundary}\nchangeFigure:lin.svg -id=lin;\nsay:目标;`;
    const line = source.split('\n').length - 1;
    const session = open(source, line, 0);
    assert.deepEqual(session.nodes.map(node => node.command), ['changeFigure', 'say']);
    const result = edit(session, session.selectedNodeId, 'say:新目标;');
    assert.equal(result.source.slice(0, source.indexOf('changeFigure:')), source.slice(0, source.indexOf('changeFigure:')));
  });
}

test('rejects non-dialogue, incomplete, ambiguous and control-flow dialogue selections', () => {
  for (const source of [
    'changeBg:day.svg;', 'say:hello -next;', 'say:hello -next=false;', 'say:hello -continue;',
    'say:hello -when=flag==1;', 'say:hello -concat;', 'say:hello -notend;', 'say:hello -future=kept;',
    'say:hello -volume=20 -volume=30;', 'say:hello\\', 'say:hello\n  -clear;', '未确认角色:hello;',
  ]) assert.throws(() => open(source, 0, 0), Error, source);
  assert.throws(() => open('say:hello;', -1, 0), /位置已失效/);
  assert.throws(() => open('say:hello;', 0, -1), /位置已失效/);
});

test('same serializer semantics are a no-op without registering any identities', () => {
  const source = 'bgm: rain.wav -volume = 080 ; 作者\nsay:  正文  ; 注释';
  let session = open(source, 1, 2);
  session = edit(session, target(session, 'bgm').nodeId, 'bgm:rain.wav -volume=80;');
  session = edit(session, session.selectedNodeId, 'say:正文;');
  assert.equal(session.changed, false);
  assert.equal(session.source, source);
  assert.equal(commit(source, 2, session), source);
  assert.equal(session.nodes.some(node => node.registered), false);
});

test('only actually edited nodes gain an identity and session snapshots are immutable', () => {
  const source = 'changeBg:day.svg -next;\nchangeFigure:lin.svg -id=lin;\nsay:目标;';
  const session = open(source, 2, 0);
  const result = edit(session, target(session, 'changeFigure').nodeId, 'changeFigure:lin-smile.svg -id=lin;');
  assert.equal((result.source.match(/@makenovel-node/g) ?? []).length, 1);
  assert.equal(result.nodes[0].registered, false);
  assert.equal(result.nodes[1].registered, true);
  assert.equal(result.nodes[2].registered, false);
  assert.equal(result.nodes[1].sentence.content, 'lin-smile.svg');
  assert.equal(result.nodes[1].raw.includes('lin-smile.svg'), true);
  assert.equal(session.source, source);
  assert.equal(session.nodes[1].sentence.content, 'lin.svg');
  assert.deepEqual(result.nodes.map(node => node.nodeId), session.nodes.map(node => node.nodeId));
});

test('changing a local edit back to its exact original removes the newly registered identity', () => {
  const source = 'changeBg:day.svg;\nsay:原文;';
  let session = open(source, 1, 0);
  session = edit(session, session.selectedNodeId, 'say:修改;');
  assert.equal(session.changed, true);
  session = edit(session, session.selectedNodeId, 'say:原文;');
  assert.equal(session.changed, false);
  assert.equal(session.nodes.at(-1).registered, false);
  assert.equal(commit(source, 0, session), source);
});

test('editing preserves BOM, CRLF, exact comments, unknown outside blocks and existing identities', () => {
  const source = '\uFEFFfutureFx:opaque -future=kept; untouched\r\n; 导演组注释\r\nchangeBg:day.svg -duration = 080 -next;  背景注释 ; @makenovel-node bg.one  \r\n; @makenovel-node say.one\r\nsay:  原文  -volume=030;  作者  \r\nfutureFx:after -x=2;\r\n';
  let session = open(source, 4, 0);
  session = edit(session, 'bg.one', 'changeBg:night.svg -duration=80 -next;');
  session = edit(session, 'say.one', 'say:新文 -volume=30;');
  const expected = source.replace('changeBg:day.svg', 'changeBg:night.svg').replace('say:  原文  ', 'say:  新文  ');
  assert.equal(commit(source, 0, session), expected);
  assert.deepEqual(semantics(nativeRanges(expected)), semantics(runtimeParse(expected)));
  assert.equal(session.nodes.find(node => node.nodeId === 'say.one').registered, true);
});

test('the existing BOM-first-command analysis boundary remains conservative and preserves all original bytes', () => {
  const source = '\uFEFFchangeBg:day.svg -next; 原注释\r\nsay:正文;\r\n';
  let session = open(source, 1, 0);
  assert.deepEqual(session.nodes.map(node => node.command), ['say']);
  session = edit(session, session.selectedNodeId, 'say:新文;');
  assert.equal(session.source.split('\r\n')[0], source.split('\r\n')[0]);
  assert.throws(() => open('\uFEFFsay:正文;', 0, 0), /仅支持/);
});

test('read-only references and foreign node identities cannot be changed', () => {
  const source = '; 独立注释\nwait:200;\nsay:正文;';
  const session = open(source, 2, 0);
  for (const node of session.nodes.filter(node => !node.editable)) assert.throws(() => edit(session, node.nodeId, 'say:覆盖;'), /仅供参考/);
  assert.throws(() => edit(session, 'missing', 'say:覆盖;'), /仅供参考/);
  assert.equal(session.source, source);
});

test('unsupported changes reject atomically and preserve previous valid local edits', () => {
  const source = 'changeBg:day.svg -next;\nsay:原文;';
  const opened = open(source, 1, 0);
  const session = edit(opened, opened.selectedNodeId, 'say:已改;');
  const before = session.source;
  for (const replacement of ['say:危险 -next;', 'say:危险 -when=flag;', 'wait:100;', 'say:危险 -future=1;']) {
    assert.throws(() => edit(session, session.selectedNodeId, replacement), Error);
    assert.equal(session.source, before);
  }
  assert.throws(() => edit(session, target(session, 'changeBg').nodeId, 'changeBg:night.svg -duration=bad;'), Error);
  assert.equal(session.source, before);
});

test('full source guard refuses unrelated edits, insertions and same-line identity replacement', () => {
  const source = 'changeBg:day.svg; @makenovel-node bg\nsay:原文; @makenovel-node say';
  const session = edit(open(source, 1, 0), 'say', 'say:面板草稿;');
  for (const current of [`; elsewhere\n${source}`, source.replace('day.svg', 'night.svg'), source.replace('@makenovel-node say', '@makenovel-node other')]) {
    assert.throws(() => commit(current, 0, session), /主文档已改变/);
  }
  assert.equal(session.nodes.at(-1).sentence.content, '面板草稿');
});

test('history guard refuses undo-redo ABA even when the source matches exactly', async () => {
  const source = 'say:原文;';
  const h = await documentFor(source);
  const opened = open(source, 0, h.document.getSnapshot().historyVersion);
  const session = edit(opened, opened.selectedNodeId, 'say:面板草稿;');
  h.document.edit('say:临时改动;');
  h.document.undo();
  assert.equal(h.document.getSnapshot().text, source);
  assert.throws(() => commit(source, h.document.getSnapshot().historyVersion, session), /主文档已改变/);
  assert.throws(() => commit(source, h.document.getSnapshot().historyVersion, opened), /主文档已改变/);
  assert.equal(h.document.getSnapshot().text, source);
  assert.equal(session.nodes.at(-1).sentence.content, '面板草稿');
});

test('group application makes one shared undo step and leaves disk and preview untouched until save', async () => {
  const source = 'changeBg:day.svg -next;\nchangeFigure:lin.svg -id=lin -next;\nbgm:rain.wav -volume=50;\nsay:正文;';
  const h = await documentFor(source);
  h.document.edit(`${source}\n; 原有未保存草稿`);
  const originalDraft = h.document.getSnapshot().text;
  let session = open(originalDraft, 3, h.document.getSnapshot().historyVersion);
  session = edit(session, target(session, 'changeBg').nodeId, 'changeBg:night.svg -next;');
  session = edit(session, target(session, 'changeFigure').nodeId, 'changeFigure:smile.svg -id=lin -next;');
  session = edit(session, target(session, 'bgm').nodeId, 'bgm:rain.wav -volume=70;');
  session = edit(session, session.selectedNodeId, 'say:新文;');
  const state = h.document.getSnapshot();
  const applied = commit(state.text, state.historyVersion, session);
  h.document.edit(applied);
  assert.equal(h.document.getSnapshot().status, 'dirty');
  assert.equal(h.document.canPreview(), false);
  assert.equal(h.disk().text, source);
  assert.equal(h.writes.length, 0);
  assert.equal(JSON.parse(h.stored()).text, applied);
  assert.equal(h.document.undo(), true);
  assert.equal(h.document.getSnapshot().text, originalDraft);
  assert.equal(h.document.undo(), true);
  assert.equal(h.document.getSnapshot().text, source);
  assert.equal(h.document.redo(), true);
  assert.equal(h.document.redo(), true);
  assert.equal(h.document.getSnapshot().text, applied);
  assert.equal(await h.document.save(), true);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].expectedRevision, A);
  assert.equal(h.document.canPreview(), true);
  assert.deepEqual(semantics(nativeRanges(applied)), semantics(runtimeParse(applied)));
});
