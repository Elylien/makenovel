import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  MANIFEST_PATH, REPO_ROOT, RUNTIME_COMPATIBILITY_ID, canonicalManifestPayload,
  computeManifestHash, validateManifest, sealGame, verifyGame, scanGame, isSafeGamePath,
} from './manifest.mjs';
import { parseArguments } from './cli.mjs';

const scratch = path.join(REPO_ROOT, '.scratch/game-manifest-tests');
await fs.mkdir(scratch, { recursive: true });
const runRoot = await fs.mkdtemp(path.join(scratch, 'run-'));

async function fixture(t, config = 'Game_name:封存样片;\r\nGame_key:manifest-test;\r\n') {
  const directory = await fs.mkdtemp(path.join(runRoot, 'project-'));
  await fs.mkdir(path.join(directory, 'game/scene'), { recursive: true });
  await fs.mkdir(path.join(directory, 'game/background'), { recursive: true });
  await fs.writeFile(path.join(directory, 'game/config.txt'), config, 'utf8');
  await fs.writeFile(path.join(directory, 'game/scene/start.txt'), '\uFEFF;测试\r\ncallScene:child.txt;\r\nsay:返回主场景;');
  await fs.writeFile(path.join(directory, 'game/scene/child.txt'), 'say:子场景;\r\nend;');
  await fs.writeFile(path.join(directory, 'game/background/原字节.bin'), Buffer.from([0, 255, 1, 128]));
  const backupRoot = path.join(runRoot, 'backups');
  const manifestFile = path.join(directory, MANIFEST_PATH);
  // Keep failed-run evidence. No recursive cleanup or user projects are touched.
  return { directory, backupRoot, manifestFile, init: () => sealGame(directory, { init: true, backupRoot }), update: () => sealGame(directory, { update: true, backupRoot }) };
}

function rejectCode(code) { return (cause) => cause.code === code; }

test('canonical wire bytes have exact field order and UTF-8 hashing', () => {
  const manifest = {
    files: [{ sha256: '0'.repeat(64), size: 7, path: 'game/config.txt' }],
    runtimeCompatibilityId: RUNTIME_COMPATIBILITY_ID, gameKey: '中文',
    projectId: '612e1c48-e933-4c68-844a-e51061511212', schemaVersion: 1,
  };
  const canonical = '{"schemaVersion":1,"projectId":"612e1c48-e933-4c68-844a-e51061511212","gameKey":"中文","runtimeCompatibilityId":"' + RUNTIME_COMPATIBILITY_ID + '","files":[{"path":"game/config.txt","size":7,"sha256":"' + '0'.repeat(64) + '"}]}';
  assert.equal(canonicalManifestPayload(manifest), canonical);
  assert.equal(computeManifestHash(manifest), createHash('sha256').update(canonical, 'utf8').digest('hex'));
});

test('initial seal preserves game bytes, binds a UUID and hashes every game file', async (t) => {
  const f = await fixture(t);
  const before = await scanGame(f.directory);
  const result = await f.init();
  assert.equal(result.changed, true);
  assert.equal(result.backupPath, null);
  assert.match(result.manifest.projectId, /^[a-f0-9-]{36}$/);
  assert.equal(result.manifest.gameKey, 'manifest-test');
  assert.deepEqual(result.manifest.files, before);
  assert.equal(result.manifest.files.length, 4);
  assert.deepEqual(await scanGame(f.directory), before);
  assert.deepEqual(await verifyGame(f.directory), result.manifest);
  assert.equal(result.manifest.files.some(({ path }) => path === MANIFEST_PATH), false);
});

test('only empty ordinary .gitkeep placeholders are excluded, without deleting author files', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.directory, 'game/template/assets'), { recursive: true });
  const placeholder = path.join(f.directory, 'game/template/assets/.gitkeep');
  await fs.writeFile(placeholder, '');
  await fs.writeFile(path.join(f.directory, 'game/template/assets/.other'), '');
  const result = await f.init();
  assert.equal(result.manifest.files.some(({ path }) => path.endsWith('/.gitkeep')), false);
  assert.equal(result.manifest.files.some(({ path }) => path.endsWith('/.other')), true);
  assert.equal((await fs.stat(placeholder)).size, 0);
  assert.deepEqual(await verifyGame(f.directory), result.manifest);
});

test('nonempty .gitkeep and a .gitkeep directory are rejected without creating a manifest', async (t) => {
  const f = await fixture(t);
  const placeholder = path.join(f.directory, 'game/.gitkeep');
  await fs.writeFile(placeholder, 'actual resource data');
  await assert.rejects(f.init(), rejectCode('UNSERVED_PLACEHOLDER'));
  assert.equal(await fs.readFile(placeholder, 'utf8'), 'actual resource data');
  await assert.rejects(fs.access(f.manifestFile), { code: 'ENOENT' });
  const other = await fixture(t);
  await fs.mkdir(path.join(other.directory, 'game/.gitkeep'));
  await assert.rejects(other.init(), rejectCode('UNSERVED_PLACEHOLDER'));
});

test('explicit update removes an earlier zero-byte .gitkeep entry while preserving identity and backup', async (t) => {
  const f = await fixture(t);
  const result = await f.init();
  await fs.writeFile(path.join(f.directory, 'game/.gitkeep'), '');
  const previous = structuredClone(result.manifest);
  previous.files.push({ path: 'game/.gitkeep', size: 0, sha256: createHash('sha256').update('').digest('hex') });
  previous.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  previous.manifestHash = computeManifestHash(previous);
  const previousBytes = Buffer.from(JSON.stringify(previous, null, 2) + '\n');
  await fs.writeFile(f.manifestFile, previousBytes);
  await assert.rejects(verifyGame(f.directory), rejectCode('UNSEALED_CHANGES'));
  const updated = await f.update();
  assert.equal(updated.manifest.projectId, previous.projectId);
  assert.equal(updated.manifest.manifestHash, result.manifest.manifestHash);
  assert.equal(updated.manifest.files.some(({ path }) => path.endsWith('/.gitkeep')), false);
  assert.deepEqual(await fs.readFile(updated.backupPath), previousBytes);
});

test('unchanged update is deterministic and preserves original manifest bytes and mtime', async (t) => {
  const f = await fixture(t);
  await f.init();
  const before = await fs.readFile(f.manifestFile);
  const time = (await fs.stat(f.manifestFile)).mtimeMs;
  const result = await f.update();
  assert.equal(result.changed, false);
  assert.equal(result.backupPath, null);
  assert.deepEqual(await fs.readFile(f.manifestFile), before);
  assert.equal((await fs.stat(f.manifestFile)).mtimeMs, time);
});

test('reviewed update keeps identity and backs up the exact previous JSON outside project', async (t) => {
  const f = await fixture(t);
  const initial = await f.init();
  const oldBytes = await fs.readFile(f.manifestFile);
  await fs.appendFile(path.join(f.directory, 'game/scene/child.txt'), '\r\nsay:修订;');
  const updated = await f.update();
  assert.equal(updated.manifest.projectId, initial.manifest.projectId);
  assert.notEqual(updated.manifest.manifestHash, initial.manifest.manifestHash);
  assert.deepEqual(await fs.readFile(updated.backupPath), oldBytes);
  assert.equal(path.relative(f.directory, updated.backupPath).startsWith('..'), true);
  assert.deepEqual(await verifyGame(f.directory), updated.manifest);
});

for (const [name, file, action] of [
  ['parent scene bytes', 'game/scene/start.txt', 'change'],
  ['child scene bytes', 'game/scene/child.txt', 'change'],
  ['asset bytes', 'game/background/原字节.bin', 'change'],
  ['nonidentity config bytes', 'game/config.txt', 'change'],
  ['new file', 'game/scene/new.txt', 'add'],
  ['removed file', 'game/scene/child.txt', 'remove'],
]) {
  test(`verify detects unsealed ${name} and leaves manifest untouched`, async (t) => {
    const f = await fixture(t);
    await f.init();
    const before = await fs.readFile(f.manifestFile);
    const target = path.join(f.directory, file);
    if (action === 'remove') await fs.unlink(target);
    else if (action === 'add') await fs.writeFile(target, 'say:新节点;');
    else await fs.appendFile(target, '\r\n;changed');
    await assert.rejects(verifyGame(f.directory), rejectCode('UNSEALED_CHANGES'));
    assert.deepEqual(await fs.readFile(f.manifestFile), before);
  });
}

test('init cannot replace identity, update cannot invent one, no implicit action', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.update(), rejectCode('MISSING_MANIFEST'));
  await assert.rejects(sealGame(f.directory), rejectCode('EXPLICIT_ACTION_REQUIRED'));
  await assert.rejects(sealGame(f.directory, { init: true, update: true }), rejectCode('EXPLICIT_ACTION_REQUIRED'));
  await f.init();
  const before = await fs.readFile(f.manifestFile);
  await assert.rejects(f.init(), rejectCode('IDENTITY_EXISTS'));
  assert.deepEqual(await fs.readFile(f.manifestFile), before);
});

test('a changed Game_key cannot repurpose an existing project identity', async (t) => {
  const f = await fixture(t);
  await f.init();
  const before = await fs.readFile(f.manifestFile);
  await fs.writeFile(path.join(f.directory, 'game/config.txt'), 'Game_key:another-work;');
  await assert.rejects(f.update(), rejectCode('IDENTITY_CHANGED'));
  await assert.rejects(verifyGame(f.directory), rejectCode('IDENTITY_CHANGED'));
  assert.deepEqual(await fs.readFile(f.manifestFile), before);
});

test('bad JSON, unknown schema, bad hash, and extra fields are preserved and rejected', async (t) => {
  const f = await fixture(t);
  const result = await f.init();
  for (const value of ['{broken', JSON.stringify({ ...result.manifest, schemaVersion: 999 }), JSON.stringify({ ...result.manifest, manifestHash: '0'.repeat(64) }), JSON.stringify({ ...result.manifest, surprise: true })]) {
    await fs.writeFile(f.manifestFile, value);
    await assert.rejects(f.update());
    assert.equal(await fs.readFile(f.manifestFile, 'utf8'), value);
  }
});

for (const [name, config] of [
  ['missing key', 'Game_name:test;'],
  ['duplicate key', 'Game_key:first;\nGame_key:second;'],
  ['multiple key args', 'Game_key:first|second;'],
  ['key options', 'Game_key:first -flag=true;'],
  ['BOM attached to key', '\uFEFFGame_key:hidden-from-native-parser;'],
  ['reserved verified namespace', 'Game_key:makenovel-v1:reserved;'],
  ['reserved unverified namespace', 'Game_key:makenovel-unverified-v1:reserved;'],
  ['reserved backup namespace', 'Game_key:makenovel-backup-v1:reserved;'],
]) {
  test(`native parser rejects ambiguous configuration: ${name}`, async (t) => {
    const f = await fixture(t, config);
    await assert.rejects(f.init(), rejectCode('INVALID_CONFIG'));
    await assert.rejects(fs.access(f.manifestFile), { code: 'ENOENT' });
  });
}

test('BOM/comment line and CRLF bytes survive without normalization', async (t) => {
  const f = await fixture(t, '\uFEFF;comment\r\nGame_key:exact-key;\r\n');
  const configPath = path.join(f.directory, 'game/config.txt');
  const before = await fs.readFile(configPath);
  await f.init();
  assert.deepEqual(await fs.readFile(configPath), before);
  assert.equal((await verifyGame(f.directory)).gameKey, 'exact-key');
});

test('manifest validator rejects unsafe paths, case collisions, ordering, and unknown runtime', async (t) => {
  const f = await fixture(t);
  const { manifest } = await f.init();
  for (const unsafe of ['game/../secret', 'game/a\\b', 'game/COM1', 'game/a.', 'game/a:stream', 'game/makenovel-manifest.json', '/game/file']) assert.equal(isSafeGamePath(unsafe), false);
  const withFiles = (files) => { const value = { ...manifest, files }; value.manifestHash = computeManifestHash(value); return value; };
  assert.throws(() => validateManifest(withFiles([...manifest.files].reverse())));
  const entry = manifest.files[0];
  assert.throws(() => validateManifest(withFiles([{ ...entry, path: 'game/A' }, { ...entry, path: 'game/a' }, ...manifest.files])));
  assert.throws(() => validateManifest({ ...manifest, runtimeCompatibilityId: 'future-protocol' }), rejectCode('INCOMPATIBLE_RUNTIME'));
  for (const gameKey of ['makenovel-v1:reserved', 'makenovel-unverified-v1:reserved', 'makenovel-backup-v1:reserved']) {
    const value = { ...manifest, gameKey }; value.manifestHash = computeManifestHash(value);
    assert.throws(() => validateManifest(value), rejectCode('INVALID_IDENTITY'));
  }
});

test('source change during native parse fails without writing a manifest', async (t) => {
  const f = await fixture(t);
  const parseConfig = () => {
    // A controlled real disk mutation at the parser boundary, before scan two.
    appendFileSync(path.join(f.directory, 'game/scene/start.txt'), '\r\nsay:concurrent;');
    return [{ command: 'Game_key', args: ['manifest-test'], options: [] }];
  };
  await assert.rejects(sealGame(f.directory, { init: true, parseConfig }), rejectCode('SOURCE_CHANGED'));
  await assert.rejects(fs.access(f.manifestFile), { code: 'ENOENT' });
});

test('a lock blocks concurrent sealing and is never removed by the rejected process', async (t) => {
  const f = await fixture(t);
  const lock = path.join(f.directory, '.makenovel-manifest.lock');
  await fs.writeFile(lock, 'owner evidence');
  await assert.rejects(f.init(), rejectCode('SEAL_BUSY'));
  assert.equal(await fs.readFile(lock, 'utf8'), 'owner evidence');
});

test('backup failure prevents replacement and retains the previous manifest', async (t) => {
  const f = await fixture(t);
  await f.init();
  const before = await fs.readFile(f.manifestFile);
  await fs.appendFile(path.join(f.directory, 'game/scene/start.txt'), '\n;reviewed');
  await assert.rejects(sealGame(f.directory, { update: true, backupRoot: path.join(f.directory, 'backups') }), rejectCode('UNSAFE_PATH'));
  assert.deepEqual(await fs.readFile(f.manifestFile), before);
});

test('junction descendants and ancestor aliases are rejected', async (t) => {
  const f = await fixture(t);
  const external = await fs.mkdtemp(path.join(runRoot, 'external-'));
  const link = path.join(f.directory, 'game/linked');
  await fs.symlink(external, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.init(), rejectCode('UNSAFE_PATH'));
  const alias = path.join(runRoot, 'alias-' + path.basename(f.directory));
  await fs.symlink(f.directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(sealGame(alias, { init: true }), rejectCode('UNSAFE_PATH'));
});

test('sealing a copy with an existing manifest preserves identity, not an implicit new project', async (t) => {
  const f = await fixture(t);
  const { manifest } = await f.init();
  const copy = path.join(runRoot, 'copy-' + path.basename(f.directory));
  await fs.cp(f.directory, copy, { recursive: true });
  const result = await sealGame(copy, { update: true });
  assert.equal(result.changed, false);
  assert.equal(result.manifest.projectId, manifest.projectId);
  assert.deepEqual(await verifyGame(copy), manifest);
});

test('CLI argument validation keeps verify read-only and refuses unknown or duplicate options', () => {
  assert.deepEqual(parseArguments(['verify', '--game', 'demo']), { action: 'verify', game: 'demo' });
  for (const args of [['verify', '--game', 'demo', '--init'], ['seal', '--game', 'a', '--game', 'b'], ['verify', '--game'], ['verify', '--game', 'demo', '--force'], ['seal', '--game', 'demo', '--runtime-id', 'unknown']]) assert.throws(() => parseArguments(args));
});

test('CLI performs an actual seal/verify and reports changed content with nonzero exit', async (t) => {
  const f = await fixture(t);
  const cli = path.join(REPO_ROOT, 'integrations/game-manifest/cli.mjs');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: REPO_ROOT });
  const initial = run('seal', '--game', f.directory, '--init', '--backup-root', f.backupRoot);
  assert.equal(initial.status, 0, initial.stderr);
  assert.equal(JSON.parse(initial.stdout).changed, true);
  const verified = run('verify', '--game', f.directory);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).verified, true);
  await fs.appendFile(path.join(f.directory, 'game/scene/child.txt'), '\n;edited');
  const refused = run('verify', '--game', f.directory);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /UNSEALED_CHANGES/u);
});
