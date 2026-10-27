import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const source = path.join(root, 'vendor/WebGAL/packages/webgal/src');
const out = path.join(root, '.scratch/flowchart-readiness-tests');
await mkdir(out, { recursive: true });
const ctx = 'const h=globalThis.__readinessHarness;';
const mocks = {
  'Core/WebGAL': ctx + 'export const WebGAL=h.WebGAL;export const Live2D={};',
  'Core/live2DCore': 'export const baseBlinkParam={};export const baseFocusParam={};',
  'Core/initializeScript': 'export const isIOS=false;',
  'Core/controller/stage/pixi/WebGALPixiContainer': ctx + 'export const WebGALPixiContainer=h.Container;',
  'Core/controller/stage/pixi/spine': 'export const addSpineBgImpl=()=>{};export const addSpineFigureImpl=()=>{};',
  'Core/controller/stage/pixi/GifResource': 'export class GifResource {}',
  'Core/controller/stage/pixi/assets/AssetManager': 'export class AssetManager {}',
  'Core/controller/stage/pixi/assets/videoTexture': 'export const acquireVideoTexture=async()=>{throw Error("video outside test scope")};',
  'Core/controller/stage/pixi/stageEffectTransform': 'export const assignPixiTransform=()=>{};',
  'Core/gameScripts/vocal/conentsCash': 'export const figureCash={};',
  'Core/util/logger': 'export const logger={debug(){},info(){},warn(){},error(){}};',
  'Core/util/constants': 'export const SCREEN_CONSTANTS={width:1920,height:1080};',
  'Core/controller/gamePlay/nextSentence': ctx + 'export const continueSentence=()=>{h.next++};export const hasDeferredStoryContinue=()=>h.deferredStory;',
  'Core/controller/storage/makenovelCompatibility': ctx + 'export const captureSaveCompatibility=()=>h.enabled?h.metadata:undefined;export const getSaveUnavailableMessage=m=>m;export const isSaveStorageEnabled=()=>h.enabled;export const getSaveStorageEpoch=()=>h.storageEpoch;export const validateForSave=()=>h.validate();export const reportSaveError=e=>h.errors.push(String(e));',
  'Core/controller/storage/savesController': ctx + 'export const writeSaveSlot=async(i,s)=>h.playerWrites.push([i,s]);export const writeFastSave=async(s)=>h.playerWrites.push(["fast",s]);export const getFastSaveFromStorage=async()=>null;',
  'Core/controller/storage/loadGame': 'export const loadGameFromStageData=async()=>true;',
  'store/store': ctx + 'export const webgalStore={getState:()=>({GUI:{showTitle:false}})};',
};
await build({
  entryPoints: [path.join(root, 'integrations/flowchart-readiness-tests/entry.ts')],
  outfile: path.join(out, 'runtime.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22',
  tsconfig: path.join(source, '../tsconfig.json'),
  plugins: [{ name: 'readiness-boundaries', setup(api) {
    api.onResolve({ filter: /.*/ }, args => {
      if (['pixi.js', 'axios', 'localforage'].includes(args.path)) return { path: args.path, namespace: 'boundary' };
      const absolute = args.path.startsWith('@/') ? path.join(source, args.path.slice(2))
        : args.path.startsWith('.') ? path.resolve(args.resolveDir, args.path) : null;
      if (!absolute) return;
      const key = path.relative(source, absolute).split(path.sep).join('/').replace(/\.(ts|tsx)$/, '');
      if (Object.hasOwn(mocks, key)) return { path: key, namespace: 'boundary' };
    });
    api.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ loader: 'js', contents: {
      'pixi.js': ctx + 'export const INSTALLED=[];export const Sprite=h.Sprite;export const Container=h.Container;export class Renderer {}export class Application {}',
      axios: ctx + 'export default {get:async()=>({data:h.flowchart})};',
      localforage: ctx + 'export default {getItem:async()=>null,setItem:(...args)=>h.persist(...args),removeItem:async()=>{}};',
    }[args.path] ?? mocks[args.path] }));
  } }],
});
const result = spawnSync(process.execPath, ['--test', path.join(root, 'integrations/flowchart-readiness-tests/readiness.test.mjs')], {
  stdio: 'inherit', env: { ...process.env, READINESS_TEST_BUNDLE: path.join(out, 'runtime.mjs') },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
