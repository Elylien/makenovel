import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { transitionFiles, transitionSceneSource, boundarySceneSource, generateFigureTransitionDemo, TRANSITION_CASES, BOUNDARY_TARGETS } from './generate.mjs';
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

test('native figure cases retain position and free-id targets, entry/exit settings, next modes and mixed identities', () => {
  const raw = transitionSceneSource(), physical = raw.split('\r\n');
  assert.equal(raw.charCodeAt(0), 0xfeff);
  assert.doesNotMatch(raw.replaceAll('\r\n', ''), /[\r\n]/);
  assert.equal(physical.length - 1, 18);
  const scene = parse(raw, 'start');
  const at = line => scene.sentenceList.find(item => item.startLine === line - 1);
  assert.deepEqual([...new Set(statements(scene).map(item => item.commandRaw))], ['changeBg', 'say', 'changeFigure', 'end']);
  const identity = inspectSceneIdentity(raw, scene.sentenceList);
  assert.equal(identity.diagnostics.filter(item => item.severity === 'error').length, 0);
  const node = line => identity.nodes.find(item => item.startLine === line - 1);
  assert.equal(identity.nodes.filter(item => item.nodeId).length, 6);
  for (const entry of TRANSITION_CASES) {
    const figure = at(entry.commandLine), close = at(entry.closeLine);
    assert.equal(figure.command, types.changeFigure);
    assert.equal(figure.content, `./game/figure/${entry.file}`);
    assert.equal(arg(figure, 'duration'), entry.duration);
    assert.equal(arg(figure, 'enterDuration'), entry.enterDuration);
    assert.equal(arg(figure, 'exitDuration'), entry.exitDuration);
    assert.equal(arg(figure, 'next'), entry.next);
    assert.equal(arg(figure, 'continue'), undefined);
    assert.equal(arg(figure, 'id'), entry.id);
    for (const position of ['left', 'center', 'right']) {
      const expected = entry.explicitPosition && position === entry.position ? true : undefined;
      assert.equal(arg(figure, position), expected, `display ${entry.key} ${position}`);
      assert.equal(arg(close, position), expected, `close ${entry.key} ${position}`);
    }
    assert.equal(entry.target, entry.id ?? `fig-${entry.position}`);
    assert.equal(at(entry.beforeLine).command, types.say);
    assert.equal(at(entry.targetLine).command, types.say);
    assert.ok(at(entry.targetLine).content.includes(entry.targetLabel));
    assert.equal(arg(at(entry.targetLine), 'vocal'), undefined);
    assert.equal(entry.targetLine, entry.commandLine + 1);
    assert.equal(close.command, types.changeFigure);
    assert.equal(close.content, '');
    assert.equal(arg(close, 'id'), entry.id);
    assert.equal(arg(close, 'duration'), 0);
    assert.equal(arg(close, 'exitDuration'), undefined);
    assert.equal(arg(close, 'next'), true);
    assert.equal(at(entry.closedLine).command, types.say);
    assert.ok(at(entry.closedLine).content.includes(entry.closedLabel));
    assert.equal(node(entry.commandLine).nodeId, entry.nodeId);
    assert.equal(node(entry.targetLine).nodeId, entry.targetNodeId);
    assert.ok(figure.inlineComment.includes('R13 preserve:'));
    if (entry.markerKind) assert.equal(node(entry.commandLine).markerKind, entry.markerKind);
    if (entry.markerLine) {
      assert.equal(node(entry.commandLine).markerLine, entry.markerLine - 1);
      assert.equal(raw.slice(node(entry.commandLine).blockStart, node(entry.commandLine).start), `; @makenovel-node ${entry.nodeId}\r\n`);
    }
  }
  assert.equal(physical[7], '; R13 preserve: standalone author note with opaque tokens alpha={a:b} -future=kept');
  assert.equal(at(18).command, types.end);
});

test('original figures and inspection boundaries resolve with native parser without an embedded player', () => {
  const files = transitionFiles('test-key');
  const start = parse(transitionSceneSource(), 'start'), boundary = parse(boundarySceneSource(), 'readonly');
  for (const scene of [start, boundary]) {
    for (const asset of scene.assetsList) assert.ok(files.has(asset.url.replace(/^\.\//, '')), asset.url);
    for (const statement of statements(scene)) assert.ok(Object.hasOwn(types, statement.commandRaw), statement.commandRaw);
    assert.equal(statements(scene).at(-1).command, types.end);
  }
  const at = line => boundary.sentenceList.find(item => item.startLine === line - 1);
  assert.equal(arg(at(2), 'enter'), 'r13-custom-fade');
  assert.equal(at(4).command, types.changeFigureDiff);
  assert.equal(at(4).content, './game/figure/lin-smile.svg');
  assert.equal(arg(at(6), 'id'), 'fig-left'); assert.equal(arg(at(6), 'left'), true);
  assert.equal(arg(at(8), 'left'), true); assert.equal(arg(at(8), 'right'), true);
  assert.equal(arg(at(10), 'motion'), 'idle'); assert.equal(arg(at(10), 'bounds'), '0,0,800,1400');
  assert.equal(arg(at(12), 'r13Opaque'), 'kept');
  assert.equal(at(12).inlineComment, 'R13 preserve: unknown option alpha={a:b}');
  assert.equal(arg(at(14), 'mouthOpen'), 'yu-smile.svg');
  assert.ok(files.has(`game/figure/${arg(at(14), 'mouthOpen')}`));
  for (const entry of BOUNDARY_TARGETS) {
    assert.equal(at(entry.sourceLine).command, entry.kind === 'figure-difference' ? types.changeFigureDiff : types.changeFigure);
    assert.equal(at(entry.line).command, types.say); assert.ok(at(entry.line).content.includes(entry.label));
  }
  assert.equal(boundarySceneSource().charCodeAt(0), 59);
  assert.doesNotMatch(boundarySceneSource().replaceAll('\r\n', ''), /[\r\n]/);
  assert.match(files.get('game/background/stage.svg'), /ROUND 13 \/ FIGURE TRANSITIONS/);
  assert.match(files.get('game/background/stage.svg'), /#eef0e5/);
  assert.match(files.get('game/figure/lin-neutral.svg'), /LIN \/ A/);
  assert.match(files.get('game/figure/yu-neutral.svg'), /YU \/ B/);
  assert.notEqual(files.get('game/figure/lin-neutral.svg'), files.get('game/figure/yu-neutral.svg'));
  assert.notEqual(files.get('game/figure/lin-neutral.svg'), files.get('game/figure/lin-smile.svg'));
  assert.deepEqual(JSON.parse(files.get('game/animation/animationTable.json')), ['r13-custom-fade']);
  assert.equal(JSON.parse(files.get('game/animation/r13-custom-fade.json')).reduce((sum, frame) => sum + frame.duration, 0), 1700);
  assert.deepEqual([...files.keys()].filter(file => /\.(?:js|html)$/.test(file)), []);
  assert.doesNotMatch(transitionSceneSource(), /(?:changeFigureDiff|setAnimation|setTempAnimation|setTransform|setVar|bgm|vocal)/);
});

test('fresh round-13 generation binds source, target metadata and unique identities while refusing existing output', async () => {
  const scratch = path.join(REPO, '.scratch'); await fs.mkdir(scratch, { recursive: true });
  const parent = await fs.mkdtemp(path.join(scratch, 'figure-transition-demo-test-'));
  const target = path.join(parent, 'new-game');
  const result = await generateFigureTransitionDemo(target), manifest = await verifyGame(target);
  assert.equal(result.upstreamCommit, UPSTREAM_COMMIT); assert.equal(result.files, 19);
  assert.match(result.gameKey, /^makenovel-round13-/);
  assert.equal(manifest.projectId, result.projectId); assert.equal(manifest.gameKey, result.gameKey); assert.equal(manifest.manifestHash, result.manifestHash);
  const receipt = JSON.parse(await fs.readFile(path.join(target, 'figure-transition-demo-receipt.json'), 'utf8'));
  assert.equal(receipt.manifestHash, manifest.manifestHash); assert.deepEqual(receipt.transitionCases, TRANSITION_CASES);
  for (const entry of [...receipt.sceneSources, receipt.configSource, ...receipt.templateFiles]) {
    assert.equal(hash(await fs.readFile(path.join(target, entry.path))), entry.sha256, entry.path);
  }
  assert.deepEqual(receipt.boundaryTargets, BOUNDARY_TARGETS.map(entry => ({ path: 'game/scene/readonly.txt', ...entry })));
  for (const entry of receipt.boundaryTargets) {
    const source = await fs.readFile(path.join(target, entry.path), 'utf8');
    assert.ok(source.split('\r\n')[entry.line - 1].includes(entry.label), entry.label);
  }
  assert.equal(await fs.readFile(path.join(target, 'game/scene/start.txt'), 'utf8'), transitionSceneSource());
  assert.equal(await fs.readFile(path.join(target, 'game/scene/readonly.txt'), 'utf8'), boundarySceneSource());
  await assert.rejects(fs.stat(path.join(target, 'background-transition-demo-receipt.json')), { code: 'ENOENT' });
  const before = await fs.readFile(path.join(target, 'game/makenovel-manifest.json'));
  await assert.rejects(generateFigureTransitionDemo(target), /OUTPUT_EXISTS/);
  assert.deepEqual(await fs.readFile(path.join(target, 'game/makenovel-manifest.json')), before);
  const fileTarget = path.join(parent, 'keep.txt'); await fs.writeFile(fileTarget, 'keep exact\r\n', { flag: 'wx' });
  await assert.rejects(generateFigureTransitionDemo(fileTarget), /OUTPUT_EXISTS/);
  assert.equal(await fs.readFile(fileTarget, 'utf8'), 'keep exact\r\n');
  const second = await generateFigureTransitionDemo(path.join(parent, 'other-game'));
  assert.notEqual(second.projectId, result.projectId); assert.notEqual(second.gameKey, result.gameKey);
  // Keep ignored scratch projects as evidence; never remove a caller's output.
});
