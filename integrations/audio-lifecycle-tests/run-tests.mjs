import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const sourceRoot = path.join(root, 'vendor/WebGAL/packages/webgal/src');
const bundleRoot = path.join(root, '.scratch/audio-lifecycle-tests');
await mkdir(bundleRoot, { recursive: true });
const stubs = {
  '@/Core/WebGAL': 'export const WebGAL = globalThis.__audioTest.WebGAL;',
  '@/Core/Modules/stage/stageStateManager': 'export const stageStateManager = globalThis.__audioTest.stage;',
  '@/store/store': 'export const webgalStore = globalThis.__audioTest.store;',
  '@/Core/util/logger': 'export const logger = { debug() {}, error() {}, warn() {} };',
  '@/hooks/useStageState': 'export const useStageState = () => globalThis.__audioTest.state;',
  react: `export const useEffect = (...args) => globalThis.__audioTest.react.effect(...args);
    export const useState = (...args) => globalThis.__audioTest.react.state(...args);
    export const useRef = (...args) => globalThis.__audioTest.react.ref(...args);
    export default { createElement: (...args) => ({ args }) };`,
  'react-redux': 'export const useSelector = fn => fn(globalThis.__audioTest.store.getState());',
  'react/jsx-runtime': 'export const jsx = (...args) => ({ args }); export const jsxs = jsx;',
};
await build({
  entryPoints: { vocal: path.join(sourceRoot, 'Core/gameScripts/vocal/index.ts'),
    effect: path.join(sourceRoot, 'Core/gameScripts/playEffect.ts'),
    container: path.join(sourceRoot, 'Stage/AudioContainer/AudioContainer.tsx') },
  outdir: bundleRoot, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  jsxFactory: 'React.createElement',
  banner: { js: `const setTimeout = (...args) => globalThis.__audioTest.clock.set(false, ...args);
const clearTimeout = id => globalThis.__audioTest.clock.clear(id);
const setInterval = (...args) => globalThis.__audioTest.clock.set(true, ...args);
const clearInterval = clearTimeout;
const React = { createElement: (...args) => ({ args }) };` },
  plugins: [{ name: 'audio-boundaries', setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: 'boundary' };
      if (args.path.startsWith('@/')) return { path: path.join(sourceRoot, `${args.path.slice(2)}.ts`) };
    });
    build.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ contents: stubs[args.path], loader: 'ts' }));
  } }],
});
const run = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./audio-lifecycle.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, AUDIO_TEST_BUNDLE: bundleRoot },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
