import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { directorFiles, directorSceneSource, failureSceneSource, generateDirectorDemo } from './generate.mjs';
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

test('native start parser sees explicit director dialogue fields and preserves BOM, CRLF and existing inline comments', () => {
  const raw = directorSceneSource();
  assert.equal(raw.charCodeAt(0), 0xfeff);
  assert.doesNotMatch(raw.replaceAll('\r\n', ''), /\n/);
  const scene = parse(raw, 'start');
  const lines = statements(scene);
  assert.deepEqual(lines.slice(0, 7).map(item => item.commandRaw), ['changeBg', 'bgm', 'changeFigure', 'changeFigure', 'wait', 'say', 'changeFigureDiff']);
  assert.equal(arg(lines[1], 'volume'), 28); assert.equal(arg(lines[1], 'enter'), 0);
  assert.equal(lines[4].content, '500'); assert.equal(arg(lines[4], 'nobreak'), true);
  assert.equal(arg(lines[5], 'speaker'), '林'); assert.equal(arg(lines[5], 'vocal'), './game/vocal/voice-a.wav'); assert.equal(arg(lines[5], 'left'), true);
  assert.equal(lines[5].inlineComment, 'R7 preserve: dialogue comment');
  const dialogues = lines.filter(item => item.command === types.say);
  assert.equal(dialogues.length, 2); assert.match(dialogues[1].content, /R7-02/);
  assert.equal(arg(dialogues[1], 'vocal'), './game/vocal/voice-b.wav');
  assert.equal(lines.filter(item => item.command === types.changeFigureDiff).length, 2);
});

test('native scene graph reaches failure.txt and every referenced media file exists in the generated source map', () => {
  const files = directorFiles('test-key');
  const start = parse(directorSceneSource(), 'start');
  const failure = parse(failureSceneSource(), 'failure');
  const choose = statements(start).find(item => item.command === types.choose);
  assert.equal(choose.content, '继续资源失败验证:failureTest|结束:finish');
  const labels = new Set(statements(start).filter(item => item.command === types.label).map(item => item.content));
  for (const option of choose.content.split('|')) assert.ok(labels.has(option.split(':')[1]));
  assert.ok(start.subSceneList.includes('./game/scene/failure.txt'));
  for (const scene of [start, failure]) {
    for (const asset of scene.assetsList) assert.ok(files.has(asset.url.replace(/^\.\//, '')), asset.url);
    assert.equal(statements(scene).at(-1).command, types.end);
  }
  const failureLines = statements(failure);
  const backgrounds = failureLines.filter(item => item.command === types.changeBg);
  assert.deepEqual(backgrounds.map(item => item.content), ['./game/background/day.svg', './game/background/broken.svg', './game/background/day.svg']);
  assert.deepEqual(failureLines.filter(item => item.command === types.wait).map(item => item.content), ['500', '100', '100']);
  assert.deepEqual(failureLines.filter(item => item.command === types.say).map(item => item.content.match(/R7-[A-Z]+/)[0]), ['R7-BASE', 'R7-FAIL', 'R7-RECOVER']);
  assert.doesNotMatch(files.get('game/background/broken.svg'), /<svg/);
  assert.match(files.get('game/background/day.svg'), /ROUND 7 \/ DAY/);
  assert.match(files.get('game/background/night.svg'), /ROUND 7 \/ NIGHT/);
});

test('fresh generation has one accurate receipt, sealed corrupt fixture and distinct new identity, and refuses existing output', async () => {
  const scratch = path.join(REPO, '.scratch'); await fs.mkdir(scratch, { recursive: true });
  const parent = await fs.mkdtemp(path.join(scratch, 'director-demo-test-'));
  const target = path.join(parent, 'new-game');
  const result = await generateDirectorDemo(target); const manifest = await verifyGame(target);
  assert.equal(result.upstreamCommit, UPSTREAM_COMMIT); assert.equal(result.files, 20);
  assert.match(result.gameKey, /^makenovel-round7-/);
  assert.equal(manifest.projectId, result.projectId); assert.equal(manifest.gameKey, result.gameKey); assert.equal(manifest.manifestHash, result.manifestHash);
  const receipt = JSON.parse(await fs.readFile(path.join(target, 'director-demo-receipt.json'), 'utf8'));
  assert.equal(receipt.manifestHash, manifest.manifestHash);
  for (const entry of [...receipt.sceneSources, receipt.configSource, ...receipt.templateFiles]) {
    assert.equal(hash(await fs.readFile(path.join(target, entry.path))), entry.sha256, entry.path);
  }
  assert.ok(manifest.files.some(entry => entry.path === 'game/background/broken.svg'));
  assert.ok(manifest.files.some(entry => entry.path === 'game/scene/failure.txt'));
  await assert.rejects(fs.stat(path.join(target, 'stage-demo-receipt.json')), { code: 'ENOENT' });
  const before = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generateDirectorDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), before);
  const second = await generateDirectorDemo(path.join(parent, 'other-game'));
  assert.notEqual(second.projectId, result.projectId); assert.notEqual(second.gameKey, result.gameKey);
  // Retain small ignored fixtures as evidence, never remove caller-owned output.
});
