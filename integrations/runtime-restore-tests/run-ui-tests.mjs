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
const ctx = "const h=globalThis.__saveUiHarness;";
const mocks = {
  react: ctx + "export const useEffect=fn=>h.effects.push(fn);",
  "react/jsx-runtime":
    'export const Fragment="fragment";export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;',
  "react-redux":
    ctx +
    "export const useSelector=fn=>fn(h.state);export const useDispatch=()=>h.dispatch;",
  "react-i18next":
    'export const useTranslation=()=>({i18n:{language:"zh-CN"}});',
  "Core/controller/storage/saveGame.ts":
    ctx + "export const saveGame=i=>h.save(i);",
  "Core/controller/storage/loadGame.ts":
    ctx + "export const loadGame=i=>h.load(i);",
  "Core/controller/storage/savesController.ts":
    ctx + "export const getSavesFromStorage=(...args)=>h.read(...args);",
  "Core/controller/storage/storageController.ts":
    ctx + "export const setStorage=()=>h.persist++;",
  "Core/controller/storage/makenovelCompatibility.ts":
    ctx + "export const reportSaveError=e=>h.errors.push(String(e));",
  "Core/controller/gamePlay/autoPlay.ts": "export const switchAuto=()=>{};",
  "Core/controller/gamePlay/fastSkip.ts": "export const switchFast=()=>{};",
  "Core/controller/gamePlay/backToTitle.ts": "export const backToTitle=()=>{};",
  "store/userDataReducer.ts":
    'export const setSlPage=payload=>({type:"page",payload});',
  "store/GUIReducer.ts":
    'export const setMenuPanelTag=payload=>({type:"menu",payload});export const setVisibility=payload=>({type:"visibility",payload});',
  "UI/GlobalDialog/GlobalDialog.tsx":
    ctx +
    "export const showGlogalDialog=options=>h.dialog=options;export const switchControls=()=>{};",
  "hooks/useTrans.ts": "export default ()=>key=>key;",
  "hooks/useSoundEffect.ts": ctx + "export default ()=>h.sounds;",
  "hooks/useFullScreen.ts":
    "export default ()=>({isSupported:false,isFullScreen:false,toggle(){}});",
  "hooks/useStageState.ts": ctx + "export const useStageState=()=>h.stage;",
  "Stage/TextBox/TextBox.tsx":
    "export const compileSentence=s=>[[{reactNode:s}]];",
  "UI/Backlog/Backlog.tsx": "export const mergeStringsAndKeepObjects=s=>s;",
};
const icons = [
  "AlignTextLeftOne",
  "DoubleDown",
  "DoubleRight",
  "DoubleUp",
  "FolderOpen",
  "FullScreen",
  "Home",
  "Lock",
  "OffScreen",
  "PlayOne",
  "PreviewCloseOne",
  "PreviewOpen",
  "ReplayMusic",
  "Save",
  "SettingTwo",
  "TreeDiagram",
  "Unlock",
];
await build({
  entryPoints: [
    path.join(root, "integrations/runtime-restore-tests/ui-entry.ts"),
  ],
  outfile: path.join(out, "ui.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  tsconfig: path.join(source, "../tsconfig.json"),
  plugins: [
    {
      name: "save-ui-boundaries",
      setup(api) {
        api.onResolve({ filter: /.*/ }, (args) => {
          if (/\.scss$/.test(args.path))
            return { path: "styles", namespace: "ui-mock" };
          if (args.path === "@icon-park/react")
            return { path: "icons", namespace: "ui-mock" };
          if (Object.hasOwn(mocks, args.path))
            return { path: args.path, namespace: "ui-mock" };
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
          for (const key of [relative, relative + ".ts", relative + ".tsx"])
            if (Object.hasOwn(mocks, key))
              return { path: key, namespace: "ui-mock" };
        });
        api.onLoad({ filter: /.*/, namespace: "ui-mock" }, (args) => ({
          loader: "js",
          contents:
            args.path === "styles"
              ? "export default new Proxy({},{get:(target,key)=>key});"
              : args.path === "icons"
              ? icons.map((name) => `export const ${name}='${name}';`).join("")
              : mocks[args.path],
        }));
      },
    },
  ],
});
const run = spawnSync(
  process.execPath,
  ["--test", fileURLToPath(new URL("./ui.test.mjs", import.meta.url))],
  {
    stdio: "inherit",
    env: { ...process.env, SAVE_UI_TEST_BUNDLE: path.join(out, "ui.mjs") },
  }
);
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
