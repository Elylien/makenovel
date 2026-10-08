import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const sourceRoot = path.join(root, 'vendor/WebGAL/packages/webgal/src');
const bundleRoot = path.join(root, '.scratch/save-initialization-tests');
await mkdir(bundleRoot, { recursive: true });
const compatibility = `
  const ctx = () => globalThis.__saveInitializationTest;
  export const initializeSaveCompatibility = (...args) => ctx().initialize(...args);
  export const getVerifiedConfigText = () => ctx().verifiedConfigText;
  export const getSaveStatus = () => ctx().status;
  export const isSaveStorageEnabled = () => ctx().enabled;
  export const getSaveStorageEpoch = () => ctx().epoch;
  export const setSaveStorageEnabled = value => { ctx().events.push(['enabled', value]); ctx().enabled = value; ctx().epoch++; };
  export const reportSaveError = error => { ctx().events.push(['error', error.message]); ctx().errors.push(error.message); };
`;
const stubs = {
  localforage: `export const keys = () => globalThis.__saveInitializationTest.keys();
    export const getItem = (...args) => globalThis.__saveInitializationTest.getItem(...args);
    export const setItem = (...args) => globalThis.__saveInitializationTest.setItem(...args);
    export default { keys, getItem, setItem };`,
  axios: 'export default { get: (...args) => globalThis.__saveInitializationTest.configGet(...args) };',
  '@/Core/WebGAL': `export const WebGAL = globalThis.__saveInitializationTest.WebGAL;
    export const Live2D = globalThis.__saveInitializationTest.Live2D;`,
  '@/Core/parser/sceneParser': 'export const WebgalParser = { parseConfig: text => globalThis.__saveInitializationTest.parseConfig(text) };',
  '@/store/store': 'export const webgalStore = globalThis.__saveInitializationTest.store;',
  '@/store/savesReducer': `export const saveActions = {
    saveGame: payload => ({ type: 'save', payload }), setFastSave: payload => ({ type: 'fast', payload }) };`,
  '@/store/userDataReducer': `export const initState = globalThis.__saveInitializationTest.defaults;
    export const resetUserData = payload => ({ type: 'user', payload });
    export const setGlobalVar = payload => ({ type: 'global', payload });
    export const setUserData = payload => ({ type: 'userField', payload });`,
  '@/store/GUIReducer': 'export const setEnableAppreciationMode = payload => ({ type: "appreciation", payload });',
  '@/Core/controller/storage/fastSaveLoad': 'export const initKey = () => globalThis.__saveInitializationTest.events.push(["initKey"]);',
  '@/Core/util/logger': 'export const logger = { info() {}, warn() {} };',
  '../../util/logger': 'export const logger = { info() {}, warn() {} };',
  '@/Core/controller/storage/makenovelCompatibility': compatibility,
  './makenovelCompatibility': compatibility,
};
await build({
  entryPoints: {
    initialize: path.join(sourceRoot, 'Core/util/coreInitialFunction/infoFetcher.ts'),
    backup: path.join(sourceRoot, 'Core/controller/storage/saveBackup.ts'),
  },
  outdir: bundleRoot, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  plugins: [{ name: 'initialization-boundaries', setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: 'boundary' };
      if (args.path.startsWith('@/')) return { path: path.join(sourceRoot, `${args.path.slice(2)}.ts`) };
    });
    build.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ contents: stubs[args.path], loader: 'ts' }));
  } }],
});
const bootstrapCompatibility = `
  const ctx = () => globalThis.__saveBootstrapTest;
  export const getVerifiedBootstrapText = path => { ctx().events.push(['cache', path]); return ctx().cache.get(path); };
  export const finishRuntimeInitialization = () => { ctx().events.push(['finished']); ctx().busy = false; ctx().finished.resolve(); };
  export const setSaveStorageEnabled = value => { ctx().events.push(['enabled', value]); ctx().enabled = value; };
  export const reportSaveError = error => { ctx().events.push(['error', error.message]); };
  export const getSaveStatus = () => ctx().status;
  export const markPreviewSession = () => { ctx().events.push(['preview-session']); ctx().enabled = false; };
`;
const bootstrapStubs = {
  './controller/storage/makenovelCompatibility': bootstrapCompatibility,
  '@/Core/controller/storage/makenovelCompatibility': bootstrapCompatibility,
  './util/coreInitialFunction/infoFetcher': 'export const infoFetcher = (...args) => globalThis.__saveBootstrapTest.info(...args);',
  './util/logger': 'export const logger = { info() {}, warn() {} };',
  '@/Core/util/logger': 'export const logger = { info() {}, warn() {} };',
  './util/gameAssetsAccess/assetSetter': `export const fileType = { scene: 'scene', background: 'background', bgm: 'bgm' };
    export const assetSetter = (name, type) => './game/' + type + '/' + name;`,
  '@/Core/util/gameAssetsAccess/assetSetter': `export const fileType = { scene: 'scene', background: 'background', bgm: 'bgm' };
    export const assetSetter = (name, type) => './game/' + type + '/' + name;`,
  './controller/scene/sceneFetcher': 'export const sceneFetcher = (...args) => globalThis.__saveBootstrapTest.scene(...args);',
  './parser/sceneParser': `export const sceneParser = (text, name, url) => {
    globalThis.__saveBootstrapTest.events.push(['parse-scene', text]); return { text, name, url }; };`,
  '@/Core/util/coreInitialFunction/bindExtraFunc': 'export const bindExtraFunc = () => globalThis.__saveBootstrapTest.events.push(["bind"]);',
  '@/Core/util/syncWithEditor/previewSyncRuntime': 'export const startPreviewSyncRuntime = () => globalThis.__saveBootstrapTest.events.push(["sync"]);',
  '@/Core/controller/stage/pixi/PixiController': 'export default class { constructor() { globalThis.__saveBootstrapTest.events.push(["pixi"]); } }',
  '@/Core/controller/stage/pixi/syncPixiStageState': 'export const syncPixiStageState = () => {};',
  axios: 'export default { get: (...args) => globalThis.__saveBootstrapTest.http(...args) };',
  '@/config/info': 'export const __INFO = { version: "test" };',
  '@/Core/WebGAL': 'export const WebGAL = globalThis.__saveBootstrapTest.WebGAL;',
  '@/Core/Modules/stage/stageStateManager': 'export const stageStateManager = { setCommitHandler: callback => { globalThis.__saveBootstrapTest.commitHandler = callback; } };',
  './controller/storage/fastSaveLoad': 'export const autoFastSaveGame = () => globalThis.__saveBootstrapTest.events.push(["auto-save"]);',
  '@/Core/util/fonts/fontOptions': 'export const buildFontOptionsFromTemplate = () => [];',
  '@/store/store': 'export const webgalStore = globalThis.__saveBootstrapTest.store;',
  '@/store/GUIReducer': `export const setFontOptions = payload => ({ type: 'fonts', payload });
    export const setGuiAsset = payload => ({ type: 'guiAsset', payload });
    export const setLogoImage = payload => ({ type: 'logos', payload });`,
  '@/store/userDataReducer': 'export const setOptionData = payload => ({ type: "option", payload });',
  '@/Core/controller/customUI/scss2cssinjsParser': 'export const scss2cssinjsParser = text => ({ others: text });',
  '@emotion/css': 'export const injectGlobal = text => globalThis.__saveBootstrapTest.events.push(["inject-style", text]);',
  '@/Core/gameScripts/changeBg/setEbg': 'export const setEbg = url => globalThis.__saveBootstrapTest.events.push(["background", url]);',
  react: 'export const useEffect = effect => { globalThis.__saveBootstrapTest.effects.push(effect); };',
  'react-redux': 'export const useSelector = selector => selector(globalThis.__saveBootstrapTest.state);',
  // If useConfigData regresses to native identity/storage imports, expose visible sentinels.
  '@/Core/controller/storage/fastSaveLoad': 'export const initKey = () => globalThis.__saveBootstrapTest.events.push(["forbidden-init-key"]);',
  '@/Core/controller/storage/savesController': `export const getFastSaveFromStorage = () => globalThis.__saveBootstrapTest.events.push(['forbidden-fast-read']);
    export const getSavesFromStorage = () => globalThis.__saveBootstrapTest.events.push(['forbidden-slot-read']);`,
  '@/Core/controller/storage/storageController': `export const getStorage = () => globalThis.__saveBootstrapTest.events.push(['forbidden-user-read']);
    export const getStorageAsync = getStorage;`,
};
await build({
  entryPoints: {
    bootstrap: path.join(sourceRoot, 'Core/initializeScript.ts'),
    configHook: path.join(sourceRoot, 'hooks/useConfigData.ts'),
  },
  outdir: bundleRoot, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  plugins: [{ name: 'bootstrap-boundaries', setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      if (Object.hasOwn(bootstrapStubs, args.path)) return { path: args.path, namespace: 'boundary' };
      if (args.path.startsWith('@/')) return { path: path.join(sourceRoot, `${args.path.slice(2)}.ts`) };
    });
    build.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ contents: bootstrapStubs[args.path], loader: 'ts' }));
  } }],
});
const run = spawnSync(process.execPath, ['--test',
  fileURLToPath(new URL('./save-initialization.test.mjs', import.meta.url)),
  fileURLToPath(new URL('./bootstrap.test.mjs', import.meta.url)),
], {
  stdio: 'inherit', env: { ...process.env, SAVE_INITIALIZATION_TEST_BUNDLE: bundleRoot },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
