import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { SaveDataNotice } = await import(pathToFileURL(process.env.PREVIEW_NOTICE_TEST_BUNDLE));
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

// Match the repository's TSX hook/event boundary tests: execute real component
// callbacks, retain hook slots across renders and run subscription cleanups.
class Hooks {
  slots = []; index = 0; pending = []; writes = 0;
  state(initial) {
    const i = this.index++;
    if (!(i in this.slots)) this.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [this.slots[i], next => {
      this.writes++;
      this.slots[i] = typeof next === 'function' ? next(this.slots[i]) : next;
    }];
  }
  ref(value) {
    const i = this.index++;
    return this.slots[i] ?? (this.slots[i] = { current: value });
  }
  effect(callback, deps) {
    const i = this.index++;
    if (same(this.slots[i]?.deps, deps)) return;
    const previous = this.slots[i];
    const slot = this.slots[i] = { deps, effect: true };
    this.pending.push(() => { previous?.cleanup?.(); slot.cleanup = callback(); });
  }
  render() {
    this.index = 0;
    globalThis.__previewNoticeHooks = this;
    return SaveDataNotice();
  }
  commit() { for (const callback of this.pending.splice(0)) callback(); }
  unmount() { for (const slot of this.slots) if (slot?.effect) slot.cleanup?.(); }
}

function find(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) { const match = find(child, predicate); if (match) return match; }
    return;
  }
  if (node == null || typeof node !== 'object') return;
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
const preview = tree => find(tree, node => node.props.role === 'status' && node.props['aria-label'] === '作者预览状态');
const error = tree => find(tree, node => node.props.role === 'alert');

function harness(initial = {}) {
  let current = { preview: false, error: '', scope: null, message: '', ...initial };
  const listeners = new Set();
  const store = {
    subscriptions: 0, cleanups: 0, dismissals: 0,
    get: () => ({ ...current }),
    publish(value) { current = { ...current, ...value }; for (const listener of listeners) listener(); },
    // Models an update between render and effect registration, without an event.
    replaceBeforeSubscribe(value) { current = { ...current, ...value }; },
    subscribe(listener) {
      store.subscriptions++; listeners.add(listener);
      return () => { store.cleanups++; listeners.delete(listener); };
    },
    clearError() { store.dismissals++; store.publish({ error: '' }); },
  };
  globalThis.__previewNoticeStore = store;
  const hooks = new Hooks();
  const render = () => { const tree = hooks.render(); hooks.commit(); return tree; };
  render();
  return { hooks, store, listeners, render };
}

test('normal playback with no storage error has no notice', () => {
  const h = harness();
  assert.equal(h.render(), null);
  assert.equal(h.listeners.size, 1);
  h.hooks.unmount();
});

test('preview status is visible without an error and explains isolation and recovery', () => {
  const h = harness({ preview: true });
  const tree = h.render();
  assert.ok(preview(tree));
  assert.equal(error(tree), undefined);
  assert.match(text(preview(tree)), /作者预览/);
  assert.match(text(preview(tree)), /存读档已隔离/);
  assert.match(text(preview(tree)), /刷新游戏.*标题正常开始/);
  h.hooks.unmount();
});

test('entering preview after mounting updates the notice through its subscription', () => {
  const h = harness();
  h.store.publish({ preview: true });
  assert.ok(preview(h.render()));
  assert.equal(h.store.subscriptions, 1, 'rerenders must not add subscriptions');
  h.hooks.unmount();
});

test('dismissing a storage error preserves the independent preview status', () => {
  const h = harness({ preview: true, error: '作者预览期间无法快速读档' });
  const tree = h.render();
  assert.match(text(error(tree)), /无法快速读档/);
  const dismiss = find(error(tree), node => node.type === 'button' && text(node) === '知道了');
  assert.ok(dismiss);
  dismiss.props.onClick();
  const next = h.render();
  assert.equal(h.store.dismissals, 1);
  assert.equal(error(next), undefined);
  assert.ok(preview(next));
  h.hooks.unmount();
});

test('a normal playback error can be dismissed without creating a preview notice', () => {
  const h = harness({ error: '存档写入失败' });
  const tree = h.render();
  assert.equal(preview(tree), undefined);
  find(error(tree), node => node.type === 'button').props.onClick();
  assert.equal(h.render(), null);
  h.hooks.unmount();
});

test('the initial effect catches a preview change that occurred before subscription', () => {
  const h = harness();
  h.hooks.unmount();
  const fresh = new Hooks();
  assert.equal(fresh.render(), null);
  h.store.replaceBeforeSubscribe({ preview: true });
  fresh.commit();
  assert.ok(preview(fresh.render()));
  fresh.unmount();
});

test('remounting the notice reads the current preview state and replaces its subscription', () => {
  const h = harness();
  h.hooks.unmount();
  h.store.publish({ preview: true });
  const fresh = new Hooks();
  assert.ok(preview(fresh.render()));
  fresh.commit();
  assert.equal(h.listeners.size, 1);
  assert.equal(h.store.subscriptions, 2);
  assert.equal(h.store.cleanups, 1);
  fresh.unmount();
});

for (const eventName of ['onPointerDown', 'onClick', 'onDoubleClick']) {
  test(`preview ${eventName} stops propagation to the game advance surface`, () => {
    const h = harness({ preview: true });
    const badge = preview(h.render());
    let stopped = false;
    let advances = 0;
    badge.props[eventName]?.({ stopPropagation() { stopped = true; } });
    if (!stopped) advances++;
    assert.equal(advances, 0);
    assert.equal(h.store.dismissals, 0);
    assert.ok(preview(h.render()));
    h.hooks.unmount();
  });
}

test('unmounting removes the listener and subsequent updates cannot write stale hook state', () => {
  const h = harness({ preview: true });
  const writes = h.hooks.writes;
  h.hooks.unmount();
  assert.equal(h.listeners.size, 0);
  assert.equal(h.store.cleanups, 1);
  h.store.publish({ error: 'late error' });
  assert.equal(h.hooks.writes, writes);
});
