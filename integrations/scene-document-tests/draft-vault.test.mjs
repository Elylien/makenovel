import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const { DraftVault } = await import(pathToFileURL(path.join(process.env.SCENE_DOCUMENT_TEST_BUNDLE, 'draftVault.mjs')));
const revision = 'a'.repeat(64), workspace = 'b'.repeat(64);
const raw = text => JSON.stringify({ version: 1, text, revision });
class Store {
  map = new Map();
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { this.map.set(key, value); }
  removeItem(key) { this.map.delete(key); }
}
const create = (local, session = new Store(), owner = 'one', scope = workspace, file = 'games/作品/game/scene/start.txt', now = () => 1) => new DraftVault(local, session, scope, file, owner, now);

test('closed page recovery is explicit, preserves exact BOM/mixed EOL, never writes the active file', () => {
  const local = new Store();
  const source = '\uFEFF; author  keep\r\nsay:草稿;\nsay:结尾;';
  create(local).write(raw(source));
  const reopened = create(local, new Store(), 'two');
  assert.equal(reopened.read(), null);
  assert.equal(reopened.list()[0].text, source);
  assert.equal(reopened.list()[0].revision, revision);
});
test('two simultaneous windows never overwrite or clear another owner', () => {
  const local = new Store(), a = create(local), b = create(local, new Store(), 'two');
  a.write(raw('say:A;')); b.write(raw('say:B;')); a.clear();
  const reopened = create(local, new Store(), 'three');
  assert.deepEqual(reopened.list().map(x => x.text), ['say:B;']);
});
test('refresh restores the same session while keeping the previous durable copy independent', () => {
  const local = new Store(), session = new Store();
  create(local, session).write(raw('say:刷新草稿;'));
  const refreshed = create(local, session, 'after-refresh');
  assert.equal(refreshed.read(), raw('say:刷新草稿;'));
  refreshed.write(raw('say:再次修改;'));
  refreshed.clear();
  assert.deepEqual(refreshed.list().map(x => x.text), ['say:刷新草稿;']);
});
test('workspace and scene keys isolate identical names, percent signs and nested paths', () => {
  const local = new Store(), session = new Store();
  create(local, session).write(raw('say:A;'));
  for (const [scope, file] of [['c'.repeat(64), 'games/作品/game/scene/start.txt'], [workspace, 'games/作品/game/scene/ch2.txt'], [workspace, 'games/作品/game/scene/%2Fstart.txt']]) {
    const other = create(local, session, 'other', scope, file);
    assert.equal(other.read(), null); assert.deepEqual(other.list(), []);
  }
});
test('quota failure retains the session copy and all earlier durable copies', () => {
  const local = new Store(), session = new Store();
  create(local).write(raw('say:原副本;'));
  local.setItem = () => { throw new Error('quota'); };
  const next = create(local, session, 'two');
  assert.throws(() => next.write(raw('say:最新;')), /存储不可用/);
  assert.equal(next.read(), raw('say:最新;'));
  assert.equal(next.list()[0].text, 'say:原副本;');
});
test('unavailable session storage cannot suppress a healthy durable recovery copy', () => {
  const local = new Store(), session = new Store();
  session.setItem = () => { throw new Error('quota'); };
  session.getItem = () => { throw new Error('SecurityError'); };
  const writer = create(local, session);
  assert.throws(() => writer.write(raw('say:持久副本;')), /存储不可用/);
  assert.equal(create(local, session, 'reopened').list()[0].text, 'say:持久副本;');
});
test('legacy session-only drafts require explicit selection and remain untouched', () => {
  const local = new Store(), session = new Store();
  const key = 'makenovel.scene-draft.v1:games/作品/game/scene/start.txt';
  session.setItem(key, raw('say:旧版;'));
  const vault = create(local, session);
  assert.equal(vault.read(), null);
  assert.equal(vault.list()[0].legacy, true);
  vault.clear();
  assert.equal(session.getItem(key), raw('say:旧版;'));
});
test('unavailable durable storage does not hide a readable legacy candidate', () => {
  const local = new Store(), session = new Store();
  session.setItem('makenovel.scene-draft.v1:games/作品/game/scene/start.txt', raw('say:旧版可恢复;'));
  Object.defineProperty(local, 'length', { get() { throw new Error('SecurityError'); } });
  assert.equal(create(local, session).list()[0].text, 'say:旧版可恢复;');
});
test('corrupt and unsupported durable records are not executed, removed or guessed', () => {
  const local = new Store();
  create(local).write(raw('say:original;'));
  const key = local.key(0);
  local.setItem(key, '{broken');
  assert.deepEqual(create(local, new Store(), 'two').list(), []);
  assert.equal(local.getItem(key), '{broken');
});
test('recovery list is newest first, stable for equal times', () => {
  const local = new Store();
  create(local, new Store(), 'a', workspace, 'file', () => 100).write(raw('old'));
  create(local, new Store(), 'b', workspace, 'file', () => 200).write(raw('new'));
  assert.deepEqual(create(local, new Store(), 'c', workspace, 'file').list().map(x => x.text), ['new','old']);
});
