import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

class Container {
  constructor() { this.children = []; this.pivot = { set() {} }; }
  addChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(item => item !== child); }
  setBaseX() {}
  setBaseY() {}
  destroy() { this.destroyed = true; }
}
class Sprite {
  constructor(texture) { this.texture = texture; this.scale = {}; this.anchor = { set() {} }; this.position = {}; }
  destroy() { this.destroyed = true; }
}
const h = { WebGAL: {}, stage: {}, Container, Sprite, GifResource: class {} };
globalThis.__resourceHarness = h;
globalThis.window = { location: { origin: 'http://localhost:3001' } };
globalThis.document = {
  getElementById: () => ({}),
  createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => '', remove() {} }),
};
const runtime = await import(pathToFileURL(process.env.RESOURCE_TEST_BUNDLE));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let count = 0; count < 12; count++) await Promise.resolve(); };
const texture = () => ({ width: 800, height: 1200, baseTexture: { resource: {} } });
const mainPending = () => [...h.owners.keys()].filter(key => key.includes(':pending:'));
const status = object => object.primaryImageLoad?.status;
function stageState() {
  return {
    bgName: '', figLeft: '', figCenter: '', figRight: '', figLeft13: '', figRight13: '', figLeft14: '', figRight14: '',
    freeFigure: [], live2dMotion: [], live2dExpression: [], live2dBlink: [], live2dFocus: [],
    figureAssociatedAnimation: [], figureMetaData: {}, effects: [], animationSettings: [], PerformList: [], GameVar: {},
  };
}
function add(kind = 'figure', key = kind === 'bg' ? 'bg-main' : 'fig-left', url = 'hero.png') {
  if (kind === 'bg') h.pixi.addBg(key, url); else h.pixi.addFigure(key, url, 'left');
  return h.pixi.getStageObjByKey(key);
}
beforeEach(() => {
  h.ready = new Map(); h.loads = []; h.owners = new Map(); h.releases = [];
  h.warnings = []; h.errors = []; h.writes = []; h.slots = new Map([[2, { old: 'manual' }]]); h.fastSlot = { old: 'fast' };
  h.ensure = async request => { const value = texture(); h.ready.set(request.url, value); return value; };
  h.currentStage = stageState();
  Object.assign(h.stage, {
    getCalculationStageState: () => h.currentStage,
    getViewStageState: () => h.currentStage,
  });
  h.pixi = Object.create(runtime.PixiStage.prototype);
  Object.assign(h.pixi, {
    figureObjects: [], backgroundObjects: [], mainStageObject: { key: 'stage-main', uuid: 'stage', sourceType: 'stage' },
    figureContainer: new Container(), backgroundContainer: new Container(), stageWidth: 1920, stageHeight: 1080,
    referenceBoxWaiters: new Map(), stageAnimations: [], lockTransformTarget: [], requestRender() {},
    assets: {
      retain(owner, request) { const held = h.owners.get(owner) ?? new Set(); held.add(request.url); h.owners.set(owner, held); },
      release(owner) { h.releases.push(owner); h.owners.delete(owner); },
      getReady(request) { return h.ready.get(request.url); },
      ensureReady(request) { h.loads.push(request.url); return h.ensure(request); },
    },
  });
  h.metadata = { schemaVersion: 1, projectId: 'fixture', gameKey: 'fixture', manifestHash: 'fixture', runtimeCompatibilityId: 'native' };
  Object.assign(h.WebGAL, {
    gameplay: { pixiStage: h.pixi, skipAnimation: true },
    figureDiffManager: { clear() {}, consume: () => false },
    backlogManager: { getBacklog: () => [] },
    sceneManager: { lockSceneWrite: false, getSessionEpoch: () => 1, isSessionCurrent: () => true,
      sceneData: { currentSentenceId: 1, sceneStack: [], currentLocals: {}, currentScene: { sceneName: 'start', sceneUrl: 'start.txt' } } },
  });
});

for (const kind of ['bg', 'figure']) {
  test(`${kind}: expired animation with a pending main image refuses both save modes without touching old slots`, async () => {
    const wait = deferred(); h.ensure = () => wait.promise;
    const object = add(kind);
    assert.deepEqual(h.currentStage.PerformList, []); // Native duration already ended; resource has not.
    assert.equal(await runtime.saveGame(2), false);
    assert.equal(await runtime.fastSaveGame(), false);
    assert.equal(status(object), 'pending');
    assert.deepEqual(h.slots.get(2), { old: 'manual' }); assert.deepEqual(h.fastSlot, { old: 'fast' });
    assert.equal(h.writes.length, 0); assert.match(h.errors.join('\n'), /资源.*加载/);
    h.ready.set('hero.png', texture()); wait.resolve(); await flush();
    assert.equal(status(object), 'ready'); assert.equal(object.pixiContainer.children.length, 1);
    assert.equal(await runtime.saveGame(2), true); assert.equal(await runtime.fastSaveGame(), true);
    assert.deepEqual(mainPending(), []);
  });
  test(`${kind}: two failed loads refuse stable saves and leave a failed current object`, async () => {
    h.ensure = async () => { throw Error('404 main'); };
    const object = add(kind); await flush();
    assert.equal(await runtime.saveGame(2), false); assert.equal(await runtime.fastSaveGame(), false);
    assert.equal(status(object), 'failed'); assert.equal(h.loads.length, 2); assert.deepEqual(mainPending(), []);
    assert.equal(h.writes.length, 0); assert.match(h.errors.join('\n'), /资源.*失败/);
    assert.deepEqual(h.slots.get(2), { old: 'manual' }); assert.deepEqual(h.fastSlot, { old: 'fast' });
  });
  test(`${kind}: late success after replacement cannot mount into or mark the new request ready`, async () => {
    const oldWait = deferred(), newWait = deferred();
    h.ensure = request => request.url === 'old.png' ? oldWait.promise : newWait.promise;
    const old = add(kind, undefined, 'old.png');
    const current = add(kind, undefined, 'new.png');
    h.ready.set('old.png', texture()); oldWait.resolve(); await flush();
    assert.equal(h.pixi.getStageObjByKey(current.key), current); assert.equal(status(current), 'pending');
    assert.equal(current.pixiContainer.children.length, 0); assert.equal(old.pixiContainer, null);
    assert.equal(h.owners.has(old.uuid), false);
    h.ready.set('new.png', texture()); newWait.resolve(); await flush();
    assert.equal(status(current), 'ready'); assert.equal(current.pixiContainer.children.length, 1);
    assert.deepEqual(mainPending(), []);
  });
  test(`${kind}: late failure after replacement cannot poison the ready replacement`, async () => {
    const wait = deferred();
    h.ensure = async request => {
      if (request.url === 'old.png') return wait.promise;
      const value = texture(); h.ready.set(request.url, value); return value;
    };
    add(kind, undefined, 'old.png'); const current = add(kind, undefined, 'new.png'); await flush();
    wait.reject(Error('old 404')); await flush();
    assert.equal(status(current), 'ready'); assert.equal(await runtime.saveGame(2), true);
    assert.equal(h.loads.filter(url => url === 'old.png').length, 1);
    assert.deepEqual(mainPending(), []);
  });
}

test('cache hit mounts once and becomes ready without a loader request', async () => {
  h.ready.set('hero.png', texture()); const object = add(); await flush();
  assert.equal(status(object), 'ready'); assert.equal(h.loads.length, 0);
  assert.equal(object.pixiContainer.children.length, 1); assert.deepEqual(mainPending(), []);
});
test('one failed load followed by native retry success becomes ready', async () => {
  let attempts = 0;
  h.ensure = async request => {
    if (++attempts === 1) throw Error('temporary network failure');
    const value = texture(); h.ready.set(request.url, value); return value;
  };
  const object = add(); await flush();
  assert.equal(attempts, 2); assert.equal(status(object), 'ready');
  assert.equal(object.pixiContainer.children.length, 1); assert.equal(await runtime.saveGame(2), true);
});
test('actual figure mount failure after image decode marks failed and cleans its temporary owner', async () => {
  const wait = deferred(); h.ensure = () => wait.promise; const object = add();
  object.pixiContainer.addChild = () => { throw Error('renderer rejected sprite'); };
  h.ready.set('hero.png', texture()); wait.resolve(); await flush();
  assert.equal(status(object), 'failed'); assert.equal(await runtime.saveGame(2), false);
  assert.deepEqual(mainPending(), []); assert.match(h.warnings.flat().join('\n'), /renderer rejected sprite/);
});
test('silent automatic quick save retains the old record while a primary image is pending', async () => {
  const wait = deferred(); h.ensure = () => wait.promise; const object = add();
  assert.equal(await runtime.fastSaveGame(true), false); assert.equal(h.errors.length, 0);
  assert.equal(h.writes.length, 0); assert.deepEqual(h.fastSlot, { old: 'fast' });
  h.pixi.removeStageObjectByKey(object.key); wait.resolve(); await flush();
});
test('a primary setup promise must settle before the image becomes saveable', async () => {
  h.ready.set('hero.png', texture()); const object = add(); await flush();
  const wait = deferred(); h.pixi.loadStageAsset(object.uuid, () => wait.promise);
  assert.equal(status(object), 'pending'); assert.equal(await runtime.saveGame(2), false);
  wait.resolve(); await flush(); assert.equal(status(object), 'ready'); assert.equal(await runtime.saveGame(2), true);
});
for (const cached of [false, true]) {
  test(`primary setup throws with cache=${cached}: failed state and pending owner cleanup`, async () => {
    const object = add(); await flush(); if (!cached) h.ready.delete('hero.png');
    h.pixi.loadStageAsset(object.uuid, () => { throw Error('mount failed'); }); await flush();
    assert.equal(status(object), 'failed'); assert.equal(await runtime.saveGame(2), false);
    assert.deepEqual(mainPending(), []); assert.match(h.warnings.flat().join('\n'), /mount failed/);
  });
}
test('primary asynchronous setup rejection is failed and releases pending owner', async () => {
  const object = add(); await flush();
  h.pixi.loadStageAsset(object.uuid, async () => { throw Error('async mount failed'); }); await flush();
  assert.equal(status(object), 'failed'); assert.equal(await runtime.fastSaveGame(), false); assert.deepEqual(mainPending(), []);
});
test('a newer request on the same UUID wins over an older setup rejection', async () => {
  const object = add(); await flush(); const wait = deferred();
  h.pixi.loadStageAsset(object.uuid, () => wait.promise);
  h.pixi.loadStageAsset(object.uuid, () => undefined); await flush();
  assert.equal(status(object), 'ready'); wait.reject(Error('obsolete setup')); await flush();
  assert.equal(status(object), 'ready'); assert.equal(await runtime.saveGame(2), true); assert.deepEqual(mainPending(), []);
});
test('a newer request on the same UUID stays pending after an older setup succeeds', async () => {
  const object = add(); await flush(); const oldWait = deferred(), newWait = deferred();
  h.pixi.loadStageAsset(object.uuid, () => oldWait.promise);
  h.pixi.loadStageAsset(object.uuid, () => newWait.promise);
  oldWait.resolve(); await flush(); assert.equal(status(object), 'pending');
  assert.equal(await runtime.saveGame(2), false);
  newWait.resolve(); await flush(); assert.equal(status(object), 'ready'); assert.deepEqual(mainPending(), []);
});
test('a failing mouth or blink texture never changes the ready primary image state', async () => {
  const object = add(); await flush(); h.ensure = async () => { throw Error('mouth 404'); };
  h.pixi.loadStageAsset(object.uuid, () => assert.fail('failed auxiliary cannot mount'), { url: 'mouth.png', kind: 'texture' });
  await flush(); assert.equal(status(object), 'ready'); assert.equal(await runtime.saveGame(2), true);
  assert.equal(await runtime.fastSaveGame(), true); assert.deepEqual(mainPending(), []);
});
test('an auxiliary success cannot make a still-pending primary image ready', async () => {
  const wait = deferred(); h.ensure = () => wait.promise; const object = add();
  h.ready.set('mouth.png', texture()); h.pixi.loadStageAsset(object.uuid, () => undefined, { url: 'mouth.png', kind: 'texture' });
  await flush(); assert.equal(status(object), 'pending'); assert.equal(await runtime.saveGame(2), false);
  h.pixi.removeStageObjectByKey(object.key); wait.resolve(); await flush(); assert.deepEqual(mainPending(), []);
});
test('reset via the native empty-stage sync removes pending images; late results cannot leave a save blocker', async () => {
  const waits = [deferred(), deferred()]; let index = 0; h.ensure = () => waits[index++].promise;
  const bg = add('bg'), figure = add();
  runtime.syncPixiStageState(stageState(), { syncPixiStage: true, skipAnimation: true, applyPixiEffects: false });
  assert.equal(h.pixi.getStageObjByUuid(bg.uuid), undefined); assert.equal(h.pixi.getStageObjByUuid(figure.uuid), undefined);
  assert.equal(await runtime.saveGame(2), true);
  waits[0].resolve(); waits[1].reject(Error('removed')); await flush();
  assert.equal(await runtime.fastSaveGame(), true); assert.deepEqual(mainPending(), []);
});
test('removing a failed image clears its save blocker without altering the intended script state', async () => {
  h.ensure = async () => { throw Error('404'); }; const object = add(); await flush();
  assert.equal(status(object), 'failed'); const before = structuredClone(h.currentStage);
  h.pixi.removeStageObjectByKey(object.key); assert.equal(await runtime.saveGame(2), true);
  assert.deepEqual(h.currentStage, before); assert.equal(h.owners.has(object.uuid), false);
});
test('same URL sync after failure does not add implicit retries on every stage commit', async () => {
  h.ensure = async () => { throw Error('404'); }; add('bg', 'bg-main', 'missing.png'); await flush();
  h.currentStage.bgName = 'missing.png';
  for (let index = 0; index < 5; index++) runtime.syncPixiStageState(h.currentStage, { syncPixiStage: true, skipAnimation: true, applyPixiEffects: false });
  await flush(); assert.equal(h.loads.length, 2); assert.equal(status(h.pixi.getStageObjByKey('bg-main')), 'failed');
});
test('retiring image records are excluded from the primary-image gate (exit lifecycle has its separate gate)', async () => {
  const wait = deferred(); h.ensure = () => wait.promise; const object = add(); object.isExiting = true;
  assert.equal(await runtime.saveGame(2), true);
  h.pixi.removeStageObjectByKey(object.key); wait.resolve(); await flush();
});
for (const type of ['gif', 'video', 'live2d', 'spine']) {
  test(`${type} resource readiness is outside this static-image gate`, async () => {
    const object = { key: 'model', uuid: 'model', sourceUrl: 'model.dat', sourceType: type, pixiContainer: new Container() };
    h.pixi.figureObjects.push(object); h.ensure = async () => { throw Error('not part of this gate'); };
    h.pixi.loadStageAsset(object.uuid, () => {}); await flush();
    assert.equal(object.primaryImageLoad, undefined); assert.equal(await runtime.saveGame(2), true);
  });
}
