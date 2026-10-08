import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { structureFiles, structureSceneSource, boundarySceneSource, generateStructureDemo, STRUCTURE_TARGET, STRUCTURE_CASES } from './generate.mjs';
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

test('native fixture has meaningful adjacent order, earlier fallbacks, mixed identities and intact author barriers', () => {
  const raw = structureSceneSource(), physical = raw.split('\r\n');
  assert.equal(raw.charCodeAt(0), 0xfeff);
  assert.doesNotMatch(raw.replaceAll('\r\n', ''), /[\r\n]/);
  assert.equal(physical.length - 1, 19);
  const scene = parse(raw, 'start'), parsed = statements(scene);
  const at = line => scene.sentenceList.find(item => item.startLine === line - 1);
  assert.deepEqual(parsed.slice(0, 6).map(item => item.commandRaw), ['changeBg', 'bgm', 'changeFigure', 'changeFigure', 'wait', 'say']);
  assert.equal(at(2).content, './game/background/day.svg'); assert.equal(at(9).content, './game/background/night.svg');
  assert.equal(arg(at(3), 'volume'), 28); assert.equal(arg(at(10), 'volume'), 41);
  assert.equal(at(11).command, types.wait); assert.equal(at(11).content, '500'); assert.equal(arg(at(11), 'nobreak'), true);
  for (const entry of STRUCTURE_CASES.figurePair) {
    const sentence = at(entry.line);
    assert.equal(sentence.command, types.changeFigure); assert.equal(sentence.content, `./game/figure/${entry.content}`);
    assert.equal(arg(sentence, 'left'), true); assert.equal(arg(sentence, 'next'), true);
  }
  assert.equal(STRUCTURE_CASES.figurePair[0].line + 1, STRUCTURE_CASES.figurePair[1].line);
  assert.notEqual(at(12).content, at(13).content);
  const identity = inspectSceneIdentity(raw, scene.sentenceList);
  assert.deepEqual(identity.diagnostics.map(({ code, severity, line }) => ({ code, severity, line })),
    [2, 3, 4, 5, 6, 9, 10, 11, 17, 18].map(line => ({ code: 'MISSING_ID', severity: 'warning', line })));
  const node = line => identity.nodes.find(item => item.startLine === line - 1);
  assert.equal(node(2).nodeId, 'r10-day'); assert.equal(node(9).nodeId, 'r10-night');
  assert.equal(node(3).nodeId, undefined); assert.equal(node(10).nodeId, undefined); assert.equal(node(12).nodeId, undefined);
  assert.equal(node(13).nodeId, 'r10-smile'); assert.equal(node(13).markerKind, 'inline');
  assert.equal(node(16).nodeId, 'r10-se'); assert.equal(node(16).markerKind, 'standalone'); assert.equal(node(16).markerLine, 14);
  assert.equal(raw.slice(node(16).blockStart, node(16).start), '; @makenovel-node r10-se\r\n');
  assert.equal(at(16).inlineComment, 'R10 preserve: one-shot author note');
  assert.equal(at(9).inlineComment, 'R10 preserve: local night author note @makenovel-node r10-night');
  assert.equal(physical[7], '; R10 preserve: standalone barrier before local commands {owner: author, move: never}.');
  assert.equal(physical[13], '; R10 preserve: standalone barrier before legacy effect {order: [neutral, smile]}.');
  for (const barrier of STRUCTURE_CASES.barriers) assert.equal(at(barrier.line).commandRaw, barrier.kind === 'comment' ? 'comment' : 'wait');
  assert.match(physical[STRUCTURE_TARGET.line - 1], /R10-TARGET.*@makenovel-node r10-target$/);
  assert.equal(node(STRUCTURE_TARGET.line).nodeId, STRUCTURE_TARGET.nodeId);
  assert.match(at(STRUCTURE_CASES.successor.line).content, /R10-AFTER/);
  assert.equal(arg(at(STRUCTURE_TARGET.line), 'vocal'), './game/vocal/voice-b.wav');
});

test('all native assets resolve and boundary scenes retain unsupported options and command facts', () => {
  const files = structureFiles('test-key');
  const start = parse(structureSceneSource(), 'start'), boundary = parse(boundarySceneSource(), 'readonly');
  for (const scene of [start, boundary]) {
    for (const asset of scene.assetsList) assert.ok(files.has(asset.url.replace(/^\.\//, '')), asset.url);
    for (const statement of statements(scene)) assert.ok(Object.hasOwn(types, statement.commandRaw), statement.commandRaw);
    assert.equal(statements(scene).at(-1).command, types.end);
  }
  const lines = statements(boundary);
  assert.equal(lines[0].command, types.changeBg); assert.equal(arg(lines[0], 'r10Opaque'), 'kept');
  assert.equal(lines[0].inlineComment, 'R10 preserve: unknown option alpha={a:b}');
  assert.equal(lines[1].command, types.wait); assert.match(lines[2].content, /R10-OPAQUE/);
  assert.equal(lines[3].command, types.setVar); assert.equal(lines[3].content, 'round10_boundary=1');
  assert.match(lines[4].content, /R10-COMMAND/);
  assert.equal(boundarySceneSource().charCodeAt(0), 59);
  assert.doesNotMatch(boundarySceneSource().replaceAll('\r\n', ''), /[\r\n]/);
  assert.match(files.get('game/background/day.svg'), /ROUND 10 \/ DAY/);
  assert.match(files.get('game/background/night.svg'), /ROUND 10 \/ NIGHT/);
  assert.ok(files.has('game/vocal/test-se.wav')); assert.ok(files.has('game/figure/lin-smile.svg'));
  assert.ok(!files.has('game/background/broken.svg'));
});

test('fresh generation binds round-10 identities and exact source bytes and refuses existing output', async () => {
  const scratch = path.join(REPO, '.scratch'); await fs.mkdir(scratch, { recursive: true });
  const parent = await fs.mkdtemp(path.join(scratch, 'director-structure-demo-test-'));
  const target = path.join(parent, 'new-game');
  const result = await generateStructureDemo(target), manifest = await verifyGame(target);
  assert.equal(result.upstreamCommit, UPSTREAM_COMMIT); assert.equal(result.files, 19);
  assert.match(result.gameKey, /^makenovel-round10-/);
  assert.equal(manifest.projectId, result.projectId); assert.equal(manifest.gameKey, result.gameKey); assert.equal(manifest.manifestHash, result.manifestHash);
  const receipt = JSON.parse(await fs.readFile(path.join(target, 'director-structure-demo-receipt.json'), 'utf8'));
  assert.equal(receipt.manifestHash, manifest.manifestHash); assert.deepEqual(receipt.structureTarget, STRUCTURE_TARGET);
  assert.deepEqual(receipt.structureCases, STRUCTURE_CASES);
  for (const entry of [...receipt.sceneSources, receipt.configSource, ...receipt.templateFiles]) {
    assert.equal(hash(await fs.readFile(path.join(target, entry.path))), entry.sha256, entry.path);
  }
  for (const entry of receipt.boundaryTargets) {
    const text = await fs.readFile(path.join(target, entry.path), 'utf8');
    assert.ok(text.split('\r\n')[entry.line - 1].includes(entry.label), entry.label);
  }
  assert.equal(await fs.readFile(path.join(target, 'game/scene/start.txt'), 'utf8'), structureSceneSource());
  assert.equal(await fs.readFile(path.join(target, 'game/scene/readonly.txt'), 'utf8'), boundarySceneSource());
  for (const oldReceipt of ['stage-demo-receipt.json', 'director-demo-receipt.json', 'director-insertion-demo-receipt.json', 'director-navigation-demo-receipt.json']) {
    await assert.rejects(fs.stat(path.join(target, oldReceipt)), { code: 'ENOENT' });
  }
  const before = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generateStructureDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), before);
  const fileTarget = path.join(parent, 'keep.txt'); await fs.writeFile(fileTarget, 'keep exact\r\n', { flag: 'wx' });
  await assert.rejects(generateStructureDemo(fileTarget), /OUTPUT_EXISTS/);
  assert.equal(await fs.readFile(fileTarget, 'utf8'), 'keep exact\r\n');
  const second = await generateStructureDemo(path.join(parent, 'other-game'));
  assert.notEqual(second.projectId, result.projectId); assert.notEqual(second.gameKey, result.gameKey);
  // Keep ignored test projects as evidence; never delete a caller's output.
});
