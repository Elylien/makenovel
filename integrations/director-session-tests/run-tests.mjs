import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const { build } = require('esbuild');
const out = path.join(root, '.scratch/director-session-tests');
await mkdir(out, { recursive: true });
const scene = path.join(root, 'vendor/WebGAL_Terre/packages/origine2/src/pages/editor/SceneDocument');
const runtime = path.join(root, 'vendor/WebGAL');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: runtime, encoding: 'utf8' }).trim() !== 'd0318e6c4cdb8b04bb5d891f40368cff3c6efc85') {
  throw new Error('Runtime parser must be the locked upstream commit.');
}
execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'packages/parser/src'], { cwd: runtime, stdio: 'pipe' });
await build({
  entryPoints: {
    director: path.join(scene, 'directorSession.ts'),
    document: path.join(scene, 'sceneDocument.ts'),
    graph: path.join(scene, 'graphicalSourceEdits.ts'),
    runtimeParser: path.join(runtime, 'packages/parser/src/index.ts'),
  },
  outdir: out, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
});
const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./director-session.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, DIRECTOR_SESSION_TEST_BUNDLE: out },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
