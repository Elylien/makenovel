import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const source = path.join(root, 'vendor/WebGAL/packages/webgal/src');
const out = path.join(root, '.scratch/stage-exit-tests');
await mkdir(out, { recursive: true });
const prefix = 'const h=globalThis.__exitHarness;';
const mocks = {
  'Core/WebGAL': prefix + 'export const WebGAL=h.WebGAL;',
  'Core/Modules/animationFunctions': prefix + 'export const getAnimateDuration=()=>1000;export const getExitAnimation=()=>({duration:h.duration,animation:{}});',
  'Core/controller/stage/pixi/stageEffectTransform': 'export const applyTransformToPixiContainer=()=>{};',
  'Core/controller/stage/pixi/prepareFigureDiff': 'export const prepareFigureDiff=()=>undefined;',
  'Core/gameScripts/changeBg/setEbg': 'export const setEbg=()=>{};',
  'Core/util/prefetcher/progressPrefetcher': 'export const prefetchCurrentSceneByProgress=()=>{};',
  'Core/util/logger': 'export const logger={warn(){},debug(){}};',
};
await build({
  entryPoints: [path.join(root, 'integrations/stage-exit-tests/entry.ts')],
  outfile: path.join(out, 'runtime.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22',
  tsconfig: path.join(source, '../tsconfig.json'),
  plugins: [{ name: 'native-exit-boundaries', setup(api) {
    if (process.env.ORIGINAL_SYNC_FILE) api.onLoad({ filter: /syncPixiStageState\.ts$/ }, async () => ({ loader: 'ts', contents: await readFile(process.env.ORIGINAL_SYNC_FILE, 'utf8') }));
    api.onResolve({ filter: /.*/ }, args => {
      const absolute = args.path.startsWith('@/') ? path.join(source, args.path.slice(2)) : args.path.startsWith('.') ? path.resolve(args.resolveDir, args.path) : null;
      if (!absolute) return;
      const key = path.relative(source, absolute).split(path.sep).join('/').replace(/\.ts$/, '');
      if (Object.hasOwn(mocks, key)) return { path: key, namespace: 'boundary' };
    });
    api.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ loader: 'js', contents: mocks[args.path] }));
  } }],
});
const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./exit.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, EXIT_TEST_BUNDLE: path.join(out, 'runtime.mjs') },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
