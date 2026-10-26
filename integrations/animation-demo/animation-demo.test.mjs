import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { animationFiles, animationSceneSource, boundarySceneSource, generateAnimationDemo, ANIMATION_CASES, ANIMATION_RESOURCES, BOUNDARY_TARGETS } from './generate.mjs';
import { REPO, UPSTREAM_COMMIT } from '../stage-demo/generate.mjs';
import { verifyGame } from '../game-manifest/manifest.mjs';

const require = createRequire(import.meta.url);
const native = require('../../vendor/WebGAL/packages/parser/build/cjs/index.cjs');
const requireVendor = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { transform } = requireVendor('esbuild');
async function loadTypeScript(relative) {
  const source = await fs.readFile(path.join(REPO, relative), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { assetSetter } = await loadTypeScript('vendor/WebGAL/packages/webgal/src/Core/util/gameAssetsAccess/assetSetter.ts');
const { inspectSceneIdentity } = await loadTypeScript('vendor/WebGAL_Terre/packages/terre2/src/Modules/scene-identity/scene-identity.ts');
const parser = new native.default(() => {}, assetSetter, native.ADD_NEXT_ARG_LIST, native.SCRIPT_CONFIG);
const types = Object.fromEntries(native.SCRIPT_CONFIG.map(({ scriptString, scriptType }) => [scriptString, scriptType]));
const parse = (text, name) => parser.parse(text, name, `./game/scene/${name}.txt`);
const statements = result => result.sentenceList.filter(item => item.commandRaw !== 'comment');
const arg = (sentence, key) => sentence.args.find(entry => entry.key === key)?.value;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('native finite animations retain target, next, explicit false/current and mixed source identities', () => {
  const raw = animationSceneSource(), physical = raw.split('\r\n');
  assert.equal(raw.charCodeAt(0), 0xfeff);
  assert.doesNotMatch(raw.replaceAll('\r\n', ''), /[\r\n]/);
  assert.equal(physical.length - 1, 23);
  const scene = parse(raw, 'start');
  const at = line => scene.sentenceList.find(item => item.startLine === line - 1);
  assert.deepEqual([...new Set(statements(scene).map(item => item.commandRaw))], ['changeBg', 'changeFigure', 'say', 'setAnimation', 'end']);
  const identity = inspectSceneIdentity(raw, scene.sentenceList);
  assert.equal(identity.diagnostics.filter(item => item.severity === 'error').length, 0);
  const node = line => identity.nodes.find(item => item.startLine === line - 1);
  assert.equal(identity.nodes.filter(item => item.nodeId).length, 7);
  for (const entry of ANIMATION_CASES) {
    const animation = at(entry.commandLine);
    assert.equal(animation.command, types.setAnimation);
    assert.equal(animation.content, entry.animation);
    assert.equal(arg(animation, 'target'), entry.target);
    assert.equal(arg(animation, 'next'), entry.next);
    assert.equal(arg(animation, 'continue'), undefined);
    assert.equal(arg(animation, 'duration'), undefined);
    assert.equal(at(entry.beforeLine).command, types.say);
    assert.equal(at(entry.targetLine).command, types.say);
    assert.ok(at(entry.targetLine).content.includes(entry.targetLabel));
    assert.equal(entry.targetLine, entry.commandLine + 1);
    assert.equal(arg(at(entry.targetLine), 'vocal'), undefined);
    assert.equal(node(entry.commandLine).nodeId, entry.nodeId);
    assert.equal(node(entry.targetLine).nodeId, entry.targetNodeId);
    assert.ok(animation.inlineComment.includes('R15 preserve:'));
    if (entry.markerKind) assert.equal(node(entry.commandLine).markerKind, entry.markerKind);
    if (entry.markerLine) {
      assert.equal(node(entry.commandLine).markerLine, entry.markerLine - 1);
      assert.equal(raw.slice(node(entry.commandLine).blockStart, node(entry.commandLine).start), `; @makenovel-node ${entry.nodeId}\r\n`);
    }
    if (entry.stableLine) assert.ok(at(entry.stableLine).content.includes(entry.stableLabel));
    if (entry.closeLine) {
      const close = at(entry.closeLine);
      assert.equal(close.command, types.changeFigure); assert.equal(close.content, '');
      assert.equal(arg(close, 'next'), true); assert.equal(arg(close, 'duration'), 0);
      assert.equal(arg(close, 'id') ?? `fig-${arg(close, 'left') ? 'left' : 'right'}`, entry.target);
    }
    if (entry.closedLine) assert.ok(at(entry.closedLine).content.includes(entry.closedLabel));
  }
  assert.equal(arg(at(3), 'id'), 'r15-hero'); assert.equal(arg(at(3), 'right'), true);
  assert.equal(arg(at(4), 'left'), true); assert.equal(arg(at(4), 'id'), undefined);
  for (const key of ['keep', 'parallel']) assert.equal(arg(at(6), key), false);
  assert.equal(arg(at(6), 'transformFrom'), 'current');
  assert.equal(physical[13], '; R15 preserve: standalone author note with opaque tokens alpha={a:b} -future=kept');
  assert.equal(at(23).command, types.end);
});

test('resource registry preserves nested/internal suffix names and separates unsupported or missing-target inspection', () => {
  const files = animationFiles('test-key');
  const start = parse(animationSceneSource(), 'start'), boundary = parse(boundarySceneSource(), 'readonly');
  for (const asset of start.assetsList) assert.ok(files.has(asset.url.replace(/^\.\//, '')), asset.url);
  for (const scene of [start, boundary]) {
    for (const statement of statements(scene)) assert.ok(Object.hasOwn(types, statement.commandRaw), statement.commandRaw);
    assert.equal(statements(scene).at(-1).command, types.end);
  }
  const at = line => boundary.sentenceList.find(item => item.startLine === line - 1);
  const byKind = kind => at(BOUNDARY_TARGETS.find(entry => entry.kind === kind).sourceLine);
  assert.equal(arg(byKind('keep'), 'keep'), true);
  assert.equal(arg(byKind('parallel'), 'parallel'), true);
  assert.equal(arg(byKind('continue'), 'continue'), true); assert.equal(arg(byKind('continue'), 'next'), undefined);
  assert.equal(arg(byKind('legacy-false'), 'writeDefault'), false); assert.equal(arg(byKind('legacy-false'), 'ignoreDefault'), false);
  assert.equal(byKind('dynamic').content, '{r15_animation}'); assert.equal(arg(byKind('dynamic'), 'target'), '{r15_target}');
  assert.equal(arg(byKind('reserved-stage'), 'target'), 'stage-main');
  assert.equal(arg(byKind('unknown-option'), 'r15Opaque'), 'kept');
  assert.equal(arg(byKind('default-transform'), 'transformFrom'), 'default');
  assert.equal(byKind('missing-resource').content, 'not-registered');
  assert.equal(arg(byKind('missing-target'), 'target'), 'not-on-stage');
  assert.equal(arg(byKind('no-next'), 'next'), undefined);
  for (const entry of BOUNDARY_TARGETS) {
    assert.equal(at(entry.sourceLine).command, types.setAnimation);
    assert.equal(at(entry.line).command, types.say); assert.ok(at(entry.line).content.includes(entry.label));
    assert.ok(at(entry.sourceLine).inlineComment.includes(`R15 preserve: ${entry.kind}`));
  }
  assert.equal(boundarySceneSource().charCodeAt(0), 59);
  assert.doesNotMatch(boundarySceneSource().replaceAll('\r\n', ''), /[\r\n]/);
  assert.match(files.get('game/background/stage.svg'), /ROUND 15 \/ NATIVE ANIMATION/);
  assert.match(files.get('game/figure/lin-neutral.svg'), /LIN \/ A/);
  assert.match(files.get('game/figure/yu-neutral.svg'), /YU \/ B/);
  assert.deepEqual(JSON.parse(files.get('game/animation/animationTable.json')), ANIMATION_RESOURCES.map(entry => entry.name));
  for (const entry of ANIMATION_RESOURCES) {
    assert.equal(entry.path.replace('game/animation/', '').replace(/\.json$/i, ''), entry.name);
    const frames = JSON.parse(files.get(entry.path));
    assert.deepEqual(frames.map(frame => frame.position.x), [0, entry.endX]);
    assert.equal(frames.reduce((sum, frame) => sum + frame.duration, 0), entry.duration);
    assert.ok(frames.every(frame => frame.ease === 'linear'));
    assert.equal(files.has(`game/animation/${entry.name}.json`), !entry.caseSensitiveRuntimePathMismatch);
  }
  assert.deepEqual([...files.keys()].filter(file => /\.(?:js|html)$/.test(file)), []);
  assert.doesNotMatch(animationSceneSource(), /(?:changeFigureDiff|setTempAnimation|setTransform|setVar|bgm|vocal|changeScene|callScene)/);
});

test('fresh generation seals assets and source, preserves existing outputs, and rejects modified bytes', async () => {
  const scratch = path.join(REPO, '.scratch'); await fs.mkdir(scratch, { recursive: true });
  const parent = await fs.mkdtemp(path.join(scratch, 'animation-demo-test-'));
  const target = path.join(parent, 'new-game');
  const result = await generateAnimationDemo(target), manifest = await verifyGame(target);
  assert.equal(result.upstreamCommit, UPSTREAM_COMMIT); assert.equal(result.files, 22);
  assert.match(result.gameKey, /^makenovel-round15-/);
  assert.equal(manifest.projectId, result.projectId); assert.equal(manifest.gameKey, result.gameKey); assert.equal(manifest.manifestHash, result.manifestHash);
  const receipt = JSON.parse(await fs.readFile(path.join(target, 'animation-demo-receipt.json'), 'utf8'));
  assert.equal(receipt.manifestHash, manifest.manifestHash); assert.deepEqual(receipt.animationCases, ANIMATION_CASES);
  for (const entry of [...receipt.sceneSources, receipt.configSource, ...receipt.templateFiles, ...receipt.animationResources]) {
    assert.equal(hash(await fs.readFile(path.join(target, entry.path))), entry.sha256, entry.path);
  }
  assert.deepEqual(receipt.boundaryTargets, BOUNDARY_TARGETS.map(entry => ({ path: 'game/scene/readonly.txt', ...entry })));
  assert.equal(await fs.readFile(path.join(target, 'game/scene/start.txt'), 'utf8'), animationSceneSource());
  assert.equal(await fs.readFile(path.join(target, 'game/scene/readonly.txt'), 'utf8'), boundarySceneSource());
  const before = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generateAnimationDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), before);
  const fileTarget = path.join(parent, 'keep.txt'); await fs.writeFile(fileTarget, 'keep exact\r\n', { flag: 'wx' });
  await assert.rejects(generateAnimationDemo(fileTarget), /OUTPUT_EXISTS/);
  assert.equal(await fs.readFile(fileTarget, 'utf8'), 'keep exact\r\n');
  const second = await generateAnimationDemo(path.join(parent, 'other-game'));
  assert.notEqual(second.projectId, result.projectId); assert.notEqual(second.gameKey, result.gameKey);
  const animationPath = path.join(target, 'game/animation/move-right.json');
  await fs.appendFile(animationPath, ' ');
  await assert.rejects(verifyGame(target), /CONTENT_CHANGED|content|changed/i);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), before);
  // Keep the intentionally modified scratch fixture; never remove a caller's output.
});
