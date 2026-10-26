import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const source = path.join(root, 'vendor/WebGAL/packages/webgal/src');
const out = path.join(root, '.scratch/playback-mode-tests');
await mkdir(out, { recursive: true });
const prefix = 'const h=globalThis.__playbackModeHarness;';
const mocks = {
  'Core/WebGAL': prefix + 'export const WebGAL=h.WebGAL;',
  'store/store': prefix + 'export const webgalStore=h.store;',
  'Core/Modules/stage/stageStateManager': prefix + 'export const stageStateManager=h.stage;',
  'Core/controller/gamePlay/scriptExecutor': prefix + 'export const scriptExecutor=()=>h.forward();',
  'Core/util/logger': 'export const logger={debug(){},info(){},warn(){},error(){}};',
  'Core/controller/stage/pixi/PixiController': 'export default class PixiStage {static assignTransform(target,source){Object.assign(target,source);}}',
  'Core/controller/stage/pixi/animations/timeline': 'export const generateTimelineObj=(timeline,target,duration)=>({timeline,target,duration});',
  'UI/BottomControlPanel/bottomControlPanel.module.scss': 'export default {button_on:"on",singleButton:"off"};',
};
await build({
  entryPoints: [path.join(root, 'integrations/playback-mode-tests/entry.ts')],
  outfile: path.join(out, 'runtime.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22',
  tsconfig: path.join(source, '../tsconfig.json'),
  plugins: [{ name: 'native-playback-mode-boundaries', setup(api) {
    api.onResolve({ filter: /.*/ }, args => {
      const absolute = args.path.startsWith('@/') ? path.join(source, args.path.slice(2))
        : args.path.startsWith('.') ? path.resolve(args.resolveDir, args.path) : null;
      if (!absolute) return;
      const key = path.relative(source, absolute).split(path.sep).join('/').replace(/\.ts$/, '');
      if (Object.hasOwn(mocks, key)) return { path: key, namespace: 'boundary' };
    });
    api.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ loader: 'js', contents: mocks[args.path] }));
  } }],
});
const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./playback.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, PLAYBACK_MODE_TEST_BUNDLE: path.join(out, 'runtime.mjs') },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
