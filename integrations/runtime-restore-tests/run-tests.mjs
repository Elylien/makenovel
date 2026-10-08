import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(
  new URL("../../vendor/WebGAL/package.json", import.meta.url)
);
const { build } = require("esbuild");
const source = path.join(root, "vendor/WebGAL/packages/webgal/src");
const out = path.join(root, ".scratch/runtime-restore-tests");
await mkdir(out, { recursive: true });
const ctx = "const h=globalThis.__restoreHarness;";
const mocks = {
  "Core/WebGAL.ts": ctx + "export const WebGAL=h.WebGAL;",
  "store/store.ts": ctx + "export const webgalStore=h.store;",
  "store/GUIReducer.ts":
    'export const setVisibility=payload=>({type:"visibility",payload}); export const setFontOptimization=payload=>({type:"font",payload});',
  "store/savesReducer.ts":
    'export const saveActions={saveGame:payload=>({type:"save",payload}),setFastSave:payload=>({type:"fast",payload}),resetFastSave:()=>({type:"fast",payload:null})};',
  "Core/parser/sceneParser.ts":
    ctx +
    'export const SCRIPT_CONFIG=[{scriptString:"say",scriptType:0,scriptFunction(){}}]; export const ADD_NEXT_ARG_LIST=[]; export const scriptRegistry={0:SCRIPT_CONFIG[0],11:{scriptFunction(){}}}; export const sceneParser=(rawScene,sceneName,sceneUrl)=>({sceneName,sceneUrl,sentenceList:rawScene.split("\\n").map(content=>({content})),assetsList:[],subSceneList:[]}); export const WebgalParser={parse:sceneParser};',
  "Core/controller/storage/makenovelCompatibility.ts":
    ctx +
    "export const captureSaveCompatibility=()=>h.storageEnabled?h.metadata:undefined; export const isSaveStorageEnabled=()=>h.storageEnabled; export const getSaveStatus=()=>({scope:{legacyGameKey:h.legacyGameKey}}); export const getSaveStorageEpoch=()=>h.storageEpoch; export const validateForSave=()=>h.validateSave(); export const assertCompatibleSnapshot=s=>h.validateLoad(s); export const reportSaveError=e=>h.errors.push(String(e)); export const waitForRuntimeReady=()=>h.waitRuntimeReady(); export const markPreviewSession=()=>{h.previewMarks++;h.storageEnabled=false;h.storageEpoch++;};",
  "Core/controller/scene/sceneFetcher.ts":
    ctx + "export const sceneFetcher=url=>h.fetchScene(url);",
  "Core/controller/storage/savesController.ts":
    ctx +
    'export const writeSaveSlot=async(index,saveData)=>{await h.dumpSave(index,saveData);h.store.dispatch({type:"save",payload:{index,saveData}})}; export const writeFastSave=async(save)=>{await h.dumpFast(save);h.store.dispatch({type:"fast",payload:save})}; export const getFastSaveFromStorage=()=>h.readFast();',
  "Core/controller/storage/storageController.ts":
    "export const getStorageAsync=async()=>{};export const dumpToStorageFast=()=>{};",
  "Core/Modules/stage/stageStateManager.ts":
    ctx +
    'export const stageStateManager=h.stage; export const initState={GameVar:{},PerformList:[],bgName:""};',
  "Core/controller/gamePlay/runScript.ts":
    ctx + "export const runScript=s=>h.runScript(s);",
  "Core/controller/gamePlay/nextSentence.ts":
    ctx + "export const continueSentence=()=>h.next++;",
  "Core/controller/gamePlay/autoPlay.ts":
    ctx + 'export const stopAuto=()=>h.stops.push("auto");',
  "Core/controller/gamePlay/fastSkip.ts":
    ctx +
    'export const stopAll=()=>h.stops.push("all");export const stopFast=()=>h.stops.push("fast");',
  "Core/gameScripts/changeBg/setEbg.ts":
    ctx + "export const setEbg=(bg)=>h.background=bg;",
  "Core/gameScripts/say/createSayPerform.ts":
    "export const createSayPerform=s=>({script:s});",
  "Core/util/logger.ts":
    "export const logger={warn(){},info(){},debug(){},error(){}};",
  "Core/util/prefetcher/assetsPrefetcher.ts":
    "export const clearPrefetchLinks=()=>{};",
  "Core/util/prefetcher/progressPrefetcher.ts":
    "export const clearProgressPrefetch=()=>{};",
  "Core/gameScripts/setVar.ts":
    ctx + "export const setGameVar=p=>h.varWrites.push(p);",
  "Core/controller/stage/playBgm.ts": "export const playBgm=()=>{};",
  "Core/util/syncWithEditor/runtime/embeddedPreviewBootstrap.ts":
    'export const requestEmbeddedLaunchId=async()=>"fixture-launch";',
  "Core/util/syncWithEditor/runtime/previewSyncTransport.ts":
    ctx +
    "export const createPreviewSyncTransport=hooks=>{h.previewHooks=hooks;return {connect(){},send:message=>{h.previewMessages.push(message);return true;},isActiveSocket:()=>true,isSocketOpen:()=>true,ensureConnected(){},dispose(){}}};",
  "Core/util/syncWithEditor/runtime/previewSyncSceneCommand.ts":
    ctx +
    "export const runFastPreview=(...args)=>h.fastPreview(...args); export const executePreviewSyncSceneCommand=()=>{};",
  "Core/util/syncWithEditor/runtime/previewDebugVariables.ts":
    ctx +
    "export const applyPreviewDebugVariables=vars=>h.applyDebugVariables(vars);",
  "Core/util/syncWithEditor/runtime/targetTransformBaseline.ts":
    "export const cloneBaseTransform=()=>({}); export const isTargetTransformBaselineSyncSettled=()=>true; export const createTargetTransformBaselineManager=()=>({invalidateBaselines(){},getReadyTransformBaselineOverride:()=>null});",
  "Core/util/syncWithEditor/runtime/handlers/referenceBoxQueryHandler.ts":
    "export const handleReferenceBoxQuery=async()=>({});",
  "Core/Modules/readHistory.ts":
    ctx +
    "export const setDebugTextReadMode=value=>h.setDebugTextReadMode(value);",
  "Core/controller/stage/pixi/syncPixiStageState.ts":
    "export const applyStageEffectToTarget=()=>{};",
};
await build({
  entryPoints: [path.join(root, "integrations/runtime-restore-tests/entry.ts")],
  outfile: path.join(out, "runtime.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  tsconfig: path.join(source, "../tsconfig.json"),
  plugins: [
    {
      name: "runtime-boundaries",
      setup(api) {
        api.onResolve({ filter: /.*/ }, (args) => {
          if (args.path === "localforage")
            return { path: "storage", namespace: "stub" };
          if (args.path === "axios")
            return { path: "axios", namespace: "stub" };
          const absolute = args.path.startsWith("@/")
            ? path.join(source, args.path.slice(2))
            : args.path.startsWith(".")
            ? path.resolve(args.resolveDir, args.path)
            : null;
          if (!absolute) return;
          const relative = path
            .relative(source, absolute)
            .split(path.sep)
            .join("/");
          const key = Object.hasOwn(mocks, relative)
            ? relative
            : relative + ".ts";
          if (Object.hasOwn(mocks, key))
            return { path: key, namespace: "stub" };
        });
        api.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          loader: "js",
          contents:
            args.path === "storage"
              ? ctx + "export default h.storage;"
              : args.path === "axios"
              ? ctx + "export default {get:async()=>({data:h.flowchart})};"
              : mocks[args.path],
        }));
      },
    },
  ],
});
const result = spawnSync(
  process.execPath,
  ["--test", fileURLToPath(new URL("./restore.test.mjs", import.meta.url))],
  {
    stdio: "inherit",
    env: { ...process.env, RESTORE_TEST_BUNDLE: path.join(out, "runtime.mjs") },
  }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
