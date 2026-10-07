import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const { build } = require('esbuild');
const bundleRoot = path.join(projectRoot, '.scratch/scene-identity-tests');
await mkdir(bundleRoot, { recursive: true });
// A browser build rejects accidental Node imports. This is the same source used
// by Terre, and tests parse actual scripts through BOTH pinned native parsers.
await build({
  entryPoints: { sceneIdentity: path.join(projectRoot, 'vendor/WebGAL_Terre/packages/terre2/src/Modules/scene-identity/scene-identity.ts') },
  outdir: bundleRoot, outExtension: { '.js': '.mjs' }, bundle: true,
  platform: 'browser', format: 'esm', target: 'es2017',
});
const runtimeRoot = path.join(projectRoot, 'vendor/WebGAL');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: runtimeRoot, encoding: 'utf8' }).trim() !== 'd0318e6c4cdb8b04bb5d891f40368cff3c6efc85') throw new Error('Runtime parser must be the locked upstream commit.');
execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'packages/parser/src'], { cwd: runtimeRoot, stdio: 'pipe' });
const run = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./scene-identity.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, SCENE_IDENTITY_TEST_BUNDLE: bundleRoot },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
