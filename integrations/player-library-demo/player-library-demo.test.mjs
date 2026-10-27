import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { playerLibraryFiles, generatePlayerLibraryDemo } from './generate.mjs';
import { REPO } from '../stage-demo/generate.mjs';
import { verifyGame } from '../game-manifest/manifest.mjs';

const require = createRequire(import.meta.url);
const native = require('../../vendor/WebGAL/packages/parser/build/cjs/index.cjs');
const requireVendor = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { transform } = requireVendor('esbuild');
const { code } = await transform(await fs.readFile(path.join(REPO, 'vendor/WebGAL/packages/webgal/src/Core/util/gameAssetsAccess/assetSetter.ts'), 'utf8'), { loader: 'ts', format: 'esm' });
const { assetSetter } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const parser = new native.default(() => {}, assetSetter, native.ADD_NEXT_ARG_LIST, native.SCRIPT_CONFIG);
const types = Object.fromEntries(native.SCRIPT_CONFIG.map(({ scriptString, scriptType }) => [scriptString, scriptType]));

test('native single-dialogue scenes and collection cases resolve to their sealed resources', () => {
  const files = playerLibraryFiles('fixture');
  for (const [name, expectedSayCount] of [['start.txt', 1], ['motion.txt', 1], ['library.txt', 6]]) {
    const text = files.get(`game/scene/${name}`);
    assert.equal(text.charCodeAt(0), 0xfeff);
    assert.doesNotMatch(text.replaceAll('\r\n', ''), /[\r\n]/);
    const scene = parser.parse(text, name, `./game/scene/${name}`);
    assert.equal(scene.sentenceList.filter(s => s.command === types.say).length, expectedSayCount);
    for (const asset of scene.assetsList) assert.ok(files.has(asset.url.replace(/^\.\//, '')), asset.url);
    for (const sentence of scene.sentenceList.filter(s => s.commandRaw !== 'comment')) assert.ok(Object.hasOwn(types, sentence.commandRaw));
  }
  const motion = parser.parse(files.get('game/scene/motion.txt'), 'motion.txt', './game/scene/motion.txt');
  const animation = motion.sentenceList.find(s => s.command === types.setAnimation);
  assert.equal(animation.args.find(a => a.key === 'next').value, true);
  assert.equal(JSON.parse(files.get('game/animation/move-right-eight.json')).reduce((n, frame) => n + frame.duration, 0), 8000);
  const library = parser.parse(files.get('game/scene/library.txt'), 'library.txt', './game/scene/library.txt');
  const lines = library.sentenceList.filter(s => s.command === types.say);
  assert.equal(lines.filter(s => s.args.some(a => a.key === 'vocal')).length, 3);
  assert.doesNotMatch(lines.find(s => s.content.includes('R18-NO-ID')).inlineComment, /@makenovel-node/);
  assert.match(lines.find(s => s.content.includes('R18-TEXT')).inlineComment, /@makenovel-node r18-text/);
  assert.equal(files.get('game/vocal/voice-a.wav').subarray(0, 4).toString(), 'RIFF');
  assert.match(files.get('game/vocal/broken.wav'), /Intentional invalid audio/);
});

test('flowchart chapters each bind an existing native scene without bundling a parallel runtime', () => {
  const files = playerLibraryFiles('fixture');
  const chart = JSON.parse(files.get('game/flowchart.json')).flowcharts[0];
  assert.equal(chart.nodes.length, 3);
  for (const node of chart.nodes) assert.ok(files.has(`game/scene/${node.data.sceneName}`));
  assert.deepEqual([...files.keys()].filter(p => /\.(?:js|html)$/.test(p)), []);
});

test('generation is non-overwriting, isolated and sealed with original source bytes', async () => {
  const parent = await fs.mkdtemp(path.join(REPO, '.scratch/player-library-demo-'));
  const target = path.join(parent, 'one');
  const result = await generatePlayerLibraryDemo(target), verified = await verifyGame(target);
  assert.equal(result.files, 18); assert.equal(result.manifestHash, verified.manifestHash);
  for (const source of result.sceneSources) assert.equal(createHash('sha256').update(await fs.readFile(path.join(target, source.path))).digest('hex'), source.sha256);
  const manifest = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generatePlayerLibraryDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), manifest);
  const second = await generatePlayerLibraryDemo(path.join(parent, 'two'));
  assert.notEqual(second.projectId, result.projectId); assert.notEqual(second.gameKey, result.gameKey);
  await fs.appendFile(path.join(target, 'game/scene/library.txt'), 'changed');
  await assert.rejects(verifyGame(target), /CONTENT_CHANGED|content|changed/i);
});
