import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { transitionFiles, transitionSceneSource, boundarySceneSource, generateBackgroundTransitionDemo, TRANSITION_CASES, BOUNDARY_TARGETS } from './generate.mjs';
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

test('native backgrounds preserve next modes, duration precedence inputs, future exit settings and mixed identities', () => {
  const raw = transitionSceneSource(), physical = raw.split('\r\n');
  assert.equal(raw.charCodeAt(0), 0xfeff);
  assert.doesNotMatch(raw.replaceAll('\r\n', ''), /[\r\n]/);
  assert.equal(physical.length - 1, 18);
  const scene = parse(raw, 'start');
  const at = line => scene.sentenceList.find(item => item.startLine === line - 1);
  assert.deepEqual([...new Set(statements(scene).map(item => item.commandRaw))], ['changeBg', 'say', 'end']);
  const identity = inspectSceneIdentity(raw, scene.sentenceList);
  assert.equal(identity.diagnostics.filter(item => item.severity === 'error').length, 0);
  const node = line => identity.nodes.find(item => item.startLine === line - 1);
  assert.equal(identity.nodes.filter(item => item.nodeId).length, 6);
  for (const entry of TRANSITION_CASES) {
    const background = at(entry.commandLine);
    assert.equal(background.command, types.changeBg);
    assert.equal(background.content, `./game/background/${entry.file}`);
    assert.equal(arg(background, 'duration'), entry.duration);
    assert.equal(arg(background, 'enterDuration'), entry.enterDuration);
    assert.equal(arg(background, 'exitDuration'), entry.exitDuration);
    assert.equal(arg(background, 'next'), entry.next);
    assert.equal(arg(background, 'continue'), undefined);
    assert.equal(at(entry.beforeLine).command, types.say);
    assert.equal(at(entry.targetLine).command, types.say);
    assert.ok(at(entry.targetLine).content.includes(entry.targetLabel));
    assert.equal(arg(at(entry.targetLine), 'vocal'), undefined);
    assert.equal(entry.targetLine, entry.commandLine + 1);
    assert.equal(at(entry.closeLine).command, types.changeBg);
    assert.equal(at(entry.closeLine).content, '');
    assert.equal(arg(at(entry.closeLine), 'duration'), 0);
    assert.equal(arg(at(entry.closeLine), 'exitDuration'), undefined);
    assert.equal(arg(at(entry.closeLine), 'next'), true);
    assert.equal(at(entry.closedLine).command, types.say);
    assert.ok(at(entry.closedLine).content.includes(entry.closedLabel));
    assert.equal(node(entry.commandLine).nodeId, entry.nodeId);
    assert.equal(node(entry.targetLine).nodeId, entry.targetNodeId);
    assert.ok(background.inlineComment.includes('R12 preserve:'));
    if (entry.markerKind) assert.equal(node(entry.commandLine).markerKind, entry.markerKind);
    if (entry.markerLine) {
      assert.equal(node(entry.commandLine).markerLine, entry.markerLine - 1);
      assert.equal(raw.slice(node(entry.commandLine).blockStart, node(entry.commandLine).start), `; @makenovel-node ${entry.nodeId}\r\n`);
    }
  }
  assert.equal(physical[7], '; R12 preserve: standalone author note with opaque tokens alpha={a:b} -future=kept');
  assert.equal(at(18).command, types.end);
});

test('original visual contrasts and advanced boundaries resolve through the locked native asset parser', () => {
  const files = transitionFiles('test-key');
  const start = parse(transitionSceneSource(), 'start'), boundary = parse(boundarySceneSource(), 'readonly');
  for (const scene of [start, boundary]) {
    for (const asset of scene.assetsList) assert.ok(files.has(asset.url.replace(/^\.\//, '')), asset.url);
    for (const statement of statements(scene)) assert.ok(Object.hasOwn(types, statement.commandRaw), statement.commandRaw);
    assert.equal(statements(scene).at(-1).command, types.end);
  }
  const at = line => boundary.sentenceList.find(item => item.startLine === line - 1);
  assert.equal(arg(at(2), 'enter'), 'r12-custom-fade');
  assert.equal(arg(at(4), 'transform'), '{"alpha":0.7}');
  assert.equal(at(6).command, types.setVar); assert.equal(at(6).content, 'r12_duration=900');
  assert.equal(arg(at(7), 'duration'), '{r12_duration}');
  assert.equal(arg(at(9), 'r12Opaque'), 'kept'); assert.equal(at(9).inlineComment, 'R12 preserve: unknown option alpha={a:b}');
  assert.equal(arg(at(11), 'when'), 'r12_duration>0'); assert.equal(arg(at(13), 'continue'), true);
  for (const entry of BOUNDARY_TARGETS) {
    assert.equal(at(entry.sourceLine).command, types.changeBg);
    assert.equal(at(entry.line).command, types.say); assert.ok(at(entry.line).content.includes(entry.label));
  }
  assert.equal(boundarySceneSource().charCodeAt(0), 59);
  assert.doesNotMatch(boundarySceneSource().replaceAll('\r\n', ''), /[\r\n]/);
  assert.match(files.get('game/background/warm.svg'), /ROUND 12 \/ WARM CIRCLES/);
  assert.match(files.get('game/background/warm.svg'), /#cd693a/);
  assert.match(files.get('game/background/cool.svg'), /ROUND 12 \/ COOL TRIANGLES/);
  assert.match(files.get('game/background/cool.svg'), /#173e67/);
  const animationNames = JSON.parse(files.get('game/animation/animationTable.json'));
  assert.deepEqual(animationNames, ['r12-custom-fade']);
  assert.equal(JSON.parse(files.get('game/animation/r12-custom-fade.json')).reduce((sum, frame) => sum + frame.duration, 0), 1700);
  assert.deepEqual([...files.keys()].filter(file => /\.(?:js|html)$/.test(file)), []);
  assert.doesNotMatch(transitionSceneSource(), /(?:changeFigure|setAnimation|setTempAnimation|setTransform|setVar|bgm|vocal)/);
});

test('fresh generation binds round-12 source bytes and identity and refuses every existing output', async () => {
  const scratch = path.join(REPO, '.scratch'); await fs.mkdir(scratch, { recursive: true });
  const parent = await fs.mkdtemp(path.join(scratch, 'background-transition-demo-test-'));
  const target = path.join(parent, 'new-game');
  const result = await generateBackgroundTransitionDemo(target), manifest = await verifyGame(target);
  assert.equal(result.upstreamCommit, UPSTREAM_COMMIT); assert.equal(result.files, 20);
  assert.match(result.gameKey, /^makenovel-round12-/);
  assert.equal(manifest.projectId, result.projectId); assert.equal(manifest.gameKey, result.gameKey); assert.equal(manifest.manifestHash, result.manifestHash);
  const receipt = JSON.parse(await fs.readFile(path.join(target, 'background-transition-demo-receipt.json'), 'utf8'));
  assert.equal(receipt.manifestHash, manifest.manifestHash); assert.deepEqual(receipt.transitionCases, TRANSITION_CASES);
  for (const entry of [...receipt.sceneSources, receipt.configSource, ...receipt.templateFiles]) {
    assert.equal(hash(await fs.readFile(path.join(target, entry.path))), entry.sha256, entry.path);
  }
  assert.deepEqual(receipt.boundaryTargets, BOUNDARY_TARGETS.map(entry => ({ path: 'game/scene/readonly.txt', ...entry })));
  for (const entry of receipt.boundaryTargets) {
    const text = await fs.readFile(path.join(target, entry.path), 'utf8');
    assert.ok(text.split('\r\n')[entry.line - 1].includes(entry.label), entry.label);
  }
  assert.equal(await fs.readFile(path.join(target, 'game/scene/start.txt'), 'utf8'), transitionSceneSource());
  assert.equal(await fs.readFile(path.join(target, 'game/scene/readonly.txt'), 'utf8'), boundarySceneSource());
  await assert.rejects(fs.stat(path.join(target, 'director-timing-demo-receipt.json')), { code: 'ENOENT' });
  const before = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generateBackgroundTransitionDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), before);
  const fileTarget = path.join(parent, 'keep.txt'); await fs.writeFile(fileTarget, 'keep exact\r\n', { flag: 'wx' });
  await assert.rejects(generateBackgroundTransitionDemo(fileTarget), /OUTPUT_EXISTS/);
  assert.equal(await fs.readFile(fileTarget, 'utf8'), 'keep exact\r\n');
  const second = await generateBackgroundTransitionDemo(path.join(parent, 'other-game'));
  assert.notEqual(second.projectId, result.projectId); assert.notEqual(second.gameKey, result.gameKey);
  // Keep ignored scratch projects as evidence, without removing any caller output.
});
