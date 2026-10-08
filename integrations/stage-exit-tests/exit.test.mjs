import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const h = { WebGAL: {} };
globalThis.__exitHarness = h;
const runtime = await import(pathToFileURL(process.env.EXIT_TEST_BUNDLE).href);
const nativeSetTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
let timerId = 0;
beforeEach(() => {
  h.objects = []; h.animations = new Map(); h.timers = new Map(); h.allTimers = [];
  h.duration = 8000; h.stops = 0;
  globalThis.setTimeout = fn => { const id = ++timerId; h.timers.set(id, fn); h.allTimers.push(fn); return id; };
  globalThis.clearTimeout = id => h.timers.delete(id);
  h.stage = {
    getStageObjByKey: key => h.objects.find(o => o.key === key),
    getFigureObjects: () => h.objects.filter(o => o.kind === 'figure'),
    removeStageObjectByKey: key => { h.objects = h.objects.filter(o => o.key !== key); },
    removeAnimation: key => h.animations.delete(key),
    registerAnimation: (animation, key, target) => h.animations.set(key, target),
  };
  h.WebGAL.gameplay = { pixiStage: h.stage, skipAnimation: false, performController: { removeAllPerform() { h.stops++; } } };
  h.WebGAL.figureDiffManager = { clear() {} };
});
afterEach(() => {
  runtime.finishStageExits();
  globalThis.setTimeout = nativeSetTimeout; globalThis.clearTimeout = nativeClearTimeout;
});
const object = (kind, uuid = 'first') => ({ kind, uuid, key: kind === 'bg' ? 'bg-main' : 'fig-left', sourceUrl: 'old.svg' });
const empty = () => ({ bgName: '', live2dMotion: [], live2dExpression: [], live2dBlink: [], live2dFocus: [], freeFigure: [], figureAssociatedAnimation: [], figureMetaData: {}, effects: [], animationSettings: [] });
const sync = (skipAnimation = false) => runtime.syncPixiStageState(empty(), { syncPixiStage: true, skipAnimation, applyPixiEffects: false });

for (const kind of ['bg', 'figure']) {
  test(`${kind}: native removal stays registered until its exit ends`, () => {
    const old = object(kind); h.objects.push(old); sync();
    assert.equal(runtime.hasPendingStageExits(), true); assert.equal(h.objects.length, 1);
    for (const fn of [...h.timers.values()]) fn();
    assert.equal(runtime.hasPendingStageExits(), false); assert.equal(h.objects.length, 0);
  });
  test(`${kind}: load/stop cancels old exit before the timer, late callback is harmless`, () => {
    const old = object(kind); h.objects.push(old); sync();
    const late = h.allTimers[0]; runtime.stopAllPerform();
    assert.equal(h.objects.length, 0); assert.equal(h.timers.size, 0); assert.equal(h.animations.size, 0);
    const replacement = { ...old, uuid: 'replacement' }; h.objects.push(replacement); late();
    assert.deepEqual(h.objects, [replacement]); assert.equal(runtime.hasPendingStageExits(), false);
  });
  test(`${kind}: two exits in the same millisecond have distinct identities`, () => {
    const OriginalDate = globalThis.Date;
    globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [1000])); } };
    try {
      h.objects.push(object(kind, 'one')); sync(); h.objects.push(object(kind, 'two')); sync();
      assert.equal(new Set(h.objects.map(o => o.key)).size, 2);
      h.allTimers[0](); assert.equal(h.objects.length, 1); assert.equal(h.objects[0].uuid, 'two');
      assert.equal(runtime.hasPendingStageExits(), true);
      runtime.finishStageExits(); assert.equal(h.objects.length, 0);
    } finally { globalThis.Date = OriginalDate; }
  });
  test(`${kind}: skip removes immediately without a pending exit`, () => {
    h.objects.push(object(kind)); sync(true);
    assert.equal(h.objects.length, 0); assert.equal(runtime.hasPendingStageExits(), false);
    assert.equal(h.timers.size, 0);
  });
}
test('cleanup checks object identity even if another object reused its key', () => {
  const old = object('figure'); h.objects.push(old); sync();
  const replacement = { ...old, uuid: 'replacement' }; h.objects = [replacement];
  runtime.finishStageExits(); assert.deepEqual(h.objects, [replacement]);
});
