import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { navigationFiles, navigationSceneSource, boundarySceneSource, generateNavigationDemo, NAVIGATION_TARGET, SOURCE_TARGETS, BRIDGE_DIALOGUES } from './generate.mjs';
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

test('native fixture separates a registered target from mixed-identity sources by 80 simple dialogues', () => {
  const raw = navigationSceneSource(), physical = raw.split('\r\n');
  assert.equal(raw.charCodeAt(0), 0xfeff);
  assert.doesNotMatch(raw.replaceAll('\r\n', ''), /[\r\n]/);
  assert.equal(physical.length - 1, 95);
  assert.match(physical[NAVIGATION_TARGET.line - 1], /R9-TARGET.*@makenovel-node r9-target$/);
  assert.match(physical[NAVIGATION_TARGET.line - 2], /opaque author note.*\{navigation: \[source, draft, return\]\}/);
  for (const target of SOURCE_TARGETS) {
    const line = physical[target.line - 1];
    assert.ok(line.startsWith(target.command + ':'));
    if (target.registered) assert.ok(line.endsWith(`@makenovel-node ${target.nodeId}`));
    else assert.doesNotMatch(line, /@makenovel-node/);
    assert.ok(NAVIGATION_TARGET.line - target.line > 80);
  }
  const parsed = statements(parse(raw, 'start'));
  assert.deepEqual(parsed.slice(0, 5).map(item => item.commandRaw), ['changeBg', 'changeFigure', 'changeFigure', 'bgm', 'wait']);
  assert.equal(arg(parsed[1], 'left'), true); assert.equal(arg(parsed[2], 'right'), true);
  assert.equal(arg(parsed[3], 'volume'), 28); assert.equal(arg(parsed[3], 'enter'), 0);
  const bridges = parsed.filter(item => /R9-PASS-/.test(item.content));
  assert.equal(bridges.length, BRIDGE_DIALOGUES);
  assert.ok(bridges.every(item => item.command === types.say && arg(item, 'speaker') === '测试员'));
  const targetIndex = parsed.findIndex(item => /R9-TARGET/.test(item.content));
  assert.match(parsed[targetIndex - 1].content, /R9-PASS-80/);
  assert.match(parsed[targetIndex + 1].content, /R9-AFTER/);
  assert.equal(arg(parsed[targetIndex], 'vocal'), './game/vocal/voice-a.wav');
  assert.equal(parsed[targetIndex].inlineComment, 'R9 preserve: navigation target @makenovel-node r9-target');
});

test('boundary cases preserve concrete diff provenance and every native media and scene path resolves', () => {
  const files = navigationFiles('test-key');
  const start = parse(navigationSceneSource(), 'start'), boundary = parse(boundarySceneSource(), 'readonly');
  const choose = statements(start).find(item => item.command === types.choose);
  const labels = new Set(statements(start).filter(item => item.command === types.label).map(item => item.content));
  for (const option of choose.content.split('|')) assert.ok(labels.has(option.split(':')[1]));
  assert.ok(start.subSceneList.includes('./game/scene/readonly.txt'));
  for (const scene of [start, boundary]) {
    for (const asset of scene.assetsList) assert.ok(files.has(asset.url.replace(/^\.\//, '')), asset.url);
    for (const statement of statements(scene)) assert.ok(Object.hasOwn(types, statement.commandRaw), statement.commandRaw);
    assert.equal(statements(scene).at(-1).command, types.end);
  }
  const lines = statements(boundary);
  assert.equal(lines[0].command, types.setVar); assert.equal(lines[0].content, 'round9_boundary=1');
  assert.match(lines[1].content, /R9-UNKNOWN/);
  assert.equal(lines[2].command, types.changeFigureDiff); assert.equal(lines[2].content, './game/figure/lin-smile.svg');
  assert.equal(arg(lines[2], 'left'), true);
  assert.equal(lines[2].inlineComment, 'R9 preserve: concrete unknown result @makenovel-node r9-diff');
  assert.match(lines[4].content, /R9-DIFF/);
  assert.equal(boundarySceneSource().charCodeAt(0), 59);
  assert.doesNotMatch(boundarySceneSource().replaceAll('\r\n', ''), /[\r\n]/);
  assert.match(files.get('game/background/day.svg'), /ROUND 9 \/ DAY/);
  assert.match(files.get('game/background/night.svg'), /ROUND 9 \/ NIGHT/);
  assert.ok(files.has('game/vocal/test-se.wav')); assert.ok(files.has('game/figure/lin-smile.svg'));
  assert.ok(!files.has('game/background/broken.svg'));
});

test('fresh generation binds round-9 identity, source targets and bytes, and refuses any existing output', async () => {
  const scratch = path.join(REPO, '.scratch'); await fs.mkdir(scratch, { recursive: true });
  const parent = await fs.mkdtemp(path.join(scratch, 'director-navigation-demo-test-'));
  const target = path.join(parent, 'new-game');
  const result = await generateNavigationDemo(target), manifest = await verifyGame(target);
  assert.equal(result.upstreamCommit, UPSTREAM_COMMIT); assert.equal(result.files, 19);
  assert.match(result.gameKey, /^makenovel-round9-/);
  assert.equal(manifest.projectId, result.projectId); assert.equal(manifest.gameKey, result.gameKey); assert.equal(manifest.manifestHash, result.manifestHash);
  const receipt = JSON.parse(await fs.readFile(path.join(target, 'director-navigation-demo-receipt.json'), 'utf8'));
  assert.equal(receipt.manifestHash, manifest.manifestHash); assert.deepEqual(receipt.navigationTarget, NAVIGATION_TARGET);
  assert.deepEqual(receipt.sourceTargets, SOURCE_TARGETS); assert.equal(receipt.bridgeDialogues, BRIDGE_DIALOGUES);
  for (const entry of [...receipt.sceneSources, receipt.configSource, ...receipt.templateFiles]) {
    assert.equal(hash(await fs.readFile(path.join(target, entry.path))), entry.sha256, entry.path);
  }
  for (const entry of receipt.boundaryTargets) {
    const text = await fs.readFile(path.join(target, entry.path), 'utf8');
    assert.ok(text.split('\r\n')[entry.line - 1].includes(entry.label), entry.label);
    if (entry.sourceNodeId) assert.ok(text.split('\r\n')[entry.sourceLine - 1].endsWith(`@makenovel-node ${entry.sourceNodeId}`));
  }
  assert.equal(await fs.readFile(path.join(target, 'game/scene/start.txt'), 'utf8'), navigationSceneSource());
  assert.equal(await fs.readFile(path.join(target, 'game/scene/readonly.txt'), 'utf8'), boundarySceneSource());
  for (const oldReceipt of ['stage-demo-receipt.json', 'director-demo-receipt.json', 'director-insertion-demo-receipt.json']) {
    await assert.rejects(fs.stat(path.join(target, oldReceipt)), { code: 'ENOENT' });
  }
  const before = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generateNavigationDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), before);
  const fileTarget = path.join(parent, 'keep.txt'); await fs.writeFile(fileTarget, 'keep exact\r\n', { flag: 'wx' });
  await assert.rejects(generateNavigationDemo(fileTarget), /OUTPUT_EXISTS/);
  assert.equal(await fs.readFile(fileTarget, 'utf8'), 'keep exact\r\n');
  const second = await generateNavigationDemo(path.join(parent, 'other-game'));
  assert.notEqual(second.projectId, result.projectId); assert.notEqual(second.gameKey, result.gameKey);
  // Keep ignored test projects as evidence; never delete a caller's output.
});
