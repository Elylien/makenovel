import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const A = `makenovel-v1:e6bc04c4-3203-4b01-a217-5a71e9b5e7cd:${'a'.repeat(64)}`;
const B = `makenovel-v1:81d40bd2-2d2e-43f1-bd3f-dc3bf0ebfe44:${'b'.repeat(64)}`;
const tick = () => new Promise(resolve => setImmediate(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let imports = 0;
async function fixture() {
  const defaults = { optionData: { speed: 50, language: 'zhCn' }, scriptManagedGlobalVar: [], globalGameVar: {},
    appreciationData: { bgm: [], cg: [] }, gameConfigInit: {}, readHistory: {} };
  const state = { userData: structuredClone(defaults), saveData: { saveData: [], quickSaveData: null } };
  const ctx = { defaults, state, WebGAL: { gameKey: A }, enabled: true, epoch: 0, errors: [], calls: [], actions: [], db: new Map() };
  ctx.store = { getState: () => state, dispatch(action) {
    ctx.actions.push(structuredClone(action));
    if (action.type === 'save') state.saveData.saveData[action.payload.index] = action.payload.saveData;
    if (action.type === 'fast') state.saveData.quickSaveData = action.payload;
    if (action.type === 'user') state.userData = action.payload;
    if (action.type.startsWith('userData/') && ctx.unlockReducer)
      state.userData = ctx.unlockReducer(state.userData, action);
  } };
  ctx.getItem = async key => { ctx.calls.push(['get', key]); return ctx.read ? ctx.read(key) : structuredClone(ctx.db.get(key) ?? null); };
  ctx.setItem = async (key, value) => {
    ctx.calls.push(['set', key, structuredClone(value)]);
    if (ctx.write) await ctx.write(key, value);
    ctx.db.set(key, structuredClone(value)); return value;
  };
  globalThis.__saveStorageTest = ctx;
  const id = ++imports;
  const saves = await import(`${pathToFileURL(path.join(process.env.SAVE_STORAGE_TEST_BUNDLE, 'saves.mjs'))}?${id}`);
  const user = await import(`${pathToFileURL(path.join(process.env.SAVE_STORAGE_TEST_BUNDLE, 'user.mjs'))}?${id}`);
  return { ctx, saves, user };
}

async function unlockFixture() {
  const fixtureResult = await fixture();
  const { ctx } = fixtureResult;
  const stage = { bgName: '', animationSettings: [], bgm: {} };
  ctx.stage = {
    getCalculationStageState: () => stage,
    setStage: (key, value) => { stage[key] = value; },
    removeEffectByTargetId() {}, removeAnimationSettingsByTarget() {}, updateAnimationSettings() {},
  };
  ctx.WebGAL.animationManager = { addAnimation() {} };
  ctx.WebGAL.gameplay = { performController: { unmountPerform() {} } };
  const unlocks = await import(`${pathToFileURL(path.join(process.env.SAVE_STORAGE_TEST_BUNDLE, 'unlocks.mjs'))}?${++imports}`);
  ctx.unlockReducer = unlocks.userDataReducer;
  return { ...fixtureResult, unlocks };
}

for (const [command, collection] of [['bgm', 'bgm'], ['changeBg', 'cg'], ['unlockBgm', 'bgm'], ['unlockCg', 'cg']]) {
  const args = [{ key: 'unlockname', value: 'Native unlock' }, { key: 'name', value: 'Native unlock' },
    { key: 'series', value: 'fixture-series' }, { key: 'order', value: 2 }];
  const sentence = { content: `${command}-asset`, args };
  test(`${command} preserves native memory unlock but never writes while preview storage is disabled`, async () => {
    const { ctx, unlocks } = await unlockFixture();
    ctx.enabled = false;
    unlocks[command](sentence);
    await tick();
    const expected = { name: 'Native unlock', url: sentence.content, series: 'fixture-series',
      ...(collection === 'cg' ? { order: 2 } : {}) };
    assert.deepEqual(ctx.state.userData.appreciationData[collection], [expected]);
    assert.deepEqual(ctx.calls, []);
    assert.deepEqual(ctx.errors, []);
  });
  test(`${command} persists its native unlock through the versioned player storage controller`, async () => {
    const { ctx, unlocks } = await unlockFixture();
    unlocks[command](sentence);
    await tick();
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0][0], 'set');
    assert.equal(ctx.calls[0][1], A);
    assert.deepEqual(ctx.db.get(A).appreciationData[collection], ctx.state.userData.appreciationData[collection]);
    assert.equal(ctx.state.userData.appreciationData[collection][0].name, 'Native unlock');
  });
}

test('normal slot failure reports UI error and does not claim a new saved value', async () => {
  const { ctx, saves } = await fixture();
  ctx.state.saveData.saveData[1] = { previous: true };
  ctx.write = async () => { throw new Error('quota failed'); };
  await assert.rejects(saves.writeSaveSlot(1, { new: true }), /quota failed/);
  assert.deepEqual(ctx.state.saveData.saveData[1], { previous: true });
  assert.deepEqual(ctx.actions, []);
  assert.ok(ctx.errors.includes('quota failed'));
});

test('fast slot failure reports and leaves previous quick-save state intact', async () => {
  const { ctx, saves } = await fixture();
  ctx.state.saveData.quickSaveData = { previous: true };
  ctx.write = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(saves.writeFastSave({ new: true }), /disk unavailable/);
  assert.deepEqual(ctx.state.saveData.quickSaveData, { previous: true });
  assert.deepEqual(ctx.actions, []);
});

test('same-slot writes are ordered, clone their input and commit only after acknowledgment', async () => {
  const { ctx, saves } = await fixture(); const first = deferred();
  ctx.write = async (_key, value) => { if (value.sequence === 1) await first.promise; };
  const input = { sequence: 1, nested: { text: 'original' } };
  const a = saves.writeSaveSlot(2, input); input.nested.text = 'mutated';
  const b = saves.writeSaveSlot(2, { sequence: 2 });
  await tick(); assert.equal(ctx.calls.length, 1); assert.deepEqual(ctx.actions, []);
  first.resolve(); await Promise.all([a, b]);
  assert.deepEqual(ctx.calls.map(c => c[2].sequence), [1, 2]);
  assert.equal(ctx.actions[0].payload.saveData.nested.text, 'original');
  assert.equal(ctx.state.saveData.saveData[2].sequence, 2);
});

test('a failed queued write does not poison later writes to that slot', async () => {
  const { ctx, saves } = await fixture();
  ctx.write = async (_key, value) => { if (value.sequence === 1) throw new Error('first failed'); };
  const first = saves.writeSaveSlot(3, { sequence: 1 });
  const second = saves.writeSaveSlot(3, { sequence: 2 });
  await assert.rejects(first, /first failed/); await second;
  assert.equal(ctx.actions.length, 1); assert.equal(ctx.state.saveData.saveData[3].sequence, 2);
});

test('old normal-slot read cannot overwrite a newer successful write', async () => {
  const { ctx, saves } = await fixture(); const read = deferred();
  ctx.read = () => read.promise;
  const loading = saves.getSavesFromStorage(1, 1); await tick();
  await saves.writeSaveSlot(1, { text: 'new' });
  read.resolve({ text: 'old' }); await loading;
  assert.equal(ctx.state.saveData.saveData[1].text, 'new');
  assert.equal(ctx.actions.length, 1);
});

test('old quick-save read rejects instead of returning a stale load candidate', async () => {
  const { ctx, saves } = await fixture(); const read = deferred();
  ctx.read = () => read.promise;
  const loading = saves.getFastSaveFromStorage(); await tick();
  await saves.writeFastSave({ text: 'new' });
  read.resolve({ text: 'old' }); await assert.rejects(loading, /已被更新/);
  assert.equal(ctx.state.saveData.quickSaveData.text, 'new');
});

test('reads requested during a queued write wait for its acknowledged contents', async () => {
  const { ctx, saves } = await fixture(); const write = deferred();
  ctx.write = () => write.promise;
  const saving = saves.writeFastSave({ text: 'new' });
  const loading = saves.getFastSaveFromStorage();
  await tick(); assert.equal(ctx.calls.filter(c => c[0] === 'get').length, 0);
  write.resolve(); await saving;
  assert.equal((await loading).text, 'new');
});

test('namespace switch rejects queued old writes and never dispatches late old success into the new game', async () => {
  const { ctx, saves } = await fixture(); const write = deferred();
  ctx.write = () => write.promise;
  const first = saves.writeSaveSlot(1, { sequence: 1 });
  const second = saves.writeSaveSlot(1, { sequence: 2 }); await tick();
  ctx.WebGAL.gameKey = B; write.resolve();
  await assert.rejects(first, /作品已切换/); await assert.rejects(second, /作品已切换/);
  assert.equal(ctx.calls.length, 1); assert.deepEqual(ctx.actions, []);
  assert.ok(ctx.calls.every(c => c[1].startsWith(A)));
});

test('namespace switch during read returns no old fast snapshot and makes no dispatch', async () => {
  const { ctx, saves } = await fixture(); const read = deferred(); ctx.read = () => read.promise;
  const loading = saves.getFastSaveFromStorage(); await tick();
  ctx.WebGAL.gameKey = B; read.resolve({ old: true });
  await assert.rejects(loading, /作品已切换/); assert.deepEqual(ctx.actions, []);
});

test('disabled explicit operations reject, report and never touch localforage', async () => {
  const { ctx, saves, user } = await fixture(); ctx.enabled = false;
  const operations = [() => saves.writeSaveSlot(0, null), () => saves.writeFastSave(null),
    () => saves.dumpSavesToStorage(0, 2), () => saves.dumpFastSaveToStorage(),
    () => saves.getSavesFromStorage(0, 2), () => saves.getFastSaveFromStorage(),
    () => user.getStorageAsync(), () => user.setStorageAsync()];
  for (const run of operations) await assert.rejects(run(), /尚未初始化/);
  assert.deepEqual(ctx.calls, []); assert.ok(ctx.errors.length >= operations.length);
});

test('disabled debounced and immediate background user persistence silently skip', async () => {
  const { ctx, user } = await fixture(); ctx.enabled = false;
  user.setStorage(); user.getStorage(); user.dumpToStorageFast();
  ctx.enabled = true; await delay(140);
  assert.deepEqual(ctx.calls, []); assert.deepEqual(ctx.errors, []);
});

test('old debounced work is cancelled when the namespace changes', async () => {
  const { ctx, user } = await fixture();
  user.setStorage(); user.getStorage(); ctx.WebGAL.gameKey = B;
  await delay(140); assert.deepEqual(ctx.calls, []); assert.deepEqual(ctx.errors, []);
});

test('legacy namespace remains protected even if a caller mistakenly enables storage', async () => {
  const { ctx, saves, user } = await fixture(); ctx.WebGAL.gameKey = 'legacy-game-key';
  await assert.rejects(user.getStorageAsync(), /没有继续读写/);
  await assert.rejects(user.setStorageAsync(), /没有继续读写/);
  await assert.rejects(saves.writeSaveSlot(1, {}), /没有继续读写/);
  await assert.rejects(saves.getSavesFromStorage(0, 0), /没有继续读写/);
  assert.deepEqual(ctx.calls, []);
});

test('invalid ranges and indices reject before enumerating or touching storage', async () => {
  const { ctx, saves } = await fixture();
  for (const index of [-1, 201, 1.5, NaN]) await assert.rejects(saves.writeSaveSlot(index, null), /位置无效/);
  for (const [start, end] of [[1, 0], [0, 100000], [-1, 2]]) {
    await assert.rejects(saves.getSavesFromStorage(start, end), /无效/);
    await assert.rejects(saves.dumpSavesToStorage(start, end), /无效/);
  }
  assert.deepEqual(ctx.calls, []);
});

test('failed user-data normalization does not commit normalized memory or replace the persisted object', async () => {
  const { ctx, user } = await fixture(); const before = ctx.state.userData;
  ctx.db.set(A, { oldProtocol: 'opaque' }); ctx.write = async () => { throw new Error('quota'); };
  await assert.rejects(user.getStorageAsync(), /quota/);
  assert.equal(ctx.state.userData, before); assert.deepEqual(ctx.actions, []);
  assert.deepEqual(ctx.db.get(A), { oldProtocol: 'opaque' });
});

test('normalization preserves unknown fields and commits only after the write resolves', async () => {
  const { ctx, user } = await fixture(); const write = deferred(); ctx.write = () => write.promise;
  ctx.db.set(A, { oldProtocol: 'opaque', optionData: { speed: 123 }, appreciationData: { cg: ['asset'] } });
  const loading = user.getStorageAsync(); await tick(); assert.deepEqual(ctx.actions, []);
  write.resolve(); await loading;
  assert.equal(ctx.state.userData.oldProtocol, 'opaque');
  assert.equal(ctx.state.userData.optionData.speed, 123);
  assert.equal(ctx.state.userData.optionData.language, 'zhCn');
  assert.deepEqual(ctx.state.userData.appreciationData.cg, ['asset']);
});

test('null user store is initialized only inside the new namespace after enabled barrier', async () => {
  const { ctx, user } = await fixture(); await user.getStorageAsync();
  assert.deepEqual(ctx.db.get(A), ctx.defaults);
  assert.deepEqual(ctx.calls.map(c => c.slice(0, 2)), [['get', A], ['set', A]]);
});

test('old user-data read cannot overwrite newer user write or current UI state', async () => {
  const { ctx, user } = await fixture(); const read = deferred(); ctx.read = () => read.promise;
  const loading = user.getStorageAsync(); await tick();
  ctx.state.userData = { ...ctx.state.userData, liveChange: 'new' };
  await user.setStorageAsync(); read.resolve({ ...ctx.defaults, oldRead: true }); await loading;
  assert.equal(ctx.state.userData.liveChange, 'new'); assert.equal(ctx.state.userData.oldRead, undefined);
  assert.deepEqual(ctx.actions, []);
});

test('normalization finishing after a new local UI change cannot reset that change', async () => {
  const { ctx, user } = await fixture(); const write = deferred(); ctx.write = () => write.promise;
  ctx.db.set(A, { oldProtocol: true }); const loading = user.getStorageAsync(); await tick();
  ctx.state.userData = { ...ctx.state.userData, liveChange: 'new' }; write.resolve(); await loading;
  assert.equal(ctx.state.userData.liveChange, 'new'); assert.deepEqual(ctx.actions, []);
});

test('user writes are serialized and snapshot state at invocation', async () => {
  const { ctx, user } = await fixture(); const write = deferred();
  ctx.write = async (_key, value) => { if (value.sequence === 1) await write.promise; };
  ctx.state.userData = { ...ctx.state.userData, sequence: 1 };
  const first = user.setStorageAsync(); ctx.state.userData.sequence = 99;
  ctx.state.userData = { ...ctx.state.userData, sequence: 2 }; const second = user.setStorageAsync();
  await tick(); assert.equal(ctx.calls.length, 1); write.resolve(); await Promise.all([first, second]);
  assert.deepEqual(ctx.calls.map(c => c[2].sequence), [1, 2]); assert.equal(ctx.db.get(A).sequence, 2);
});

test('background immediate and debounced failures are reported without unhandled rejections', async () => {
  const { ctx, user, saves } = await fixture(); ctx.write = async () => { throw new Error('permission denied'); };
  user.dumpToStorageFast(); user.setStorage(); saves.writeSaveSlot(1, {});
  await delay(140); assert.ok(ctx.errors.filter(message => message === 'permission denied').length >= 3);
  assert.deepEqual(ctx.actions, []);
});

test('user namespace switch before a pending read resolves performs no normalization or dispatch', async () => {
  const { ctx, user } = await fixture(); const read = deferred(); ctx.read = () => read.promise;
  const loading = user.getStorageAsync(); await tick(); ctx.WebGAL.gameKey = B; read.resolve({ legacy: true });
  await assert.rejects(loading, /作品已切换/);
  assert.equal(ctx.calls.length, 1); assert.deepEqual(ctx.actions, []);
});

test('isolated unverified namespace can retain settings without touching legacy keys', async () => {
  const { ctx, user } = await fixture(); ctx.WebGAL.gameKey = `makenovel-unverified-v1:${'f'.repeat(64)}`;
  await user.getStorageAsync(); await user.setStorageAsync();
  assert.ok(ctx.calls.every(call => call[1] === ctx.WebGAL.gameKey));
});

test('storage epoch rejects A-to-B-to-A queued writes even when the visible namespace matches again', async () => {
  const { ctx, saves } = await fixture(); const write = deferred(); ctx.write = () => write.promise;
  const first = saves.writeSaveSlot(1, { sequence: 1 });
  const second = saves.writeSaveSlot(1, { sequence: 2 }); await tick();
  ctx.WebGAL.gameKey = B; ctx.epoch++;
  ctx.WebGAL.gameKey = A; ctx.epoch++; write.resolve();
  await assert.rejects(first, /作品已切换/); await assert.rejects(second, /作品已切换/);
  assert.equal(ctx.calls.length, 1); assert.deepEqual(ctx.actions, []);
});

test('storage epoch rejects late fast reads after disable and reenable', async () => {
  const { ctx, saves } = await fixture(); const read = deferred(); ctx.read = () => read.promise;
  const loading = saves.getFastSaveFromStorage(); await tick();
  ctx.enabled = false; ctx.epoch++; ctx.enabled = true; ctx.epoch++; read.resolve({ old: true });
  await assert.rejects(loading, /作品已切换/); assert.deepEqual(ctx.actions, []);
});

test('storage epoch rejects old user reads after the same namespace reinitializes', async () => {
  const { ctx, user } = await fixture(); const read = deferred(); ctx.read = () => read.promise;
  const loading = user.getStorageAsync(); await tick(); ctx.epoch++; read.resolve({ old: true });
  await assert.rejects(loading, /作品已切换/); assert.equal(ctx.calls.length, 1); assert.deepEqual(ctx.actions, []);
});

test('debounced background work does not escape disable-enable barrier in the same namespace', async () => {
  const { ctx, user } = await fixture(); user.setStorage(); user.getStorage();
  ctx.enabled = false; ctx.epoch++; ctx.enabled = true; ctx.epoch++;
  await delay(140); assert.deepEqual(ctx.calls, []); assert.deepEqual(ctx.errors, []);
});
