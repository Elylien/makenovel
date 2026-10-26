import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const load = name => import(pathToFileURL(path.join(process.env.DIRECTOR_SESSION_TEST_BUNDLE, `${name}.mjs`)));
const { createDirectorSession: open, editDirectorSession: edit, commitDirectorSession: commit,
  directorAnimationState: state, editDirectorAnimation: animate, directorStructuralActions: actions,
  moveDirectorSessionNode: move, deleteDirectorSessionNode: remove, addDirectorSessionNode: add } = await load('director');
const { nativeRanges } = await load('graph');
const { SceneDocument } = await load('document');
const runtime = await load('runtimeParser');
const parser = new runtime.default(undefined, name => name, [], runtime.SCRIPT_CONFIG);
const animation = session => session.nodes.find(node => node.command === 'setAnimation');
const input = (session, changes = {}) => {
  const { animation: name, target, next } = state(animation(session));
  return { animation: name, target, next, ...changes };
};

test('finite animation state accepts explicit native targets and does not assert target existence', () => {
  for (const target of ['fig-left', 'fig-center', 'fig-right', 'bg-main', 'hero', '人物.一']) {
    for (const args of ['', ' -keep=false -parallel=false -transformFrom=current', ' -next=false', ' -next']) {
      const source = `setAnimation:folder.json/move.json-side -target=${target}${args}; 作者\r\nsay:正文;`;
      const session = open(source, 1, 0);
      assert.deepEqual(state(animation(session)), { animation: 'folder.json/move.json-side', target,
        next: args === ' -next', editable: true, reason: null });
      assert.equal(session.source, source);
      assert.equal(session.changed, false);
      assert.equal(animation(session).registered, false);
      assert.ok(session.inheritance.figures.every(fact => fact.status === 'not-seen'));
    }
  }
});

test('finite animation editing changes only requested native tokens with BOM CRLF legacy ID and comments intact', () => {
  const source = '\uFEFF; header\r\nfuture:before -opaque=1; 注释\r\n; @makenovel-node anim.legacy\r\n'
    + 'setAnimation:  move-right  -target = hero -next = false -keep = false -parallel=false -transformFrom = current; 作者\t; 尾注  \r\n'
    + 'say:正文; @makenovel-node say.one\r\nfuture:after -opaque=2; 保留\r\n';
  const session = open(source, 4, 7);
  const changed = animate(session, 'anim.legacy', input(session, { animation: 'folder.json/move.json-side', target: 'bg-main' }));
  assert.equal(changed.source, source.replace('  move-right  ', '  folder.json/move.json-side  ').replace('-target = hero', '-target = bg-main'));
  assert.deepEqual(nativeRanges(changed.source), parser.parse(changed.source.replace(/^\uFEFF/, ''), 'test', 'test.txt').sentenceList);
  assert.equal(animation(changed).nodeId, 'anim.legacy');
  assert.equal(animation(changed).registered, true);
  assert.equal(commit(source, 7, changed), changed.source);
});

test('animation native false and current omission remain semantic no-ops without identity registration', () => {
  for (const args of ['', ' -next = false', ' -keep = false -parallel=false -transformFrom = current -next=false']) {
    const source = `setAnimation:  move  -target = hero${args}; 作者\nsay:正文;`;
    const session = open(source, 1, 0), id = animation(session).nodeId;
    assert.equal(animate(session, id, input(session)), session);
    assert.equal(edit(session, id, 'setAnimation:move -target=hero;'), session);
    assert.equal(edit(session, id, 'setAnimation:move -target=hero -keep=false -parallel=false -transformFrom=current -next=false;'), session);
    assert.equal(animation(session).registered, false);
  }
});

test('native animation proposal changes preserve false and current spellings', () => {
  const source = 'setAnimation:move -target = hero -keep = false -parallel=false -transformFrom = current -next = false; 作者\nsay:正文;';
  const session = open(source, 1, 0), id = animation(session).nodeId;
  const changed = edit(session, id, 'setAnimation:other -target=fig-left;');
  assert.equal(changed.source, source.replace('Animation:move', 'Animation:other').replace('-target = hero', '-target = fig-left')
    .replace('; 作者', `; 作者; @makenovel-node ${id}`));
});

test('full animation roundtrip restores exact resource target next spellings and identity state', () => {
  for (const raw of [
    'setAnimation:  move  -target = hero -keep = false -next=false; 作者',
    'setAnimation:move -target=bg-main -parallel=false -transformFrom=current -next; 作者 ; @makenovel-node anim.inline  ',
    '; @makenovel-node anim.legacy\r\nsetAnimation:move -target=fig-right -next = true; 作者',
    'setAnimation:move\\;side -target=hero -next=false; 作者',
  ]) {
    const source = `${raw}\r\nsay:正文;`, session = open(source, source.split('\n').length - 1, 0);
    const original = animation(session), before = input(session);
    const changed = animate(session, original.nodeId, { animation: 'folder/other', target: 'visitor', next: !before.next });
    const restored = animate(changed, original.nodeId, { ...before, animation: before.animation.replaceAll(';', '\\;') });
    assert.equal(restored.source, source, raw);
    assert.equal(restored.changed, false, raw);
    assert.equal(animation(restored).registered, original.registered, raw);
    assert.equal(animation(restored).nodeId, original.nodeId, raw);
  }
});

test('animation next roundtrip alone retains concurrent target and resource changes', () => {
  const source = 'setAnimation:move -target=hero -next=false; 作者\nsay:正文;';
  const session = open(source, 1, 0), id = animation(session).nodeId;
  let changed = animate(session, id, input(session, { next: true }));
  changed = animate(changed, id, input(changed, { animation: 'other', target: 'visitor' }));
  changed = animate(changed, id, input(changed, { next: false }));
  assert.equal(state(animation(changed)).animation, 'other');
  assert.equal(state(animation(changed)).target, 'visitor');
  assert.equal(changed.changed, true);
});

test('folded complete native animation proposals preserve one source line and reject extra real commands', () => {
  const name = `folder/${'animation-'.repeat(20)}move`;
  const source = `setAnimation:${name} -target=hero -keep=false -next = false; 作者\nsay:正文;`;
  const session = open(source, 1, 0), id = animation(session).nodeId;
  const proposal = `setAnimation:${name}\n  -target=visitor\n  -transformFrom=current; 作者`;
  assert.ok(nativeRanges(proposal).some(sentence => sentence.isLineBreakHolder));
  const changed = edit(session, id, proposal);
  assert.equal(changed.source, source.replace('-target=hero', '-target=visitor').replace('; 作者', `; 作者; @makenovel-node ${id}`));
  assert.equal(edit(changed, id, proposal), changed);
  for (const extra of ['say:injected;', 'setAnimation:other -target=hero;', '; extra comment']) {
    assert.throws(() => edit(session, id, `${proposal}\n${extra}`), /额外命令/);
  }
});

test('animation raw buffers reject truncation interpolation controls and invalid booleans while preserving draft', () => {
  const session = open('setAnimation:move -target=hero;\nsay:正文;', 1, 0), id = animation(session).nodeId;
  const changed = animate(session, id, input(session, { animation: 'other' }));
  for (const value of ['', ' ', ' move', 'move ', 'move;tail', 'move\n', 'move\r', 'move\t', 'move\u0000',
    'move\u007f', 'move\uFEFF', '{name}', 'move -next', 'move\\path', 'move\\', null, 12, true]) {
    assert.throws(() => animate(changed, id, input(changed, { animation: value })), /静态动画/);
  }
  for (const value of ['', ' hero', 'hero ', 'hero\n', 'hero\t', '{hero}', 'hero;tail', 'hero\\;tail', 'stage-main',
    'fig-left14', 'fig-right13', 'fig-custom', 'bg-main-off', 'stage-custom', 'default_id', '123', 'true', null, 1, false]) {
    assert.throws(() => animate(changed, id, input(changed, { target: value })), /静态动画/);
  }
  for (const value of [undefined, null, 0, 1, 'true', 'false']) {
    assert.throws(() => animate(changed, id, input(changed, { next: value })), /静态动画/);
  }
  assert.throws(() => animate(changed, id, null), /静态动画/);
  assert.equal(state(animation(changed)).animation, 'other');
  assert.equal(changed.source, animate(session, id, input(session, { animation: 'other' })).source);
});

test('animation adapter retains original escaped asset tokens and accepts new explicitly escaped file names', () => {
  const source = 'setAnimation:move\\;right -target=hero; 作者\nchangeBg:stage.svg;\nsay:正文;';
  const session = open(source, 2, 0), id = animation(session).nodeId;
  const changed = animate(session, id, input(session, { target: 'bg-main' }));
  assert.equal(state(animation(changed)).animation, 'move;right');
  assert.match(changed.source, /setAnimation:move\\;right -target=bg-main/);
  assert.equal(changed.nodes.filter(node => node.registered).length, 1);
  const selected = animate(changed, id, input(changed, { animation: 'folder.json/move\\;left' }));
  assert.equal(state(animation(selected)).animation, 'folder.json/move;left');
  assert.equal(state(animation(selected)).target, 'bg-main');
});

const boundaries = [
  'setAnimation:move;', 'setAnimation: -target=hero;', 'setAnimation:none -target=hero;',
  'setAnimation:{animation} -target=hero;', 'setAnimation:move -target={hero};',
  'setAnimation:move -target=hero -target=other;', 'setAnimation:move -target=hero -next=false -next;',
  'setAnimation:move -target=hero -keep;', 'setAnimation:move -target=hero -parallel=true;',
  'setAnimation:move -target=hero -keep=0;', 'setAnimation:move -target=hero -parallel=FALSE;',
  'setAnimation:move -target=hero -transformFrom=default;', 'setAnimation:move -target=hero -transformFrom=Current;',
  'setAnimation:move -target=hero -continue;', 'setAnimation:move -target=hero -continue=false;',
  'setAnimation:move -target=hero -writeDefault=false;', 'setAnimation:move -target=hero -ignoreDefault=false;',
  'setAnimation:move -target=hero -future=false;', 'setAnimation:move -target=hero -when=1;',
  'setAnimation:move -target=hero -next=1;', 'setAnimation:move -target=hero -next=FALSE;',
  'setAnimation:move -target=stage-main;', 'setAnimation:move -target=default_id;',
  'setAnimation:move -target=fig-left14;', 'setAnimation:move -target=fig-right13;',
  'setAnimation:move -target=bg-main-off;', 'setAnimation:move -target=123;',
  'setAnimation:move\n  -target=hero;',
];

test('advanced animation forms remain source and collection boundaries without normalization', () => {
  for (const statement of boundaries) {
    const source = `changeFigure:actor.svg -left;\n${statement}\nsay:正文;`;
    const session = open(source, source.split('\n').length - 1, 0);
    assert.equal(animation(session), undefined, statement);
    assert.equal(session.source, source, statement);
    assert.equal(session.changed, false, statement);
    assert.equal(session.inheritance.boundary.command, 'setAnimation', statement);
    assert.ok(session.inheritance.figures.every(fact => fact.status === 'unknown'), statement);
  }
});

test('valid animation rejects advanced replacement proposals without discarding current local changes', () => {
  const session = open('setAnimation:move -target=hero;\nsay:正文;', 1, 0), id = animation(session).nodeId;
  const changed = animate(session, id, input(session, { next: true }));
  for (const statement of boundaries.filter(value => !value.includes('\n'))) {
    assert.throws(() => edit(changed, id, statement), undefined, statement);
  }
  assert.equal(state(animation(changed)).next, true);
  assert.equal(state(animation(session)).next, false);
});

test('animation neither masks nor fabricates material provenance before or after a dialogue boundary', () => {
  const lines = ['changeBg:stage.svg;', 'changeFigure:left.svg -left;', 'changeFigure:center.svg;',
    'changeFigure:hero.svg -id=hero -right;', 'setAnimation:move -target=not-yet-created;', 'say:first;',
    'setAnimation:other -target=bg-main;', 'say:second;'];
  for (const line of [5, 7]) {
    const session = open(lines.join('\n'), line, 0);
    assert.equal(session.inheritance.background.content, 'stage.svg');
    assert.equal(session.inheritance.figures.find(fact => fact.target === 'position:center').content, 'center.svg');
    assert.equal(session.inheritance.figures.find(fact => fact.target === 'position:left').content, 'left.svg');
    assert.equal(session.inheritance.figures.find(fact => fact.target === 'id:hero').content, 'hero.svg');
    assert.equal(session.inheritance.figures.some(fact => fact.target.includes('not-yet-created')), false);
    assert.equal(session.inheritance.boundary, null);
  }
});

test('animation itself and adjacent create or close settings cannot be moved across it', () => {
  const source = 'changeFigure:hero.svg -id=hero;\nsetAnimation:move -target=hero;\nchangeFigure:none -id=hero;\nsay:正文;';
  const session = open(source, 3, 0), anim = animation(session);
  const figures = session.nodes.filter(node => node.command === 'changeFigure');
  assert.equal(actions(session, anim.nodeId).canDelete, false);
  assert.equal(actions(session, anim.nodeId).canMoveUp, false);
  assert.equal(actions(session, anim.nodeId).canMoveDown, false);
  assert.equal(actions(session, figures[0].nodeId).canMoveDown, false);
  assert.equal(actions(session, figures[1].nodeId).canMoveUp, false);
  assert.throws(() => remove(session, anim.nodeId), /动画/);
  assert.throws(() => move(session, figures[0].nodeId, 'down'), /动画/);
  assert.throws(() => move(session, figures[1].nodeId, 'up'), /动画/);
  assert.throws(() => add(session, 'setAnimation:other -target=hero;'));
  assert.equal(session.source, source);
});

test('animation and dialogue edit form one undo redo save transaction and reject stale history', async () => {
  const source = 'setAnimation:move -target=hero -next=false; 作者\r\nsay:正文;';
  let disk = { text: source, revision: 'a'.repeat(64) }, writes = [];
  const document = new SceneDocument({ read: async () => disk, save: async (text, expectedRevision) => {
    writes.push({ text, expectedRevision }); disk = { text, revision: 'b'.repeat(64) }; return disk;
  } }, { read: () => null, write() {}, clear() {} });
  await document.load();
  const initial = document.getSnapshot(), session = open(source, 1, initial.historyVersion);
  const changedAnimation = animate(session, animation(session).nodeId, { animation: 'other', target: 'bg-main', next: true });
  const batch = edit(changedAnimation, session.selectedNodeId, 'say:新对白;');
  assert.equal(document.getSnapshot().text, source);
  assert.equal(writes.length, 0);
  document.edit(commit(source, initial.historyVersion, batch));
  assert.equal(document.undo(), true);
  assert.equal(document.getSnapshot().text, source);
  assert.throws(() => commit(source, document.getSnapshot().historyVersion, batch), /主文档已改变/);
  assert.equal(document.redo(), true);
  assert.equal(document.getSnapshot().text, batch.source);
  assert.equal(await document.save(), true);
  assert.equal(writes.length, 1);
  assert.equal(disk.text, batch.source);
  const reopened = open(disk.text, 1, document.getSnapshot().historyVersion);
  assert.deepEqual(state(animation(reopened)), { animation: 'other', target: 'bg-main', next: true, editable: true, reason: null });
});


test('known model figures and non-static backgrounds keep existing animation rows read-only', () => {
  for (const [declaration, target] of [
    ['changeFigure:hero.model3.json -id=hero -right;', 'hero'],
    ['changeFigure:hero.json -left;', 'fig-left'],
    ['changeFigure:hero.skel -right;', 'fig-right'],
    ['changeFigure:hero.json?type=spine;', 'fig-center'],
    ['changeFigure:hero.gif -id=hero;', 'hero'],
    ['changeBg:movie.webm;', 'bg-main'],
    ['changeBg:stage.skel;', 'bg-main'],
    ['changeBg:stage.gif;', 'bg-main'],
  ]) {
    const source = `${declaration}\r\nsetAnimation:move -target=${target}; 作者\r\nsay:正文;`;
    const session = open(source, 2, 0), node = animation(session);
    assert.ok(node, declaration);
    assert.equal(node.editable, false, declaration);
    assert.equal(state(node).editable, false, declaration);
    assert.match(state(node).reason, /模型或非静态素材/, declaration);
    assert.equal(node.registered, false, declaration);
    assert.throws(() => animate(session, node.nodeId, input(session, { next: true })), /模型或非静态素材/);
    assert.throws(() => edit(session, node.nodeId, `setAnimation:other -target=${target};`), /模型或非静态素材/);
    const dialogue = edit(session, session.selectedNodeId, 'say:新对白;');
    assert.equal(state(animation(dialogue)).editable, false, declaration);
    assert.ok(dialogue.source.startsWith(`${declaration}\r\nsetAnimation:move -target=${target}; 作者\r\n`));
    assert.equal(session.source, source);
    assert.equal(session.changed, false);
  }
});

test('both raw and native animation proposals reject retargeting to a known model or video', () => {
  const source = 'changeFigure:still.svg -id=hero;\nchangeFigure:model.json -id=model;\n'
    + 'changeFigure:side.skel -right;\nchangeBg:movie.mp4;\nsetAnimation:move -target=hero;\nsay:正文;';
  const session = open(source, 5, 0), id = animation(session).nodeId;
  const changed = animate(session, id, input(session, { next: true }));
  for (const target of ['model', 'fig-right', 'bg-main']) {
    assert.throws(() => animate(changed, id, input(changed, { target })), /模型或非静态素材/, target);
    assert.throws(() => edit(changed, id, `setAnimation:other -target=${target} -next;`), /模型或非静态素材/, target);
  }
  assert.equal(state(animation(changed)).target, 'hero');
  assert.equal(state(animation(changed)).next, true);
  assert.equal(state(animation(changed)).animation, 'move');
  assert.equal(session.source, source);
});

test('animation source gating uses the latest declaration before its row including closes and replacements', () => {
  for (const [lines, expected] of [
    [['changeFigure:model.json -id=hero;', 'changeFigure:none -id=hero;'], true],
    [['changeFigure:model.json -id=hero;', 'changeFigure:still.svg -id=hero;'], true],
    [['changeFigure:still.svg -id=hero;', 'changeFigure:model.json -id=hero;'], false],
    [['changeFigure:model.json -id=hero;', 'say:previous;'], false],
    [['changeFigure:model.json -id=other;', 'changeFigure:still.svg -id=hero;'], true],
  ]) {
    const source = [...lines, 'setAnimation:move -target=hero;', 'say:正文;'].join('\n');
    const session = open(source, lines.length + 1, 0);
    assert.equal(state(animation(session)).editable, expected, source);
  }
  for (const replacement of ['none', 'still.svg']) {
    const source = `changeBg:movie.webm;\nchangeBg:${replacement};\nsetAnimation:move -target=bg-main;\nsay:正文;`;
    assert.equal(state(animation(open(source, 3, 0))).editable, true, replacement);
  }
  for (const [before, after, expected] of [['still.svg', 'model.json', true], ['model.json', 'none', false]]) {
    const source = `changeFigure:${before} -id=hero;\nsetAnimation:move -target=hero;\nchangeFigure:${after} -id=hero;\nsay:正文;`;
    assert.equal(state(animation(open(source, 3, 0))).editable, expected, source);
  }
});

test('unknown animation targets and paths remain editable without inferring runtime target existence', () => {
  for (const [lines, target] of [
    [[], 'missing-hero'],
    [['changeFigure:model.json -id=hero;', 'jumpLabel:branch;'], 'hero'],
    [['changeFigure:model.json -id=hero;', 'changeFigure:{asset} -id=hero;'], 'hero'],
    [['changeFigure:model.json -id=hero -right;'], 'fig-right'],
    [['changeFigure:model.json -right;'], 'hero'],
  ]) {
    const source = [...lines, `setAnimation:move -target=${target};`, 'say:正文;'].join('\n');
    const session = open(source, lines.length + 1, 0), node = animation(session);
    assert.equal(state(node).editable, true, source);
    assert.equal(animate(session, node.nodeId, input(session, { next: true })).changed, true, source);
  }
});

test('editing or deleting a source declaration refreshes animation read-only state without stale gating', () => {
  const source = 'changeFigure:still.svg -id=hero;\nsetAnimation:move -target=hero; 作者\nsay:正文;';
  const session = open(source, 2, 0), figure = session.nodes.find(node => node.command === 'changeFigure');
  const model = edit(session, figure.nodeId, 'changeFigure:model.json -id=hero;');
  assert.equal(state(animation(model)).editable, false);
  assert.match(state(animation(model)).reason, /模型或非静态素材/);
  assert.throws(() => animate(model, animation(model).nodeId, input(model, { next: true })), /模型或非静态素材/);
  const restored = edit(model, figure.nodeId, 'changeFigure:still.svg -id=hero;');
  assert.equal(state(animation(restored)).editable, true);
  assert.equal(state(animation(restored)).reason, null);
  assert.equal(animate(restored, animation(restored).nodeId, input(restored, { next: true })).changed, true);
  const removed = remove(model, figure.nodeId);
  assert.equal(state(animation(removed)).editable, true);
  assert.equal(state(animation(removed)).reason, null);
  assert.equal(animate(removed, animation(removed).nodeId, input(removed, { next: true })).changed, true);
  assert.equal(session.source, source);
});
