import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const source = path.join(root, 'vendor/WebGAL/packages/webgal/src');
const out = path.join(root, '.scratch/preview-notice-tests');
await mkdir(out, { recursive: true });

// Exercise the production notice and its subscription effect. Storage is an
// external-store boundary; its isolation semantics have their own runtime suite.
const mocks = {
  react: `const h=()=>globalThis.__previewNoticeHooks;
    export const useState=value=>h().state(value);
    export const useEffect=(callback,deps)=>h().effect(callback,deps);
    export const useRef=value=>h().ref(value);`,
  'react/jsx-runtime': `export const Fragment='fragment';
    export const jsx=(type,props,key)=>({type,props:props??{},key}); export const jsxs=jsx;`,
  localforage: 'export default {};',
  '@/Core/controller/storage/saveBackup': `export const captureSaveBackup=()=>{throw Error('Unexpected backup');};
    export const verifySaveBackup=()=>{throw Error('Unexpected backup');};`,
  '@/Core/controller/storage/makenovelCompatibility': `const h=()=>globalThis.__previewNoticeStore;
    export const getSaveStatus=()=>h().get();
    export const subscribeSaveStatus=callback=>h().subscribe(callback);
    export const clearSaveError=()=>h().clearError();
    export const reportSaveError=()=>{throw Error('Unexpected backup error');};`,
};
const outfile = path.join(out, 'notice.mjs');
await build({
  entryPoints: [path.join(source, 'UI/SaveDataTools/SaveDataTools.tsx')],
  outfile, bundle: true, format: 'esm', platform: 'node', target: 'node22',
  tsconfig: path.join(source, '../tsconfig.json'),
  plugins: [{
    name: 'preview-notice-boundaries',
    setup(api) {
      api.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path)
        ? { path: args.path, namespace: 'notice-mock' }
        : args.path.endsWith('.scss') ? { path: 'styles', namespace: 'notice-mock' } : undefined);
      api.onLoad({ filter: /.*/, namespace: 'notice-mock' }, args => ({
        contents: args.path === 'styles' ? 'export default {};' : mocks[args.path], loader: 'js',
      }));
    },
  }],
});
const run = spawnSync(process.execPath, [
  '--test', fileURLToPath(new URL('./notice.test.mjs', import.meta.url)),
], { stdio: 'inherit', env: { ...process.env, PREVIEW_NOTICE_TEST_BUNDLE: outfile } });
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
