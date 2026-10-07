import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyDialogueEdits, contentHash, SceneEditError } from './source-roundtrip.mjs';

// Deliberately fail if the actual pinned parser has not been built. A local
// parser imitation or a skipped integration test would not prove compatibility.
const parserURL = new URL('../../vendor/WebGAL/packages/parser/build/es/index.js', import.meta.url);
let native;
try {
  native = await import(parserURL.href);
} catch (cause) {
  throw new Error('Build the pinned vendor/WebGAL parser before running native-integration.test.mjs. See README.md.', { cause });
}
const upstreamPath = fileURLToPath(new URL('../../vendor/WebGAL', import.meta.url));
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstreamPath, encoding: 'utf8' }).trim(),
  'd0318e6c4cdb8b04bb5d891f40368cff3c6efc85', 'The evidence requires the pinned upstream commit.');
execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'packages/parser/src'], { cwd: upstreamPath, stdio: 'pipe' });
const parser = new native.default(undefined, (name) => name, native.ADD_NEXT_ARG_LIST, native.SCRIPT_CONFIG);
const parse = (source) => parser.parse(source, 'experiment', 'experiment.txt').sentenceList;
const semantic = (sentences) => sentences.filter((item) => item.commandRaw !== 'comment').map((item) => ({
  command: item.command, commandRaw: item.commandRaw, content: item.content, args: item.args, inlineComment: item.inlineComment,
}));

test('native parser recognizes a standalone ID marker as a comment with next=true', () => {
  const result = parse('; @makenovel-node node.one\r\nsay:原文;');
  assert.equal(result[0].commandRaw, 'comment');
  assert.equal(result[0].content, '@makenovel-node node.one');
  assert.deepEqual(result[0].args, [{ key: 'next', value: true }]);
  assert.equal(result[1].commandRaw, 'say');
  assert.equal(result[1].content, '原文');
  assert.equal(result[1].startLine, 1); // ID comments still shift native indices.
});

test('a real fixture with markers has the same native executable semantics as without markers', async () => {
  const source = (await readFile(new URL('./fixtures/rain-scene.txt', import.meta.url))).toString('utf8');
  const withoutMarkers = source.split('\r\n').filter((line) => !line.startsWith('; @makenovel-node ')).join('\r\n');
  assert.deepEqual(semantic(parse(source)), semantic(parse(withoutMarkers)));
  assert.equal(parse(source).find((item) => item.commandRaw === 'choose').content,
    '继续等雨:wait.txt|一起回家:home.txt');
  const unknown = parse(source).find((item) => item.commandRaw === 'futureEffect');
  // Upstream treats unregistered names as speakers. Preservation is not a
  // guarantee that an unknown command is safe or has the intended semantics.
  assert.equal(unknown.command, native.SCRIPT_CONFIG.find((item) => item.scriptString === 'say').scriptType);
});

test('a localized edit changes only native say content, including literal semicolons', () => {
  const source = Buffer.from('; @makenovel-node node.one\r\nsay: 原文 -speaker=凛 -volume=80; 作者备注\r\nchangeBg:night.png -next;');
  const result = applyDialogueEdits(source, {
    expectedHash: contentHash(source), edits: [{ nodeId: 'node.one', text: '新台词;继续等待🌧️' }],
  });
  const before = semantic(parse(source.toString()));
  const after = semantic(parse(result.source.toString()));
  assert.equal(after[0].content, '新台词;继续等待🌧️');
  assert.deepEqual(after, [{ ...before[0], content: '新台词;继续等待🌧️' }, ...before.slice(1)]);
});

test('native preprocessing really absorbs markers after an explicit continuation', () => {
  const result = parse('say:前文\\\n; @makenovel-node node.one\nsay:当前;');
  assert.equal(result[0].inlineComment, '@makenovel-node node.one');
  assert.equal(result[1].isLineBreakHolder, true);
  assert.equal(result[0].endLine, 1);
});

test('leading-hyphen replacement is rejected because native parsing would turn it into a next argument', () => {
  const nativeUnsafe = parse('; @makenovel-node n\nsay: -next')[1];
  assert.equal(nativeUnsafe.content, '');
  assert.deepEqual(nativeUnsafe.args, [{ key: 'next', value: true }]);
  const source = Buffer.from('; @makenovel-node n\nsay: 原文');
  assert.throws(() => applyDialogueEdits(source, {
    expectedHash: contentHash(source), edits: [{ nodeId: 'n', text: '-next' }],
  }), (error) => error instanceof SceneEditError && error.code === 'UNSUPPORTED_TEXT');
  assert.equal(source.toString(), '; @makenovel-node n\nsay: 原文');
  assert.equal(parse(source.toString())[1].content, '原文');
  assert.deepEqual(parse(source.toString())[1].args, []);
});
