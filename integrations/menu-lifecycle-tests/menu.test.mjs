import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

let id = 0;
async function setup() {
  const listeners = new Set();
  const h = {
    GUI: {}, epoch: 0, forward: 0, commits: 0, input: 0, blocking: false, unsettled: false,
    store: { getState: () => ({ GUI: h.GUI }), subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
    stage: { commit() { h.commits++; }, applyCommittedPixiEffects() {} },
    WebGAL: {
      sceneManager: { lockSceneWrite: false, sceneData: { currentSentenceId: 10, currentScene: {} }, getSessionEpoch: () => h.epoch, isSessionCurrent: epoch => epoch === h.epoch },
      events: { userInteractNext: { emit() { h.input++; } } },
      flowchartManager: { unlockPendingCurrentScene() {} },
      gameplay: { performController: {
        hasBlockingNextPerform: () => h.blocking, hasUnsettledNonHoldPerform: () => h.unsettled,
        settleNonHoldPerforms() { h.unsettled = false; }, discardUncommittedNonHoldPerforms() {},
        clearNonHoldPerformsFromStageState() {}, beginCollectingPerforms() {}, endCollectingPerforms() {}, commitPendingPerforms() {},
      } },
    },
    change(values) { Object.assign(h.GUI, values); for (const fn of [...listeners]) fn(); },
    listeners,
  };
  globalThis.__menuHarness = h;
  const runtime = await import(pathToFileURL(process.env.MENU_TEST_BUNDLE).href + '?' + ++id);
  return { h, ...runtime };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const panel of ['showMenuPanel', 'showBacklog', 'showFlowchart', 'showGlobalDialog', 'showPanicOverlay', 'showExtra']) {
  test(`${panel}: internal completion waits and resumes only once after close`, async () => {
    const { h, continueSentence, hasDeferredStoryContinue } = await setup();
    h.change({ [panel]: true });
    continueSentence(); continueSentence();
    assert.equal(hasDeferredStoryContinue(), true);
    assert.equal(h.forward, 0);
    h.change({ [panel]: false }); await tick();
    assert.equal(h.forward, 1); assert.equal(h.commits, 1);
    assert.equal(hasDeferredStoryContinue(), false);
    assert.equal(h.listeners.size, 0);
  });
}
test('menu input cannot emit user-next or settle active performances', async () => {
  const { h, nextSentence } = await setup();
  h.unsettled = true; h.change({ showMenuPanel: true }); nextSentence();
  assert.equal(h.input, 0); assert.equal(h.unsettled, true); assert.equal(h.forward, 0);
  h.change({ showMenuPanel: false }); await tick(); assert.equal(h.forward, 0);
});
test('nested panels keep the deferred continuation until all close', async () => {
  const { h, continueSentence } = await setup();
  h.change({ showMenuPanel: true, showGlobalDialog: true }); continueSentence();
  h.change({ showGlobalDialog: false }); await tick(); assert.equal(h.forward, 0);
  h.change({ showMenuPanel: false }); await tick(); assert.equal(h.forward, 1);
});
test('title cancels a pending continuation permanently', async () => {
  const { h, continueSentence } = await setup();
  h.change({ showMenuPanel: true }); continueSentence();
  h.change({ showTitle: true }); h.change({ showTitle: false, showMenuPanel: false }); await tick();
  assert.equal(h.forward, 0); assert.equal(h.listeners.size, 0);
});
test('restore or new session invalidates a pending continuation', async () => {
  const { h, continueSentence } = await setup();
  h.change({ showMenuPanel: true }); continueSentence(); h.epoch++;
  h.change({ showMenuPanel: false }); await tick(); assert.equal(h.forward, 0);
});
test('changed sentence position discards old completion', async () => {
  const { h, continueSentence } = await setup();
  h.change({ showMenuPanel: true }); continueSentence(); h.WebGAL.sceneManager.sceneData.currentSentenceId++;
  h.change({ showMenuPanel: false }); await tick(); assert.equal(h.forward, 0);
});
test('changed scene at same line discards old completion', async () => {
  const { h, continueSentence } = await setup();
  h.change({ showMenuPanel: true }); continueSentence(); h.WebGAL.sceneManager.sceneData.currentScene = {};
  h.change({ showMenuPanel: false }); await tick(); assert.equal(h.forward, 0);
});
test('manual input wins the close-panel microtask race without double advance', async () => {
  const { h, continueSentence, nextSentence } = await setup();
  h.change({ showMenuPanel: true }); continueSentence();
  h.change({ showMenuPanel: false }); nextSentence(); await tick(); assert.equal(h.forward, 1);
});
test('a newly opened panel before the microtask keeps continuation deferred', async () => {
  const { h, continueSentence } = await setup();
  h.change({ showMenuPanel: true }); continueSentence();
  h.change({ showMenuPanel: false }); h.change({ showBacklog: true }); await tick(); assert.equal(h.forward, 0);
  h.change({ showBacklog: false }); await tick(); assert.equal(h.forward, 1);
});
test('an unblocked natural continuation and ordinary click retain native behavior', async () => {
  const { h, continueSentence, nextSentence } = await setup();
  continueSentence(); nextSentence(); assert.equal(h.forward, 2); assert.equal(h.input, 1);
});
