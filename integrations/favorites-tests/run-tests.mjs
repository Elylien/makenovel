import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const out = path.join(root, '.scratch/favorites-tests');
await mkdir(out, { recursive: true });
const ctx = 'const h=globalThis.__favoritesTest;';
const mocks = {
  'localforage': ctx + 'export default {getItem:(...args)=>h.getItem(...args),setItem:(...args)=>h.setItem(...args)};',
  '@/Core/WebGAL': ctx + 'export const WebGAL=h.WebGAL;',
  '@/Core/parser/sceneParser': 'export { SCRIPT_CONFIG, ADD_NEXT_ARG_LIST } from "webgal-parser";',
  './makenovelCompatibility': ctx + `
    export const captureSaveCompatibility=()=>h.enabled?h.meta:undefined;
    export const getSaveStorageEpoch=()=>h.epoch;
    export const isSaveStorageEnabled=()=>h.enabled;
    export const getSaveUnavailableMessage=message=>h.preview?'作者预览已隔离':message;
    export const reportSaveError=error=>h.errors.push(error.message);
    export const sha256=bytes=>h.sha256(bytes);
    export const assertCompatibleSnapshot=snapshot=>h.validateSnapshot(snapshot);
    export const readVerifiedVocalAsset=path=>h.readVerifiedVocalAsset(path);
  `,
};
await build({
  entryPoints: [path.join(root, 'vendor/WebGAL/packages/webgal/src/Core/controller/storage/makenovelFavorites.ts')],
  outfile: path.join(out, 'favorites.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  tsconfig: path.join(root, 'vendor/WebGAL/packages/webgal/tsconfig.json'),
  plugins: [{ name: 'favorites-boundaries', setup(api) {
    api.onResolve({filter: /.*/}, args => Object.hasOwn(mocks, args.path) ? {path:args.path,namespace:'boundary'} : undefined);
    api.onLoad({filter: /.*/,namespace:'boundary'}, args => ({contents:mocks[args.path],loader:'ts',resolveDir:path.join(root,'vendor/WebGAL')}));
  } }],
});
const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./favorites.test.mjs', import.meta.url))], {
  stdio:'inherit', env:{...process.env,FAVORITES_TEST_BUNDLE:path.join(out,'favorites.mjs')},
});
if (result.error) throw result.error;
process.exitCode=result.status ?? 1;
