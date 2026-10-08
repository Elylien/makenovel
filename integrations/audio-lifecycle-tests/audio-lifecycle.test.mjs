import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let imports = 0;
function audio(name) {
  const listeners = new Map();
  return { name, src: name, currentTime: 0, volume: 1, plays: 0, pauses: 0, removes: 0,
    play() { this.plays++; return this.playResult ?? Promise.resolve(); },
    pause() { this.pauses++; }, remove() { this.removes++; },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); },
    emit(type) { listeners.get(type)?.(); this[`on${type}`]?.(); },
    callback(type) { return listeners.get(type) ?? this[`on${type}`]; } };
}
function clock() {
  let id = 0;
  const tasks = new Map();
  return { tasks, set(interval, callback, delay) { tasks.set(++id, { interval, callback, delay }); return id; },
    clear(id) { tasks.delete(id); },
    invoke(delay) { const task = [...tasks].find(([, task]) => task.delay === delay);
      assert.ok(task, `expected timer ${delay}`); if (!task[1].interval) tasks.delete(task[0]); return task[1].callback(); },
    count(delay) { return [...tasks.values()].filter(task => task.delay === delay).length; } };
}
async function fixture({ animate = true } = {}) {
  const ctx = { events: [], clock: clock(), current: audio('voice.ogg'), created: [], running: [], sources: [],
    state: { freeFigure: [], figureAssociatedAnimation: animate ? [{ targetId: 'fig-center' }] : [],
      bgm: { src: 'bgm.ogg', enter: 0, volume: 100 }, vocalVolume: 100, playVocal: 'voice.ogg', uiSe: '' },
    options: { volumeMain: 100, vocalVolume: 100, bgmVolume: 100, seVolume: 100, uiSeVolume: 50 },
    GUI: { showTitle: false, titleBgm: 'title.ogg', isEnterGame: true } };
  ctx.stage = { getCalculationStageState: () => ctx.state, setStage(key, value) { ctx.state[key] = value; },
    setStageAndCommit(key, value) { ctx.events.push(['stage', key, value]); ctx.state[key] = value; } };
  ctx.store = { getState: () => ({ userData: { optionData: ctx.options }, GUI: ctx.GUI }) };
  const controller = { unmountPerform(name, force = false) { ctx.events.push(['unmount', name, force]);
    const matches = ctx.running.filter(p => p.performName === name && (force || !p.isHoldOn));
    ctx.running = ctx.running.filter(p => !matches.includes(p)); for (const p of matches) p.stopFunction(); } };
  ctx.WebGAL = { gameplay: { performController: controller, pixiStage: {
    performBlinkAnimation: (...args) => ctx.events.push(['blink', ...args]),
    performMouthSyncAnimation: (...args) => ctx.events.push(['mouth', ...args]), setModelMouthY() {} } } };
  const bound = new WeakSet();
  class FakeAudioContext {
    state = 'running'; destination = {};
    constructor() { if (ctx.contextError) throw ctx.contextError; ctx.context = this; }
    async resume() { await ctx.resume.promise; this.state = 'running'; }
    createAnalyser() { return { frequencyBinCount: 8, connect() {}, getByteFrequencyData() {} }; }
    createMediaElementSource(element) {
      if (ctx.sourceError) throw ctx.sourceError;
      if (bound.has(element)) throw new Error('media element already bound');
      bound.add(element); const source = { mediaElement: element, connect() {}, disconnect() {} }; ctx.sources.push(source); return source;
    }
  }
  ctx.AudioContext = FakeAudioContext;
  globalThis.__audioTest = ctx;
  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.document = { getElementById: id => id === 'currentBgm' ? ctx.bgm : ctx.current,
    createElement() { const element = audio('effect'); ctx.created.push(element); return element; } };
  const id = ++imports;
  const load = name => import(`${pathToFileURL(path.join(process.env.AUDIO_TEST_BUNDLE, `${name}.mjs`))}?${id}`);
  const { playVocal } = await load('vocal'), { playEffect } = await load('effect');
  const sentence = (content, args = {}) => ({ content, args: Object.entries(args).map(([key, value]) => ({ key, value })) });
  const start = p => { ctx.running.push(p); p.startFunction?.(); return p; };
  const voice = () => start(playVocal(sentence('dialog', { vocal: 'voice.ogg' })));
  const effect = args => start(playEffect(sentence('effect.ogg', args)));
  const stop = p => { ctx.running = ctx.running.filter(value => value !== p); p.stopFunction(); };
  return { ctx, voice, effect, stop, load, start, sentence, playEffect };
}

test('voice stopped before its deferred DOM start never plays', async () => {
  const { ctx, voice, stop } = await fixture(); const p = voice(); stop(p);
  assert.equal(ctx.clock.count(1), 0); assert.equal(ctx.current.plays, 0);
});

test('stopping while AudioContext resumes cannot revive sound, lip sync or blinking', async () => {
  const { ctx, voice, stop } = await fixture(); ctx.resume = deferred();
  ctx.AudioContext.prototype.state = 'suspended';
  window.AudioContext = class extends ctx.AudioContext { state = 'suspended'; };
  const p = voice(); const pending = ctx.clock.invoke(1); await tick(); stop(p);
  const blinkCount = ctx.events.filter(e => e[0] === 'blink').length;
  ctx.resume.resolve(); await pending; await tick();
  assert.equal(ctx.current.plays, 0); assert.equal(ctx.clock.count(50), 0);
  assert.equal(ctx.events.filter(e => e[0] === 'blink').length, blinkCount);
});

test('old voice playback rejection cannot unmount a replacement voice', async () => {
  const { ctx, voice } = await fixture({ animate: false });
  const rejected = deferred(); ctx.current.playResult = rejected.promise; voice(); await ctx.clock.invoke(1);
  ctx.current = audio('replacement.ogg'); const replacement = voice(); await ctx.clock.invoke(1);
  rejected.reject(new Error('late browser denial')); await tick();
  assert.ok(ctx.running.includes(replacement)); assert.equal(ctx.current.pauses, 0);
});

test('a stopped voice pauses only the audio element it captured', async () => {
  const { ctx, voice, stop } = await fixture({ animate: false }); const original = ctx.current;
  const p = voice(); await ctx.clock.invoke(1); ctx.current = audio('restored.ogg'); stop(p);
  assert.equal(original.pauses, 1); assert.equal(ctx.current.pauses, 0);
});

test('voice rejection releases auto blocking and allows a later retry', async () => {
  const { ctx, voice } = await fixture({ animate: false }); ctx.current.playResult = Promise.reject(new Error('blocked'));
  const p = voice(); await ctx.clock.invoke(1); await tick();
  assert.equal(p.blockingAuto(), false); assert.ok(!ctx.running.includes(p));
  ctx.current.playResult = Promise.resolve(); const retry = voice(); await ctx.clock.invoke(1);
  assert.ok(ctx.running.includes(retry)); assert.equal(ctx.current.plays, 2);
});

test('missing voice element finishes instead of retaining a one hour perform', async () => {
  const { ctx, voice } = await fixture(); ctx.current = null; const p = voice(); await ctx.clock.invoke(1);
  assert.equal(p.blockingAuto(), false); assert.ok(!ctx.running.includes(p));
});

for (const failure of ['contextError', 'sourceError']) test(`${failure} is handled and does not block auto`, async () => {
  const { ctx, voice } = await fixture(); ctx[failure] = new Error(failure); const p = voice();
  await assert.doesNotReject(async () => { await ctx.clock.invoke(1); await tick(); });
  assert.equal(p.blockingAuto(), false); assert.ok(!ctx.running.includes(p));
});

test('reusing an earlier audio DOM element reconnects its existing WebAudio source', async () => {
  const { ctx, voice, stop } = await fixture(); const first = ctx.current;
  const p = voice(); await ctx.clock.invoke(1); stop(p);
  ctx.current = audio('second.ogg'); const second = voice(); await ctx.clock.invoke(1); stop(second);
  ctx.current = first; const replay = voice(); await assert.doesNotReject(async () => { await ctx.clock.invoke(1); });
  assert.equal(ctx.sources.length, 2); assert.equal(first.plays, 2); assert.ok(ctx.running.includes(replay));
});

for (const loop of [false, true]) test(`SE play rejection releases ${loop ? 'looping' : 'ordinary'} perform`, async () => {
  const { ctx, effect } = await fixture();
  document.createElement = () => { const element = audio('effect'); element.playResult = Promise.reject(new Error('blocked')); ctx.created.push(element); return element; };
  const p = effect(loop ? { id: 'rain' } : {}); await tick();
  assert.equal(p.blockingAuto(), false); assert.ok(!ctx.running.includes(p)); assert.equal(ctx.created[0].removes, 1);
});

test('SE stale error and ended callbacks cannot stop a replacement with the same id', async () => {
  const { ctx, effect } = await fixture(); effect({ id: 'rain' });
  const old = ctx.created[0], error = old.callback('error'), ended = old.callback('ended');
  const replacement = effect({ id: 'rain' }); error(); ended(); await tick();
  assert.ok(ctx.running.includes(replacement)); assert.equal(ctx.created[1].pauses, 0);
});

test('ordinary SE late rejection cannot stop a replacement sound', async () => {
  const { ctx, effect } = await fixture(); const rejected = deferred();
  document.createElement = () => { const element = audio('effect'); element.playResult = rejected.promise; ctx.created.push(element); return element; };
  effect(); await tick();
  document.createElement = () => { const element = audio('replacement'); ctx.created.push(element); return element; };
  const replacement = effect(); await tick(); rejected.reject(new Error('late denial')); await tick();
  assert.ok(ctx.running.includes(replacement)); assert.equal(ctx.created[1].pauses, 0);
});

test('voice media error releases auto blocking and cancelled blinking settles open', async () => {
  const { ctx, voice } = await fixture(); const p = voice(); await ctx.clock.invoke(1); ctx.current.emit('error');
  assert.equal(p.blockingAuto(), false); assert.ok(!ctx.running.includes(p));
  assert.equal(ctx.events.filter(e => e[0] === 'blink').at(-1)[3], 'open');
  assert.equal(ctx.clock.count(200), 0); assert.equal(ctx.clock.count(50), 0);
});

test('ordinary SE end clears its perform and audio exactly once', async () => {
  const { ctx, effect } = await fixture(); const p = effect(); const ended = ctx.created[0].callback('ended'); ended(); ended();
  assert.equal(p.blockingAuto(), false); assert.ok(!ctx.running.includes(p)); assert.equal(ctx.created[0].removes, 1);
});

async function containerFixture() {
  const f = await fixture(); const { ctx } = f; ctx.bgm = audio('bgm.ogg');
  let cursor = 0; const slots = [], effects = [];
  ctx.react = {
    ref(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    state(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, next => { slots[i].value = next; }]; },
    effect(callback, deps) { const i = cursor++, previous = slots[i];
      if (!previous || deps.some((dep, index) => dep !== previous.deps[index])) {
        effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; });
      }
    },
  };
  const { AudioContainer } = await f.load('container');
  const render = () => { cursor = 0; AudioContainer(); effects.splice(0).forEach(effect => effect()); };
  const unmount = () => { slots.forEach(slot => slot.cleanup?.()); };
  return { ...f, render, unmount };
}

test('BGM fade callbacks cannot clear a newly selected track before React cleanup runs', async () => {
  const { ctx, render } = await containerFixture(); ctx.state.bgm.enter = -20; render(); await tick();
  ctx.clock.invoke(10); ctx.state.bgm = { src: 'new.ogg', enter: 0, volume: 60 };
  ctx.clock.invoke(10);
  assert.equal(ctx.state.bgm.src, 'new.ogg'); assert.equal(ctx.events.filter(e => e[0] === 'stage' && e[1] === 'bgm').length, 0);
});

test('BGM effect cleanup cancels fade callbacks on component unmount', async () => {
  const { ctx, render, unmount } = await containerFixture(); ctx.state.bgm.enter = 40; render();
  assert.equal(ctx.clock.count(10), 1); unmount(); assert.equal(ctx.clock.count(10), 0);
});

test('restoring an identical BGM starts a new fade and invalidates the old request', async () => {
  const { ctx, render } = await containerFixture(); ctx.state.bgm.enter = -20; render(); await tick(); ctx.clock.invoke(10);
  const oldTick = [...ctx.clock.tasks.values()].find(task => task.delay === 10).callback;
  ctx.state.bgm = { ...ctx.state.bgm }; oldTick(); assert.equal(ctx.state.bgm.src, 'bgm.ogg');
  render(); assert.equal(ctx.bgm.volume, 1); ctx.clock.invoke(10); assert.equal(ctx.bgm.volume, 0.5);
});

test('BGM fade out reaches zero then clears only its own stage track', async () => {
  const { ctx, render } = await containerFixture(); ctx.state.bgm.enter = -20; render(); await tick();
  ctx.clock.invoke(10); assert.equal(ctx.bgm.volume, 0.5); ctx.clock.invoke(10);
  assert.equal(ctx.bgm.volume, 0); assert.equal(ctx.state.bgm.src, ''); assert.equal(ctx.clock.count(10), 0);
});

test('muted BGM fade out also clears its own stage track', async () => {
  const { ctx, render } = await containerFixture(); ctx.options.volumeMain = 0; ctx.state.bgm.enter = -20; render();
  if (ctx.clock.count(10)) ctx.clock.invoke(10);
  assert.equal(ctx.state.bgm.src, '');
});

test('UI sound rejection is observed and releases the transient audio', async () => {
  const { ctx, render } = await containerFixture(); ctx.state.uiSe = 'click.ogg';
  document.createElement = () => { const element = audio('click'); element.playResult = Promise.reject(new Error('UI denied')); ctx.created.push(element); return element; };
  render(); await tick(); assert.equal(ctx.created[0].removes, 1); assert.equal(ctx.created[0].pauses, 1);
});

test('UI sound error and unmount release audio without stopping it when uiSe resets', async () => {
  const { ctx, render, unmount } = await containerFixture(); ctx.state.uiSe = 'click.ogg'; render(); await tick();
  render(); assert.equal(ctx.created[0].pauses, 0); ctx.created[0].emit('error'); assert.equal(ctx.created[0].removes, 1);
  ctx.state.uiSe = 'another.ogg'; render(); await tick(); unmount();
  assert.equal(ctx.created[1].pauses, 1); assert.equal(ctx.created[1].removes, 1);
});

test('opening a menu preserves the native BGM and current voice playback', async () => {
  const { ctx, render } = await containerFixture(); render(); await tick();
  ctx.GUI.showMenuPanel = true; render(); await tick();
  assert.equal(ctx.bgm.pauses, 0); assert.equal(ctx.current.pauses, 0);
});
