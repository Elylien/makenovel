import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generateDemo, originalFiles, makeToneWav, sceneSource, REPO, UPSTREAM_COMMIT } from './generate.mjs';
import { verifyGame } from '../game-manifest/manifest.mjs';

const require = createRequire(import.meta.url);
const parserModule = require('../../vendor/WebGAL/packages/parser/build/cjs/index.cjs');
const requireEditor = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const { transform } = requireEditor('esbuild');
// Use the real runtime asset resolver, not an assumed copy of its directory mapping.
const source = await fs.readFile(path.join(REPO, 'vendor/WebGAL/packages/webgal/src/Core/util/gameAssetsAccess/assetSetter.ts'), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { assetSetter } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const parser = new parserModule.default(() => {}, assetSetter, parserModule.ADD_NEXT_ARG_LIST, parserModule.SCRIPT_CONFIG);
const types = Object.fromEntries(parserModule.SCRIPT_CONFIG.map(({ scriptString, scriptType }) => [scriptString, scriptType]));
const parsed = parser.parse(sceneSource(), 'start', './game/scene/start.txt');
const arg = (sentence, key) => sentence.args.find((entry) => entry.key === key)?.value;

test('native parser resolves every media path, including SE and both vocal arguments', () => {
  const files = originalFiles('test-key');
  const paths = parsed.assetsList.map((asset) => asset.url);
  const effect = parsed.sentenceList.find((sentence) => sentence.command === types.playEffect);
  paths.push(effect.content); // Native assetsScanner does not list SE, contentParser still resolves it.
  assert.equal(effect.content, './game/vocal/test-se.wav');
  for (const url of paths) assert.ok(files.has(url.replace(/^\.\//, '')), `Missing media: ${url}`);
  const vocals = parsed.sentenceList.map((sentence) => arg(sentence, 'vocal')).filter(Boolean);
  assert.ok(vocals.includes('./game/vocal/voice-a.wav'));
  assert.ok(vocals.includes('./game/vocal/voice-b.wav'));
  assert.equal(parsed.sentenceList.filter((sentence) => sentence.commandRaw !== 'comment').at(-1).command, types.end);
});

test('both branches and retry targets exist and native wait/animation arguments retain intended durations', () => {
  const statements = parsed.sentenceList;
  const labels = new Set(statements.filter((sentence) => sentence.command === types.label).map((sentence) => sentence.content));
  const branches = statements.filter((sentence) => sentence.command === types.choose);
  assert.equal(branches.length, 2);
  for (const sentence of branches) for (const option of sentence.content.split('|')) assert.ok(labels.has(option.split(':')[1]));
  for (const sentence of statements.filter((s) => s.command === types.jumpLabel)) assert.ok(labels.has(sentence.content));
  const waits = statements.filter((s) => s.command === types.wait && s.content === '8000');
  assert.equal(waits.length, 2);
  assert.ok(waits.every((s) => arg(s, 'nobreak') === true && arg(s, 'next') !== true));
  const slides = statements.filter((s) => s.command === types.setTransform && Number(arg(s, 'duration')) === 8000);
  assert.equal(slides.length, 2);
  assert.ok(slides.every((s) => arg(s, 'target') === 'fig-right' && arg(s, 'next') === true));
  assert.equal(statements.filter((s) => s.command === types.changeFigureDiff).length, 4);
  const hop = statements.find((s) => s.command === types.setTempAnimation);
  assert.equal(JSON.parse(hop.content).reduce((sum, frame) => sum + frame.duration, 0), 860);
  assert.equal(arg(hop, 'target'), 'fig-left');
});

test('original figure differences share geometry and have no external SVG dependencies', () => {
  const files = originalFiles('same-key');
  for (const [name, value] of files) if (name.endsWith('.svg')) {
    assert.doesNotMatch(value, /<(?:image|script|foreignObject)|(?:href|url\s*\()/i);
    if (name.includes('/figure/')) assert.match(value, /width="800" height="1400" viewBox="0 0 800 1400"/);
  }
  assert.notEqual(files.get('game/figure/lin-neutral.svg'), files.get('game/figure/lin-smile.svg'));
  assert.notEqual(files.get('game/figure/lin-neutral.svg'), files.get('game/figure/yu-neutral.svg'));
  const again = originalFiles('same-key');
  for (const [name, bytes] of files) assert.deepEqual(again.get(name), bytes, name);
});

test('PCM test tones have valid RIFF lengths, bounded amplitude and distinct voice-channel patterns', () => {
  const files = originalFiles('test-key');
  for (const [name, bytes] of files) if (name.endsWith('.wav')) {
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
    assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
    assert.equal(bytes.readUInt16LE(20), 1);
    assert.equal(bytes.readUInt16LE(22), 1);
    assert.equal(bytes.readUInt32LE(24), 24000);
    let peak = 0;
    for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
    assert.ok(peak > 1000 && peak < 10000, `${name}: ${peak}`);
  }
  assert.notDeepEqual(files.get('game/vocal/voice-a.wav'), files.get('game/vocal/voice-b.wav'));
  assert.equal(makeToneWav([440], 1).length, 48044);
});

test('new generation seals native configuration, copies pinned text only, and refuses to replace any existing project', async () => {
  const scratch = path.join(REPO, '.scratch');
  await fs.mkdir(scratch, { recursive: true });
  const parent = await fs.mkdtemp(path.join(scratch, 'stage-demo-test-'));
  const target = path.join(parent, 'new-game');
  const receipt = await generateDemo(target);
  const manifest = await verifyGame(target);
  assert.equal(receipt.upstreamCommit, UPSTREAM_COMMIT);
  assert.equal(receipt.files, 18);
  assert.equal(manifest.gameKey, receipt.gameKey);
  assert.equal(manifest.projectId, receipt.projectId);
  assert.ok(manifest.files.some((file) => file.path === 'game/template/UI/Title/title.scss'));
  assert.ok(!manifest.files.some((file) => /\.(mp3|webp|png|woff2?)$/i.test(file.path)));
  const before = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generateDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), before);
  const second = await generateDemo(path.join(parent, 'another-game'));
  assert.notEqual(second.projectId, receipt.projectId);
  assert.notEqual(second.gameKey, receipt.gameKey);
  // Retain our small ignored fixture for diagnosis; never delete caller-owned files.
});
