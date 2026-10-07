const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const terreRoot = path.resolve(__dirname, '../../vendor/WebGAL_Terre');
const backendRoot = path.join(terreRoot, 'packages/terre2');
const protocolEntry = path.join(terreRoot, 'packages/editor-preview-protocol/dist/cjs/index.js');
const lock = require('../../upstream.lock.json').upstreams.find((entry) => entry.name === 'WebGAL_Terre');
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: terreRoot, encoding: 'utf8' });
const lockHash = createHash('sha256').update(fs.readFileSync(path.join(terreRoot, 'yarn.lock'))).digest('hex');

if (head.status !== 0 || head.stdout.trim() !== lock.commit || lockHash.toUpperCase() !== lock.lockSha256) {
  console.error('Terre commit or yarn.lock differs from upstream.lock.json; review the version before testing.');
  process.exit(1);
}

if (!fs.existsSync(protocolEntry)) {
  console.error('Missing generated editor-preview protocol. Build Terre first; this runner never rebuilds shared outputs.');
  process.exit(1);
}

const jestEntry = require.resolve('jest/bin/jest', { paths: [backendRoot] });
const result = spawnSync(process.execPath, [
  jestEntry,
  '--config', path.join(__dirname, 'jest.config.cjs'),
  '--runInBand',
  ...process.argv.slice(2),
], { cwd: backendRoot, stdio: 'inherit', env: process.env });

if (result.error) {
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
