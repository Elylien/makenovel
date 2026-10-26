import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

let importId = 0;
async function setup() {
  const listeners = new Set();
  const h = {
    GUI: {}, epoch: 0, forwards: 0, input: 0, commits: 0, effectsApplied: 0,
    registered: [], removed: [], state: [],
    calculation: { effects: [], animationSettings: [], isRead: true },
    animations: [{ name: 'move', effects: [
      { position: { x: 0 }, duration: 0, ease: 'linear' },
      { position: { x: 180 }, duration: 3000, ease: 'linear' },
    ] }],
    store: {
      getState: () => ({ GUI: h.GUI, userData: { optionData: { autoSpeed: 100, skipAll: false } } }),
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    },
    change(values) { Object.assign(h.GUI, values); for (const fn of [...listeners]) fn(); },
    forward() { h.forwards++; h.WebGAL.sceneManager.sceneData.currentSentenceId++; },
  };
  h.stage = {
    addPerform(p) { h.state.push(p); },
    removePerformById(id) { h.state = h.state.filter(p => p.id !== id); },
    clearUncommittedNonHoldPerforms() { h.state = h.state.filter(p => p.isHoldOn); },
    commit() { h.commits++; },
    applyCommittedPixiEffects() { h.effectsApplied++; },
    getCalculationStageState() { return h.calculation; },
    updateEffect(effect) {
      h.calculation.effects = h.calculation.effects.filter(item => item.target !== effect.target);
      h.calculation.effects.push(effect);
    },
  };
  h.WebGAL = {
    sceneManager: {
      lockSceneWrite: false, sceneData: { currentSentenceId: 10, currentScene: {} },
      getSessionEpoch: () => h.epoch, isSessionCurrent: epoch => epoch === h.epoch,
    },
    events: { userInteractNext: { emit() { h.input++; } } },
    flowchartManager: { unlockPendingCurrentScene() {} },
    gameplay: {
      isAuto: false, autoInterval: null, autoTimeout: null,
      isFast: false, fastInterval: null,
      pixiStage: {
        registerAnimation(animation, key, target) { h.registered.push({ animation, key, target }); },
        removeAnimation(key) { h.removed.push(key); },
      },
    },
    animationManager: { getAnimations: () => h.animations },
  };
  globalThis.__playbackModeHarness = h;
  const runtime = await import(pathToFileURL(process.env.PLAYBACK_MODE_TEST_BUNDLE).href + '?' + ++importId);
  const controller = new runtime.PerformController();
  h.WebGAL.gameplay.performController = controller;
  const animate = (next = false, extraArgs = []) => {
    const sentence = { content: 'move', args: [
      { key: 'target', value: 'hero' }, { key: 'next', value: next }, ...extraArgs,
    ] };
    const p = runtime.setAnimation(sentence);
    controller.arrangeNewPerform(p, sentence);
    return p;
  };
  return { h, controller, animate, ...runtime };
}

// A deterministic event-loop clock. Cleared jobs do not execute; captured callbacks
// are used only where native lifecycle code explicitly guards late completions.
async function clocked(run) {
  const original = Object.fromEntries(['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']
    .map(key => [key, globalThis[key]]));
  let now = 0, id = 0;
  const jobs = new Map(), captured = [];
  const add = (callback, delay, interval) => {
    const token = ++id;
    const job = { at: now + Math.max(0, Number(delay) || 0), callback, interval, token };
    jobs.set(token, job); captured.push(job); return token;
  };
  globalThis.setTimeout = (fn, delay = 0) => add(fn, delay, 0);
  globalThis.setInterval = (fn, delay = 0) => add(fn, delay, Math.max(1, Number(delay) || 1));
  globalThis.clearTimeout = globalThis.clearInterval = token => jobs.delete(token);
  const clock = {
    tick(ms) {
      const end = now + ms;
      let iterations = 0;
      for (;;) {
        const job = [...jobs.values()].filter(j => j.at <= end).sort((a, b) => a.at - b.at || a.token - b.token)[0];
        if (!job) break;
        assert.ok(++iterations < 10000, 'clock must not spin forever');
        now = job.at;
        if (job.interval) job.at += job.interval;
        else jobs.delete(job.token);
        job.callback();
      }
      now = end;
    },
    jobs, captured, get now() { return now; },
  };
  try { await run(clock); } finally { Object.assign(globalThis, original); }
}

for (const next of [false, true]) {
  test(`finite next=${next}: natural completion cleans animation and manual input advances exactly once`, () => clocked(async clock => {
    const { h, controller, animate, nextSentence } = await setup();
    animate(next);
    assert.equal(h.registered[0].target, 'hero');
    assert.equal(h.calculation.effects[0].transform.position.x, 180);
    clock.tick(2999);
    assert.equal(controller.hasUnsettledNonHoldPerform(), true);
    clock.tick(1);
    assert.equal(controller.performList.length, 0);
    assert.equal(h.state.length, 0);
    assert.equal(h.forwards, 0);
    nextSentence();
    assert.equal(h.forwards, 1);
    assert.deepEqual(h.removed, ['hero-move-3000']);
    assert.equal(clock.jobs.size, 0);
  }));
}

test('auto waits for native finite animation, then gives the full reading delay', () => clocked(async clock => {
  const { h, animate, switchAuto, stopAll } = await setup();
  animate(true); switchAuto();
  clock.tick(2999);
  assert.equal(h.forwards, 0);
  assert.equal(h.WebGAL.gameplay.autoTimeout, null);
  clock.tick(250);
  assert.equal(h.forwards, 0);
  clock.tick(1);
  assert.equal(h.forwards, 1);
  stopAll();
  assert.equal(clock.jobs.size, 0);
}));

test('a native animation starting after auto scheduling invalidates its old deadline', () => clocked(async clock => {
  const { h, animate, switchAuto, stopAll } = await setup();
  switchAuto(); clock.tick(349);
  assert.notEqual(h.WebGAL.gameplay.autoTimeout, null);
  animate(false); clock.tick(1);
  assert.equal(h.forwards, 0);
  assert.equal(h.WebGAL.gameplay.autoTimeout, null);
  clock.tick(3299); // Now 3649; animation ended at 3349, next poll was 3400.
  assert.equal(h.forwards, 0);
  clock.tick(1);
  assert.equal(h.forwards, 1);
  stopAll();
}));

test('fast first settles a finite animation and only its next tick advances dialogue', () => clocked(async clock => {
  const { h, controller, animate, startFast, stopFast } = await setup();
  animate(true); const lateAnimationEnd = clock.captured[0].callback;
  startFast(); clock.tick(50);
  assert.equal(controller.performList.length, 0);
  assert.equal(h.forwards, 0);
  clock.tick(50);
  assert.equal(h.forwards, 1);
  stopFast(); lateAnimationEnd(); clock.tick(4000);
  assert.equal(h.forwards, 1);
  assert.deepEqual(h.removed, ['hero-move-3000']);
  assert.equal(clock.jobs.size, 0);
}));

test('unread fast stops before settling animation; forced fast may settle and advance', () => clocked(async clock => {
  const { h, controller, animate, startFast, stopFast } = await setup();
  h.calculation.isRead = false; animate(); startFast(); clock.tick(50);
  assert.equal(h.WebGAL.gameplay.isFast, false);
  assert.equal(controller.performList.length, 1);
  assert.equal(h.input, 0);
  startFast(true); clock.tick(50);
  assert.equal(controller.performList.length, 0);
  assert.equal(h.forwards, 0);
  clock.tick(50);
  assert.equal(h.forwards, 1);
  stopFast();
}));

for (const panel of ['showMenuPanel', 'showBacklog', 'showFlowchart']) {
  test(`${panel}: auto and fast cannot advance or settle the covered native animation`, () => clocked(async clock => {
    const { h, controller, animate, switchAuto, startFast, stopAll, nextSentence } = await setup();
    animate(true); h.change({ [panel]: true });
    switchAuto(); startFast(true); clock.tick(1000);
    assert.equal(controller.performList.length, 1);
    assert.equal(h.input, 0);
    assert.equal(h.forwards, 0);
    clock.tick(3000);
    assert.equal(controller.performList.length, 0);
    assert.equal(h.forwards, 0);
    assert.equal(h.input, 0);
    stopAll(); h.change({ [panel]: false });
    await Promise.resolve();
    assert.equal(h.forwards, 0);
    nextSentence();
    assert.equal(h.forwards, 1);
    assert.equal(h.calculation.effects[0].transform.position.x, 180);
  }));
}

test('stopAll clears scheduled auto advance and temporary fast expiry without stopping the animation', () => clocked(async clock => {
  const { h, controller, animate, switchAuto, startTemporaryFast, stopAll } = await setup();
  switchAuto(); clock.tick(100);
  assert.notEqual(h.WebGAL.gameplay.autoTimeout, null);
  animate(); startTemporaryFast(150); stopAll();
  assert.equal(h.WebGAL.gameplay.autoTimeout, null);
  assert.equal(h.WebGAL.gameplay.autoInterval, null);
  assert.equal(h.WebGAL.gameplay.isFast, false);
  clock.tick(3000);
  assert.equal(h.forwards, 0);
  assert.equal(controller.performList.length, 0);
  assert.equal(clock.jobs.size, 0);
}));

test('session cleanup cancels old animation/mode jobs and late animation completion cannot affect replacement', () => clocked(async clock => {
  const { h, controller, animate, switchAuto, startFast, stopAll } = await setup();
  animate(); const stale = clock.captured[0].callback;
  switchAuto(); startFast();
  h.epoch++; stopAll(); controller.removeAllPerform(); h.state = [];
  h.WebGAL.sceneManager.sceneData.currentScene = {};
  animate(); stale(); clock.tick(500);
  assert.equal(controller.performList.length, 1);
  assert.equal(h.forwards, 0);
  clock.tick(2500);
  assert.equal(controller.performList.length, 0);
  assert.equal(h.forwards, 0);
  assert.equal(h.registered.length, 2);
  assert.equal(h.removed.length, 2);
  assert.equal(clock.jobs.size, 0);
}));

test('a deferred native completion is discarded when session changes before panel closes', () => clocked(async clock => {
  const { h, animate, hasDeferredStoryContinue } = await setup();
  // -continue is a native legacy combination, outside the finite director form;
  // use it only to cover the shared completion/session boundary.
  animate(false, [{ key: 'continue', value: true }]);
  h.change({ showBacklog: true }); clock.tick(3000);
  assert.equal(hasDeferredStoryContinue(), true);
  assert.equal(h.forwards, 0);
  h.epoch++; h.change({ showBacklog: false }); await Promise.resolve();
  assert.equal(hasDeferredStoryContinue(), false);
  assert.equal(h.forwards, 0);
}));
