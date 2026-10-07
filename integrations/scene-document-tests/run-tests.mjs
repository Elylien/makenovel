import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const { build } = require('esbuild');
const sourceRoot = path.join(projectRoot, 'vendor/WebGAL_Terre/packages/origine2/src/pages/editor');
const bundleRoot = path.join(projectRoot, '.scratch/scene-document-tests');
await mkdir(bundleRoot, { recursive: true });
await build({
  entryPoints: {
    sceneDocument: path.join(sourceRoot, 'SceneDocument/sceneDocument.ts'),
    sourceEdits: path.join(sourceRoot, 'SceneDocument/sourceEdits.ts'),
    graphText: path.join(sourceRoot, 'GraphicalEditor/utils/sceneTextProcessor.ts'),
    graphEdits: path.join(sourceRoot, 'SceneDocument/graphicalSourceEdits.ts'),
  },
  outdir: bundleRoot,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
});
const run = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./scene-document.test.mjs', import.meta.url))], {
  stdio: 'inherit',
  env: { ...process.env, SCENE_DOCUMENT_TEST_BUNDLE: bundleRoot },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
