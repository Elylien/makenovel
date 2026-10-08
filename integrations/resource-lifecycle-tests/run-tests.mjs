import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const source = path.join(root, 'vendor/WebGAL/packages/webgal/src');
const out = path.join(root, '.scratch/resource-lifecycle-tests');
await mkdir(out, { recursive: true });
const ctx = 'const h=globalThis.__resourceHarness;';
const mocks = {
  'Core/WebGAL': ctx + 'export const WebGAL=h.WebGAL; export const Live2D={};',
  'Core/live2DCore': 'export const baseBlinkParam={}; export const baseFocusParam={};',
  'Core/initializeScript': 'export const isIOS=false;',
  'Core/controller/stage/pixi/WebGALPixiContainer': ctx + 'export const WebGALPixiContainer=h.Container;',
  'Core/controller/stage/pixi/spine': 'export const addSpineBgImpl=()=>{};export const addSpineFigureImpl=()=>{};',
  'Core/controller/stage/pixi/GifResource': ctx + 'export const GifResource=h.GifResource;',
  'Core/controller/stage/pixi/assets/AssetManager': 'export class AssetManager {}',
  'Core/controller/stage/pixi/assets/videoTexture': 'export const acquireVideoTexture=async()=>{throw Error("out of scope")};',
  'Core/controller/stage/pixi/prepareFigureDiff': 'export const prepareFigureDiff=()=>undefined;',
  'Core/controller/stage/pixi/stageEffectTransform': 'export const assignPixiTransform=()=>{};export const applyTransformToPixiContainer=()=>{};',
  'Core/gameScripts/vocal/conentsCash': 'export const figureCash={};',
  'Core/util/logger': ctx + 'export const logger={debug(){},info(){},warn:(...args)=>h.warnings.push(args),error(){}};',
  'Core/util/constants': 'export const SCREEN_CONSTANTS={width:1920,height:1080};',
  'Core/Modules/stage/stageStateManager': ctx + 'export const stageStateManager=h.stage;',
  'Core/Modules/animationFunctions': 'export const getAnimateDuration=()=>0;export const getExitAnimation=()=>({duration:0,animation:null});',
  'Core/gameScripts/changeBg/setEbg': 'export const setEbg=()=>{};',
  'Core/util/prefetcher/progressPrefetcher': 'export const prefetchCurrentSceneByProgress=()=>{};',
  'Core/controller/gamePlay/nextSentence': 'export const hasDeferredStoryContinue=()=>false;',
  'Core/controller/storage/makenovelCompatibility': ctx + 'export const captureSaveCompatibility=()=>h.metadata;export const validateForSave=async()=>h.metadata;export const reportSaveError=error=>h.errors.push(String(error));',
  'Core/controller/storage/savesController': ctx + 'export const writeSaveSlot=async(index,save)=>{h.writes.push(["save",index,save]);h.slots.set(index,save)};export const writeFastSave=async(save)=>{h.writes.push(["fast",save]);h.fastSlot=save};export const getFastSaveFromStorage=async()=>h.fastSlot;',
  'Core/controller/storage/loadGame': 'export const loadGameFromStageData=async()=>true;',
  'store/store': ctx + 'export const webgalStore={getState:()=>({GUI:{showTitle:false}})};',
};
await build({
  entryPoints: [path.join(root, 'integrations/resource-lifecycle-tests/entry.ts')],
  outfile: path.join(out, 'runtime.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22',
  tsconfig: path.join(source, '../tsconfig.json'),
  plugins: [{ name: 'resource-boundaries', setup(api) {
    api.onLoad({ filter: /PixiController\.ts$/ }, async () => process.env.ORIGINAL_RESOURCE_CONTROLLER
      ? { loader: 'ts', contents: await readFile(process.env.ORIGINAL_RESOURCE_CONTROLLER, 'utf8') } : undefined);
    api.onLoad({ filter: /saveGame\.ts$/ }, async () => process.env.ORIGINAL_RESOURCE_SAVE
      ? { loader: 'ts', contents: await readFile(process.env.ORIGINAL_RESOURCE_SAVE, 'utf8') } : undefined);
    api.onResolve({ filter: /.*/ }, args => {
      if (args.path === 'pixi.js') return { path: 'pixi', namespace: 'boundary' };
      const absolute = args.path.startsWith('@/') ? path.join(source, args.path.slice(2))
        : args.path.startsWith('.') ? path.resolve(args.resolveDir, args.path) : null;
      if (!absolute) return;
      const key = path.relative(source, absolute).split(path.sep).join('/').replace(/\.(ts|tsx)$/, '');
      if (Object.hasOwn(mocks, key)) return { path: key, namespace: 'boundary' };
    });
    api.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ loader: 'js', contents: args.path === 'pixi'
      ? ctx + 'export const INSTALLED=[];export const Sprite=h.Sprite;export const Container=h.Container;export class Renderer {}export class Application {constructor(){throw Error("renderer construction is outside this harness")}}'
      : mocks[args.path] }));
  } }],
});
await build({
  entryPoints: [path.join(source, 'Core/controller/stage/pixi/assets/assetParsers.ts')],
  outfile: path.join(out, 'asset-parser.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22',
  tsconfig: path.join(source, '../tsconfig.json'),
  plugins: [{ name: 'svg-dom-and-registry-boundaries', setup(api) {
    api.onLoad({ filter: /assetParsers\.ts$/ }, async () => process.env.ORIGINAL_ASSET_PARSER
      ? { loader: 'ts', contents: await readFile(process.env.ORIGINAL_ASSET_PARSER, 'utf8') } : undefined);
    api.onResolve({ filter: /.*/ }, args => {
      if (args.path === 'pixi.js') return { path: 'pixi', namespace: 'svg-boundary' };
      if (args.path === '@pixi/assets') return { path: 'assets', namespace: 'svg-boundary' };
      if (args.path === '../GifResource') return { path: 'gif', namespace: 'svg-boundary' };
      if (args.path === './videoTexture') return { path: 'video', namespace: 'svg-boundary' };
    });
    api.onLoad({ filter: /.*/, namespace: 'svg-boundary' }, args => ({ loader: 'js', contents: {
      pixi: 'const p=globalThis.__svgHarness.core;export const Texture=p.Texture;export const BaseTexture=p.BaseTexture;export const SVGResource=p.SVGResource;export const VideoResource=p.VideoResource;',
      assets: 'export const Assets=globalThis.__svgHarness.Assets;',
      gif: 'export class GifResource {}',
      video: 'export const loadVideoResource=()=>{throw Error("video outside SVG boundary test")};',
    }[args.path] }));
  } }],
});
const result = spawnSync(process.execPath, ['--test',
  fileURLToPath(new URL('./resource.test.mjs', import.meta.url)),
  fileURLToPath(new URL('./svg-parser.test.mjs', import.meta.url)),
], {
  stdio: 'inherit', env: { ...process.env, RESOURCE_TEST_BUNDLE: path.join(out, 'runtime.mjs'), SVG_PARSER_TEST_BUNDLE: path.join(out, 'asset-parser.mjs') },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
