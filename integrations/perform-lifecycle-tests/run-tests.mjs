import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const source = path.join(root, 'vendor/WebGAL/packages/webgal/src');
const out = path.join(root, '.scratch/perform-lifecycle-tests');
await mkdir(out, { recursive: true });
const mocks = {
  'Core/controller/gamePlay/nextSentence.ts': 'export const continueSentence=()=>globalThis.__performHarness.continue();',
  'Core/Modules/stage/stageStateManager.ts': 'export const stageStateManager=globalThis.__performHarness.stage;',
  'Core/WebGAL.ts': 'export const WebGAL=globalThis.__performHarness.WebGAL;',
  'store/store.ts': 'export const webgalStore={dispatch(){}};',
  'store/userDataReducer.ts': 'export const unlockCgInUserData=payload=>payload;',
  'Core/util/logger.ts': 'export const logger={debug(){},info(){},warn(){},error(){}};',
  'Core/controller/storage/storageController.ts': 'export const dumpToStorageFast=()=>{};',
  'Core/live2DCore.ts': 'export const baseBlinkParam={}; export const baseFocusParam={};',
  'Core/gameScripts/figureAssociatedAnimation.ts': 'export const setFigureAssociatedAnimation=()=>{};',
  'Core/controller/stage/pixi/PixiController.ts': 'export default class PixiStage {static assignTransform(target,source){Object.assign(target,source);}}',
  'Core/controller/stage/pixi/animations/timeline.ts': 'export const generateTimelineObj=(timeline,target,duration)=>({timeline,target,duration});',
};
await build({
  entryPoints: [path.join(root, 'integrations/perform-lifecycle-tests/entry.ts')],
  outfile: path.join(out, 'runtime.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22',
  tsconfig: path.join(source, '../tsconfig.json'),
  plugins: [{ name: 'perform-boundaries', setup(b) {
    b.onLoad({ filter: /\.[tj]s$/ }, args => {
      const relative = path.relative(source, args.path).replaceAll('\\', '/');
      return relative in mocks ? { contents: mocks[relative], loader: 'ts' } : undefined;
    });
  } }],
});
const result = spawnSync(process.execPath, ['--test', path.join(root, 'integrations/perform-lifecycle-tests/perform.test.mjs')], {
  stdio: 'inherit', env: { ...process.env, PERFORM_TEST_BUNDLE: path.join(out, 'runtime.mjs') },
});
process.exitCode = result.status ?? 1;
