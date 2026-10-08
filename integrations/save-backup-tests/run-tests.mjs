import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL/package.json', import.meta.url));
const { build } = require('esbuild');
const bundleRoot = path.join(root, '.scratch/save-backup-tests');
await mkdir(bundleRoot, { recursive: true });
await build({
  entryPoints: [path.join(root, 'vendor/WebGAL/packages/webgal/src/Core/controller/storage/saveBackup.ts')],
  outfile: path.join(bundleRoot, 'saveBackup.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
});
const run = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./save-backup.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, SAVE_BACKUP_TEST_BUNDLE: bundleRoot },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
