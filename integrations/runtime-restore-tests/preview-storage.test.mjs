import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { computeManifestHash, RUNTIME_COMPATIBILITY_ID } from '../game-manifest/manifest.mjs';

// The renderer and network are controlled boundaries. Compatibility, restore,
// preview dispatch, sync-scene session invalidation and the parser are real.
const bundle = process.env.PREVIEW_STORAGE_TEST_BUNDLE;
if (!bundle) throw new Error('Run integrations/runtime-restore-tests/run-tests.mjs first.');
const baseURI = 'http://127.0.0.1:3001/games/preview-storage/';
const raw = 'say:RIGHT;\nsay:UNREGISTERED;\nsay:END;';
const clone = value => structuredClone(value);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
let pageSequence = 0;

function fixture() {
  const sources = {
    'game/config.txt': 'Game_name:Preview isolation;\nGame_key:preview-storage-fixture;\n',
    'game/scene/start.txt': raw,
  };
  const files = Object.entries(sources).map(([name, text]) => {
    const bytes = Buffer.from(text);
    return { path: name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const manifest = {
    schemaVersion: 1,
    projectId: '8196901b-cded-43c1-b35f-580db4a2375e',
    gameKey: 'preview-storage-fixture',
    runtimeCompatibilityId: RUNTIME_COMPATIBILITY_ID,
    files,
  };
  manifest.manifestHash = computeManifestHash(manifest);
  sources['game/makenovel-manifest.json'] = JSON.stringify(manifest);
  const calls = [];
  let hook;
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.origin, new URL(baseURI).origin);
    assert.equal(url.pathname.startsWith(new URL(baseURI).pathname), true);
    assert.equal(options?.cache, 'no-store');
    const name = decodeURIComponent(url.pathname.slice(new URL(baseURI).pathname.length));
    calls.push(name);
    await hook?.(name);
    return Object.hasOwn(sources, name) ? new Response(sources[name]) : new Response('missing', { status: 404 });
  };
  return { manifest, calls, setHook: value => { hook = value; } };
}

async function newPage(f) {
  const h = {
    WebGAL: {}, store: {}, stage: {}, currentStage: null,
    previewMessages: [], stops: [], backstage: [], performs: ['active-perform'],
    onSend() {}, applyDebugVariables() {}, setDebugTextReadMode() {},
  };
  globalThis.__previewStorageHarness = h;
  globalThis.window = {
    location: { protocol: 'http:', hostname: '127.0.0.1', port: '3001' },
    addEventListener() {}, dispatchEvent() {},
  };
  globalThis.document = { baseURI, querySelector: () => null, addEventListener() {} };
  const runtime = await import(pathToFileURL(bundle).href + `?page=${++pageSequence}`);
  const initialStage = text => ({ ...clone(runtime.initState), showText: text });
  h.currentStage = initialStage('ACTIVE');
  h.storeState = {
    GUI: { showTitle: false, showMenuPanel: false, showBacklog: false, showTextBox: true },
    saveData: { saveData: [] },
  };
  Object.assign(h.store, {
    getState: () => h.storeState,
    dispatch: ({ type, payload }) => {
      if (type === 'visibility') h.storeState.GUI[payload.component] = payload.visibility;
      if (type === 'font') h.storeState.GUI.fontOptimization = payload;
    },
  });
  Object.assign(h.stage, {
    subscribe: () => () => {},
    getCalculationStageState: () => h.currentStage,
    getViewStageState: () => h.currentStage,
    replaceCalculationStageState: stage => { h.currentStage = stage; },
    resetAllStageState: stage => { h.currentStage = stage; },
    resetCalculationStageState: stage => { h.currentStage = stage; },
    removeAllPerform: () => { h.currentStage.PerformList = []; },
    setStage: (key, value) => { h.currentStage[key] = value; },
    setStageAndCommit: (key, value) => { h.currentStage[key] = value; },
    commit() {}, applyCommittedPixiEffects() {},
  });
  const manager = new runtime.SceneManager();
  Object.assign(h.WebGAL, {
    sceneManager: manager,
    gameName: 'Preview isolation',
    backlogManager: {
      isSaveBacklogNext: false,
      getBacklog: () => h.backstage,
      makeBacklogEmpty: () => { h.backstage = []; },
      insertBacklogItem: value => { h.backstage.push(value); },
    },
    gameplay: {
      isFastPreview: false,
      resetGamePlay: () => { h.WebGAL.gameplay.isFastPreview = false; },
      pixiStage: { removeAllAnimations() {}, requestRender() {} },
      performController: {
        removeAllPerform: () => { h.stops.push('perform'); h.performs = []; },
        beginCollectingPerforms() {}, endCollectingPerforms() {},
        commitPendingPerforms() {}, arrangeNewPerform() {},
        discardUncommittedNonHoldPerforms() {}, clearNonHoldPerformsFromStageState() {},
        hasPendingBlockingStateCalculationPerform: () => false,
      },
    },
  });
  h.fetchScene = async () => {
    // Assert the isolation marker precedes even the first preview fetch.
    assert.equal(runtime.isSaveStorageEnabled(), false);
    return raw;
  };
  h.forward = () => {
    const script = manager.sceneData.currentScene.sentenceList[manager.sceneData.currentSentenceId++];
    if (!script) return false;
    h.currentStage.showText = script.content;
    return true;
  };
  h.commit = () => {};
  h.runScript = () => {};
  h.WebGAL.gameKey = await runtime.initializeSaveCompatibility('./game/config.txt', f.manifest.gameKey);
  assert.equal(runtime.getSaveStatus().ready, true, runtime.getSaveStatus().error);
  assert.equal(runtime.getSaveStatus().preview, false);
  runtime.setSaveStorageEnabled(true);
  const { schemaVersion, projectId, gameKey, runtimeCompatibilityId, manifestHash } = f.manifest;
  h.storeState.saveData.saveData[0] = {
    makenovel: { schemaVersion, projectId, gameKey, runtimeCompatibilityId, manifestHash },
    nowStageState: initialStage('RIGHT'),
    sceneData: { sceneName: 'start.txt', sceneUrl: './game/scene/start.txt', currentSentenceId: 1, sceneStack: [], currentLocals: {} },
    backlog: [], index: 0, saveTime: 'fixture', previewImage: '',
  };
  runtime.startPreviewSyncRuntime();
  await h.previewHooks.onOpen({});
  const registration = h.previewMessages.find(message => message.type === 'session.register-preview');
  assert.ok(registration);
  h.previewHooks.onMessage(JSON.stringify(runtime.createResponseEnvelope('session.register-preview', registration.requestId, {})));
  const request = (type, payload) => h.previewHooks.onMessage(JSON.stringify(runtime.createRequestEnvelope(type, 'preview-fixture', payload)));
  const jump = async () => {
    const settled = deferred();
    h.onSend = message => {
      if (message.type === 'stage.snapshot.updated' && message.payload.sceneName === 'start.txt' && message.payload.sentenceId === 2) settled.resolve();
    };
    request('preview.command.sync-scene', { sceneName: 'start.txt', sentenceId: 2, debugVariables: [] });
    await settled.promise;
    h.onSend = () => {};
    assert.equal(h.currentStage.showText, 'UNREGISTERED');
    assert.equal(h.WebGAL.gameplay.isFastPreview, false);
    assert.equal(manager.lockSceneWrite, false);
  };
  const state = () => clone({ stage: h.currentStage, scene: manager.sceneData, backlog: h.backstage, gui: h.storeState.GUI, performs: h.performs });
  return { runtime, h, manager, request, jump, state };
}

test('real sync-scene latch rejects quick-load before restore and releases its lock without changing preview state', { timeout: 5000 }, async () => {
  const f = fixture();
  const page = await newPage(f);
  const { runtime, h, manager } = page;
  assert.equal(await runtime.loadGame(0), true);
  assert.equal(h.currentStage.showText, 'RIGHT');
  await page.jump();
  assert.equal(runtime.getSaveStatus().preview, true);
  assert.match(runtime.getSaveStatus().message, /作者预览/u);
  const before = page.state();
  const stops = [...h.stops];
  const slot = clone(h.storeState.saveData.saveData[0]);
  const readCount = f.calls.length;
  assert.equal(await runtime.loadGame(0), false);
  assert.equal(runtime.getSaveStatus().error, runtime.getSaveUnavailableMessage('当前作品不能读取存档。'));
  assert.match(runtime.getSaveStatus().error, /作者预览.*刷新/u);
  assert.deepEqual(page.state(), before);
  assert.deepEqual(h.stops, stops);
  assert.deepEqual(h.storeState.saveData.saveData[0], slot);
  assert.equal(f.calls.length, readCount, 'preview rejection does not fetch or begin snapshot restoration');
  assert.equal(manager.lockSceneWrite, false);
});

test('same-page reinitialization cannot unlock preview reads but a fresh page restores the same preserved slot', { timeout: 5000 }, async () => {
  const f = fixture();
  const page = await newPage(f);
  await page.jump();
  const slot = clone(page.h.storeState.saveData.saveData[0]);
  await page.runtime.initializeSaveCompatibility('./game/config.txt', f.manifest.gameKey);
  page.runtime.setSaveStorageEnabled(true);
  assert.equal(page.runtime.getSaveStatus().preview, true);
  assert.equal(page.runtime.isSaveStorageEnabled(), false);
  assert.equal(await page.runtime.loadGame(0), false);
  assert.equal(page.manager.lockSceneWrite, false);
  const fresh = await newPage(f);
  fresh.h.storeState.saveData.saveData[0] = slot;
  assert.equal(await fresh.runtime.loadGame(0), true);
  assert.equal(fresh.h.currentStage.showText, 'RIGHT');
  assert.equal(fresh.manager.sceneData.currentSentenceId, 1);
  assert.equal(fresh.manager.lockSceneWrite, false);
  assert.deepEqual(fresh.h.storeState.saveData.saveData[0], slot);
});

test('automatic font setup and read-only preview queries preserve real validated quick-load access', { timeout: 5000 }, async () => {
  const page = await newPage(fixture());
  page.request('preview.command.set-font-optimization', { enabled: true });
  page.request('preview.query.base-transform', {});
  assert.equal(page.runtime.isSaveStorageEnabled(), true);
  assert.equal(page.runtime.getSaveStatus().ready, true);
  assert.equal(page.runtime.getSaveStatus().preview, false);
  assert.equal(page.h.storeState.GUI.fontOptimization, true);
  assert.equal(await page.runtime.loadGame(0), true);
  assert.equal(page.h.currentStage.showText, 'RIGHT');
  assert.equal(page.manager.lockSceneWrite, false);
});

test('sync-scene arriving during real snapshot verification cancels the old read and preserves the settled preview', { timeout: 5000 }, async () => {
  const f = fixture();
  const page = await newPage(f);
  const entered = deferred();
  const release = deferred();
  let held = false;
  f.setHook(async name => {
    if (!held && name === 'game/makenovel-manifest.json') {
      held = true;
      entered.resolve();
      await release.promise;
    }
  });
  const pendingLoad = page.runtime.loadGame(0);
  await entered.promise;
  assert.equal(page.manager.lockSceneWrite, true);
  await page.jump();
  const preview = page.state();
  const stops = [...page.h.stops];
  release.resolve();
  assert.equal(await pendingLoad, false);
  assert.deepEqual(page.state(), preview);
  assert.deepEqual(page.h.stops, stops);
  assert.equal(page.runtime.isSaveStorageEnabled(), false);
  assert.equal(page.manager.lockSceneWrite, false);
  assert.equal(page.runtime.getSaveStatus().error, '', 'superseded restore must not replace the preview status with a stale error');
});
