import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const { build } = require('esbuild');
const bundleRoot = path.join(projectRoot, '.scratch/scene-document-tests');
await mkdir(bundleRoot, { recursive: true });
const sourceRoot = path.join(projectRoot, 'vendor/WebGAL_Terre/packages/origine2/src');
const mocks = {
  react: `
    const h = () => globalThis.__messageHarness;
    export const useEffect = fn => { h().cleanups.push(fn()); };
    export const useMemo = fn => fn();
    export const useRef = () => ({ current: h().iframe });
    export const useState = () => [true, value => h().ready.push(value)];
    export default { createElement: (...args) => args };
  `,
  'react/jsx-runtime': `export const jsx=(...args)=>args; export const jsxs=jsx; export const Fragment='fragment';`,
  swr: `export default () => ({data:'initial',mutate:async()=>{}}); export const useSWRConfig = () => ({mutate:async()=>{}});`,
  axios: `export default {get: async()=>({data:'initial'})};`,
  '@/api': `const record=async data=>{globalThis.__messageHarness.writes.push(data);}; export const api={assetsControllerEditTextFile:record,manageGameControllerEditTextFile:record};`,
  '@/store/useEditorStore': `export default {use:{isDarkMode:()=>false}};`,
  '@/utils/editorPreviewClient': `export const EditorPreviewClient={reloadTemplates:()=>{}};`,
};
await build({
  entryPoints: {
    jsonResource: path.join(sourceRoot, 'pages/editor/ResourceDisplay/JsonResourceDisplay/JsonResourceDisplay.tsx'),
    templateEditor: path.join(sourceRoot, 'pages/templateEditor/TextEditor/TextEditor.tsx'),
  },
  outdir: bundleRoot,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'transform',
  target: 'node22',
  plugins: [{
    name: 'message-boundary-harness',
    setup(api) {
      api.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'boundary-mock' } : undefined);
      api.onLoad({ filter: /.*/, namespace: 'boundary-mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    },
  }],
});
const run = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./message-boundary.test.mjs', import.meta.url))], {
  stdio: 'inherit',
  env: { ...process.env, SCENE_DOCUMENT_TEST_BUNDLE: bundleRoot },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
