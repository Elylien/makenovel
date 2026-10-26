import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const h = { stage: {}, WebGAL: {} };
globalThis.__performHarness = h;
const { PerformController, changeBg, changeFigure, setAnimation } = await import(pathToFileURL(process.env.PERFORM_TEST_BUNDLE));
const script = (continuing = false) => ({ args: continuing ? [{ key: 'continue', value: true }] : [] });
const perform = (name, overrides = {}) => ({
  performName: name, duration: 1000, isHoldOn: false,
  startFunction() { h.started.push(name); }, stopFunction() { h.stopped.push(name); },
  blockingNext: () => false, blockingAuto: () => true, ...overrides,
});
beforeEach(() => {
  h.started = []; h.stopped = []; h.next = 0; h.state = [];
  h.calculation = { bgName: '', figure_center: '', freeFigure: [], live2dMotion: [], effects: [], animationSettings: [] };
  h.animations = []; h.registered = []; h.removedAnimations = [];
  Object.assign(h.WebGAL, {
    gameplay: { performController: { unmountPerform() {} }, skipAnimation: false, pixiStage: {
      registerAnimation(animation, key, target) { h.registered.push({ animation, key, target }); },
      removeAnimation(key) { h.removedAnimations.push(key); },
    } },
    animationManager: { addAnimation(animation) { h.animations.push(animation); }, getAnimations() { return h.animations; } },
  });
  h.continue = () => { h.next++; };
  Object.assign(h.stage, {
    addPerform(p) { h.state.push(p); },
    removePerformByName(name) { h.state = h.state.filter(p => p.id !== name && !p.id.startsWith(name + '#')); },
    removePerformById(id) { h.state = h.state.filter(p => p.id !== id); },
    removePerformByPrefix(prefix) { h.state = h.state.filter(p => !p.id.startsWith(prefix)); },
    clearUncommittedNonHoldPerforms() { h.state = h.state.filter(p => p.isHoldOn); },
    commit() {}, applyCommittedPixiEffects() {},
    getCalculationStageState() { return h.calculation; },
    removeEffectByTargetId() {}, removeAnimationSettingsByTarget() {},
    updateAnimationSettings({ target, key, value }) {
      let setting = h.calculation.animationSettings.find(s => s.target === target);
      if (!setting) { setting = { target }; h.calculation.animationSettings.push(setting); }
      setting[key] = value;
    },
    updateEffect(effect) { h.calculation.effects.push(effect); },
    setStage(key, value) { h.calculation[key] = value; },
    setFreeFigureByKey(figure) {
      h.calculation.freeFigure = h.calculation.freeFigure.filter(f => f.key !== figure.key);
      if (figure.name) h.calculation.freeFigure.push(figure);
    },
    setLive2dMotion() {}, setLive2dExpression() {}, setLive2dBlink() {}, setLive2dFocus() {}, setFigureMetaData() {},
  });
});
function clocked(run) {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  let now = 0, id = 0;
  const jobs = new Map(), captured = [];
  globalThis.setTimeout = (callback, delay = 0) => {
    const token = ++id;
    jobs.set(token, { at: now + Number(delay), callback }); captured.push(callback); return token;
  };
  globalThis.clearTimeout = token => jobs.delete(token);
  const clock = {
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...jobs].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        const [token, job] = next; jobs.delete(token); now = job.at; job.callback();
      }
      now = end;
    },
    jobs, captured,
  };
  try { run(clock); } finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
}

test('two completed animations waiting behind one nobreak wait advance only once', () => clocked(clock => {
  const controller = new PerformController();
  controller.arrangeNewPerform(perform('left', { duration: 20 }), script(true));
  controller.arrangeNewPerform(perform('right', { duration: 40 }), script(true));
  controller.arrangeNewPerform(perform('wait', { duration: 100, goNextWhenOver: true, blockingNext: () => true }), script());
  clock.tick(300);
  assert.equal(h.next, 1);
  assert.equal(clock.jobs.size, 0);
}));

test('batch name unmount finishes cleanup before its one continuation can install a replacement', () => clocked(clock => {
  const controller = new PerformController();
  controller.arrangeNewPerform(perform('figure#one'), script(true));
  controller.arrangeNewPerform(perform('figure#two'), script(true));
  h.continue = () => {
    h.next++;
    assert.equal(controller.performList.length, 0);
    assert.equal(h.state.length, 0);
    if (h.next === 1) controller.arrangeNewPerform(perform('figure#new'), script());
  };
  controller.unmountPerform('figure', true);
  assert.equal(h.next, 1);
  assert.deepEqual(controller.performList.map(p => p.performName), ['figure#new']);
  assert.deepEqual(h.state.map(p => p.id), ['figure#new']);
  controller.removeAllPerform();
}));

test('prefix unmount advances once after all matching performs are removed', () => clocked(() => {
  const controller = new PerformController();
  controller.arrangeNewPerform(perform('animation-left'), script(true));
  controller.arrangeNewPerform(perform('animation-right'), script(true));
  h.continue = () => { h.next++; assert.equal(controller.performList.length, 0); assert.equal(h.state.length, 0); };
  controller.unmountPerformByPrefix('animation-', true);
  assert.equal(h.next, 1);
}));

test('reset inside startFunction cannot leave a live perform or timer', () => clocked(clock => {
  const controller = new PerformController();
  const p = perform('cancel-on-start', { startFunction() { controller.removeAllPerform(); } });
  controller.arrangeNewPerform(p, script(true));
  assert.equal(controller.performList.length, 0);
  assert.deepEqual(h.stopped, ['cancel-on-start']);
  assert.equal(clock.jobs.size, 0);
}));

test('reset during pending commit prevents later pending starts', () => clocked(clock => {
  const controller = new PerformController();
  controller.beginCollectingPerforms();
  controller.arrangeNewPerform(perform('first', { startFunction() { controller.removeAllPerform(); } }), script());
  controller.arrangeNewPerform(perform('stale'), script());
  controller.endCollectingPerforms();
  controller.commitPendingPerforms();
  assert.deepEqual(h.started, []);
  assert.equal(controller.performList.length, 0);
  assert.equal(clock.jobs.size, 0);
}));

test('stop callback reentry cannot stop one object twice or remove a new perform', () => clocked(() => {
  const controller = new PerformController(); let stops = 0;
  const p = perform('old', { stopFunction() { stops++; assert.equal(stops, 1); controller.softUnmountPerformObject(p); } });
  controller.arrangeNewPerform(p, script());
  controller.softUnmountPerformObject(p);
  assert.equal(stops, 1);
  assert.equal(controller.performList.length, 0);
}));

test('reset cancels a blocked continuation including a late queued callback', () => clocked(clock => {
  const controller = new PerformController();
  controller.arrangeNewPerform(perform('continue', { duration: 10 }), script(true));
  controller.arrangeNewPerform(perform('blocker', { isHoldOn: true, blockingNext: () => true }), script());
  clock.tick(10);
  const late = clock.captured.at(-1);
  controller.removeAllPerform();
  late(); clock.tick(1000);
  assert.equal(h.next, 0);
  assert.equal(clock.jobs.size, 0);
}));

test('new calculation batch invalidates a previously blocked continuation', () => clocked(clock => {
  const controller = new PerformController();
  controller.arrangeNewPerform(perform('continue', { duration: 10 }), script(true));
  const blocker = perform('blocker', { isHoldOn: true, blockingNext: () => true });
  controller.arrangeNewPerform(blocker, script()); clock.tick(10);
  const late = clock.captured.at(-1);
  controller.beginCollectingPerforms(); controller.endCollectingPerforms();
  controller.unmountPerform('blocker', true);
  late(); clock.tick(1000);
  assert.equal(h.next, 0);
  assert.equal(clock.jobs.size, 0);
}));

test('natural completion retains hold performs and honors script continue', () => clocked(clock => {
  const controller = new PerformController();
  controller.arrangeNewPerform(perform('hold', { duration: 10, isHoldOn: true }), script());
  controller.arrangeNewPerform(perform('transient', { duration: 20 }), script(true));
  clock.tick(30);
  assert.equal(h.next, 1);
  assert.deepEqual(controller.performList.map(p => p.performName), ['hold']);
  assert.deepEqual(h.stopped, ['transient']);
  controller.removeAllPerform();
}));

test('user settle skips protected performs and consumes only one continuation', () => clocked(() => {
  const controller = new PerformController();
  controller.arrangeNewPerform(perform('left'), script(true));
  controller.arrangeNewPerform(perform('right'), script(true));
  controller.arrangeNewPerform(perform('protected', { skipNextCollect: true }), script());
  controller.settleNonHoldPerforms(true);
  assert.equal(h.next, 1);
  assert.deepEqual(controller.performList.map(p => p.performName), ['protected']);
  controller.removeAllPerform();
}));

test('replacement while calculating a new sentence cannot recursively advance it', () => clocked(() => {
  const controller = new PerformController();
  controller.arrangeNewPerform(perform('animation-left'), script(true));
  controller.beginCollectingPerforms();
  controller.unmountPerform('animation-left', true);
  controller.arrangeNewPerform(perform('animation-left'), script());
  controller.endCollectingPerforms(); controller.commitPendingPerforms();
  assert.equal(h.next, 0);
  assert.equal(controller.performList.length, 1);
  controller.removeAllPerform();
}));

test('a synchronous startup failure is cleaned up before it propagates', () => clocked(clock => {
  const controller = new PerformController();
  const p = perform('failure', { startFunction() { throw new Error('start failed'); } });
  assert.throws(() => controller.arrangeNewPerform(p, script()), /start failed/);
  assert.equal(controller.performList.length, 0);
  assert.equal(h.state.length, 0);
  assert.equal(clock.jobs.size, 0);
  assert.deepEqual(h.stopped, ['failure']);
}));

for (const [kind, handler, target] of [['background', changeBg, 'bg-main'], ['figure', changeFigure, 'fig-center']]) {
  for (const exitDuration of [100, 1200]) {
    test(`${kind} enter timing remains 600ms with a ${exitDuration}ms custom exit`, () => clocked(clock => {
      const controller = new PerformController(); h.WebGAL.gameplay.performController = controller;
      h.animations.push(
        { name: 'entrance', effects: [{ alpha: 0, duration: 0 }, { alpha: 1, duration: 600 }] },
        { name: 'departure', effects: [{ alpha: 1, duration: 0 }, { alpha: 0, duration: exitDuration }] },
      );
      const sentence = { content: 'image.png', args: [{ key: 'enter', value: 'entrance' }, { key: 'exit', value: 'departure' }] };
      const p = handler(sentence);
      assert.equal(p.duration, 600);
      controller.arrangeNewPerform(p, sentence);
      assert.equal(h.registered[0].animation.duration, 600);
      assert.equal(h.registered[0].target, target);
      clock.tick(599);
      assert.equal(controller.performList.length, 1);
      assert.equal(h.removedAnimations.length, 0);
      clock.tick(1);
      assert.equal(controller.performList.length, 0);
      assert.deepEqual(h.removedAnimations, [`${target}-softin`]);
      assert.equal(h.calculation.animationSettings.find(s => s.target === target).exitAnimationName, 'departure');
    }));
  }
}

test('base animation completion preserves a still-running parallel animation in saved stage state', () => clocked(clock => {
  const controller = new PerformController();
  controller.arrangeNewPerform(perform('animation-left', { duration: 100 }), script());
  controller.arrangeNewPerform(perform('animation-left#parallel', { duration: 1000 }), script());
  clock.tick(100);
  assert.deepEqual(controller.performList.map(p => p.performName), ['animation-left#parallel']);
  assert.deepEqual(h.state.map(p => p.id), ['animation-left#parallel']);
  controller.removeAllPerform();
}));

test('non-force batch removal retains held parallel animation both live and in saved state', () => clocked(() => {
  const controller = new PerformController();
  controller.arrangeNewPerform(perform('animation-left'), script());
  controller.arrangeNewPerform(perform('animation-left#held', { isHoldOn: true }), script());
  controller.unmountPerform('animation-left');
  assert.deepEqual(controller.performList.map(p => p.performName), ['animation-left#held']);
  assert.deepEqual(h.state.map(p => p.id), ['animation-left#held']);
  controller.removeAllPerform();
}));

// Native setAnimation and PerformController are real; the renderer is a boundary
// double. These assert timing/effects/lifecycle, not visible interpolation.
function animationCase(args = []) {
  const controller = new PerformController();
  h.WebGAL.gameplay.performController = controller;
  h.animations.push({ name: 'move', effects: [
    { position: { x: 0 }, duration: 0, ease: 'linear' },
    { position: { x: 180 }, duration: 3000, ease: 'linear' },
  ] });
  const sentence = { content: 'move', args: [{ key: 'target', value: 'hero' }, ...args] };
  const p = setAnimation(sentence);
  controller.arrangeNewPerform(p, sentence);
  return { controller, p };
}

for (const next of [false, true]) {
  test(`native finite animation next=${next} keeps its duration and never adds an end continuation`, () => clocked(clock => {
    const { controller, p } = animationCase([{ key: 'next', value: next }]);
    assert.equal(p.duration, 3000);
    assert.equal(p.isHoldOn, false);
    assert.equal(p.blockingAuto(), true);
    assert.equal(h.registered[0].target, 'hero');
    assert.deepEqual(h.calculation.effects.at(-1).transform.position, { x: 180 });
    assert.equal(Object.hasOwn(h.calculation.effects.at(-1).transform, 'alpha'), false);
    clock.tick(2999);
    assert.equal(controller.hasUnsettledNonHoldPerform(), true);
    clock.tick(1);
    assert.equal(controller.hasUnsettledNonHoldPerform(), false);
    assert.deepEqual(h.removedAnimations, ['hero-move-3000']);
    assert.equal(h.next, 0);
  }));
}

test('early native animation settlement removes its timer and stale completion cannot advance twice', () => clocked(clock => {
  const { controller } = animationCase([{ key: 'continue', value: true }]);
  const stale = clock.captured.at(-1);
  clock.tick(500);
  controller.settleNonHoldPerforms(true);
  assert.equal(h.next, 1);
  assert.equal(controller.performList.length, 0);
  stale(); clock.tick(5000);
  assert.equal(h.next, 1);
  assert.deepEqual(h.removedAnimations, ['hero-move-3000']);
}));

test('ordinary native animation replaces ordinary and parallel performs only for its target', () => clocked(clock => {
  const controller = new PerformController(); h.WebGAL.gameplay.performController = controller;
  controller.arrangeNewPerform(perform('animation-hero'), script());
  controller.arrangeNewPerform(perform('animation-hero#other'), script());
  controller.arrangeNewPerform(perform('animation-someone'), script());
  h.animations.push({ name: 'move', effects: [{ position: { x: 180 }, duration: 3000 }] });
  const sentence = { content: 'move', args: [{ key: 'target', value: 'hero' }] };
  controller.arrangeNewPerform(setAnimation(sentence), sentence);
  assert.deepEqual(h.stopped, ['animation-hero', 'animation-hero#other']);
  assert.deepEqual(controller.performList.map(p => p.performName), ['animation-someone', 'animation-hero']);
  controller.removeAllPerform(); clock.tick(5000);
  assert.equal(controller.performList.length, 0);
  assert.equal(h.next, 0);
}));

test('native unknown animation does not register a visual or fabricate an end effect', () => clocked(clock => {
  const controller = new PerformController(); h.WebGAL.gameplay.performController = controller;
  const sentence = { content: 'missing', args: [{ key: 'target', value: 'hero' }] };
  const p = setAnimation(sentence); controller.arrangeNewPerform(p, sentence);
  assert.equal(p.duration, 0);
  assert.equal(h.registered.length, 0);
  assert.equal(h.calculation.effects.length, 0);
  clock.tick(0);
  assert.equal(controller.performList.length, 0);
}));

test('closing a native custom figure cancels its animation and late timer cannot revive it', () => clocked(clock => {
  h.calculation.freeFigure = [{ key: 'hero', basePosition: 'right', name: 'hero.svg' }];
  const { controller } = animationCase();
  const late = clock.captured.at(-1);
  changeFigure({ content: '', args: [{ key: 'id', value: 'hero' }] });
  assert.equal(controller.performList.length, 0);
  assert.equal(h.calculation.freeFigure.some(f => f.key === 'hero'), false);
  const count = h.registered.length;
  late(); clock.tick(5000);
  assert.equal(h.registered.length, count);
  assert.equal(h.next, 0);
  assert.deepEqual(h.removedAnimations, ['hero-move-3000']);
}));
