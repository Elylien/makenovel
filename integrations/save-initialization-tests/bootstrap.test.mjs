import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const namespace = `makenovel-v1:e6bc04c4-3203-4b01-a217-5a71e9b5e7cd:${'a'.repeat(64)}`;
const legacy = 'bootstrap-legacy-key';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const stylePaths = ['game/template/UI/Title/title.scss', 'game/template/Stage/TextBox/textbox.scss', 'game/template/Stage/Choose/choose.scss'];
let imports = 0;
async function fixture() {
  const ctx = { events: [], cache: new Map(), effects: [], enabled: true, busy: true, finished: deferred(),
    status: { scope: { legacyGameKey: legacy } }, state: { userData: { optionData: { textboxFont: 0 }, globalGameVar: { Game_key: legacy } } } };
  ctx.store = { getState: () => ctx.state, dispatch: action => { ctx.events.push(['dispatch', action.type, action.payload]); } };
  ctx.WebGAL = { gameKey: namespace, gameName: '', gameplay: {}, styleObjects: new Map(),
    sceneManager: { sceneData: {}, settledScenes: new Set(), getSessionEpoch: () => 1, isSessionCurrent: epoch => epoch === 1 },
    flowchartManager: { waitForCurrentSceneDialog: () => ctx.events.push(['flowchart-wait']) },
    animationManager: { addAnimation: data => ctx.events.push(['animation', data]) },
    events: { styleUpdate: { on: callback => { ctx.styleReload = callback; ctx.events.push(['style-listener']); } },
      afterStyleUpdate: { emit: () => ctx.events.push(['style-complete']) } } };
  ctx.info = async url => {
    ctx.events.push(['info', url]);
    const result = ctx.infoWait ? await ctx.infoWait : {};
    window.renderPromiseResolve();
    return result;
  };
  ctx.scene = async url => { ctx.events.push(['scene', url]); return ctx.sceneWait ?? 'start scene'; };
  ctx.http = async url => {
    ctx.events.push(['http', url]);
    if (ctx.httpOverride) return { data: await ctx.httpOverride(url) };
    if (url === './game/template/template.json') return { data: { fonts: [], name: 'network-template' } };
    if (url === './game/animation/animationTable.json') return { data: [] };
    if (stylePaths.includes(url)) return { data: `style:${url}` };
    throw new Error(`unexpected network: ${url}`);
  };
  globalThis.__saveBootstrapTest = ctx;
  globalThis.window = { __WEBGAL_DEVICE_INFO__: { isIOS: false }, renderPromiseResolve() {
    ctx.events.push(['render']);
    delete window.renderPromiseResolve;
  } };
  const head = { appendChild: element => ctx.events.push(['style-link', element.href]), querySelector: () => null };
  globalThis.document = { title: '', head, getElementsByTagName: () => [head], createElement: () => ({ setAttribute() {}, appendChild() {} }) };
  const id = ++imports;
  const { initializeScript } = await import(`${pathToFileURL(path.join(process.env.SAVE_INITIALIZATION_TEST_BUNDLE, 'bootstrap.mjs'))}?${id}`);
  const { default: useConfigData } = await import(`${pathToFileURL(path.join(process.env.SAVE_INITIALIZATION_TEST_BUNDLE, 'configHook.mjs'))}?${id}`);
  const renderHook = () => { useConfigData(); ctx.effects.splice(0).forEach(effect => effect()); };
  return { ctx, initializeScript, renderHook };
}

test('bootstrap waits for info, then waits for animation and actual template styles before releasing initialization', async () => {
  const { ctx, initializeScript } = await fixture();
  const info = deferred(), animation = deferred(), style = deferred(); ctx.infoWait = info.promise;
  ctx.httpOverride = async url => {
    if (url === './game/template/template.json') return { fonts: [] };
    if (url === './game/animation/animationTable.json') return ['move'];
    if (url === './game/animation/move.json') return animation.promise;
    if (url === stylePaths[0]) return style.promise;
    if (stylePaths.includes(url)) return 'other style';
    throw new Error(`unexpected ${url}`);
  };
  initializeScript(); await tick();
  assert.ok(ctx.events.some(e => e[0] === 'info'));
  assert.ok(ctx.events.every(e => !['scene', 'http', 'cache', 'style-link', 'finished'].includes(e[0])));
  assert.equal(ctx.busy, true);
  info.resolve({}); await tick();
  assert.ok(ctx.events.some(e => e[0] === 'scene'));
  assert.ok(ctx.events.some(e => e[0] === 'http' && e[1] === './game/animation/move.json'));
  assert.ok(ctx.events.some(e => e[0] === 'http' && e[1] === stylePaths[0]));
  assert.equal(ctx.busy, true); assert.ok(ctx.events.every(e => e[0] !== 'bind'));
  animation.resolve([{ position: 10 }]); await tick(); assert.equal(ctx.busy, true);
  style.resolve('final style'); await ctx.finished.promise;
  assert.equal(ctx.busy, false);
  const order = name => ctx.events.findIndex(e => e[0] === name);
  assert.ok(order('animation') < order('finished') && order('style-complete') < order('finished'));
  assert.ok(order('bind') < order('finished') && order('sync') < order('finished'));
});

test('verified animation and template bytes are used without a second network request', async () => {
  const { ctx, initializeScript } = await fixture();
  ctx.cache.set('game/animation/animationTable.json', JSON.stringify(['cached']));
  ctx.cache.set('game/animation/cached.json', JSON.stringify([{ sealed: true }]));
  ctx.cache.set('game/template/template.json', JSON.stringify({ fonts: [], name: 'sealed-template' }));
  for (const stylePath of stylePaths) ctx.cache.set(stylePath, `sealed:${stylePath}`);
  ctx.httpOverride = async () => { throw new Error('second network must not happen'); };
  initializeScript(); await ctx.finished.promise;
  assert.ok(ctx.events.every(e => e[0] !== 'http'));
  assert.deepEqual(ctx.events.find(e => e[0] === 'animation')[1], { name: 'cached', effects: [{ sealed: true }] });
  assert.equal(ctx.WebGAL.template.name, 'sealed-template');
  assert.equal(ctx.WebGAL.styleObjects.get('title').others, `sealed:${stylePaths[0]}`);
});

test('information failure disables persistence, releases render and finishes initialization without loading playable data', async () => {
  const { ctx, initializeScript } = await fixture();
  ctx.info = async () => { throw new Error('configuration unavailable'); };
  initializeScript(); await ctx.finished.promise;
  assert.equal(ctx.enabled, false); assert.equal(ctx.busy, false);
  assert.ok(ctx.events.some(e => e[0] === 'error' && e[1] === 'configuration unavailable'));
  assert.ok(ctx.events.some(e => e[0] === 'render'));
  assert.ok(ctx.events.every(e => !['scene', 'http', 'cache', 'bind', 'sync'].includes(e[0])));
});

test('animation failure after the host render callback removes itself disables persistence without an unhandled rejection', async () => {
  const { ctx, initializeScript } = await fixture();
  ctx.cache.set('game/animation/animationTable.json', 'not-json');
  initializeScript(); await ctx.finished.promise; await tick();
  assert.equal(ctx.enabled, false); assert.equal(ctx.busy, false);
  assert.ok(ctx.events.some(e => e[0] === 'error'));
  assert.equal(ctx.events.filter(e => e[0] === 'render').length, 1);
  assert.equal(window.renderPromiseResolve, undefined);
  assert.ok(ctx.events.every(e => e[0] !== 'bind' && e[0] !== 'sync'));
});

test('scene failure after successful info keeps the original error and finishes with the render callback already removed', async () => {
  const { ctx, initializeScript } = await fixture();
  ctx.scene = async () => { throw new Error('opening scene unavailable'); };
  initializeScript(); await ctx.finished.promise; await tick();
  assert.equal(ctx.enabled, false); assert.equal(ctx.busy, false);
  assert.deepEqual(ctx.events.filter(e => e[0] === 'error'), [['error', 'opening scene unavailable']]);
  assert.equal(ctx.events.filter(e => e[0] === 'render').length, 1);
  assert.equal(window.renderPromiseResolve, undefined);
  assert.ok(ctx.events.every(e => e[0] !== 'bind' && e[0] !== 'sync'));
});

test('config hook never replaces a verified namespace or reloads legacy player storage', async () => {
  const { ctx, renderHook } = await fixture();
  ctx.state.userData.globalGameVar = { Game_key: legacy, Game_name: '可见标题', Title_img: 'cover.png', Title_bgm: 'title.ogg', Game_Logo: 'one.png|two.png' };
  renderHook();
  assert.equal(ctx.WebGAL.gameKey, namespace); assert.equal(ctx.WebGAL.gameName, '可见标题');
  assert.equal(document.title, '可见标题');
  assert.ok(ctx.events.every(e => !e[0].startsWith('forbidden-') && e[0] !== 'preview-session'));
});

test('changed config Game_key marks an invalid preview session and preserves the assigned namespace', async () => {
  const { ctx, renderHook } = await fixture();
  ctx.state.userData.globalGameVar = { Game_key: 'different-game', Game_name: '不同作品' }; renderHook();
  assert.equal(ctx.WebGAL.gameKey, namespace); assert.equal(ctx.enabled, false);
  assert.ok(ctx.events.some(e => e[0] === 'preview-session'));
  assert.ok(ctx.events.some(e => e[0] === 'error' && e[1].includes('作品身份已改变')));
  assert.ok(ctx.events.every(e => !e[0].startsWith('forbidden-')));
});
