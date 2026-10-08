import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { insertionFiles, insertionSceneSource, boundarySceneSource, generateInsertionDemo } from './generate.mjs';
import { REPO, UPSTREAM_COMMIT } from '../stage-demo/generate.mjs';
import { verifyGame } from '../game-manifest/manifest.mjs';

const require = createRequire(import.meta.url);
const native = require('../../vendor/WebGAL/packages/parser/build/cjs/index.cjs');
const requireVendor = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { transform } = requireVendor('esbuild');
const source = await fs.readFile(path.join(REPO, 'vendor/WebGAL/packages/webgal/src/Core/util/gameAssetsAccess/assetSetter.ts'), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { assetSetter } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const parser = new native.default(() => {}, assetSetter, native.ADD_NEXT_ARG_LIST, native.SCRIPT_CONFIG);
const types = Object.fromEntries(native.SCRIPT_CONFIG.map(({ scriptString, scriptType }) => [scriptString, scriptType]));
const parse = (text, name) => parser.parse(text, name, `./game/scene/${name}.txt`);
const statements = result => result.sentenceList.filter(item => item.commandRaw !== 'comment');
const arg = (sentence, key) => sentence.args.find(entry => entry.key === key)?.value;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('native start establishes a stage then exposes an empty local insertion group and a later inherited dialogue', () => {
  const raw = insertionSceneSource();
  assert.equal(raw.charCodeAt(0), 0xfeff);
  assert.doesNotMatch(raw.replaceAll('\r\n', ''), /[\r\n]/);
  assert.equal(raw.split('\r\n').length - 1, 17);
  const lines = statements(parse(raw, 'start'));
  assert.deepEqual(lines.slice(0, 9).map(item => item.commandRaw), ['changeBg', 'bgm', 'changeFigure', 'changeFigure', 'wait', 'say', 'say', 'wait', 'say']);
  assert.equal(arg(lines[1], 'volume'), 28); assert.equal(arg(lines[1], 'enter'), 0);
  assert.equal(arg(lines[2], 'left'), true); assert.equal(arg(lines[3], 'right'), true);
  assert.equal(arg(lines[5], 'speaker'), '林'); assert.equal(arg(lines[5], 'vocal'), './game/vocal/voice-a.wav');
  assert.match(lines[6].content, /R8-02/); assert.equal(arg(lines[6], 'vocal'), './game/vocal/voice-b.wav');
  assert.equal(lines[6].inlineComment, 'R8 preserve: insertion target');
  assert.match(lines[8].content, /R8-03/); assert.equal(lines[7].content, '500');
  assert.equal(arg(lines[7], 'nobreak'), true);
  assert.ok(raw.includes('; R8 opaque author note: keep {draft: [night, left, sound]} exactly here.\r\n'));
});

test('native branches and opaque arguments remain legal and every referenced media and scene path resolves', () => {
  const files = insertionFiles('test-key');
  const start = parse(insertionSceneSource(), 'start');
  const boundary = parse(boundarySceneSource(), 'readonly');
  const choose = statements(start).find(item => item.command === types.choose);
  assert.equal(choose.content, '查看来源边界:boundary|结束:finish');
  const labels = new Set(statements(start).filter(item => item.command === types.label).map(item => item.content));
  for (const option of choose.content.split('|')) assert.ok(labels.has(option.split(':')[1]));
  assert.ok(start.subSceneList.includes('./game/scene/readonly.txt'));
  for (const scene of [start, boundary]) {
    for (const asset of scene.assetsList) assert.ok(files.has(asset.url.replace(/^\.\//, '')), asset.url);
    for (const statement of statements(scene)) assert.ok(Object.hasOwn(types, statement.commandRaw), statement.commandRaw);
    assert.equal(statements(scene).at(-1).command, types.end);
  }
  const lines = statements(boundary);
  assert.equal(lines[0].command, types.setVar); assert.equal(lines[0].content, 'round8_boundary=1');
  assert.equal(lines[2].command, types.changeBg); assert.equal(lines[2].content, './game/background/night.svg');
  assert.equal(arg(lines[2], 'r8Opaque'), 'kept');
  assert.equal(lines[2].inlineComment, 'R8 preserve: opaque argument alpha={a:b}');
  assert.match(lines[4].content, /R8-OPAQUE/);
  // These are available for GUI insertion even though start.txt does not play them yet.
  const inserted = statements(parse('changeBg:night.svg -next;\nchangeFigure:lin-smile.svg -left -next;\nbgm:test-bgm.wav -volume=41 -next;\nplayEffect:test-se.wav -volume=55;\n', 'candidate'));
  for (const sentence of inserted) assert.ok(files.has(sentence.content.replace(/^\.\//, '')), sentence.content);
  assert.equal(inserted.at(-1).content, './game/vocal/test-se.wav');
  assert.match(files.get('game/background/day.svg'), /ROUND 8 \/ DAY/);
  assert.match(files.get('game/background/night.svg'), /ROUND 8 \/ NIGHT/);
  assert.ok(!files.has('game/background/broken.svg'));
});

test('fresh generation seals only round-8 identity, precise source bytes and locked template text, and refuses replacement', async () => {
  const scratch = path.join(REPO, '.scratch'); await fs.mkdir(scratch, { recursive: true });
  const parent = await fs.mkdtemp(path.join(scratch, 'director-insertion-demo-test-'));
  const target = path.join(parent, 'new-game');
  const result = await generateInsertionDemo(target); const manifest = await verifyGame(target);
  assert.equal(result.upstreamCommit, UPSTREAM_COMMIT); assert.equal(result.files, 19);
  assert.match(result.gameKey, /^makenovel-round8-/);
  assert.equal(manifest.projectId, result.projectId); assert.equal(manifest.gameKey, result.gameKey); assert.equal(manifest.manifestHash, result.manifestHash);
  const receipt = JSON.parse(await fs.readFile(path.join(target, 'director-insertion-demo-receipt.json'), 'utf8'));
  assert.equal(receipt.manifestHash, manifest.manifestHash); assert.equal(receipt.insertionTarget.line, 9);
  for (const entry of [...receipt.sceneSources, receipt.configSource, ...receipt.templateFiles]) {
    assert.equal(hash(await fs.readFile(path.join(target, entry.path))), entry.sha256, entry.path);
  }
  assert.equal(await fs.readFile(path.join(target, 'game/scene/start.txt'), 'utf8'), insertionSceneSource());
  assert.equal(await fs.readFile(path.join(target, 'game/scene/readonly.txt'), 'utf8'), boundarySceneSource());
  for (const oldReceipt of ['stage-demo-receipt.json', 'director-demo-receipt.json']) {
    await assert.rejects(fs.stat(path.join(target, oldReceipt)), { code: 'ENOENT' });
  }
  const before = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generateInsertionDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), before);
  const fileTarget = path.join(parent, 'keep.txt'); await fs.writeFile(fileTarget, 'keep exact\r\n', { flag: 'wx' });
  await assert.rejects(generateInsertionDemo(fileTarget), /OUTPUT_EXISTS/);
  assert.equal(await fs.readFile(fileTarget, 'utf8'), 'keep exact\r\n');
  const second = await generateInsertionDemo(path.join(parent, 'other-game'));
  assert.notEqual(second.projectId, result.projectId); assert.notEqual(second.gameKey, result.gameKey);
  // Retain small ignored fixtures as evidence; no caller-owned output is removed.
});
