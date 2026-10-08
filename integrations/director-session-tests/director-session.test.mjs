import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const load = name => import(pathToFileURL(path.join(process.env.DIRECTOR_SESSION_TEST_BUNDLE, `${name}.mjs`)));
const { createDirectorSession: open, editDirectorSession: edit, commitDirectorSession: commit,
  addDirectorSessionNode: add, removeDirectorSessionNode: remove } = await load('director');
const { createDirectorSourceNavigation: navigation, resolveDirectorNavigation: locate } = await load('navigation');
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

for (const statement of ['changeBg:night.svg -next;', 'changeFigure:lin.png -id=lin -left -next;', 'bgm:rain.wav -volume=35;', 'playEffect:bell.opus -volume=20;']) {
  test(`inserts complete ${statement.split(':')[0]} immediately before the selected dialogue with a fresh identity`, () => {
    const source = '; authors comment\r\nwait:250;\r\nsay:正文;\r\nsay:下一句;\r\n';
    const original = open(source, 2, 4);
    const result = add(original, statement);
    const added = result.nodes.find(node => node.origin === 'inserted');
    assert.equal(added.startLine, 2);
    assert.equal(result.nodes.find(node => node.nodeId === original.selectedNodeId).startLine, 3);
    assert.equal(result.nodes.find(node => node.nodeId === original.selectedNodeId).registered, false);
    assert.equal((result.source.match(/@makenovel-node/g) ?? []).length, 1);
    assert.equal(added.raw, `${statement}; @makenovel-node ${added.nodeId}`);
    assert.equal(result.source.replace(`${added.raw}\r\n`, ''), source);
    assert.equal(original.source, source);
    assert.deepEqual(semantics(nativeRanges(result.source)), semantics(runtimeParse(result.source)));
    assert.equal(remove(result, added.nodeId).source, source);
  });
}

test('inserting before a standalone marker preserves BOM, mixed EOLs and every pre-existing byte', () => {
  const source = '\uFEFF; 文件开头\r\nchangeBg:day.svg -next;  untouched\n; 本句注释\r\n; @makenovel-node target\r\nsay:原文;\nfutureFx:opaque -custom=1;';
  let session = open(source, 4, 1);
  const ids = session.nodes.map(node => node.nodeId);
  session = add(session, 'bgm:rain.wav;');
  const added = session.nodes.find(node => node.origin === 'inserted');
  assert.equal(added.startLine, 3);
  assert.equal(session.nodes.find(node => node.nodeId === 'target').startLine, 5);
  assert.equal(session.source.replace(`${added.raw}\r\n`, ''), source);
  assert.equal(session.source.includes(`${added.raw}\r\n; @makenovel-node target\r\nsay:原文;`), true);
  session = edit(session, 'target', 'say:改稿;');
  session = edit(session, 'target', 'say:原文;');
  session = remove(session, added.nodeId);
  assert.equal(session.source, source);
  assert.deepEqual(session.nodes.map(node => node.nodeId), ids);
  assert.equal(session.changed, false);
});

test('insertions keep original reserved identities and callbacks attached to their relocated source rows', () => {
  const source = 'changeBg:day.svg;\nsay:原文;';
  let session = open(source, 1, 0);
  const dialogueId = session.selectedNodeId;
  const backgroundId = target(session, 'changeBg').nodeId;
  session = add(session, 'changeFigure:lin.svg -left;');
  const firstId = session.nodes.find(node => node.origin === 'inserted').nodeId;
  session = add(session, 'bgm:rain.wav;');
  const secondId = session.nodes.filter(node => node.origin === 'inserted').at(-1).nodeId;
  session = edit(session, dialogueId, 'say:位移后修改;');
  session = edit(session, backgroundId, 'changeBg:night.svg;');
  session = remove(session, firstId);
  session = edit(session, secondId, 'bgm:rain.wav -volume=42;');
  assert.equal(session.nodes.find(node => node.nodeId === dialogueId).sentence.content, '位移后修改');
  assert.equal(session.nodes.find(node => node.nodeId === dialogueId).startLine, 2);
  assert.equal(target(session, 'changeBg').sentence.content, 'night.svg');
  assert.equal(target(session, 'bgm').sentence.args.find(arg => arg.key === 'volume').value, 42);
  assert.throws(() => edit(session, firstId, 'changeFigure:ghost.svg;'), /仅供参考/);
  assert.throws(() => remove(session, firstId), /只能撤掉/);
  session = edit(session, dialogueId, 'say:原文;');
  session = edit(session, backgroundId, 'changeBg:day.svg;');
  session = remove(session, secondId);
  assert.equal(session.source, source);
  assert.equal(session.nodes.every(node => !node.registered), true);
  assert.equal(session.changed, false);
});

test('removing added rows in any order preserves original whitespace and never deletes existing rows', () => {
  const source = '; isolated\n\nwait:150;\nsay:原文;';
  let session = open(source, 3, 0);
  for (const statement of ['bgm:one.wav;', 'playEffect:two.ogg;', 'changeBg:three.webp;']) session = add(session, statement);
  const added = session.nodes.filter(node => node.origin === 'inserted');
  for (const node of session.nodes.filter(node => node.origin === 'existing')) assert.throws(() => remove(session, node.nodeId), /只能撤掉/);
  session = remove(session, added[1].nodeId);
  session = remove(session, added[0].nodeId);
  session = remove(session, added[2].nodeId);
  assert.equal(commit(source, 0, session), source);
  assert.equal(session.changed, false);
});

test('new commands reject incomplete assets, unsupported syntax, dynamic values and source injection atomically', () => {
  const session = open('say:正文;', 0, 0);
  for (const statement of [
    'changeBg:;', 'bgm:;', 'changeFigure:选择立绘文件;', 'playEffect:Select sound file;',
    'changeBg:movie.mp4;', 'changeFigure:model.model3.json;', 'changeFigureDiff:lin.svg -left;',
    'changeBg:day.svg -when=flag;', 'changeBg:day.svg -future=1;', 'bgm:rain.wav -volume=bad;',
    'changeBg:{scene}.svg;', 'changeFigure:lin.svg -id={actor};', 'bgm:rain.wav -volume={level};',
    'changeBg:day.svg; @makenovel-node injected', 'changeBg:day.svg; author comment',
    'changeBg:day.svg;say:second;', 'changeBg:day.svg;\nsay:second;',
    '\uFEFFbgm:rain.wav;', 'wait:100;', 'say:不允许;', '; 注释', '',
  ]) assert.throws(() => add(session, statement), Error, statement);
  assert.equal(session.source, 'say:正文;');
  assert.equal(session.changed, false);
  assert.equal(session.nodes.length, 1);
});

test('added rows reject later empty and placeholder edits, retain identity on explicit none and keep prior valid data', () => {
  let session = add(open('say:正文;', 0, 0), 'changeBg:day.svg;');
  const added = session.nodes.find(node => node.origin === 'inserted');
  const before = session.source;
  for (const statement of ['changeBg:;', 'changeBg:选择背景文件;', 'changeBg:movie.mp4;', 'changeBg:{image}.svg;']) {
    assert.throws(() => edit(session, added.nodeId, statement), Error);
    assert.equal(session.source, before);
  }
  session = edit(session, added.nodeId, 'changeBg:none;');
  assert.equal(session.nodes.find(node => node.nodeId === added.nodeId).registered, true);
  assert.equal(session.inheritance.background.status, 'none');
  session = edit(session, added.nodeId, 'changeBg:day.svg;');
  assert.equal(session.nodes.find(node => node.nodeId === added.nodeId).registered, true);
  assert.equal(session.source, before);
});

test('multiple inserts and source edits form one shared undo and retain stale-source and ABA guards', async () => {
  const source = 'wait:200;\nsay:正文;';
  const h = await documentFor(source);
  const state = h.document.getSnapshot();
  let session = open(source, 1, state.historyVersion);
  session = add(session, 'changeBg:night.svg -next;');
  session = add(session, 'changeFigure:lin.svg -id=lin -next;');
  session = edit(session, session.selectedNodeId, 'say:新正文;');
  assert.equal(h.document.getSnapshot(), state);
  assert.equal(h.writes.length, 0);
  assert.equal(h.stored(), null);
  assert.throws(() => commit(`${source}\n; external`, state.historyVersion, session), /主文档已改变/);
  assert.throws(() => commit(source, state.historyVersion + 2, session), /主文档已改变/);
  const result = commit(source, state.historyVersion, session);
  h.document.edit(result, { resyncControls: true });
  assert.equal(h.document.undo(), true);
  assert.equal(h.document.getSnapshot().text, source);
  assert.equal(h.document.undo(), false);
  assert.equal(h.document.redo(), true);
  assert.equal(h.document.getSnapshot().text, result);
  assert.equal(h.disk().text, source);
  assert.equal(await h.document.save(), true);
  assert.equal(h.disk().text, result);
});

test('source facts cross simple dialogue, wait and comments, distinguish earlier and local commands and never register IDs', () => {
  const source = ['changeBg:day.svg; @makenovel-node old-bg', 'changeFigure:lin.svg -id=lin -left;',
    'bgm:rain.wav;', 'say:前一句;', '; comment', 'wait:250;', 'changeBg:night.svg -next;', 'say:本句;'].join('\n');
  const session = open(source, 7, 0);
  assert.equal(session.inheritance.background.content, 'night.svg');
  assert.equal(session.inheritance.background.scope, 'local');
  assert.equal(session.inheritance.background.startLine, 6);
  assert.equal(session.inheritance.bgm.content, 'rain.wav');
  assert.equal(session.inheritance.bgm.scope, 'earlier');
  assert.equal(session.inheritance.bgm.nodeId, undefined);
  const figure = session.inheritance.figures.find(fact => fact.target === 'id:lin');
  assert.equal(figure.content, 'lin.svg');
  assert.equal(figure.scope, 'earlier');
  assert.equal(session.inheritance.boundary, null);
  assert.equal(session.source, source);
  assert.equal(session.changed, false);
});

for (const boundary of ['label:cut;', 'choose:左:left|右:right;', 'jumpLabel:other;', 'callScene:other.txt;',
  'setVar:route=1;', 'setTransform:{"position":{"x":20}} -target=lin;', 'futureFx:unknown;',
  'changeBg:old.svg -when=flag;', 'wait:200 -when=flag;', 'changeBg:old.svg -future=kept;',
  'say:继续 -next;', 'changeFigure:none -clear;', 'changeBg:{image}.svg;', 'changeFigure:lin.svg -id={actor};']) {
  test(`source facts stop at ${boundary} and expose only later proven overrides`, () => {
    const source = ['bgm:old.wav;', 'changeFigure:left.svg -left;', boundary, 'changeBg:local.svg;', 'say:正文;'].join('\n');
    const session = open(source, 4, 0);
    assert.equal(session.inheritance.bgm.status, 'unknown');
    assert.equal(session.inheritance.figures.find(fact => fact.target === 'position:left').status, 'unknown');
    assert.equal(session.inheritance.background.status, 'source');
    assert.equal(session.inheritance.background.content, 'local.svg');
    assert.equal(session.inheritance.boundary.startLine, 2);
    assert.equal(session.source, source);
  });
}

test('explicit none and no source in this scene are distinct and do not imply initial runtime state', () => {
  const empty = open('say:正文;', 0, 0).inheritance;
  assert.equal(empty.background.status, 'not-seen');
  assert.equal(empty.bgm.status, 'not-seen');
  const source = 'changeBg:none;\nbgm:none;\nchangeFigure:none -right;\nplayEffect:none -id=rain;\nsay:正文;';
  const facts = open(source, 4, 0).inheritance;
  assert.equal(facts.background.status, 'none');
  assert.equal(facts.bgm.status, 'none');
  assert.equal(facts.figures.find(fact => fact.target === 'position:right').status, 'none');
  assert.equal(facts.figures.find(fact => fact.target === 'position:left').status, 'not-seen');
  assert.equal(facts.effects.find(fact => fact.target === 'effect:rain').status, 'none');
});

test('source targets follow native id priority and center-left-right boolean priority', () => {
  const source = ['changeFigure:id.svg -id=hero -left;', 'changeFigure:center.svg -right -center -left;',
    'changeFigure:left.svg -center=false -left=true -right;', 'say:正文;'].join('\n');
  const facts = open(source, 3, 0).inheritance.figures;
  assert.equal(facts.find(fact => fact.target === 'id:hero').content, 'id.svg');
  assert.equal(facts.find(fact => fact.target === 'position:center').content, 'center.svg');
  assert.equal(facts.find(fact => fact.target === 'position:left').content, 'left.svg');
  assert.equal(facts.find(fact => fact.target === 'position:right').status, 'not-seen');
});

test('difference source is visible but its result is unknown even for none and a prior model', () => {
  for (const image of ['smile.svg', 'none']) {
    const source = `changeFigure:model.model3.json -id=hero;\nsay:前句;\nchangeFigureDiff:${image} -id=hero;\nsay:正文;`;
    const fact = open(source, 3, 0).inheritance.figures.find(fact => fact.target === 'id:hero');
    assert.equal(fact.command, 'changeFigureDiff');
    assert.equal(fact.content, image);
    assert.equal(fact.status, 'unknown');
    assert.equal(fact.startLine, 2);
  }
});

test('new source overrides disappear from the summary when removed and the earlier origin is restored', () => {
  const source = 'bgm:old.wav; @makenovel-node earlier\nsay:前句;\nsay:本句;';
  const original = open(source, 2, 0);
  let session = add(original, 'bgm:none;');
  assert.equal(session.inheritance.bgm.scope, 'local');
  assert.equal(session.inheritance.bgm.status, 'none');
  session = remove(session, session.nodes.find(node => node.origin === 'inserted').nodeId);
  assert.deepEqual(session.inheritance, original.inheritance);
  assert.equal(session.inheritance.bgm.nodeId, 'earlier');
  assert.equal(session.inheritance.bgm.scope, 'earlier');
  assert.equal(session.changed, false);
});

test('source navigation selects the latest concrete command among duplicate text without registering IDs', () => {
  const source = 'changeBg:day.svg;\nsay:前一段;\nchangeBg:day.svg;\nsay:前一句;\nsay:原对白;';
  const session = open(source, 4, 3);
  const request = navigation(session, { ...session.inheritance.background });
  assert.deepEqual(locate(source, 3, request.target), { startLine: 2, raw: 'changeBg:day.svg;', command: 'changeBg' });
  assert.deepEqual(locate(source, 3, request.origin), { startLine: 4, raw: 'say:原对白;', command: 'say' });
  assert.equal(request.target.nodeId, undefined);
  assert.equal(request.origin.nodeId, undefined);
  assert.equal(session.source, source);
  assert.equal(session.nodes.some(node => node.registered), false);
});

test('local source navigation never exposes reserved session IDs as source-registered identity', () => {
  const source = 'changeBg:day.svg;\nsay:原对白;';
  const session = open(source, 1, 0);
  assert.equal(typeof session.inheritance.background.nodeId, 'string');
  const request = navigation(session, session.inheritance.background);
  assert.equal(Object.hasOwn(request.target, 'nodeId'), false);
  assert.equal(Object.hasOwn(request.origin, 'nodeId'), false);
  assert.equal(locate(source, 0, request.target).startLine, 0);
});

test('source and return navigation preserve registered inline and legacy identities with BOM and CRLF', () => {
  const source = '\uFEFF; 作者\r\nchangeBg:day.svg; 原注释 ; @makenovel-node background.one\r\nsay:前句;\r\n; @makenovel-node origin.one\r\nsay:原对白; 作者正文\r\n';
  const session = open(source, 4, 8);
  const request = navigation(session, session.inheritance.background);
  assert.equal(request.target.nodeId, 'background.one');
  assert.equal(request.origin.nodeId, 'origin.one');
  assert.equal(locate(source, 8, request.target).raw, source.split('\r\n')[1]);
  assert.deepEqual(locate(source, 8, request.origin), {
    startLine: 4, command: 'say', raw: 'say:原对白; 作者正文', nodeId: 'origin.one',
  });
  assert.equal(session.source, source);
});

test('repeated source and return resolution has no shared document, draft, history, save or preview side effects', async () => {
  const source = 'bgm:test.wav -volume=41;\nsay:前句;\nsay:原对白;';
  const h = await documentFor(source);
  const snapshot = h.document.getSnapshot();
  let updates = 0;
  const unsubscribe = h.document.subscribe(() => updates++);
  const session = open(snapshot.text, 2, snapshot.historyVersion);
  const request = navigation(session, session.inheritance.bgm);
  for (let index = 0; index < 3; index++) {
    locate(h.document.getSnapshot().text, h.document.getSnapshot().historyVersion, request.target);
    locate(h.document.getSnapshot().text, h.document.getSnapshot().historyVersion, request.origin);
  }
  unsubscribe();
  assert.equal(h.document.getSnapshot(), snapshot);
  assert.equal(h.document.canPreview(), true);
  assert.equal(updates, 0);
  assert.equal(h.stored(), null);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.disk(), { text: source, revision: A });
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.target), true);
  assert.equal(Object.isFrozen(request.origin), true);
});

test('explicitly closed sources and unknown diff results retain a navigable concrete source', () => {
  const source = 'bgm:none;\nchangeFigureDiff:smile.svg -id=hero;\nsay:原对白;';
  const session = open(source, 2, 0);
  const diff = session.inheritance.figures.find(fact => fact.target === 'id:hero');
  assert.equal(session.inheritance.bgm.status, 'none');
  assert.equal(diff.status, 'unknown');
  assert.equal(locate(source, 0, navigation(session, session.inheritance.bgm).target).startLine, 0);
  assert.equal(locate(source, 0, navigation(session, diff).target).command, 'changeFigureDiff');
});

for (const [name, source] of [
  ['unseen source', 'say:原对白;'],
  ['unknown beyond a control-flow boundary', 'bgm:test.wav;\nlabel:branch;\nsay:原对白;'],
]) {
  test(`navigation does not invent a location for ${name}`, () => {
    const session = open(source, source.split('\n').length - 1, 0);
    assert.throws(() => navigation(session, session.inheritance.bgm), /没有可定位/);
    assert.equal(session.source, source);
  });
}

test('facts from another session and modified fact metadata cannot redirect a source lookup', () => {
  const source = 'changeBg:day.svg;\nsay:原对白;';
  const session = open(source, 1, 0);
  const foreign = open(source.replace('day.svg', 'night.svg'), 1, 0);
  for (const fact of [foreign.inheritance.background,
    { ...session.inheritance.background, target: 'bgm' },
    { ...session.inheritance.background, startLine: 1 },
    { ...session.inheritance.background, nodeId: 'other' },
  ]) assert.throws(() => navigation(session, fact), /没有可定位/);
});

test('unapplied text or inserted commands cannot be navigated away from', () => {
  const source = 'changeBg:day.svg;\nsay:原对白;';
  const original = open(source, 1, 0);
  const changed = edit(original, original.selectedNodeId, 'say:局部草稿;');
  const added = add(original, 'bgm:music.wav;');
  for (const session of [changed, added, { ...changed, changed: false }]) {
    assert.throws(() => navigation(session, session.inheritance.background), /未应用修改/);
  }
  assert.equal(changed.nodes.at(-1).sentence.content, '局部草稿');
  assert.equal(added.nodes.some(node => node.origin === 'inserted'), true);
  assert.equal(original.source, source);
});

test('reverting a local edit or removing its new row restores nonmutating source navigation', () => {
  const source = 'changeBg:day.svg;\nsay:原对白;';
  const original = open(source, 1, 0);
  let text = edit(original, original.selectedNodeId, 'say:局部草稿;');
  text = edit(text, text.selectedNodeId, 'say:原对白;');
  let inserted = add(original, 'bgm:test.wav;');
  inserted = remove(inserted, inserted.nodes.find(node => node.origin === 'inserted').nodeId);
  for (const session of [text, inserted]) {
    const request = navigation(session, session.inheritance.background);
    assert.equal(locate(source, 0, request.origin).startLine, 1);
    assert.equal(session.source, source);
  }
});

test('navigation rejects unrelated edits, removed source, and moved registered identity instead of guessing', () => {
  const source = 'changeBg:day.svg; @makenovel-node bg.one\nsay:原对白; @makenovel-node say.one';
  const session = open(source, 1, 4);
  const request = navigation(session, session.inheritance.background);
  for (const current of [
    `${source}\n; unrelated`, source.replace('day.svg', 'night.svg'), source.split('\n')[1],
    `; inserted\n${source}`, source.replace('@makenovel-node bg.one', '@makenovel-node bg.two'),
  ]) {
    assert.throws(() => locate(current, 4, request.target), /主文档已改变/);
    assert.throws(() => locate(current, 4, request.origin), /主文档已改变/);
  }
});

test('source and return navigation both refuse undo-redo ABA with exact restored source', async () => {
  const source = 'changeBg:day.svg;\nsay:原对白;';
  const h = await documentFor(source);
  const initial = h.document.getSnapshot();
  const session = open(source, 1, initial.historyVersion);
  const request = navigation(session, session.inheritance.background);
  h.document.edit(source.replace('原对白', '另一次编辑'));
  assert.equal(h.document.undo(), true);
  const afterUndo = h.document.getSnapshot();
  assert.equal(afterUndo.text, source);
  for (const locator of [request.target, request.origin]) {
    assert.throws(() => locate(afterUndo.text, afterUndo.historyVersion, locator), /主文档已改变/);
  }
  assert.equal(h.document.redo(), true);
  assert.equal(h.document.undo(), true);
  const afterRedoUndo = h.document.getSnapshot();
  assert.equal(afterRedoUndo.text, source);
  assert.throws(() => locate(afterRedoUndo.text, afterRedoUndo.historyVersion, request.target), /主文档已改变/);
  assert.deepEqual(h.writes, []);
});

test('navigation refuses missing ranges, fabricated IDs and changed raw metadata in a frozen snapshot', () => {
  const source = 'changeBg:day.svg;\n; comment\nsay:原对白;';
  const session = open(source, 2, 0);
  const request = navigation(session, session.inheritance.background);
  for (const locator of [
    { ...request.target, startLine: -1 }, { ...request.target, startLine: 40 },
    { ...request.target, startLine: 1 }, { ...request.target, nodeId: session.nodes[0].nodeId },
    { ...request.target, raw: 'changeBg:night.svg;' }, { ...request.target, command: 'bgm' },
  ]) assert.throws(() => locate(source, 0, locator), /来源/);
});
