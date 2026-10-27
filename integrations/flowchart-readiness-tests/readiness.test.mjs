import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

class Container {
  constructor() { this.children = []; this.pivot = { set() {} }; }
  addChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(item => item !== child); }
  setBaseX() {} setBaseY() {} destroy() {}
}
class Sprite { constructor(texture) { this.texture = texture; this.scale = {}; this.anchor = { set() {} }; this.position = {}; } destroy() {} }
const h = { WebGAL: {}, Container, Sprite };
globalThis.__readinessHarness = h;
globalThis.window = { location: { origin: 'http://localhost:3001' }, dispatchEvent() {} };
globalThis.document = { getElementById: () => ({}), createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => '', remove() {} }) };
const runtime = await import(pathToFileURL(process.env.READINESS_TEST_BUNDLE));
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const texture = () => ({ width: 800, height: 1200, baseTexture: { resource: {} } });
const scene = () => ({ sceneName: 'single.txt', sceneUrl: './game/scene/single.txt', sentenceList: [{ content: 'only dialogue' }], assetsList: [], subSceneList: [] });
beforeEach(async () => {
  h.errors = []; h.writes = []; h.playerWrites = []; h.next = 0; h.enabled = true; h.storageEpoch = 0; h.deferredStory = false;
  h.metadata = { schemaVersion: 1, projectId: 'fixture', gameKey: 'fixture', manifestHash: 'fixture', runtimeCompatibilityId: 'native' };
  h.validate = async () => h.metadata;
  h.persist = async (key,value) => { h.writes.push([key, structuredClone(value)]); return value; };
  h.flowchart = { flowcharts: [{ id: 'main', name: 'Main', nodes: [{ id: 'single', position: {x:0,y:0}, data: { label: 'Single', sceneName: 'single.txt' } }], edges: [] }] };
  h.ready = new Map(); h.ensure = async request => { const value = texture(); h.ready.set(request.url, value); return value; };
  h.pixi = Object.create(runtime.PixiStage.prototype);
  Object.assign(h.pixi, {
    figureObjects: [], backgroundObjects: [], mainStageObject: { key: 'stage-main', uuid: 'stage', sourceType: 'stage' },
    figureContainer: new Container(), backgroundContainer: new Container(), stageWidth: 1920, stageHeight: 1080,
    referenceBoxWaiters: new Map(), stageAnimations: [], lockTransformTarget: [], requestRender() {},
    assets: { retain() {}, release() {}, getReady: r => h.ready.get(r.url), ensureReady: r => h.ensure(r) },
  });
  h.scene = new runtime.SceneManager(); h.scene.sceneData.currentScene = scene(); h.scene.sceneData.currentSentenceId = 1;
  h.perform = new runtime.PerformController();
  Object.assign(h.WebGAL, {
    gameKey: 'fixture', sceneManager: h.scene,
    gameplay: { pixiStage: h.pixi, skipAnimation: true, performController: h.perform },
    figureDiffManager: { clear() {}, consume: () => false }, backlogManager: { getBacklog: () => [] },
  });
  runtime.stageStateManager.setCommitHandler(null);
  runtime.stageStateManager.resetAllStageState({ ...structuredClone(runtime.initState), showText: 'only dialogue' });
  h.flow = new runtime.FlowchartManager(h.scene); await h.flow.init('fixture', true);
  h.WebGAL.flowchartManager = h.flow;
});
afterEach(async () => { h.flow.cancelPendingSceneUnlock(); h.perform.removeAllPerform(); runtime.finishStageExits(); await flush(); });
function request() { h.flow.waitForCurrentSceneDialog(); h.flow.requestUnlockCurrentScene(); h.flow.unlockPendingCurrentScene(); }
function image(url = 'hero.png') { h.pixi.addFigure('fig-left', url, 'left'); return h.pixi.getStageObjByKey('fig-left'); }
function assertOnce() { assert.equal(h.flow.isUnlocked('main', 'single'), true); assert.equal(h.writes.filter(([key]) => key === 'fixture-flowchart-main-single').length, 1); assert.deepEqual(h.errors, []); }

test('single dialogue unlocks after native primary image settles without another script commit', async () => {
  const wait = deferred(); h.ensure = () => wait.promise; const object = image(); request();
  assert.equal(await runtime.saveGame(2), false); assert.equal(await runtime.fastSaveGame(), false);
  assert.deepEqual(h.playerWrites, []); h.errors = [];
  h.ready.set('hero.png', texture()); wait.resolve(); await flush();
  assert.equal(object.primaryImageLoad.status, 'ready'); assertOnce(); assert.equal(h.next, 0);
});
test('finite native perform completion unlocks the same single dialogue', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const perform = { performName: 'finite', duration: 25, isHoldOn: false, blockingNext: () => false, blockingAuto: () => false,
    startFunction() {}, stopFunction() { runtime.stageStateManager.setStage('bgName', 'final.png'); } };
  h.perform.arrangeNewPerform(perform, { command: runtime.commandType.setAnimation, content: 'move', args: [] });
  request(); await flush(); assert.equal(h.flow.isUnlocked('main', 'single'), false);
  t.mock.timers.tick(25); await flush(); assertOnce(); assert.equal(h.next, 0);
  assert.equal(h.writes[0][1].nowStageState.bgName, 'final.png'); assert.deepEqual(h.writes[0][1].nowStageState.PerformList, []);
});
test('last native exit cleanup unlocks without a later dialogue', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const old = { key: 'exit', uuid: 'old' }; let current = old;
  runtime.scheduleStageExit({ getStageObjByKey: () => current, removeAnimation() {}, removeStageObjectByKey() { current = undefined; } }, old, 'exit', 25);
  request(); t.mock.timers.tick(25); await flush(); assertOnce(); assert.equal(current, undefined);
});
test('scene-operation finish retries a ready request held by the write lock', async () => {
  const epoch = h.scene.beginSceneWrite(); request(); await flush(); assert.deepEqual(h.writes, []);
  h.scene.finishSessionOperation(epoch, 'scene'); await flush(); assertOnce();
});
test('scene-write start notifies immediately with the lock held and cannot unlock a pending request', async () => {
  h.deferredStory = true; request(); h.deferredStory = false;
  const observedLocks = [];
  const unsubscribe = runtime.subscribeVisualReadiness(() => observedLocks.push(h.scene.lockSceneWrite));
  const epoch = h.scene.beginSceneWrite();
  assert.deepEqual(observedLocks, [true]); unsubscribe();
  await flush(); assert.deepEqual(h.writes, []); assert.equal(h.flow.isUnlocked('main', 'single'), false);
  h.scene.finishSessionOperation(epoch, 'scene'); await flush(); assertOnce();
});
test('readiness notifications coalesce after the entire synchronous stage commit', async () => {
  const wait = deferred(); h.ensure = () => wait.promise; image(); request();
  h.ready.set('hero.png', texture()); wait.resolve(); await flush(); assertOnce();
  runtime.stageStateManager.commit(); runtime.stageStateManager.commit(); await flush(); assertOnce();
});
test('image failure reports once and cannot unlock on a later unrelated stage event', async () => {
  const wait = deferred(); h.ensure = () => wait.promise; image(); request(); wait.reject(Error('missing')); await flush();
  assert.equal(h.errors.length, 1); assert.match(h.errors[0], /图片资源加载失败/); assert.deepEqual(h.writes, []);
  h.pixi.removeStageObjectByKey('fig-left'); runtime.stageStateManager.commit(); await flush();
  assert.equal(h.errors.length, 1); assert.equal(h.flow.isUnlocked('main', 'single'), false);
});
test('a pending native image still prevents unlock after the finite perform commits', async () => {
  const wait = deferred(); h.ensure = () => wait.promise; image(); request();
  runtime.stageStateManager.commit(); await flush(); assert.deepEqual(h.writes, []);
  h.ready.set('hero.png', texture()); wait.resolve(); await flush(); assertOnce();
});
test('a covered story continuation remains a gate until a subsequent native commit', async () => {
  const wait = deferred(); h.ensure = () => wait.promise; image(); request(); h.deferredStory = true;
  h.ready.set('hero.png', texture()); wait.resolve(); await flush(); assert.deepEqual(h.writes, []);
  h.deferredStory = false; runtime.stageStateManager.commit(); await flush(); assertOnce();
});
for (const invalidation of ['same-name replacement','session','restore','title reset','storage ABA','namespace','clear progress']) {
  test(`late native image cannot unlock after ${invalidation}`, async () => {
    const wait = deferred(); h.ensure = () => wait.promise; image(); request();
    if (invalidation === 'same-name replacement') h.scene.sceneData.currentScene = scene();
    if (invalidation === 'session') h.scene.invalidateSession();
    if (invalidation === 'restore') h.scene.beginRestoreRequest();
    if (invalidation === 'title reset') h.scene.resetScene();
    if (invalidation === 'storage ABA') h.storageEpoch += 2;
    if (invalidation === 'namespace') h.WebGAL.gameKey = 'new';
    if (invalidation === 'clear progress') await h.flow.clearProgress();
    h.ready.set('hero.png', texture()); wait.resolve(); await flush();
    assert.deepEqual(h.writes, []); assert.equal(h.flow.isUnlocked('main', 'single'), false); assert.deepEqual(h.errors, []);
  });
}
test('old image callback cannot settle a replacement image before its own ready event', async () => {
  const old = deferred(), current = deferred(); h.ensure = r => r.url === 'old.png' ? old.promise : current.promise;
  image('old.png'); request(); image('new.png'); h.ready.set('old.png', texture()); old.resolve(); await flush(); assert.deepEqual(h.writes, []);
  h.ready.set('new.png', texture()); current.resolve(); await flush(); assertOnce();
});

test('a synchronous commit batch cannot unlock while its final state is transient', async () => {
  const blocker = { id: 'finite', isHoldOn: false, script: { command: runtime.commandType.setAnimation, args: [], content: 'move' } };
  runtime.stageStateManager.setStage('PerformList', [blocker]); request();
  runtime.stageStateManager.setStage('PerformList', []); runtime.stageStateManager.commit();
  runtime.stageStateManager.setStage('PerformList', [blocker]); runtime.stageStateManager.commit();
  await flush(); assert.deepEqual(h.writes, []);
  runtime.stageStateManager.setStage('PerformList', []); runtime.stageStateManager.commit();
  runtime.stageStateManager.commit(); runtime.stageStateManager.commit(); await flush(); assertOnce();
});
test('a queued old request cannot consume a newer scene before its first dialogue', async () => {
  h.deferredStory = true; request(); h.deferredStory = false;
  runtime.stageStateManager.commit();
  h.scene.sceneData.currentScene = scene(); h.flow.waitForCurrentSceneDialog();
  await flush(); assert.deepEqual(h.writes, []);
  h.flow.requestUnlockCurrentScene(); runtime.stageStateManager.commit(); await flush(); assertOnce();
});
test('successful consumption removes readiness listeners instead of checking every later commit', async () => {
  h.deferredStory = true; request(); h.deferredStory = false;
  let checks = 0; const unlock = h.flow.unlockPendingCurrentScene.bind(h.flow);
  h.flow.unlockPendingCurrentScene = () => { checks++; unlock(); };
  runtime.stageStateManager.commit(); runtime.stageStateManager.commit(); await flush(); assertOnce(); assert.equal(checks, 1);
  runtime.stageStateManager.commit(); runtime.stageStateManager.commit(); await flush(); assert.equal(checks, 1);
});
