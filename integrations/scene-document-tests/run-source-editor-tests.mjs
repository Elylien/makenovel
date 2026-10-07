import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const { build } = require('esbuild');
const bundleRoot = path.join(projectRoot, '.scratch/source-editor-tests');
await mkdir(bundleRoot, { recursive: true });
const sourceRoot = path.join(projectRoot, 'vendor/WebGAL_Terre/packages/origine2/src/pages/editor');
// Only the unused React shell and app services are stubbed. Tests invoke the production
// binding and SceneDocument, including parser validation and byte-preserving source edits.
const mocks = {
  react: 'export const useCallback=fn=>fn; export const useEffect=()=>{}; export const useRef=()=>({current:null});',
  'react/jsx-runtime': 'export const jsx=()=>{}; export const jsxs=jsx;',
  'monaco-editor': 'export const editor={}; export const MarkerSeverity={};',
  '@monaco-editor/react': 'export default ()=>null;',
  './textEditor.module.scss': 'export default {};',
  '../../../runtime/WG_ORIGINE_RUNTIME': 'export const editorLineHolder={}; export const lspSceneName={};',
  '../../../utils/editorPreviewClient': 'export const EditorPreviewClient={};',
  '@/utils/eventBus': 'export const eventBus={};',
  '@/store/useEditorStore': 'export default {};',
  '../SceneDocument/useSceneDocument': 'export const useSceneDocument=()=>{};',
  '../SceneDocument/DocumentBar': 'export const DocumentBar=()=>null;',
};
await build({
  entryPoints: {
    sourceEditor: path.join(sourceRoot, 'TextEditor/TextEditor.tsx'),
    sceneDocument: path.join(sourceRoot, 'SceneDocument/sceneDocument.ts'),
  },
  outdir: bundleRoot,
  outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  plugins: [{ name: 'source-editor-boundary-harness', setup(api) {
    api.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'boundary-mock' } : undefined);
    api.onLoad({ filter: /.*/, namespace: 'boundary-mock' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const run = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./source-editor-boundary.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, SOURCE_EDITOR_TEST_BUNDLE: bundleRoot },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
