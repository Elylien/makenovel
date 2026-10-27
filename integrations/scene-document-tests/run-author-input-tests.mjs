import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const { build } = require('esbuild');
const source = path.join(root, 'vendor/WebGAL_Terre/packages/origine2/src');
const out = path.join(root, '.scratch/author-input-tests');
await mkdir(out, { recursive: true });
const entries = {
  sidebar: 'pages/dashboard/Sidebar.tsx',
  choose: 'pages/editor/GraphicalEditor/SentenceEditor/Choose.tsx',
  config: 'pages/editor/Topbar/tabs/GameConfig/GameConfig.tsx',
  assets: 'components/Assets/Assets.tsx',
  file: 'components/Assets/FileElement.tsx',
};
const entryPaths = new Set(Object.values(entries).map(relative => path.join(source, relative)));
const importedNames = new Map();
for (const entry of entryPaths) {
  const code = await readFile(entry, 'utf8');
  for (const [, specifier, module] of code.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const names = importedNames.get(module) ?? new Set();
    const named = specifier.match(/\{([^}]*)\}/)?.[1] ?? '';
    for (const part of named.split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name) names.add(name);
    }
    importedNames.set(module, names);
  }
}
const mocks = {
  react: `const h=()=>globalThis.__authorInputHooks;
    export const useState=x=>h().state(x),useRef=x=>h().ref(x),useMemo=fn=>fn(),useEffect=()=>{};
    export default {};`,
  'react/jsx-runtime': `export const jsx=(type,props,key)=>({type,props:props??{},key}); export const jsxs=jsx,Fragment='Fragment';`,
  '@lingui/macro': `export const t=(text,...args)=>text.reduce((s,v,i)=>s+v+(args[i]??''),''); export const Trans='Trans';`,
  '@fluentui/react-icons': [...(importedNames.get('@fluentui/react-icons') ?? [])].map(name =>
    name === 'bundleIcon' ? `export const bundleIcon=()=> 'Icon';` : `export const ${name}='Icon';`).join('\n'),
  '@/api': `export const api=new Proxy({}, {get:(_,name)=>(...args)=>{globalThis.__authorInputApi.push({name,args});return Promise.resolve({data:{}});}});`,
  swr: `export default ()=>({data:[]}); export const useSWRConfig=()=>({mutate:()=>{}});`,
  '@/store/useEditorStore': `export default {use:new Proxy({}, {get:(_,key)=>()=>({viewType:'list',sortBy:'name',sortOrder:'asc',isTrash:false}[key]??(()=>{}))})};`,
  '@/hooks/useTrashFailedToast': `export default ()=>()=>{throw new Error('Unexpected trash operation');};`,
  '@/utils/getFileIcon': `export const extractExtension=()=>'', getDirIcon=()=>null, getFileIcon=()=>null;`,
  '@/pages/editor/ChooseFile/chooseFileConfig': `export const extNameMap=new Map([['scene',['.txt']]]);`,
  '../../ChooseFile/chooseFileConfig': `export const extNameMap=new Map([['scene',['.txt']]]);`,
  lodash: `export const cloneDeep=value=>structuredClone(value);`,
};

// Render actual component callbacks, retaining real useValue and filename validation.
// Layout widgets, unrelated stores, and API transport are the only test doubles.
await build({
  entryPoints: Object.fromEntries(Object.entries(entries).map(([key, relative]) => [key, path.join(source, relative)])),
  outdir: out, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  plugins: [{ name: 'author-input-boundary', setup(api) {
    api.onResolve({ filter: /.*/ }, args => {
      if (args.kind === 'entry-point') return;
      if (/\/(useValue|isImeKeyEvent|normalizeFileName|checkFileName)$/.test(args.path)) {
        return { path: args.path.startsWith('@/') ? path.join(source, args.path.slice(2) + '.ts') : path.resolve(args.resolveDir, args.path + '.ts') };
      }
      return { path: args.path, namespace: 'mock' };
    });
    api.onLoad({ filter: /\.(tsx)$/, namespace: 'file' }, async args => {
      if (!entryPaths.has(args.path)) return;
      const extra = args.path.endsWith('Choose.tsx') ? '\nexport { ChooseTargetDialog };'
        : args.path.endsWith('GameConfig.tsx') ? '\nexport { GameConfigEditor };' : '';
      return { contents: await readFile(args.path, 'utf8') + extra, loader: 'tsx' };
    });
    api.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({
      contents: mocks[args.path] ?? (args.path.endsWith('.scss') ? 'export default {};' :
        `export default ${JSON.stringify(args.path)};\n` + [...(importedNames.get(args.path) ?? [])].map(name =>
          `export const ${name}=${JSON.stringify(name)};`).join('\n')),
      loader: 'js',
    }));
  } }],
});
const run = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./author-input-boundary.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, AUTHOR_INPUT_TEST_BUNDLE: out },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
