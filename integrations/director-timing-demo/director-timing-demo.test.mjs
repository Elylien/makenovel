import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { timingFiles, timingSceneSource, boundarySceneSource, generateTimingDemo, TIMING_CASES, TIMING_SUCCESSOR, BOUNDARY_TARGETS } from './generate.mjs';
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

test('native timing intervals preserve exact milliseconds, visual edges, mixed identities, BOM and author notes', () => {
  const raw = timingSceneSource(), physical = raw.split('\r\n');
  assert.equal(raw.charCodeAt(0), 0xfeff);
  assert.doesNotMatch(raw.replaceAll('\r\n', ''), /[\r\n]/);
  assert.equal(physical.length - 1, 23);
  const scene = parse(raw, 'start');
  const at = line => scene.sentenceList.find(item => item.startLine === line - 1);
  assert.deepEqual(statements(scene).slice(0, 6).map(item => item.commandRaw), ['changeBg', 'bgm', 'changeFigure', 'changeFigure', 'wait', 'say']);
  const identity = inspectSceneIdentity(raw, scene.sentenceList);
  assert.equal(identity.diagnostics.filter(item => item.severity === 'error').length, 0);
  const node = line => identity.nodes.find(item => item.startLine === line - 1);
  assert.equal(identity.nodes.filter(item => item.nodeId).length, 6);
  for (const entry of TIMING_CASES) {
    const wait = at(entry.waitLine);
    assert.equal(wait.command, types.wait); assert.equal(wait.content, String(entry.duration));
    assert.equal(arg(wait, 'nobreak') ?? false, entry.nobreak); assert.equal(arg(wait, 'next'), undefined);
    assert.equal(wait.args.length, entry.nobreak ? 1 : 0);
    assert.equal(at(entry.beforeLine).command, types.say);
    assert.equal(at(entry.nightLine).command, types.changeBg); assert.equal(at(entry.nightLine).content, './game/background/night.svg');
    assert.equal(at(entry.dayLine).command, types.changeBg); assert.equal(at(entry.dayLine).content, './game/background/day.svg');
    assert.equal(arg(at(entry.nightLine), 'duration'), 0); assert.equal(arg(at(entry.dayLine), 'duration'), 0);
    assert.equal(arg(at(entry.nightLine), 'next'), true); assert.equal(arg(at(entry.dayLine), 'next'), true);
    assert.equal(entry.dayLine, entry.waitLine + 1); assert.equal(entry.targetLine, entry.dayLine + 1);
    assert.equal(at(entry.targetLine).command, types.say); assert.ok(at(entry.targetLine).content.includes(entry.targetLabel));
    assert.equal(arg(at(entry.targetLine), 'vocal'), undefined);
    assert.equal(node(entry.waitLine).nodeId, entry.nodeId);
    assert.equal(node(entry.targetLine).nodeId, entry.targetNodeId);
    assert.ok(wait.inlineComment.includes('R11 preserve:'));
    if (entry.markerKind) assert.equal(node(entry.waitLine).markerKind, entry.markerKind);
    if (entry.markerLine) {
      assert.equal(node(entry.waitLine).markerLine, entry.markerLine - 1);
      assert.equal(raw.slice(node(entry.waitLine).blockStart, node(entry.waitLine).start), `; @makenovel-node ${entry.nodeId}\r\n`);
    }
  }
  const overlap = TIMING_CASES[0];
  assert.equal(at(overlap.animationLine).command, types.changeFigure);
  assert.equal(arg(at(overlap.animationLine), 'duration'), overlap.animationDuration);
  assert.equal(arg(at(overlap.animationLine), 'next'), true);
  assert.equal(overlap.animationLine + 1, overlap.waitLine);
  assert.match(physical[overlap.animationLine - 1], /R11 preserve: transition overlaps following wait/);
  assert.ok(at(TIMING_SUCCESSOR.line).content.includes(TIMING_SUCCESSOR.label));
  assert.equal(at(23).command, types.end);
});

test('all native assets resolve and unsupported timing forms remain exact, separate authoring cases', () => {
  const files = timingFiles('test-key');
  const start = parse(timingSceneSource(), 'start'), boundary = parse(boundarySceneSource(), 'readonly');
  for (const scene of [start, boundary]) {
    for (const asset of scene.assetsList) assert.ok(files.has(asset.url.replace(/^\.\//, '')), asset.url);
    for (const statement of statements(scene)) assert.ok(Object.hasOwn(types, statement.commandRaw), statement.commandRaw);
    assert.equal(statements(scene).at(-1).command, types.end);
  }
  const at = line => boundary.sentenceList.find(item => item.startLine === line - 1);
  assert.equal(arg(at(2), 'next'), true); assert.equal(arg(at(4), 'next'), false);
  assert.equal(at(6).command, types.setVar); assert.equal(at(6).content, 'round11_delay=700');
  assert.equal(at(7).content, '{round11_delay}'); assert.equal(arg(at(7), 'nobreak'), true);
  assert.equal(arg(at(9), 'r11Opaque'), 'kept'); assert.equal(at(9).inlineComment, 'R11 preserve: unknown option alpha={a:b}');
  assert.equal(arg(at(11), 'continue'), true); assert.equal(arg(at(13), 'when'), 'round11_delay>0');
  for (const entry of BOUNDARY_TARGETS) {
    assert.equal(at(entry.sourceLine).command, types.wait);
    assert.equal(at(entry.line).command, types.say); assert.ok(at(entry.line).content.includes(entry.label));
  }
  assert.equal(boundarySceneSource().charCodeAt(0), 59);
  assert.doesNotMatch(boundarySceneSource().replaceAll('\r\n', ''), /[\r\n]/);
  assert.match(files.get('game/background/day.svg'), /ROUND 11 \/ DAY/);
  assert.match(files.get('game/background/night.svg'), /ROUND 11 \/ NIGHT/);
  assert.ok(files.has('game/figure/lin-smile.svg')); assert.ok(!files.has('game/background/broken.svg'));
  // No runtime event instrumentation or alternate entry is injected by this generator.
  assert.deepEqual([...files.keys()].filter(file => /\.(?:js|html)$/.test(file)), []);
});

test('fresh generation binds round-11 identity and source bytes, and refuses any existing output', async () => {
  const scratch = path.join(REPO, '.scratch'); await fs.mkdir(scratch, { recursive: true });
  const parent = await fs.mkdtemp(path.join(scratch, 'director-timing-demo-test-'));
  const target = path.join(parent, 'new-game');
  const result = await generateTimingDemo(target), manifest = await verifyGame(target);
  assert.equal(result.upstreamCommit, UPSTREAM_COMMIT); assert.equal(result.files, 19);
  assert.match(result.gameKey, /^makenovel-round11-/);
  assert.equal(manifest.projectId, result.projectId); assert.equal(manifest.gameKey, result.gameKey); assert.equal(manifest.manifestHash, result.manifestHash);
  const receipt = JSON.parse(await fs.readFile(path.join(target, 'director-timing-demo-receipt.json'), 'utf8'));
  assert.equal(receipt.manifestHash, manifest.manifestHash); assert.deepEqual(receipt.timingCases, TIMING_CASES);
  assert.deepEqual(receipt.successor, TIMING_SUCCESSOR);
  for (const entry of [...receipt.sceneSources, receipt.configSource, ...receipt.templateFiles]) {
    assert.equal(hash(await fs.readFile(path.join(target, entry.path))), entry.sha256, entry.path);
  }
  assert.deepEqual(receipt.boundaryTargets, BOUNDARY_TARGETS.map(entry => ({ path: 'game/scene/readonly.txt', ...entry })));
  for (const entry of receipt.boundaryTargets) {
    const text = await fs.readFile(path.join(target, entry.path), 'utf8');
    assert.ok(text.split('\r\n')[entry.line - 1].includes(entry.label), entry.label);
  }
  assert.equal(await fs.readFile(path.join(target, 'game/scene/start.txt'), 'utf8'), timingSceneSource());
  assert.equal(await fs.readFile(path.join(target, 'game/scene/readonly.txt'), 'utf8'), boundarySceneSource());
  for (const oldReceipt of ['stage-demo-receipt.json', 'director-demo-receipt.json', 'director-insertion-demo-receipt.json', 'director-navigation-demo-receipt.json', 'director-structure-demo-receipt.json']) {
    await assert.rejects(fs.stat(path.join(target, oldReceipt)), { code: 'ENOENT' });
  }
  const before = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generateTimingDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), before);
  const fileTarget = path.join(parent, 'keep.txt'); await fs.writeFile(fileTarget, 'keep exact\r\n', { flag: 'wx' });
  await assert.rejects(generateTimingDemo(fileTarget), /OUTPUT_EXISTS/);
  assert.equal(await fs.readFile(fileTarget, 'utf8'), 'keep exact\r\n');
  const second = await generateTimingDemo(path.join(parent, 'other-game'));
  assert.notEqual(second.projectId, result.projectId); assert.notEqual(second.gameKey, result.gameKey);
  // Keep ignored scratch projects as evidence; never remove a caller's output.
});
