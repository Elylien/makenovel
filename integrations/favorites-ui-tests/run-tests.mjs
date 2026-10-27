import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const source = path.join(root, 'vendor/WebGAL/packages/webgal/src');
const out = path.join(root, '.scratch/favorites-ui-tests');
await mkdir(out, { recursive: true });
const mocks = {
  react: `const h=()=>globalThis.__favoriteHooks;
    export const useState=v=>h().state(v); export const useRef=v=>h().ref(v);
    export const useEffect=(f,d)=>h().effect(f,d); export const useMemo=(f,d)=>h().memo(f,d);
    export const useCallback=(f,d)=>h().memo(()=>f,d); export const Fragment='fragment';`,
  'react/jsx-runtime': `export const Fragment='fragment'; export const jsx=(type,props,key)=>({type,props:props??{},key}); export const jsxs=jsx;`,
  'react-redux': `export const useSelector=f=>f(globalThis.__favoriteUI.state); export const useDispatch=()=>globalThis.__favoriteUI.dispatch;`,
  '@/Core/WebGAL': `export const WebGAL=globalThis.__favoriteUI.WebGAL;`,
  '@/store/store': `export const webgalStore={getState:()=>globalThis.__favoriteUI.state};`,
  '@/Core/controller/storage/makenovelFavorites': `const s=()=>globalThis.__favoriteUI;
    export const loadFavorites=()=>s().load(); export const favoriteBacklog=x=>s().add(x);
    export const removeFavorite=id=>s().remove(id); export const clearFavorites=()=>s().clear();
    export const verifyFavoriteVoice=entry=>s().verifyVoice(entry);
    export const subscribeFavorites=f=>s().subscribeFavorites(f);
    export const favoriteIdForBacklog=(item,entries)=>entries.find(e=>e.id===item.id)?.id;`,
  '@/Core/controller/storage/makenovelCompatibility': `const s=()=>globalThis.__favoriteUI;
    export const getSaveStatus=()=>({preview:s().preview}); export const getSaveStorageEpoch=()=>s().epoch;
    export const isSaveStorageEnabled=()=>!s().preview;
    export const subscribeSaveStatus=f=>s().subscribeStatus(f); export const reportSaveError=e=>s().errors.push(e.message);`,
  '@/Stage/TextBox/TextBox': `export const compileSentence=text=>[[{reactNode:text}]];`,
  '@/Core/Modules/visualReadiness': `export const subscribeVisualReadiness=f=>globalThis.__favoriteUI.subscribeVisual(f);`,
  '@/hooks/useTrans': `export default ()=> (...keys)=>keys.length===1?keys[0]:keys;`,
  '@/hooks/useSoundEffect': `export default ()=>({playSeEnter(){},playSeClick(){},playSeDialogOpen(){},playSeSwitch(){}});`,
  '@/hooks/useLanguage': `export default ()=>()=>{};`,
  '@/config/language': `export default {zh:'中文'}; export const language={zh:0};`,
  '@/Core/util/logger': `export const logger={info(){}};`,
  '@/Core/controller/gamePlay/autoPlay': `export const stopAuto=()=>{};`,
  '@/Core/controller/storage/jumpFromBacklog': `export const jumpFromBacklog=()=>globalThis.__favoriteUI.jumps++;`,
  '@/store/GUIReducer': `export const setVisibility=x=>x;`,
  '@/store/userDataReducer': `export const resetAllData=()=>({type:'resetAll'}); export const resetOptionSet=()=>({type:'resetOptions'}); export const setOptionData=x=>x;`,
  '@/store/savesReducer': `export const saveActions={resetSaves:()=>({type:'resetSaves'})};`,
  '@/Core/controller/storage/storageController': `export const setStorage=()=>{}; export const dumpToStorageFast=()=>globalThis.__favoriteUI.writes++;`,
  '@/Core/controller/storage/savesController': `export const dumpSavesToStorage=async()=>{globalThis.__favoriteUI.writes++;}; export const dumpFastSaveToStorage=async()=>{globalThis.__favoriteUI.writes++;};`,
  '@/UI/GlobalDialog/GlobalDialog': `export const showGlogalDialog=options=>{globalThis.__favoriteUI.dialog=options;};`,
  '@/UI/Menu/Options/NormalOption': `export const NormalOption='NormalOption';`,
  '@/UI/Menu/Options/NormalButton': `export const NormalButton='NormalButton';`,
  '@/UI/Menu/Options/OptionSlider': `export const OptionSlider='OptionSlider';`,
  '@/UI/Menu/Options/System/About': `export default 'About';`,
  '@/UI/SaveDataTools/SaveDataTools': `export const SaveDataTools='SaveDataTools';`,
  '@icon-park/react': `export const Info='Info',CloseSmall='CloseSmall',Return='Return',VolumeNotice='VolumeNotice';`,
};
await build({
  entryPoints: {
    voice: path.join(source, 'UI/Favorites/favoriteVoice.ts'),
    hook: path.join(source, 'UI/Favorites/useFavorites.ts'),
    panel: path.join(source, 'UI/Favorites/Favorites.tsx'),
    backlog: path.join(source, 'UI/Backlog/Backlog.tsx'),
    system: path.join(source, 'UI/Menu/Options/System/System.tsx'),
  },
  outdir: out, outExtension: { '.js': '.mjs' }, bundle: true, format: 'esm', platform: 'node', target: 'node22',
  tsconfig: path.join(source, '../tsconfig.json'),
  plugins: [{ name: 'favorites-ui-boundaries', setup(api) {
    api.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path)
      ? { path: args.path, namespace: 'favorite-ui-mock' }
      : args.path.endsWith('.scss') ? { path: 'styles', namespace: 'favorite-ui-mock' } : undefined);
    api.onLoad({ filter: /.*/, namespace: 'favorite-ui-mock' }, args => ({
      contents: args.path === 'styles' ? 'export default new Proxy({}, {get:(_,key)=>key});' : mocks[args.path], loader: 'js',
    }));
  } }],
});
const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./favorites-ui.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, FAVORITES_UI_BUNDLE: out },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
