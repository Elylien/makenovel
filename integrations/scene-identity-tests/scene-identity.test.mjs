import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const identity = await import(pathToFileURL(path.join(process.env.SCENE_IDENTITY_TEST_BUNDLE, 'sceneIdentity.mjs')).href);
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const editorNative = require('webgal-parser');
const runtimeNative = await import(new URL('../../vendor/WebGAL/packages/parser/build/es/index.js', import.meta.url));
const createParser = native => new native.default(undefined, name => name, native.ADD_NEXT_ARG_LIST, native.SCRIPT_CONFIG);
const editorParser = createParser(editorNative);
const runtimeParser = createParser(runtimeNative);
const parse = source => editorParser.parse(source, 'identity-test', 'identity-test.txt').sentenceList;
// Terre's existing sceneBody removes only the transport BOM before parsing.
// Source offsets are still based on the original text; line indices are equal.
const parseEditorBody = source => parse(source.startsWith('\uFEFF') ? source.slice(1) : source);
const runtimeParse = source => runtimeParser.parse(source, 'identity-test', 'identity-test.txt').sentenceList;
const inspect = source => identity.inspectSceneIdentity(source, parse(source));
const idFactory = () => { let index = 0; return () => `node.${++index}`; };
const register = source => identity.assignMissingNodeIds(source, parse(source), idFactory()).source;
// Native continuation placeholders expose a copy of source text as comment
// content. IDs necessarily appear there too; this metadata is never executed.
// Keep their command, arguments, physical range and count in the comparison.
const sem = sentences => sentences.map(({ command, commandRaw, content, args, startLine, endLine, isLineBreakHolder }) => ({ command, commandRaw, content: isLineBreakHolder ? '<native-line-break>' : content, args, startLine, endLine, isLineBreakHolder }));
const code = expected => error => error instanceof identity.SceneIdentityError && error.code === expected;

test('inline IDs preserve native sentence count, ranges and execution semantics in runtime and editor', () => {
  const source = '\uFEFFsay: 雨还没停 -speaker=凛 -x=1 -x=2;  作者注释 ; 保留空格  \r\nchangeBg:street.jpg -next;\nwait:250\n';
  const result = register(source);
  assert.equal(result, source.replace('  \r\n', '  ; @makenovel-node node.1\r\n').replace('-next;\n', '-next;; @makenovel-node node.2\n').replace('wait:250\n', 'wait:250; @makenovel-node node.3\n'));
  assert.deepEqual(sem(parse(result)), sem(parse(source)));
  assert.deepEqual(sem(runtimeParse(result)), sem(runtimeParse(source)));
  assert.equal(result.split('\n').length, source.split('\n').length);
  assert.deepEqual(inspect(result).nodes.map(node => node.nodeId), ['node.1', 'node.2', 'node.3']);
  assert.equal(inspect(result).diagnostics.length, 0);
});

test('registration is idempotent and can leave unknown advanced blocks untouched', () => {
  const source = 'say:正文;\nfutureCommand:opaque -keep=1;  note \nwait:10;';
  const first = identity.assignMissingNodeIds(source, parse(source), idFactory(), { eligibleStartLines: [0, 2] });
  assert.equal(first.assigned.length, 2);
  assert.ok(first.source.includes('\nfutureCommand:opaque -keep=1;  note \n'));
  const again = identity.assignMissingNodeIds(first.source, parse(first.source), () => { throw new Error('Do not generate an existing ID again.'); }, { eligibleStartLines: [0, 2] });
  assert.equal(again.source, first.source);
  assert.deepEqual(again.changes, []);
  assert.deepEqual(inspect(first.source).diagnostics.map(item => item.code), ['MISSING_ID']);
});

test('multiline registration keeps native ranges and placeholder count', () => {
  const source = 'choose:甲:a.txt\r\n  |乙:b.txt\r\n  -next\r\nsay:一\\\r\n二;  注释';
  const result = register(source);
  assert.deepEqual(sem(parse(result)), sem(parse(source)));
  assert.deepEqual(sem(runtimeParse(result)), sem(runtimeParse(source)));
  assert.deepEqual(inspect(result).nodes.map(({ nodeId, startLine, endLine }) => ({ nodeId, startLine, endLine })), [
    { nodeId: 'node.1', startLine: 0, endLine: 2 }, { nodeId: 'node.2', startLine: 3, endLine: 4 },
  ]);
});

test('legacy standalone markers retain bytes and attach to the next complete command', () => {
  const source = '\uFEFF; @makenovel-node legacy.one\r\nsay:原文; 原注释\r\nwait:10;';
  const result = register(source);
  assert.ok(result.startsWith(source.slice(0, source.indexOf('wait:'))));
  assert.equal(inspect(result).nodes[0].markerKind, 'standalone');
  assert.equal(inspect(result).nodes[0].startLine, 1);
  assert.equal(inspect(result).nodes[0].blockStart, 1);
});

test('inserting before a legacy node uses the whole block boundary and cannot steal its ID', () => {
  const source = '\uFEFF; @makenovel-node legacy.original\r\nsay:原命令; 作者备注\r\nwait:20; @makenovel-node later';
  const target = inspect(source).nodes.find(node => node.nodeId === 'legacy.original');
  const inserted = identity.applySourceChanges(source, [{ start: target.blockStart, end: target.blockStart, before: '', after: 'say:新插入;\r\n' }]).source;
  const result = identity.assignMissingNodeIds(inserted, parse(inserted), () => 'new.inserted').source;
  assert.deepEqual(inspect(result).nodes.map(node => node.nodeId), ['new.inserted', 'legacy.original', 'later']);
  const original = inspect(result).nodes.find(node => node.nodeId === 'legacy.original');
  assert.equal(parse(result)[original.startLine].content, '原命令');
  assert.ok(result.includes('; @makenovel-node legacy.original\r\nsay:原命令; 作者备注\r\n'));
  assert.equal(result.charCodeAt(0), 0xfeff);
});

test('duplicate, malformed, ambiguous, dangling and swallowed identities are explicit diagnostics', () => {
  const fixtures = [
    ['say:a; @makenovel-node same\nsay:b; @makenovel-node same', 'DUPLICATE_ID'],
    ['say:a; @makenovel-node 123', 'INVALID_ID_MARKER'],
    ['say:a; @makenovel-node n extra', 'INVALID_ID_MARKER'],
    ['say:a; @makenovel-node n @makenovel-node m', 'INVALID_ID_MARKER'],
    ['; @makenovel-node n\nsay:a; @makenovel-node n', 'AMBIGUOUS_ID'],
    ['; @makenovel-node n\n; unrelated\nsay:a;', 'DANGLING_ID'],
    ['; @makenovel-node n', 'DANGLING_ID'],
    ['say:a\\\n; @makenovel-node n\nsay:b;', 'UNSAFE_ID_MARKER'],
  ];
  for (const [source, expected] of fixtures) {
    assert.ok(inspect(source).diagnostics.some(item => item.code === expected), `${expected}: ${source}`);
    assert.throws(() => identity.assignMissingNodeIds(source, parse(source), idFactory()), code('IDENTITY_DIAGNOSTICS'));
  }
});

test('marker-like dialogue text is not silently treated as identity', () => {
  const source = 'say:讲述 @makenovel-node prose 的意思;';
  assert.equal(inspect(source).nodes[0].nodeId, undefined);
  const result = register(source);
  assert.equal(parse(result)[0].content, parse(source)[0].content);
  assert.equal(inspect(result).nodes[0].nodeId, 'node.1');
});

test('dialogue patch changes only its content range, preserving BOM EOL duplicate args and comment spacing', () => {
  const source = '\uFEFFsay:  原文\\;正文🌧️  -speaker=凛 -volume=080 -x=1 -x=2;  注释 ; @makenovel-node rain.one  \r\nfutureCommand:未知 -x=1; \n';
  const result = identity.patchNodeDialogue(source, parse(source), { nodeId: 'rain.one', text: '新文;后续🌧️' });
  assert.equal(result.source, source.replace('原文\\;正文🌧️', '新文\\;后续🌧️'));
  assert.equal(result.changes.length, 1);
  for (const parser of [parse, runtimeParse]) {
    const before = sem(parser(source));
    const after = sem(parser(result.source));
    assert.deepEqual(after, [{ ...before[0], content: '新文;后续🌧️' }, ...before.slice(1)]);
  }
  assert.equal(inspect(result.source).nodes[0].nodeId, 'rain.one');
});

test('a text revision does not change node identity; source deletion reports identity loss', () => {
  const source = register('say:原文;\nwait:20;');
  const changed = identity.patchNodeDialogue(source, parse(source), { nodeId: 'node.1', text: '新文' }).source;
  assert.deepEqual(identity.compareSceneIdentities(inspect(source), inspect(changed)), { removed: [], added: [], retained: ['node.1', 'node.2'] });
  const removed = changed.replace('; @makenovel-node node.1', '');
  assert.deepEqual(identity.compareSceneIdentities(inspect(changed), inspect(removed)).removed, ['node.1']);
  assert.ok(inspect(removed).diagnostics.some(item => item.code === 'MISSING_ID'));
  assert.throws(() => identity.patchNodeDialogue(removed, parse(removed), { nodeId: 'node.1', text: '不能猜位置' }), code('ID_NOT_FOUND'));
});

test('unsafe content and unconfirmed implicit speakers reject graphical edits', () => {
  for (const value of ['-next', ' new', 'new ', '', 'none', 'new -next', 'new\\value', 'a\nb', 'a\u0000b', '\uD800']) {
    const source = register('say: old;');
    assert.throws(() => identity.patchNodeDialogue(source, parse(source), { nodeId: 'node.1', text: value }), error => error instanceof identity.SceneIdentityError, JSON.stringify(value));
  }
  const named = register('凛:原文;');
  assert.throws(() => identity.patchNodeDialogue(named, parse(named), { nodeId: 'node.1', text: '新文' }), code('UNSUPPORTED_COMMAND_EDIT'));
  const accepted = identity.patchNodeDialogue(named, parse(named), { nodeId: 'node.1', text: '新文', allowImplicitDialogue: true }).source;
  assert.equal(parse(accepted)[0].content, '新文');
  assert.deepEqual(parse(accepted)[0].args, parse(named)[0].args);
  const multiline = register('say:前\\\n后;');
  assert.throws(() => identity.patchNodeDialogue(multiline, parse(multiline), { nodeId: 'node.1', text: '新文' }), code('UNSUPPORTED_MULTILINE_EDIT'));
});

test('implicit dialogue colon cannot unexpectedly become a new speaker delimiter', () => {
  const source = register('原文;');
  assert.throws(() => identity.patchNodeDialogue(source, parse(source), { nodeId: 'node.1', text: '凛:新文', allowImplicitDialogue: true }), code('UNSUPPORTED_DIALOGUE_TEXT'));
});

test('fresh IDs reject collisions and malformed identifiers without returning partial edits', () => {
  const source = 'say:a; @makenovel-node taken\nsay:b;';
  assert.throws(() => identity.assignMissingNodeIds(source, parse(source), () => 'taken'), code('DUPLICATE_NEW_ID'));
  assert.throws(() => identity.assignMissingNodeIds(source, parse(source), () => '12'), code('INVALID_NEW_ID'));
  assert.throws(() => identity.assignMissingNodeIds('say:a\\', parse('say:a\\'), idFactory()), code('UNSAFE_CONTINUATION'));
  assert.throws(() => identity.assignMissingNodeIds('choose:a:a.txt\n  |b:b.txt', parse('choose:a:a.txt\n  |b:b.txt'), () => 'node-concat'), code('UNSAFE_NEW_ID'));
});

test('statement token patch preserves original spellings and comment while changing only requested values', () => {
  const source = '\uFEFFsay:  原文  -speaker=凛 -volume = 080  -unknown=kept;  author ; @makenovel-node say.one  \r\nfutureCommand:opaque -x=1;';
  const replacement = '凛:新文 -unknown=kept -volume=90; trimmed or unrelated serializer comment';
  const result = identity.patchNodeStatement(source, parseEditorBody(source), { nodeId: 'say.one', replacement }, parseEditorBody);
  assert.equal(result.source, source.replace('原文', '新文').replace('080', '90'));
  assert.equal(result.changes.length, 2);
  assert.equal(inspect(result.source).nodes[0].nodeId, 'say.one');
});

test('generic same-command edit preserves untouched unknown arguments and numeric spelling', () => {
  const source = 'changeBg:  old.jpg  -duration = 0500 -next -custom=keep;  author ; @makenovel-node bg.one';
  const result = identity.patchNodeStatement(source, parse(source), { nodeId: 'bg.one', replacement: 'changeBg:new.jpg -duration=500 -next -custom=keep;' }, parse);
  assert.equal(result.source, source.replace('old.jpg', 'new.jpg'));
  assert.deepEqual(runtimeParse(result.source)[0].args, runtimeParse(source)[0].args);
});

test('statement add remove and shorthand edits retain untouched tokens', () => {
  const source = 'say:原文 -speaker=凛 -old.ogg -volume=80 -clear;  author ; @makenovel-node a';
  const result = identity.patchNodeStatement(source, parse(source), { nodeId: 'a', replacement: 'say:原文 -speaker=紬 -vocal=new.ogg -volume=80 -fontSize=large;' }, parse).source;
  assert.equal(result, 'say:原文 -speaker=紬 -vocal=new.ogg -volume=80 -fontSize=large;  author ; @makenovel-node a');
  const boolean = identity.patchNodeStatement('say:原文 -next; @makenovel-node b', parse('say:原文 -next; @makenovel-node b'), { nodeId: 'b', replacement: 'say:原文 -next=false;' }, parse).source;
  assert.equal(boolean, 'say:原文 -next=false; @makenovel-node b');
});

test('serializer duplicate collapse command changes and unsafe boundary proposals reject without changes', () => {
  const duplicate = 'say:正文 -x=1 -x=2; @makenovel-node a';
  assert.throws(() => identity.patchNodeStatement(duplicate, parse(duplicate), { nodeId: 'a', replacement: 'say:新文 -x=2;' }, parse), code('AMBIGUOUS_ARGUMENTS'));
  const source = 'say:  正文; @makenovel-node a';
  assert.throws(() => identity.patchNodeStatement(source, parse(source), { nodeId: 'a', replacement: 'wait:10;' }, parse), code('UNSUPPORTED_COMMAND_EDIT'));
  assert.throws(() => identity.patchNodeStatement(source, parse(source), { nodeId: 'a', replacement: 'say:-next;' }, parse), code('UNSAFE_NATIVE_PROJECTION'));
  assert.throws(() => identity.patchNodeStatement(source, parse(source), { nodeId: 'a', replacement: 'say:前\\\n后;' }, parse), code('UNSUPPORTED_MULTILINE_EDIT'));
  assert.equal(source, 'say:  正文; @makenovel-node a');
});

test('copy uses a fresh ID and preserves exact command content; move retains it across duplicate text', () => {
  const source = register('say:相同;\r\nsay:相同;\r\nwait:10;');
  const copied = identity.duplicateNode(source, parse(source), 'node.1', () => 'copy.one');
  assert.equal(copied.nodeId, 'copy.one');
  assert.deepEqual(inspect(copied.source).nodes.map(node => node.nodeId), ['node.1', 'copy.one', 'node.2', 'node.3']);
  const moved = identity.moveNode(copied.source, parse(copied.source), 'copy.one', null);
  assert.deepEqual(inspect(moved.source).nodes.map(node => node.nodeId), ['node.1', 'node.2', 'node.3', 'copy.one']);
  assert.deepEqual(inspect(moved.source).diagnostics, []);
  assert.deepEqual(parse(moved.source).filter(item => item.commandRaw !== 'comment').map(item => item.content), ['相同', '相同', '10', '相同']);
});

test('copy move delete carry a legacy marker and its complete multiline command as one block', () => {
  const source = '\uFEFF; @makenovel-node choose.one\r\nchoose:甲:a.txt\r\n  |乙:b.txt; 原注释\r\nsay:后文; @makenovel-node say.two';
  const copied = identity.duplicateNode(source, parse(source), 'choose.one', () => 'choose.copy').source;
  assert.equal(copied.split('; @makenovel-node choose.copy').length, 2);
  const moved = identity.moveNode(copied, parse(copied), 'choose.one', null).source;
  assert.equal(moved.charCodeAt(0), 0xfeff);
  assert.deepEqual(inspect(moved).nodes.map(node => node.nodeId), ['choose.copy', 'say.two', 'choose.one']);
  const deleted = identity.deleteNode(moved, parse(moved), 'choose.one').source;
  assert.ok(!deleted.includes('choose.one'));
  assert.equal(inspect(deleted).diagnostics.length, 0);
  assert.deepEqual(inspect(deleted).nodes.map(node => node.nodeId), ['choose.copy', 'say.two']);
});

test('delete registered nodes leaves unregistered advanced blocks byte-identical', () => {
  const source = '\uFEFFsay:a; @makenovel-node a\r\nfutureCommand:opaque -dup=1 -dup=2; author\nwait:10; @makenovel-node b';
  const result = identity.deleteNode(source, parse(source), 'a').source;
  assert.equal(result, '\uFEFFfutureCommand:opaque -dup=1 -dup=2; author\nwait:10; @makenovel-node b');
  assert.equal(inspect(result).nodes[1].nodeId, 'b');
});

test('moving a final line without EOL to the front does not concatenate commands', () => {
  const source = '\uFEFFsay:a; @makenovel-node a\r\nwait:10; @makenovel-node b';
  const result = identity.moveNode(source, parse(source), 'b', 'a').source;
  assert.deepEqual(inspect(result).nodes.map(node => node.nodeId), ['b', 'a']);
  assert.equal(parse(result).filter(item => item.commandRaw !== 'comment').length, 2);
  assert.ok(result.startsWith('\uFEFFwait:10; @makenovel-node b\r\nsay:a; @makenovel-node a'));
  assert.equal(identity.moveNode(source, parse(source), 'a', 'a').source, source);
  assert.equal(identity.moveNode(source, parse(source), 'a', 'b').source, source);
});

test('all move directions retain node-to-command association with mixed EOL and legacy markers', () => {
  const source = '\uFEFFsay:相同; @makenovel-node first\r\n; @makenovel-node choice\nchoose:甲:a.txt\n  |乙:b.txt; author\nwait:20; @makenovel-node last';
  const originalIds = ['first', 'choice', 'last'];
  for (const from of originalIds) {
    for (const before of [...originalIds, null]) {
      const result = identity.moveNode(source, parse(source), from, before).source;
      const expected = originalIds.filter(id => id !== from);
      if (before === from) expected.splice(originalIds.indexOf(from), 0, from);
      else expected.splice(before === null ? expected.length : expected.indexOf(before), 0, from);
      assert.deepEqual(inspect(result).nodes.map(node => node.nodeId), expected, `${from} before ${before}`);
      const native = parse(result);
      for (const node of inspect(result).nodes) {
        assert.equal(native[node.startLine].content, { first: '相同', choice: '甲:a.txt|乙:b.txt', last: '20' }[node.nodeId]);
      }
    }
  }
});

test('legacy identity on an unfinished continuation cannot be moved or copied', () => {
  const source = 'say:a; @makenovel-node first\n; @makenovel-node unfinished\nsay:b\\';
  assert.throws(() => identity.moveNode(source, parse(source), 'unfinished', 'first'), code('UNSAFE_CONTINUATION'));
  assert.throws(() => identity.duplicateNode(source, parse(source), 'unfinished', () => 'copy'), code('UNSAFE_CONTINUATION'));
});

test('native statement insertion before a legacy node preserves old identity, BOM and every original EOL', () => {
  const source = '\uFEFFsay:前句; @makenovel-node previous\r\n; @makenovel-node target\nsay:目标; 作者注释\nwait:10; @makenovel-node last';
  const result = identity.insertSceneStatement(source, parse(source), 2, 'say:新句;', () => 'inserted', parse);
  assert.equal(result.source, source.slice(0, source.indexOf('; @makenovel-node target')) + 'say:新句;; @makenovel-node inserted\n' + source.slice(source.indexOf('; @makenovel-node target')));
  assert.deepEqual(inspect(result.source).nodes.map(node => node.nodeId), ['previous', 'inserted', 'target', 'last']);
  const target = inspect(result.source).nodes.find(node => node.nodeId === 'target');
  assert.equal(parse(result.source)[target.startLine].content, '目标');
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].before, '');
});

test('EOF insertion in CRLF files never leaves a bare CR and separates an unterminated final line', () => {
  for (const ending of ['', '\r\n']) {
    const source = 'say:首句; @makenovel-node first\r\nwait:10; @makenovel-node last' + ending;
    const result = identity.insertSceneStatement(source, parse(source), null, 'say:新句;', () => 'inserted', parse).source;
    assert.ok(result.startsWith(source));
    assert.ok(result.endsWith('say:新句;; @makenovel-node inserted'));
    assert.ok(!result.endsWith('\r'));
    assert.ok(!/(^|[^\r])\n/.test(result));
    assert.deepEqual(inspect(result).nodes.map(node => node.nodeId), ['first', 'last', 'inserted']);
  }
});

test('multiline inserted statement adopts adjacent CRLF and retains native statement boundaries', () => {
  const source = 'say:旧句; @makenovel-node old\r\n';
  const result = identity.insertSceneStatement(source, parse(source), 0, 'choose:甲:a.txt\n  |乙:b.txt\n  -next;', () => 'choice', parse).source;
  assert.equal(result, 'choose:甲:a.txt\r\n  |乙:b.txt\r\n  -next;; @makenovel-node choice\r\n' + source);
  assert.deepEqual(inspect(result).nodes.map(({ nodeId, startLine, endLine }) => ({ nodeId, startLine, endLine })), [
    { nodeId: 'choice', startLine: 0, endLine: 2 }, { nodeId: 'old', startLine: 3, endLine: 3 },
  ]);
  assert.equal(runtimeParse(result)[0].content, '甲:a.txt|乙:b.txt');
});

test('insertion handles empty, BOM-only and final blank-line boundaries', () => {
  for (const source of ['', '\uFEFF']) {
    const result = identity.insertSceneStatement(source, parse(source), 0, 'say:第一句;', () => 'first', parse).source;
    assert.equal(result, `${source}say:第一句;; @makenovel-node first`);
  }
  const source = 'say:旧句; @makenovel-node old\r\n';
  const result = identity.insertSceneStatement(source, parse(source), 1, 'say:尾句;\n', () => 'last', parse).source;
  assert.equal(result, source + 'say:尾句;; @makenovel-node last\r\n');
});

test('insertion rejects ID theft, multiple commands, unsafe continuation and stale middle-line boundaries', () => {
  const source = 'choose:甲:a.txt\n  |乙:b.txt; @makenovel-node choice';
  assert.throws(() => identity.insertSceneStatement(source, parse(source), 1, 'say:插入;', () => 'new', parse), code('INVALID_INSERT_BOUNDARY'));
  assert.throws(() => identity.insertSceneStatement(source, parse(source), null, 'say:新句; @makenovel-node existing', () => 'new', parse), code('INVALID_INSERT_STATEMENT'));
  assert.throws(() => identity.insertSceneStatement(source, parse(source), null, 'say:一;\nsay:二;', () => 'new', parse), code('INVALID_INSERT_STATEMENT'));
  const unfinished = '; @makenovel-node first\nsay:旧句\\';
  assert.throws(() => identity.insertSceneStatement(unfinished, parse(unfinished), null, 'say:新句;', () => 'new', parse), error => error instanceof identity.SceneIdentityError);
  const normal = 'say:旧句; @makenovel-node old\n';
  assert.throws(() => identity.insertSceneStatement(normal, parse(normal), null, '  |会变续行', () => 'new', parse), error => error instanceof identity.SceneIdentityError);
});

test('local changes reject stale slices overlaps invalid ranges and broken Unicode', () => {
  assert.throws(() => identity.applySourceChanges('abcd', [{ start: 1, end: 2, before: 'x', after: 'y' }]), code('STALE_SOURCE_CHANGE'));
  assert.throws(() => identity.applySourceChanges('abcd', [{ start: 1, end: 3, before: 'bc', after: '' }, { start: 2, end: 4, before: 'cd', after: '' }]), code('INVALID_SOURCE_CHANGE'));
  assert.throws(() => identity.inspectSceneIdentity('say:a;', [{ startLine: 0, endLine: 2, commandRaw: 'say' }]), code('INVALID_SOURCE_RANGES'));
  assert.throws(() => identity.inspectSceneIdentity('say:a\r', parse('say:a\r')), code('UNSUPPORTED_LINE_ENDING'));
  assert.throws(() => identity.inspectSceneIdentity('say:\uD800;', []), code('INVALID_SOURCE'));
  assert.throws(() => identity.applySourceChanges('🌧', [{ start: 0, end: 1, before: '\uD83C', after: '' }]), code('INVALID_SOURCE'));
});
