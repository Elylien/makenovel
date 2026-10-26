import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { playbackFiles, playbackStartSource, playbackMotionSource, playbackFlowchart, generatePlaybackDemo, PLAYBACK_STOPS, PLAYBACK_RESOURCES } from './generate.mjs';
import { REPO, UPSTREAM_COMMIT } from '../stage-demo/generate.mjs';
import { verifyGame } from '../game-manifest/manifest.mjs';

const require = createRequire(import.meta.url);
const native = require('../../vendor/WebGAL/packages/parser/build/cjs/index.cjs');
const requireVendor = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { transform } = requireVendor('esbuild');
async function loadTypeScript(relative) {
  const { code } = await transform(await fs.readFile(path.join(REPO, relative), 'utf8'), { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { assetSetter } = await loadTypeScript('vendor/WebGAL/packages/webgal/src/Core/util/gameAssetsAccess/assetSetter.ts');
const { inspectSceneIdentity } = await loadTypeScript('vendor/WebGAL_Terre/packages/terre2/src/Modules/scene-identity/scene-identity.ts');
const parser = new native.default(() => {}, assetSetter, native.ADD_NEXT_ARG_LIST, native.SCRIPT_CONFIG);
const types = Object.fromEntries(native.SCRIPT_CONFIG.map(({ scriptString, scriptType }) => [scriptString, scriptType]));
const parse = (text, name) => parser.parse(text, name, `./game/scene/${name}`);
const arg = (sentence, key) => sentence.args.find(entry => entry.key === key)?.value;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('native scene transition reaches an overlapping first dialogue, then stable and manual checkpoints', () => {
  const texts = { 'start.txt': playbackStartSource(), 'motion.txt': playbackMotionSource() };
  const scenes = Object.fromEntries(Object.entries(texts).map(([name, text]) => [name, parse(text, name)]));
  const at = (scene, line) => scenes[scene].sentenceList.find(item => item.startLine === line - 1);
  for (const [name, text] of Object.entries(texts)) {
    assert.equal(text.charCodeAt(0), 0xfeff, name);
    assert.doesNotMatch(text.replaceAll('\r\n', ''), /[\r\n]/);
    const identities = inspectSceneIdentity(text, scenes[name].sentenceList);
    assert.equal(identities.diagnostics.filter(item => item.severity === 'error').length, 0);
    for (const stop of PLAYBACK_STOPS.filter(entry => entry.scene === name)) {
      const sentence = at(name, stop.line);
      assert.equal(sentence.command, types.say);
      assert.ok(sentence.content.includes(stop.label), stop.label);
      assert.equal(identities.nodes.find(item => item.startLine === stop.line - 1).nodeId, stop.nodeId);
      assert.ok(sentence.inlineComment.includes('R16 preserve:'));
    }
    for (const statement of scenes[name].sentenceList.filter(item => item.commandRaw !== 'comment')) {
      assert.ok(Object.hasOwn(types, statement.commandRaw), statement.commandRaw);
    }
  }
  assert.equal(texts['start.txt'].split('\r\n').length - 1, 7);
  assert.equal(texts['motion.txt'].split('\r\n').length - 1, 21);
  assert.equal(at('start.txt', 6).command, types.changeScene);
  assert.match(at('start.txt', 6).content, /motion\.txt$/);
  const animation = at('motion.txt', 2);
  assert.equal(animation.command, types.setAnimation);
  assert.equal(animation.content, 'move-right-eight');
  assert.equal(arg(animation, 'target'), 'r16-hero');
  assert.equal(arg(animation, 'next'), true);
  assert.equal(arg(animation, 'keep'), false); assert.equal(arg(animation, 'parallel'), false);
  assert.equal(arg(animation, 'transformFrom'), 'current');
  assert.equal(scenes['motion.txt'].sentenceList.find(item => item.command === types.say).startLine, 2);
  assert.equal(at('motion.txt', 10).command, types.setAnimation);
  assert.equal(arg(at('motion.txt', 10), 'next'), false);
  assert.equal(arg(at('motion.txt', 10), 'target'), 'fig-left');
  assert.equal(at('motion.txt', 5).content, '');
  assert.equal(arg(at('motion.txt', 5), 'id'), 'r16-hero');
  assert.equal(arg(at('motion.txt', 6), 'left'), true);
  assert.doesNotMatch(playbackMotionSource(), /(?:setVar|changeFigureDiff|setTempAnimation|bgm:|-vocal=)/);
});

test('flowchart nodes and every native scene asset resolve to the same sealed fixture', () => {
  const files = playbackFiles('fixture-key');
  for (const name of ['start.txt', 'motion.txt']) {
    const scene = parse(files.get(`game/scene/${name}`), name);
    for (const asset of scene.assetsList) assert.ok(files.has(asset.url.replace(/^\.\//, '')), asset.url);
  }
  const flow = playbackFlowchart();
  assert.deepEqual(JSON.parse(files.get('game/flowchart.json')), flow);
  assert.equal(flow.flowcharts.length, 1);
  assert.equal(flow.flowcharts[0].type, 'main');
  assert.deepEqual(flow.flowcharts[0].nodes.map(node => node.data.sceneName), ['start.txt', 'motion.txt']);
  assert.deepEqual(flow.flowcharts[0].edges, [{ id: 'start-to-motion', source: 'start', target: 'motion' }]);
  for (const node of flow.flowcharts[0].nodes) assert.ok(files.has(`game/scene/${node.data.sceneName}`));
  assert.match(files.get('game/config.txt'), /Enable_flowchart:true;/);
  assert.match(files.get('game/background/stage.svg'), /ROUND 16 \/ PLAYBACK &amp; RESTORE/);
  assert.match(files.get('game/figure/lin-neutral.svg'), /LIN \/ A/);
  assert.match(files.get('game/figure/yu-neutral.svg'), /YU \/ B/);
  assert.deepEqual(JSON.parse(files.get('game/animation/animationTable.json')), PLAYBACK_RESOURCES.map(entry => entry.name));
  for (const resource of PLAYBACK_RESOURCES) {
    assert.equal(resource.path, `game/animation/${resource.name}.json`);
    const frames = JSON.parse(files.get(resource.path));
    assert.deepEqual(frames.map(frame => frame.position.x), [0, resource.endX]);
    assert.equal(frames.reduce((sum, frame) => sum + frame.duration, 0), 8000);
    assert.ok(frames.every(frame => frame.ease === 'linear'));
  }
  assert.deepEqual([...files.keys()].filter(file => /\.(?:js|html|wav)$/.test(file)), []);
});

test('generation seals source, graph and resources, refuses existing output, and keeps identities independent', async () => {
  const scratch = path.join(REPO, '.scratch'); await fs.mkdir(scratch, { recursive: true });
  const parent = await fs.mkdtemp(path.join(scratch, 'playback-demo-test-'));
  const target = path.join(parent, 'new-game');
  const result = await generatePlaybackDemo(target), verified = await verifyGame(target);
  assert.equal(result.upstreamCommit, UPSTREAM_COMMIT);
  assert.equal(result.files, 14);
  assert.match(result.gameKey, /^makenovel-round16-/);
  assert.equal(result.manifestHash, verified.manifestHash);
  assert.equal(result.gameKey, verified.gameKey); assert.equal(result.projectId, verified.projectId);
  const receipt = JSON.parse(await fs.readFile(path.join(target, 'playback-demo-receipt.json'), 'utf8'));
  assert.deepEqual(receipt.playbackStops, PLAYBACK_STOPS);
  for (const entry of [...receipt.sceneSources, receipt.configSource, receipt.flowchartSource, ...receipt.templateFiles, ...receipt.animationResources]) {
    assert.equal(hash(await fs.readFile(path.join(target, entry.path))), entry.sha256, entry.path);
  }
  assert.equal(await fs.readFile(path.join(target, 'game/scene/motion.txt'), 'utf8'), playbackMotionSource());
  const manifestBytes = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generatePlaybackDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), manifestBytes);
  const existingFile = path.join(parent, 'keep.txt');
  await fs.writeFile(existingFile, 'keep exact\r\n', { flag: 'wx' });
  await assert.rejects(generatePlaybackDemo(existingFile), /OUTPUT_EXISTS/);
  assert.equal(await fs.readFile(existingFile, 'utf8'), 'keep exact\r\n');
  const second = await generatePlaybackDemo(path.join(parent, 'other-game'));
  assert.notEqual(result.projectId, second.projectId); assert.notEqual(result.gameKey, second.gameKey);
  await fs.appendFile(path.join(target, 'game/flowchart.json'), ' ');
  await assert.rejects(verifyGame(target), /CONTENT_CHANGED|content|changed/i);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), manifestBytes);
  // Keep scratch outputs for evidence; never delete a caller's project.
});
