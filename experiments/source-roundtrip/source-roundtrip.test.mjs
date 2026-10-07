import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyDialogueEdits, contentHash, inspectScene, SceneEditError } from './source-roundtrip.mjs';

const fixture = await readFile(new URL('./fixtures/rain-scene.txt', import.meta.url));
const golden = await readFile(new URL('./fixtures/rain-scene.expected.txt', import.meta.url));
const marked = (body = 'say:原文;注释') => Buffer.from(`; @makenovel-node node.one\r\n${body}\r\n`);
const apply = (source, text, nodeId = 'node.one') => applyDialogueEdits(source, {
  expectedHash: contentHash(source), edits: [{ nodeId, text }],
});
const throwsCode = (fn, code) => assert.throws(fn, (error) => error instanceof SceneEditError && error.code === code);

test('a real UTF-8 BOM/CRLF fixture matches independently authored expected bytes after one edit', () => {
  const unchanged = Buffer.from(fixture);
  const result = apply(fixture, '雨停之后，一起回家吧。🌧️', 'rain.opening');
  assert.deepEqual(result.source, golden);
  assert.deepEqual(fixture, unchanged);
  assert.deepEqual(result.source.subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]));
  assert.equal(result.source.toString().includes('futureEffect:{"kind":"unknown","note":"保留我"} -raw=true; 未知命令'), true);
  assert.equal(result.source.toString().includes('choose:继续等雨:wait.txt\r\n  |一起回家:home.txt; 多行高级块'), true);
  assert.equal(inspectScene(result.source).nodes[0].nodeId, 'rain.opening');
});

test('a semicolon is serialized as native escaped content, keeping all argument and comment bytes', () => {
  const source = marked('say:\t字面\\;分号  -speaker=凛 -volume=80; 作者;第二段注释');
  assert.equal(inspectScene(source).nodes[0].text, '字面;分号');
  assert.equal(apply(source, '一;二').source.toString(),
    '; @makenovel-node node.one\r\nsay:\t一\\;二  -speaker=凛 -volume=80; 作者;第二段注释\r\n');
});

test('mixed line endings and absence of a final newline survive', () => {
  const source = Buffer.from('; 保持 LF\n; @makenovel-node node.one\r\nsay:旧;结尾');
  assert.equal(apply(source, '新').source.toString(), '; 保持 LF\n; @makenovel-node node.one\r\nsay:新;结尾');
});

test('moving a marked node keeps identity; edits in reverse request order have stable byte ranges', () => {
  const source = Buffer.from('; @makenovel-node node.two\nsay:二;\n; @makenovel-node node.one\nsay:一;');
  const result = applyDialogueEdits(source, {
    expectedHash: contentHash(source),
    edits: [{ nodeId: 'node.one', text: '第一句更长。' }, { nodeId: 'node.two', text: '第二句🌧️' }],
  });
  assert.equal(result.source.toString(), '; @makenovel-node node.two\nsay:第二句🌧️;\n; @makenovel-node node.one\nsay:第一句更长。;');
  assert.deepEqual(result.changes.map((item) => item.nodeId), ['node.two', 'node.one']);
});

test('unrelated external comment changes and newline-only changes both conflict', () => {
  const source = marked();
  for (const changed of [Buffer.concat([source, Buffer.from('; 新备注\n')]), Buffer.from(source.toString().replaceAll('\r\n', '\n'))]) {
    const copy = Buffer.from(changed);
    throwsCode(() => applyDialogueEdits(changed, {
      expectedHash: contentHash(source), edits: [{ nodeId: 'node.one', text: '改动' }],
    }), 'VERSION_CONFLICT');
    assert.deepEqual(changed, copy);
  }
});

test('hash is mandatory; SHA-256 vectors are standard; identical text produces an identical revision', () => {
  assert.equal(contentHash(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  throwsCode(() => applyDialogueEdits(marked(), { edits: [{ nodeId: 'node.one', text: '改' }] }), 'EXPECTED_HASH_REQUIRED');
  const source = marked();
  const result = apply(source, '原文');
  assert.deepEqual(result.source, source);
  assert.equal(result.afterHash, result.beforeHash);
});

test('duplicate IDs, absent IDs, malformed IDs and orphan markers fail with structured diagnostics', () => {
  throwsCode(() => inspectScene(Buffer.concat([marked(), marked()])), 'DUPLICATE_ID');
  throwsCode(() => apply(marked(), '改', 'absent'), 'ID_NOT_FOUND');
  throwsCode(() => inspectScene(Buffer.from('; @makenovel-node bad id\nsay:原文;')), 'INVALID_ID_MARKER');
  for (const source of ['; @makenovel-node orphan', '; @makenovel-node orphan\n\nsay:后文;', '; @makenovel-node orphan\n; note']) {
    throwsCode(() => inspectScene(Buffer.from(source)), 'MISSING_TARGET');
  }
  try {
    apply(marked(), '改', 'absent');
  } catch (error) {
    assert.deepEqual(error.toJSON(), { code: 'ID_NOT_FOUND', message: 'The requested node ID does not exist.', nodeId: 'absent' });
  }
});

test('a transaction with one invalid edit never mutates input or returns partial success', () => {
  const source = Buffer.from(fixture);
  throwsCode(() => applyDialogueEdits(source, {
    expectedHash: contentHash(source),
    edits: [{ nodeId: 'rain.opening', text: '有效修改' }, { nodeId: 'deleted.node', text: '无效修改' }],
  }), 'ID_NOT_FOUND');
  assert.deepEqual(source, fixture);
  throwsCode(() => applyDialogueEdits(source, {
    expectedHash: contentHash(source),
    edits: [{ nodeId: 'rain.reply', text: '一' }, { nodeId: 'rain.reply', text: '二' }],
  }), 'DUPLICATE_EDIT');
});

test('native multiline boundaries cannot consume the marker or the edited command', () => {
  throwsCode(() => inspectScene(Buffer.from('say:前文\\\n; @makenovel-node node.one\nsay:当前;')), 'UNSAFE_ID_MARKER');
  throwsCode(() => inspectScene(Buffer.from('; @makenovel-node node.one\n -volume=70')), 'UNSAFE_ID_MARKER');
  for (const body of ['say:第一行\\\n第二行;', 'say:正文\n  -volume=70;', 'say:正文\n  |后续']) {
    const source = marked(body);
    assert.equal(inspectScene(source).nodes[0].editable, false);
    throwsCode(() => apply(source, '改'), 'UNSUPPORTED_MULTILINE');
  }
});

test('opaque unknown commands stay discoverable but cannot be edited as dialogue', () => {
  for (const command of ['futureEffect:unknown;', '凛:原文;', ' say:原文;']) {
    const source = marked(command);
    assert.equal(inspectScene(source).nodes[0].editable, false);
    throwsCode(() => apply(source, '改'), 'UNSUPPORTED_COMMAND');
  }
});

test('unsupported text is rejected instead of accidentally creating parameters or silently changing content', () => {
  for (const text of ['', 'none', ' 外侧空格', '末尾空格 ', '文本 -next', '两\n行', '两\r行', 'a\\b', '\u0000', 'a\u2028b', '\ud800']) {
    throwsCode(() => apply(marked(), text), 'UNSUPPORTED_TEXT');
  }
  for (const body of ['say:;', 'say:none;', 'say:高级\\n转义;', 'say:含\u0000控制;']) {
    throwsCode(() => apply(marked(body), '改'), 'UNSUPPORTED_CONTENT');
  }
});

test('a leading ASCII hyphen cannot turn preserved whitespace into a native argument boundary', () => {
  for (const prefix of ['', ' ', '  ', '\t', '\t ']) {
    const source = marked(`say:${prefix}原文`);
    const original = Buffer.from(source);
    for (const text of ['-next', '-speaker=凛', '-']) {
      throwsCode(() => apply(source, text), 'UNSUPPORTED_TEXT');
      assert.deepEqual(source, original);
    }
  }
});

test('a rejected leading-hyphen edit aborts a multi-node transaction without applying earlier edits', () => {
  const source = Buffer.from(fixture);
  throwsCode(() => applyDialogueEdits(source, {
    expectedHash: contentHash(source),
    edits: [{ nodeId: 'rain.reply', text: '可接受的修改' }, { nodeId: 'rain.opening', text: '-next' }],
  }), 'UNSUPPORTED_TEXT');
  assert.deepEqual(source, fixture);
});

test('invalid UTF-8 and bare CR fail instead of replacing bytes during decoding', () => {
  throwsCode(() => inspectScene(Buffer.from([0xc3, 0x28])), 'INVALID_UTF8');
  throwsCode(() => inspectScene(Buffer.from('; a\rsay:b;')), 'UNSUPPORTED_LINE_ENDING');
  throwsCode(() => inspectScene(Buffer.from('; ends with bare CR\r')), 'UNSUPPORTED_LINE_ENDING');
});
