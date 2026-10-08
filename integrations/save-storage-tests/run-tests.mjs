import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const source = path.join(root, 'vendor/WebGAL/packages/webgal/src/Core/controller/storage');
const bundleRoot = path.join(root, '.scratch/save-storage-tests');
await mkdir(bundleRoot, { recursive: true });
const stubs = {
  localforage: `export const getItem = (...args) => globalThis.__saveStorageTest.getItem(...args);
    export const setItem = (...args) => globalThis.__saveStorageTest.setItem(...args);
    export default { getItem, setItem };`,
  '@/Core/WebGAL': 'export const WebGAL = globalThis.__saveStorageTest.WebGAL;',
  '@/store/store': 'export const webgalStore = globalThis.__saveStorageTest.store;',
  '@/store/savesReducer': `export const saveActions = {
    saveGame: payload => ({ type: 'save', payload }), setFastSave: payload => ({ type: 'fast', payload }) };`,
  '@/store/userDataReducer': `export const initState = globalThis.__saveStorageTest.defaults;
    export const resetUserData = payload => ({ type: 'user', payload });
    export const unlockBgmInUserData = payload => ({ type: 'userData/unlockBgmInUserData', payload });
    export const unlockCgInUserData = payload => ({ type: 'userData/unlockCgInUserData', payload });`,
  '../../util/logger': 'export const logger = { info() {}, warn() {} };',
  '@/Core/util/logger': 'export const logger = { info() {}, warn() {} };',
  '@/Core/controller/stage/playBgm': 'export const playBgm = () => {};',
  '@/Core/Modules/stage/stageStateManager': 'export const stageStateManager = globalThis.__saveStorageTest.stage;',
  '@/Stage/stage.module.scss': 'export default {};',
  '@/Core/controller/stage/pixi/animations/generateTransformAnimationObj': 'export const generateTransformAnimationObj = () => [{}];',
  '@/Core/controller/stage/pixi/animations/timeline': 'export const generateTimelineObj = () => ({});',
  '@/Core/Modules/animationFunctions': 'export const applyAnimationEndState = () => null; export const getAnimateDuration = () => 0;',
  '../parseTransformFrame': 'export const parseTransformFrame = () => null;',
  './makenovelCompatibility': `export const isSaveStorageEnabled = () => globalThis.__saveStorageTest.enabled;
    export const getSaveStorageEpoch = () => globalThis.__saveStorageTest.epoch;
    export const reportSaveError = error => { globalThis.__saveStorageTest.errors.push(error.message); };`,
};
await build({
  entryPoints: { saves: path.join(source, 'savesController.ts'), user: path.join(source, 'storageController.ts'),
    unlocks: path.join(root, 'integrations/save-storage-tests/unlocks-entry.ts') },
  tsconfig: path.join(root, 'vendor/WebGAL/packages/webgal/tsconfig.json'),
  outdir: bundleRoot, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  plugins: [{ name: 'storage-boundaries', setup(build) {
    build.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'boundary' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ contents: stubs[args.path], loader: 'ts' }));
  } }],
});
const run = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./save-storage.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, SAVE_STORAGE_TEST_BUNDLE: bundleRoot },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
