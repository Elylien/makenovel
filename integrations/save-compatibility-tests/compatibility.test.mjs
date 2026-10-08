import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { computeManifestHash, sealGame, REPO_ROOT, MANIFEST_PATH, RUNTIME_COMPATIBILITY_ID } from '../game-manifest/manifest.mjs';

const bundleRoot = process.env.SAVE_COMPATIBILITY_TEST_BUNDLE;
if (!bundleRoot) throw new Error('Use run-tests.mjs to bundle the production TypeScript first.');
const runtime = await import(pathToFileURL(path.join(bundleRoot, 'compatibility.mjs')));
const { initState } = await import(pathToFileURL(path.join(bundleRoot, 'nativeStage.mjs')));
const require = createRequire(import.meta.url);
const NativeParser = require(path.join(REPO_ROOT, 'vendor/WebGAL/packages/parser/build/cjs/index.cjs'));
const nativeParser = new NativeParser.default(() => {}, (name) => name, NativeParser.ADD_NEXT_ARG_LIST, NativeParser.SCRIPT_CONFIG);
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const scratch = path.join(REPO_ROOT, '.scratch/save-compatibility-tests');
await fs.mkdir(scratch, { recursive: true });
const runRoot = await fs.mkdtemp(path.join(scratch, 'run-'));
const baseURI = 'http://127.0.0.1:3000/works/demo/';

async function fixture() {
  const directory = await fs.mkdtemp(path.join(runRoot, 'game-'));
  await fs.mkdir(path.join(directory, 'game/scene'), { recursive: true });
  await fs.mkdir(path.join(directory, 'game/background'), { recursive: true });
  const sources = {
    'game/config.txt': 'Game_name:兼容校验;\r\nGame_key:compat-test;\r\n',
    'game/scene/start.txt': ';parent\r\ncallScene:child.txt;\r\nsay:返回主场景;\r\n',
    'game/scene/child.txt': '\uFEFF;child\r\nsay:子场景;\r\nend;\r\n',
    'game/scene/中文 #%.txt': ';named\r\nsay:路径字节;\r\n',
    'game/background/pixel #%.bin': Buffer.from([0, 255, 128, 7]),
  };
  for (const [name, value] of Object.entries(sources)) await fs.writeFile(path.join(directory, name), value);
  const backupRoot = path.join(runRoot, 'manifest-backups');
  const { manifest } = await sealGame(directory, { init: true, backupRoot });
  const calls = [];
  let hook;
  globalThis.document = { baseURI };
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.origin, new URL(baseURI).origin);
    assert.equal(options?.cache, 'no-store');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.equal(url.pathname.startsWith(new URL(baseURI).pathname), true);
    const relative = decodeURIComponent(url.pathname.slice(new URL(baseURI).pathname.length));
    calls.push({ url: url.href, relative });
    const intercepted = await hook?.(relative, calls);
    if (intercepted) return intercepted;
    try { return new Response(await fs.readFile(path.join(directory, relative)), { status: 200 }); }
    catch (cause) { if (cause.code === 'ENOENT') return new Response('missing', { status: 404 }); throw cause; }
  };
  return {
    directory, manifest, sources, calls, backupRoot,
    setHook(value) { hook = value; },
    async update() { return (await sealGame(directory, { update: true, backupRoot })).manifest; },
    async initialize(key = 'compat-test') { return runtime.initializeSaveCompatibility('./game/config.txt', key); },
    async ready() { const namespace = await this.initialize(); assert.equal(runtime.getSaveStatus().ready, true, runtime.getSaveStatus().error); runtime.setSaveStorageEnabled(true); return namespace; },
  };
}

function metadata(manifest) {
  const { schemaVersion, projectId, gameKey, runtimeCompatibilityId, manifestHash } = manifest;
  return { schemaVersion, projectId, gameKey, runtimeCompatibilityId, manifestHash };
}

function snapshot(manifest) {
  const scene = {
    sceneName: 'child.txt', sceneUrl: './game/scene/child.txt', currentSentenceId: 2,
    currentLocals: { branch: 'child', amount: 3, done: false, values: ['a', 2, true] },
    sceneStack: [{ sceneName: 'start.txt', sceneUrl: './game/scene/start.txt', continueLine: 1, locals: { caller: 1 }, writeReturnTo: 'result' }],
  };
  const stage = structuredClone(initState);
  stage.showText = '子场景';
  stage.GameVar = { points: 2, answered: true, heroine: '澪', route: ['a', 2] };
  return {
    makenovel: metadata(manifest), nowStageState: stage, index: 0, saveTime: 'fixture', previewImage: '',
    sceneData: scene,
    backlog: [{ makenovel: metadata(manifest), currentStageState: structuredClone(stage), saveScene: structuredClone(scene) }],
  };
}

function rehash(value) { value.manifestHash = computeManifestHash(value); return value; }

test('production runtime accepts author-tool canonical contract with WebCrypto', async () => {
  const f = await fixture();
  assert.equal(runtime.RUNTIME_COMPATIBILITY_ID, RUNTIME_COMPATIBILITY_ID);
  assert.deepEqual(await runtime.validateManifest(f.manifest), f.manifest);
  const reordered = Object.fromEntries(Object.entries(f.manifest).reverse());
  reordered.files = reordered.files.map((file) => Object.fromEntries(Object.entries(file).reverse()));
  assert.equal((await runtime.validateManifest(reordered)).manifestHash, f.manifest.manifestHash);
});

test('manifest validation rejects identity, schema, runtime, hash and unsafe file contracts', async () => {
  const f = await fixture();
  const variants = [
    { ...f.manifest, schemaVersion: 99 }, { ...f.manifest, projectId: 'not-a-uuid' },
    { ...f.manifest, projectId: f.manifest.projectId.toUpperCase() },
    { ...f.manifest, gameKey: ' trailing ' }, { ...f.manifest, gameKey: '' },
    { ...f.manifest, runtimeCompatibilityId: 'other' }, { ...f.manifest, manifestHash: '0'.repeat(64) },
    { ...f.manifest, future: true }, { ...f.manifest, files: [] },
  ];
  for (const value of variants) await assert.rejects(runtime.validateManifest(value));
  for (const unsafe of ['game/../secret', 'game/a\\b', 'game/COM1', 'game/a.', 'game/a:stream', 'game/makenovel-manifest.json', '/game/file']) {
    const value = structuredClone(f.manifest);
    value.files[0].path = unsafe;
    value.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    await assert.rejects(runtime.validateManifest(rehash(value)));
  }
  for (const mutate of [
    (value) => value.files.reverse(),
    (value) => { value.files.push({ ...value.files[0], path: value.files[0].path.toUpperCase() }); value.files.sort((a, b) => a.path < b.path ? -1 : 1); },
    (value) => { value.files.find((file) => file.path === 'game/config.txt').path = 'game/CONFIG.txt'; value.files.sort((a, b) => a.path < b.path ? -1 : 1); },
    (value) => { value.files[0].size = 0.5; },
  ]) {
    const value = structuredClone(f.manifest); mutate(value);
    await assert.rejects(runtime.validateManifest(rehash(value)));
  }
});

test('reserved MakeNovel Game_key prefixes are rejected by the runtime contract', async () => {
  const f = await fixture();
  for (const gameKey of ['makenovel-v1:reserved', 'makenovel-unverified-v1:reserved', 'makenovel-backup-v1:reserved']) {
    await assert.rejects(runtime.validateManifest(rehash({ ...f.manifest, gameKey })));
  }
});

test('same version validates native stage, call frames and backlog sources without mutating snapshot', async () => {
  const f = await fixture();
  const namespace = await f.ready();
  assert.equal(namespace, `makenovel-v1:${f.manifest.projectId}:${f.manifest.manifestHash}`);
  assert.deepEqual(await runtime.validateForSave(), metadata(f.manifest));
  assert.equal(typeof initState.GameVar, 'object');
  assert.equal(Object.hasOwn(initState, 'gameVar'), false);
  const save = snapshot(f.manifest);
  const original = JSON.stringify(save);
  const result = await runtime.assertCompatibleSnapshot(save);
  // UTF-8 decoding follows native axios text semantics; BOM is checked as raw
  // bytes by the manifest, then stripped by TextDecoder for parser text.
  assert.equal(result.rawScene, f.sources['game/scene/child.txt'].replace(/^\uFEFF/u, ''));
  assert.equal(result.sceneSources.get('./game/scene/start.txt'), f.sources['game/scene/start.txt']);
  assert.equal(result.sceneSources.size, 2);
  assert.equal(JSON.stringify(save), original);
});

test('URL encoding preserves spaces, percent, hash and Unicode file names', async () => {
  const f = await fixture(); await f.ready();
  const save = snapshot(f.manifest);
  save.sceneData.sceneUrl = './game/scene/' + encodeURIComponent('中文 #%.txt');
  save.sceneData.sceneName = '中文 #%.txt';
  const result = await runtime.assertCompatibleSnapshot(save);
  assert.equal(result.rawScene, f.sources['game/scene/中文 #%.txt']);
  assert.equal(f.calls.some((call) => call.url.includes('%23%25')), true);
});

for (const [label, filename] of [['parent', 'game/scene/start.txt'], ['child', 'game/scene/child.txt'], ['asset', 'game/background/pixel #%.bin'], ['config', 'game/config.txt']]) {
  test(`unsealed ${label} bytes block save and load, preserving original snapshot`, async () => {
    const f = await fixture(); await f.ready();
    const save = snapshot(f.manifest); const original = JSON.stringify(save);
    await fs.appendFile(path.join(f.directory, filename), '\n;changed');
    await assert.rejects(runtime.validateForSave(), /作品内容已变化/u);
    await assert.rejects(runtime.assertCompatibleSnapshot(save), /作品内容已变化/u);
    assert.equal(JSON.stringify(save), original);
  });
}

test('author reseal creates a new namespace and rejects prior-version snapshots', async () => {
  const f = await fixture(); const oldNamespace = await f.ready();
  const oldSave = snapshot(f.manifest);
  await fs.appendFile(path.join(f.directory, 'game/scene/start.txt'), '\n;reviewed');
  const next = await f.update();
  await assert.rejects(runtime.validateForSave(), /作品版本已更换/u);
  const nextNamespace = await f.ready();
  assert.notEqual(nextNamespace, oldNamespace);
  assert.equal(next.projectId, f.manifest.projectId);
  await assert.rejects(runtime.assertCompatibleSnapshot(oldSave), /旧版本|未知来源/u);
  assert.equal((await runtime.assertCompatibleSnapshot(snapshot(next))).sceneSources.size, 2);
});

test('a reseal during restore preflight is rejected by the final manifest read', async () => {
  const f = await fixture(); await f.ready();
  const replacement = structuredClone(f.manifest);
  replacement.gameKey = 'same-files-different-binding'; rehash(replacement);
  let manifestReads = 0;
  f.setHook(async (name) => {
    if (name === MANIFEST_PATH && ++manifestReads === 2) return new Response(JSON.stringify(replacement), { status: 200 });
  });
  await assert.rejects(runtime.assertCompatibleSnapshot(snapshot(f.manifest)), /校验期间作品版本改变/u);
});

test('a reseal during initialization cannot publish a verified old namespace', async () => {
  const f = await fixture();
  const replacement = structuredClone(f.manifest);
  replacement.gameKey = 'changed-during-startup'; rehash(replacement);
  let manifestReads = 0;
  f.setHook((name) => {
    if (name === MANIFEST_PATH && ++manifestReads >= 2) return new Response(JSON.stringify(replacement), { status: 200 });
  });
  const namespace = await f.initialize();
  assert.equal(runtime.getSaveStatus().ready, false);
  assert.match(namespace, /^makenovel-unverified-v1:/u);
  runtime.setSaveStorageEnabled(true);
  assert.equal(runtime.captureSaveCompatibility(), undefined);
});

test('file mutation before its verification read is refused even with unchanged manifest', async () => {
  const f = await fixture(); await f.ready();
  let changed = false;
  f.setHook(async (name) => {
    if (!changed && name === 'game/scene/start.txt') {
      changed = true;
      await fs.appendFile(path.join(f.directory, name), '\n;changed-during-verification');
    }
  });
  await assert.rejects(runtime.assertCompatibleSnapshot(snapshot(f.manifest)), /作品内容已变化/u);
});

test('unknown slots, mismatched metadata, unverified backlog and corrupt stages are rejected', async () => {
  const f = await fixture(); await f.ready();
  for (const mutate of [
    (save) => { delete save.makenovel; },
    (save) => { save.makenovel.projectId = '22222222-2222-4222-8222-222222222222'; },
    (save) => { save.makenovel.future = true; },
    (save) => { delete save.backlog[0].makenovel; },
    (save) => { save.backlog[0].makenovel.manifestHash = '0'.repeat(64); },
    (save) => { save.nowStageState.gameVar = {}; delete save.nowStageState.GameVar; },
    (save) => { save.nowStageState.PerformList = [{ script: { command: 'say', content: 'x', args: [] } }]; },
    (save) => { save.sceneData.currentSentenceId = -1; },
    (save) => { save.sceneData.sceneStack[0].continueLine = 1.2; },
    (save) => { save.sceneData.currentLocals = []; },
  ]) {
    const save = snapshot(f.manifest); mutate(save);
    const original = JSON.stringify(save);
    await assert.rejects(runtime.assertCompatibleSnapshot(save));
    assert.equal(JSON.stringify(save), original);
  }
});

test('outside-project URLs, absent listed scenes, query and hash references are rejected', async () => {
  const f = await fixture(); await f.ready();
  for (const url of ['https://external.invalid/scene.txt', '../outside.txt', '/works/other/game/scene/start.txt', './game/scene/start.txt?rev=1', './game/scene/start.txt#x', './game/scene/missing.txt', './game/scene/%2e%2e/config.txt', './game/scene/%ZZ']) {
    const save = snapshot(f.manifest); save.sceneData.sceneUrl = url;
    await assert.rejects(runtime.assertCompatibleSnapshot(save));
  }
  const frame = snapshot(f.manifest); frame.sceneData.sceneStack[0].sceneUrl = 'https://external.invalid/parent.txt';
  await assert.rejects(runtime.assertCompatibleSnapshot(frame));
  const backlog = snapshot(f.manifest); backlog.backlog[0].saveScene.sceneUrl = './game/scene/absent.txt';
  await assert.rejects(runtime.assertCompatibleSnapshot(backlog));
});

test('disabled storage refuses snapshot capture, saving and loading after valid initialization', async () => {
  const f = await fixture(); await f.ready();
  runtime.setSaveStorageEnabled(false);
  assert.equal(runtime.captureSaveCompatibility(), undefined);
  assert.equal(runtime.isSaveStorageEnabled(), false);
  await assert.rejects(runtime.validateForSave());
  await assert.rejects(runtime.assertCompatibleSnapshot(snapshot(f.manifest)));
});

test('missing manifest uses isolated unverified scope and never captures metadata', async () => {
  const f = await fixture();
  await fs.unlink(path.join(f.directory, MANIFEST_PATH));
  const namespace = await f.initialize();
  assert.match(namespace, /^makenovel-unverified-v1:[a-f0-9]{64}$/u);
  assert.equal(runtime.getSaveStatus().ready, false);
  assert.deepEqual(runtime.getSaveStatus().scope, { legacyGameKey: 'compat-test' });
  runtime.setSaveStorageEnabled(true);
  assert.equal(runtime.captureSaveCompatibility(), undefined);
});

test('wrong native Game_key and startup missing files fail closed with backup scope preserved', async () => {
  const f = await fixture();
  const wrong = await f.initialize('another-key');
  assert.match(wrong, /^makenovel-unverified-v1:/u);
  assert.equal(runtime.getSaveStatus().ready, false);
  assert.deepEqual(runtime.getSaveStatus().scope, { legacyGameKey: 'another-key' });
  await fs.unlink(path.join(f.directory, 'game/scene/child.txt'));
  await f.initialize();
  assert.equal(runtime.getSaveStatus().ready, false);
  assert.deepEqual(runtime.getSaveStatus().scope, { legacyGameKey: 'compat-test', projectId: f.manifest.projectId });
  assert.match(runtime.getSaveStatus().error, /无法读取作品文件/u);
});

test('404 during restore leaves caller snapshot and native initializer unchanged', async () => {
  const f = await fixture(); await f.ready();
  const save = snapshot(f.manifest); const before = JSON.stringify(save); const nativeBefore = JSON.stringify(initState);
  f.setHook((name) => name === 'game/scene/child.txt' ? new Response('missing', { status: 404 }) : undefined);
  await assert.rejects(runtime.assertCompatibleSnapshot(save), /无法读取作品文件/u);
  assert.equal(JSON.stringify(save), before);
  assert.equal(JSON.stringify(initState), nativeBefore);
});

test('status listeners receive failures and can unsubscribe without retaining observers', async () => {
  const f = await fixture(); await f.ready();
  let count = 0;
  const unsubscribe = runtime.subscribeSaveStatus(() => { count++; });
  runtime.reportSaveError(new Error('fixture failure'));
  assert.equal(runtime.getSaveStatus().error, 'fixture failure');
  runtime.clearSaveError();
  assert.equal(runtime.getSaveStatus().error, '');
  assert.equal(count, 2);
  unsubscribe(); runtime.reportSaveError(new Error('after unsubscribe'));
  assert.equal(count, 2);
});

test('native scalar arrays and optional locals survive, with null-prototype maps accepted', async () => {
  const f = await fixture(); await f.ready();
  const save = snapshot(f.manifest);
  const variables = Object.assign(Object.create(null), { 中文变量: '文字', number: -1.25, yes: true, no: false, empty: [], mixed: ['', 0, false] });
  save.nowStageState.GameVar = variables;
  save.sceneData.currentLocals = variables;
  save.sceneData.sceneStack[0].locals = variables;
  save.sceneData.sceneStack[0].writeReturnTo = '';
  await runtime.assertCompatibleSnapshot(save);
  delete save.sceneData.currentLocals;
  delete save.sceneData.sceneStack[0].locals;
  delete save.sceneData.sceneStack[0].writeReturnTo;
  delete save.nowStageState.currentDialogSegments;
  delete save.nowStageState.isDialogNotend;
  await runtime.assertCompatibleSnapshot(save);
});

test('GameVar, currentLocals and frame locals reject invalid values before any fetch', async () => {
  const f = await fixture(); await f.ready();
  for (const place of ['GameVar', 'currentLocals', 'frameLocals']) {
    for (const value of [null, undefined, NaN, Infinity, -Infinity, {}, [['nested']], [undefined], [NaN], new Array(2), 2n, new Date()]) {
      const save = snapshot(f.manifest);
      const table = { unsafeValue: value };
      if (place === 'GameVar') save.nowStageState.GameVar = table;
      if (place === 'currentLocals') save.sceneData.currentLocals = table;
      if (place === 'frameLocals') save.sceneData.sceneStack[0].locals = table;
      const callsBefore = f.calls.length;
      await assert.rejects(runtime.assertCompatibleSnapshot(save));
      assert.equal(f.calls.length, callsBefore);
    }
  }
});

test('prototype keys, accessors, class instances, cycles and invalid return targets are refused', async () => {
  const f = await fixture(); await f.ready();
  for (const key of ['__proto__', 'prototype', 'constructor']) {
    const save = snapshot(f.manifest);
    save.nowStageState.GameVar = JSON.parse(`{"${key}":"value"}`);
    await assert.rejects(runtime.assertCompatibleSnapshot(save), /不安全/u);
  }
  for (const target of [4, {}, ['name'], null, '__proto__', 'constructor', ' prototype ']) {
    const save = snapshot(f.manifest); save.sceneData.sceneStack[0].writeReturnTo = target;
    await assert.rejects(runtime.assertCompatibleSnapshot(save));
  }
  const accessor = snapshot(f.manifest);
  let accessed = 0;
  Object.defineProperty(accessor.nowStageState, 'bgName', { enumerable: true, get() { accessed++; return ''; } });
  await assert.rejects(runtime.assertCompatibleSnapshot(accessor), /访问器/u);
  assert.equal(accessed, 0);
  const cycle = snapshot(f.manifest); cycle.nowStageState.extension = cycle;
  await assert.rejects(runtime.assertCompatibleSnapshot(cycle), /循环/u);
  const inherited = snapshot(f.manifest); Object.setPrototypeOf(inherited.nowStageState.GameVar, { inherited: true });
  await assert.rejects(runtime.assertCompatibleSnapshot(inherited), /数据类型/u);
  const symbol = snapshot(f.manifest); symbol.nowStageState[Symbol('hidden')] = 1;
  await assert.rejects(runtime.assertCompatibleSnapshot(symbol), /不安全/u);
});

test('required native stage fields cannot be omitted, optional legacy fields may be absent', async () => {
  const f = await fixture(); await f.ready();
  for (const key of Object.keys(initState).filter((name) => !['currentDialogSegments', 'isDialogNotend'].includes(name))) {
    const save = snapshot(f.manifest); delete save.nowStageState[key];
    await assert.rejects(runtime.assertCompatibleSnapshot(save), undefined, `missing native field ${key}`);
  }
  for (const mutate of [
    (stage) => { stage.isRead = 1; },
    (stage) => { stage.isDisableTextbox = 'false'; },
    (stage) => { stage.bgm = []; },
    (stage) => { stage.bgm.volume = Infinity; },
    (stage) => { stage.effects[0].transform.scale = 4; },
    (stage) => { stage.effects[0].transform.alpha = 'opaque'; },
    (stage) => { stage.currentDialogSegments = [3]; },
    (stage) => { stage.isDialogNotend = 1; },
    (stage) => { stage.replacedUIlable = { title: false }; },
    (stage) => { stage.figureMetaData = { heroine: { zIndex: 'front' } }; },
  ]) {
    const save = snapshot(f.manifest); mutate(save.nowStageState);
    await assert.rejects(runtime.assertCompatibleSnapshot(save));
  }
});

function populatedStage() {
  const stage = structuredClone(initState);
  stage.freeFigure = [{ basePosition: 'left13', name: 'figure.webp', key: 'heroine' }];
  stage.figureAssociatedAnimation = [{ targetId: 'heroine', animationFlag: 'talk', mouthAnimation: { open: 'open.webp', close: 'close.webp', halfOpen: 'half.webp' }, blinkAnimation: { open: 'open.webp', close: 'closed.webp' } }];
  stage.choose = [{ key: '选项一', targetScene: 'child.txt', isSubScene: true }];
  stage.animationSettings = [{ target: 'heroine', enterAnimationName: 'fade', enterDuration: 250, enterAnimationIgnoreDefault: false }];
  stage.live2dMotion = [{ target: 'heroine', motion: 'wave', skin: undefined, overrideBounds: [0, 0, 100, 200] }];
  stage.live2dExpression = [{ target: 'heroine', expression: 'smile' }];
  stage.live2dBlink = [{ target: 'heroine', blink: { blinkInterval: 4000, blinkIntervalRandom: 500, closingDuration: 100, closedDuration: 50, openingDuration: 150 } }];
  stage.live2dFocus = [{ target: 'heroine', focus: { x: 0, y: 0.2, instant: true } }];
  const sentences = nativeParser.parse('say:正在说话 -speaker=澪;\nchangeBg:room.webp;\ncallScene:child.txt;', 'start.txt', './game/scene/start.txt').sentenceList;
  stage.PerformList = sentences.map((script, index) => ({ id: `native-${index}`, isHoldOn: index !== 0, script }));
  stage.figureMetaData = { heroine: { zIndex: 1, blendMode: 'normal' } };
  // Preserve legal shared references; data validation must distinguish them from cycles.
  stage.effects.push({ target: 'heroine', transform: stage.effects[0].transform });
  return stage;
}

test('populated native stage and real parser performs pass with optional fields absent', async () => {
  const f = await fixture(); await f.ready();
  const save = snapshot(f.manifest);
  save.nowStageState = populatedStage();
  save.backlog[0].currentStageState = populatedStage();
  const original = structuredClone(save);
  await runtime.assertCompatibleSnapshot(save);
  assert.deepEqual(save, original);
});

test('malformed stage entries and real-parser perform mutations fail before network', async () => {
  const f = await fixture(); await f.ready();
  const mutations = [
    (stage) => { stage.freeFigure[0].basePosition = null; },
    (stage) => { stage.figureAssociatedAnimation[0].mouthAnimation = {}; },
    (stage) => { stage.choose[0].isSubScene = 'yes'; },
    (stage) => { stage.effects.push({ transform: {} }); },
    (stage) => { stage.animationSettings[0].enterDuration = 'fast'; },
    (stage) => { stage.live2dMotion[0].overrideBounds = [0, 1]; },
    (stage) => { stage.live2dExpression[0].expression = {}; },
    (stage) => { stage.live2dBlink[0].blink.blinkInterval = NaN; },
    (stage) => { stage.live2dFocus[0].focus.instant = 1; },
    (stage) => { stage.PerformList[0].isHoldOn = 'yes'; },
    (stage) => { stage.PerformList[0].script.args[0].value = NaN; },
    (stage) => { stage.PerformList[0].script.args.push({ key: 'bad', value: {} }); },
    (stage) => { stage.PerformList[0].script.subScene = [3]; },
    (stage) => { stage.PerformList[0].script.sentenceAssets = [null]; },
    (stage) => { delete stage.PerformList[0].script.commandRaw; },
  ];
  for (const mutate of mutations) {
    const save = snapshot(f.manifest); save.nowStageState = populatedStage(); mutate(save.nowStageState);
    const callsBefore = f.calls.length;
    await assert.rejects(runtime.assertCompatibleSnapshot(save));
    assert.equal(f.calls.length, callsBefore);
  }
  const oldBacklog = snapshot(f.manifest); oldBacklog.backlog[0].currentStageState.GameVar.bad = NaN;
  await assert.rejects(runtime.assertCompatibleSnapshot(oldBacklog));
  const stack = snapshot(f.manifest); stack.sceneData.sceneStack = Array.from({ length: 65 }, () => structuredClone(stack.sceneData.sceneStack[0]));
  await assert.rejects(runtime.assertCompatibleSnapshot(stack));
});

test('verified config getter follows sealed bytes instead of a stale earlier response with the same key', async () => {
  const f = await fixture();
  const staleResponse = f.sources['game/config.txt'];
  const newConfig = 'Game_name:新版本标题;\r\nGame_key:compat-test;\r\nTextbox_theme:imss;\r\n';
  await fs.writeFile(path.join(f.directory, 'game/config.txt'), newConfig);
  const manifest = await f.update();
  await f.ready();
  assert.notEqual(runtime.getVerifiedConfigText(), staleResponse);
  assert.equal(runtime.getVerifiedConfigText(), newConfig);
  assert.equal(runtime.captureSaveCompatibility().manifestHash, manifest.manifestHash);
  const parsed = nativeParser.parseConfig(runtime.getVerifiedConfigText());
  assert.equal(parsed.find((item) => item.command === 'Game_name').args[0], '新版本标题');
});

test('verified config is cleared at initialization start and stays absent after a failed check', async () => {
  const f = await fixture(); await f.ready();
  assert.equal(runtime.getVerifiedConfigText(), f.sources['game/config.txt']);
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let requested;
  const waiting = new Promise((resolve) => { requested = resolve; });
  f.setHook(async (name) => {
    if (name === MANIFEST_PATH) { requested(); await blocked; return new Response('missing', { status: 404 }); }
  });
  const initializing = f.initialize();
  assert.equal(runtime.getVerifiedConfigText(), undefined);
  await waiting;
  assert.equal(runtime.getVerifiedConfigText(), undefined);
  release(); await initializing;
  assert.equal(runtime.getVerifiedConfigText(), undefined);
});

const freshRuntime = (name) => import(pathToFileURL(path.join(bundleRoot, 'compatibility.mjs')).href + `?case=${name}`);

test('author preview latches all storage gates off even after enabling or reinitializing', async () => {
  const f = await fixture();
  const preview = await freshRuntime('preview-after-ready');
  await preview.initializeSaveCompatibility('./game/config.txt', 'compat-test');
  preview.setSaveStorageEnabled(true);
  assert.equal(preview.isSaveStorageEnabled(), true);
  assert.ok(preview.captureSaveCompatibility());
  const epoch = preview.getSaveStorageEpoch();
  preview.markPreviewSession();
  assert.equal(preview.getSaveStorageEpoch(), epoch + 1);
  assert.equal(preview.getSaveStatus().ready, false);
  assert.match(preview.getSaveStatus().message, /作者预览/u);
  assert.equal(preview.getVerifiedConfigText(), undefined);
  for (const enable of [false, true, true]) {
    preview.setSaveStorageEnabled(enable);
    assert.equal(preview.isSaveStorageEnabled(), false);
    assert.equal(preview.captureSaveCompatibility(), undefined);
    await assert.rejects(preview.validateForSave());
    await assert.rejects(preview.assertCompatibleSnapshot(snapshot(f.manifest)));
  }
  // Reinitialization may verify config for playback, but cannot turn this page
  // back into a player-storage session once it accepted author preview input.
  await preview.initializeSaveCompatibility('./game/config.txt', 'compat-test');
  preview.setSaveStorageEnabled(true);
  assert.equal(preview.getVerifiedConfigText(), f.sources['game/config.txt']);
  assert.equal(preview.getSaveStatus().ready, false);
  assert.match(preview.getSaveStatus().message, /作者预览/u);
  assert.equal(preview.isSaveStorageEnabled(), false);
  assert.equal(preview.captureSaveCompatibility(), undefined);
});

test('author preview before or during initialization cannot be overwritten by late verification', async () => {
  for (const timing of ['before', 'during']) {
    const f = await fixture();
    const preview = await freshRuntime(`preview-${timing}`);
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    let requested;
    const waiting = new Promise((resolve) => { requested = resolve; });
    let held = false;
    f.setHook(async (name) => {
      if (!held && name === MANIFEST_PATH) { held = true; requested(); await blocked; }
    });
    if (timing === 'before') preview.markPreviewSession();
    const initializing = preview.initializeSaveCompatibility('./game/config.txt', 'compat-test');
    await waiting;
    if (timing === 'during') preview.markPreviewSession();
    release(); await initializing;
    preview.setSaveStorageEnabled(true);
    assert.equal(preview.getSaveStatus().ready, false);
    assert.match(preview.getSaveStatus().message, /作者预览/u);
    assert.equal(preview.getVerifiedConfigText(), f.sources['game/config.txt']);
    assert.equal(preview.isSaveStorageEnabled(), false);
    assert.equal(preview.captureSaveCompatibility(), undefined);
  }
});

test('author preview invalidates a save validation already waiting for file verification', async () => {
  const f = await fixture();
  const preview = await freshRuntime('preview-during-save');
  await preview.initializeSaveCompatibility('./game/config.txt', 'compat-test'); preview.setSaveStorageEnabled(true);
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  let requested;
  const waiting = new Promise((resolve) => { requested = resolve; });
  let held = false;
  f.setHook(async (name) => {
    if (!held && name === MANIFEST_PATH) { held = true; requested(); await blocked; }
  });
  const pending = preview.validateForSave();
  const rejected = assert.rejects(pending, /存档会话已改变/u);
  await waiting; preview.markPreviewSession(); release();
  await rejected;
  assert.equal(preview.isSaveStorageEnabled(), false);
});

test('runtime-ready barrier is explicit, shared and idempotent, even for an unsealed playable game', async () => {
  const f = await fixture();
  const bootstrap = await freshRuntime('bootstrap-barrier');
  const first = bootstrap.waitForRuntimeReady();
  assert.equal(first, bootstrap.waitForRuntimeReady());
  let released = false;
  first.then(() => { released = true; });
  await Promise.resolve();
  assert.equal(released, false);
  await fs.unlink(path.join(f.directory, MANIFEST_PATH));
  await bootstrap.initializeSaveCompatibility('./game/config.txt', 'compat-test');
  assert.equal(bootstrap.getSaveStatus().ready, false);
  assert.equal(released, false);
  bootstrap.finishRuntimeInitialization(); bootstrap.finishRuntimeInitialization();
  await first;
  assert.equal(released, true);
  assert.equal(bootstrap.getSaveStatus().ready, false);
});

test('bootstrap text getter binds verified animation/template bytes without caching other resources or later save checks', async () => {
  const f = await fixture();
  const texts = {
    'game/animation/wave.json': '\uFEFF{"name":"挥手","frames":[]}\r\n',
    'game/template/ui.json': '{"label":"按钮"}\r\n',
    'game/template/nested/theme.scss': '.title { color: #abc; }\r\n',
  };
  for (const [name, value] of Object.entries(texts)) {
    await fs.mkdir(path.dirname(path.join(f.directory, name)), { recursive: true });
    await fs.writeFile(path.join(f.directory, name), value);
  }
  await fs.writeFile(path.join(f.directory, 'game/template/picture.bin'), Buffer.from([255, 0, 128]));
  await fs.writeFile(path.join(f.directory, 'game/animation/not-json.txt'), 'not retained');
  await f.update(); await f.ready();
  for (const [name, value] of Object.entries(texts)) {
    assert.equal(runtime.getVerifiedBootstrapText(name), value.replace(/^\uFEFF/u, ''));
  }
  for (const name of ['game/template/picture.bin', 'game/animation/not-json.txt', 'game/scene/start.txt', 'game/config.txt', './game/template/ui.json', 'game/template/missing.json']) {
    assert.equal(runtime.getVerifiedBootstrapText(name), undefined);
  }
  const before = runtime.getVerifiedBootstrapText('game/animation/wave.json');
  await fs.writeFile(path.join(f.directory, 'game/animation/wave.json'), '{"name":"changed"}');
  assert.equal(runtime.getVerifiedBootstrapText('game/animation/wave.json'), before);
  const callsBefore = f.calls.length;
  await assert.rejects(runtime.validateForSave(), /作品内容已变化/u);
  assert.equal(f.calls.slice(callsBefore).some((call) => call.relative === 'game/animation/wave.json'), true);
});

test('bootstrap text cache clears on initialization, failed verification and author preview', async () => {
  const f = await fixture();
  const filename = 'game/template/style.scss';
  await fs.mkdir(path.dirname(path.join(f.directory, filename)), { recursive: true });
  await fs.writeFile(path.join(f.directory, filename), 'body { color: red; }');
  await f.update();
  const bootstrap = await freshRuntime('bootstrap-cache-clear');
  await bootstrap.initializeSaveCompatibility('./game/config.txt', 'compat-test');
  assert.equal(bootstrap.getVerifiedBootstrapText(filename), 'body { color: red; }');
  await fs.unlink(path.join(f.directory, MANIFEST_PATH));
  const initializing = bootstrap.initializeSaveCompatibility('./game/config.txt', 'compat-test');
  assert.equal(bootstrap.getVerifiedBootstrapText(filename), undefined);
  await initializing;
  assert.equal(bootstrap.getVerifiedBootstrapText(filename), undefined);
  await sealGame(f.directory, { init: true, backupRoot: f.backupRoot });
  await bootstrap.initializeSaveCompatibility('./game/config.txt', 'compat-test');
  assert.equal(bootstrap.getVerifiedBootstrapText(filename), 'body { color: red; }');
  bootstrap.markPreviewSession();
  assert.equal(bootstrap.getVerifiedBootstrapText(filename), undefined);
});
