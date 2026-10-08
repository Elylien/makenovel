import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const legacy = 'makenovel-initialization-test';
const projectId = 'e6bc04c4-3203-4b01-a217-5a71e9b5e7cd';
const verified = `makenovel-v1:${projectId}:${'a'.repeat(64)}`;
const isolated = `makenovel-unverified-v1:${createHash('sha256').update(legacy).digest('hex')}`;
const foreign = 'another-game';
const isBackup = key => key.startsWith('makenovel-backup-v1:');
const tick = () => new Promise(resolve => setImmediate(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const backupModule = await import(pathToFileURL(path.join(process.env.SAVE_INITIALIZATION_TEST_BUNDLE, 'backup.mjs')));
let imports = 0;

async function fixture({ sealed = true, entries } = {}) {
  const defaults = { optionData: { speed: 50, language: 'zhCn' }, scriptManagedGlobalVar: [], globalGameVar: {},
    appreciationData: { bgm: [], cg: [] }, gameConfigInit: {}, readHistory: {} };
  const state = { userData: structuredClone(defaults), saveData: { saveData: [], quickSaveData: null } };
  const initial = entries ?? [[legacy, { old: 'untouched', readHistory: { start: [1] } }],
    [`${legacy}-saves0`, { oldSlot: 'opaque' }], [`${legacy}-saves-fast`, 'broken old quick save'],
    [`${legacy}-flowchart`, ['main-start']], [`${legacy}-flowchart-main-start`, null], [foreign, { unrelated: true }]];
  const ctx = { defaults, state, enabled: false, epoch: 0, events: [], errors: [], status: {}, db: new Map(structuredClone(initial)),
    Live2D: {}, config: [{ command: 'Game_key', args: [legacy] }, { command: 'Game_name', args: ['初始化样片'] },
      { command: 'Enable_flowchart', args: ['true'] }, { command: 'Enable_Appreciation', args: ['true'] },
      { command: 'Legacy_Expression_Blend_Mode', args: ['true'] }] };
  ctx.WebGAL = { gameKey: 'not-yet-selected', flowchartManager: { async init(key, enabled) { ctx.events.push(['flowchart', key, enabled]); } },
    steam: { initialize(id) { ctx.events.push(['steam', id]); } } };
  ctx.store = { getState: () => state, dispatch(action) {
    ctx.events.push(['dispatch', action.type]);
    if (action.type === 'save') state.saveData.saveData[action.payload.index] = action.payload.saveData;
    if (action.type === 'fast') state.saveData.quickSaveData = action.payload;
    if (action.type === 'user') state.userData = action.payload;
    if (action.type === 'global') state.userData = { ...state.userData, globalGameVar: { ...state.userData.globalGameVar, [action.payload.key]: action.payload.value } };
    if (action.type === 'userField') state.userData = { ...state.userData, [action.payload.key]: action.payload.value };
  } };
  ctx.configGet = async url => { ctx.events.push(['config', url]); return { data: 'fixture parsed at the parser boundary' }; };
  ctx.parseConfig = text => text === 'fixture parsed at the parser boundary' ? ctx.config : JSON.parse(text);
  ctx.initialize = async (url, gameKey) => {
    ctx.events.push(['compatibility', url, gameKey]); ctx.enabled = false; ctx.epoch++;
    ctx.status = { ready: sealed, scope: { legacyGameKey: gameKey, ...(sealed ? { projectId } : {}) } };
    if (ctx.manifestWait) await ctx.manifestWait;
    return sealed ? verified : isolated;
  };
  ctx.keys = async () => { ctx.events.push(['keys']); return [...ctx.db.keys()]; };
  ctx.getItem = async key => {
    ctx.events.push(['get-start', key, ctx.enabled]);
    if (ctx.read) await ctx.read(key);
    const value = structuredClone(ctx.db.get(key) ?? null);
    ctx.events.push(['get-done', key, ctx.enabled]); return value;
  };
  ctx.setItem = async (key, value) => {
    ctx.events.push(['set-start', key, ctx.enabled]);
    if (ctx.write) await ctx.write(key, value);
    ctx.db.set(key, structuredClone(ctx.replaceWrite ? ctx.replaceWrite(key, value) : value));
    ctx.events.push(['set-done', key, ctx.enabled]); return value;
  };
  globalThis.__saveInitializationTest = ctx;
  globalThis.window = { renderPromiseResolve() { ctx.events.push(['render']); ctx.rendered = true; } };
  const { infoFetcher } = await import(`${pathToFileURL(path.join(process.env.SAVE_INITIALIZATION_TEST_BUNDLE, 'initialize.mjs'))}?${++imports}`);
  return { ctx, infoFetcher, original: structuredClone(ctx.db), finish: async () => { await delay(140); } };
}

function assertOriginalUntouched(ctx, original) {
  for (const [key, value] of original) assert.deepEqual(ctx.db.get(key), value, key);
  assert.ok(ctx.events.filter(event => event[0] === 'set-start').every(event => !original.has(event[1])));
}
function assertNoNativeStartup(ctx) {
  assert.ok(ctx.events.every(e => e[0] !== 'initKey' && e[0] !== 'flowchart'));
  assert.ok(ctx.events.filter(e => e[0] === 'get-start' || e[0] === 'set-start').every(e => !e[1].startsWith('makenovel-v1:') && !e[1].startsWith('makenovel-unverified-v1:')));
}

test('real infoFetcher waits for real backup readback before any user/slot/flowchart initialization', async () => {
  const { ctx, infoFetcher, original, finish } = await fixture();
  const readback = deferred(); const reached = deferred();
  ctx.read = async key => { if (isBackup(key)) { reached.resolve(); await readback.promise; } };
  const initializing = infoFetcher('./game/config.txt'); await reached.promise;
  assert.equal(ctx.enabled, false); assert.equal(ctx.rendered, undefined); assertNoNativeStartup(ctx);
  assertOriginalUntouched(ctx, original);
  const backupKey = [...ctx.db.keys()].find(isBackup); assert.ok(backupKey);
  await backupModule.verifySaveBackup(ctx.db.get(backupKey), ctx.status.scope);
  readback.resolve(); const config = await initializing;
  assert.equal(config.Enable_flowchart, true); assert.equal(ctx.enabled, true); assert.equal(ctx.rendered, true);
  const readbackIndex = ctx.events.findIndex(e => e[0] === 'get-done' && e[1] === backupKey);
  const enabledIndex = ctx.events.findIndex(e => e[0] === 'enabled' && e[1] === true);
  const userRead = ctx.events.findIndex(e => e[0] === 'get-start' && e[1] === verified);
  const fastRead = ctx.events.findIndex(e => e[0] === 'get-start' && e[1] === `${verified}-saves-fast`);
  const slotRead = ctx.events.findIndex(e => e[0] === 'get-start' && e[1] === `${verified}-saves0`);
  const flowchart = ctx.events.findIndex(e => e[0] === 'flowchart');
  const render = ctx.events.findIndex(e => e[0] === 'render');
  assert.ok(readbackIndex < enabledIndex && enabledIndex < userRead && userRead < fastRead && fastRead < slotRead && slotRead < flowchart && flowchart < render);
  assert.deepEqual(ctx.events[flowchart], ['flowchart', verified, true]);
  await finish(); assertOriginalUntouched(ctx, original);
});

test('quota failure keeps old keys untouched and storage disabled while still resolving render and config', async () => {
  const { ctx, infoFetcher, original, finish } = await fixture();
  ctx.write = async key => { if (isBackup(key)) throw new Error('QuotaExceededError'); };
  const config = await infoFetcher('./game/config.txt'); await finish();
  assert.equal(config.Game_key, legacy); assert.equal(ctx.enabled, false); assert.equal(ctx.rendered, true);
  assert.ok(ctx.errors.some(error => error.includes('QuotaExceededError'))); assertNoNativeStartup(ctx);
  assertOriginalUntouched(ctx, original); assert.equal(ctx.db.size, original.size);
});

test('corrupted backup readback blocks native initialization but preserves the failed copy and renders', async () => {
  const { ctx, infoFetcher, original, finish } = await fixture();
  ctx.replaceWrite = (key, value) => isBackup(key) ? { truncated: true } : value;
  await infoFetcher('./game/config.txt'); await finish();
  assert.equal(ctx.enabled, false); assert.equal(ctx.rendered, true); assertNoNativeStartup(ctx);
  assertOriginalUntouched(ctx, original);
  const key = [...ctx.db.keys()].find(isBackup); assert.deepEqual(ctx.db.get(key), { truncated: true });
  assert.ok(ctx.errors.some(error => error.includes('未能安全备份或读取')));
});

test('backup readback I/O failure does not proceed into user normalization or slot reads', async () => {
  const { ctx, infoFetcher, original, finish } = await fixture();
  ctx.read = async key => { if (isBackup(key)) throw new Error('readback unavailable'); };
  await infoFetcher('./game/config.txt'); await finish();
  assert.equal(ctx.enabled, false); assert.equal(ctx.rendered, true); assertNoNativeStartup(ctx);
  assertOriginalUntouched(ctx, original); assert.ok(ctx.errors.some(error => error.includes('readback unavailable')));
});

test('missing manifest selects isolated settings namespace and never normalizes legacy values', async () => {
  const { ctx, infoFetcher, original, finish } = await fixture({ sealed: false });
  await infoFetcher('./game/config.txt'); await finish();
  assert.equal(ctx.WebGAL.gameKey, isolated); assert.equal(ctx.status.ready, false); assert.equal(ctx.enabled, true);
  assert.equal(ctx.rendered, true); assertOriginalUntouched(ctx, original);
  const key = [...ctx.db.keys()].find(isBackup);
  const archived = await backupModule.verifySaveBackup(ctx.db.get(key), { legacyGameKey: legacy });
  assert.ok(archived.payload.records.some(r => r.key === `${legacy}-saves-fast` && r.value.type === 'string'));
  assert.ok(ctx.db.has(isolated));
  assert.ok(ctx.events.filter(e => e[0] === 'set-start' && !isBackup(e[1])).every(e => e[1] === isolated));
  assert.deepEqual(ctx.state.saveData.quickSaveData, null);
});

test('initialization remains disabled while version verification is pending', async () => {
  const { ctx, infoFetcher, finish } = await fixture(); const verification = deferred(); ctx.manifestWait = verification.promise;
  const initializing = infoFetcher('./game/config.txt'); await tick();
  assert.equal(ctx.enabled, false); assertNoNativeStartup(ctx);
  assert.ok(ctx.events.every(e => e[0] !== 'keys' && e[0] !== 'get-start' && e[0] !== 'set-start'));
  verification.resolve(); await initializing; await finish();
});

test('a failed native initialization read after verified backup disables later writers but still renders', async () => {
  const { ctx, infoFetcher, original, finish } = await fixture();
  ctx.read = async key => { if (key === verified) throw new Error('user storage unavailable'); };
  await infoFetcher('./game/config.txt'); await finish();
  assert.equal(ctx.rendered, true); assert.equal(ctx.enabled, false); assertOriginalUntouched(ctx, original);
  assert.ok([...ctx.db.keys()].some(isBackup));
  assert.ok(ctx.events.every(e => e[0] !== 'flowchart'));
  assert.ok(ctx.events.filter(e => e[0] === 'get-start').every(e => e[1] !== `${verified}-saves-fast` && e[1] !== `${verified}-saves0`));
  assert.ok(ctx.events.filter(e => e[0] === 'set-start').every(e => isBackup(e[1])));
});

test('empty player namespace needs no backup write and does not collect another game', async () => {
  const { ctx, infoFetcher, original, finish } = await fixture({ entries: [[foreign, { privateOtherGame: true }]] });
  await infoFetcher('./game/config.txt'); await finish();
  assert.equal(ctx.rendered, true); assert.equal(ctx.enabled, true); assertOriginalUntouched(ctx, original);
  assert.equal([...ctx.db.keys()].filter(isBackup).length, 0);
  assert.ok(ctx.events.filter(e => e[0] === 'get-start').every(e => e[1] !== foreign));
  assert.ok(ctx.db.has(verified));
});

test('verified config bytes replace the earlier axios response before initializing displayed and stored config', async () => {
  const { ctx, infoFetcher, finish } = await fixture();
  ctx.verifiedConfigText = JSON.stringify([
    { command: 'Game_key', args: [legacy] },
    { command: 'Game_name', args: ['已核验标题'] },
    { command: 'Enable_flowchart', args: ['false'] },
    { command: 'Verified_only', args: ['sealed-value'] },
  ]);
  const config = await infoFetcher('./game/config.txt'); await finish();
  assert.equal(config.Game_name, '已核验标题'); assert.equal(config.Enable_flowchart, false);
  assert.equal(config.Verified_only, 'sealed-value'); assert.equal(config.Enable_Appreciation, undefined);
  assert.equal(ctx.state.userData.globalGameVar.Game_name, '已核验标题');
  assert.equal(ctx.db.get(verified).gameConfigInit.Verified_only, 'sealed-value');
  assert.deepEqual(ctx.events.find(event => event[0] === 'flowchart'), ['flowchart', verified, false]);
});
