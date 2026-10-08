import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 1;
export const MANIFEST_PATH = 'game/makenovel-manifest.json';
export const RUNTIME_COMPATIBILITY_ID = 'makenovel-webgal-save-v1:d0318e6c4cdb8b04bb5d891f40368cff3c6efc85';
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const RESERVED_GAME_KEY = /^makenovel-(?:v1|unverified-v1|backup-v1):/;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const error = (code, message) => Object.assign(new Error(message), { code });
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/** This field order is the runtime wire contract, not generic sorted-key JSON. */
export function canonicalManifestPayload(manifest) {
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    projectId: manifest.projectId,
    gameKey: manifest.gameKey,
    runtimeCompatibilityId: manifest.runtimeCompatibilityId,
    files: manifest.files.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
  });
}

export function computeManifestHash(manifest) {
  return sha256(Buffer.from(canonicalManifestPayload(manifest), 'utf8'));
}

function safeSegment(segment) {
  return segment !== '' && segment !== '.' && segment !== '..'
    && !/[<>:"/\\|?*\u0000-\u001f\u007f]/u.test(segment)
    && !/[. ]$/u.test(segment)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment);
}

export function isSafeGamePath(value) {
  return typeof value === 'string' && value.startsWith('game/')
    && value.split('/').every(safeSegment) && value.toLowerCase() !== MANIFEST_PATH;
}

/** Validates untrusted data without normalizing or silently repairing it. */
export function validateManifest(manifest) {
  if (!exactKeys(manifest, ['schemaVersion', 'projectId', 'gameKey', 'runtimeCompatibilityId', 'files', 'manifestHash'])) {
    throw error('INVALID_MANIFEST', 'Manifest fields are missing or unknown; preserve the original file.');
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION) throw error('UNKNOWN_SCHEMA', 'Unsupported manifest schemaVersion.');
  if (typeof manifest.projectId !== 'string' || !UUID.test(manifest.projectId)) throw error('INVALID_IDENTITY', 'projectId must be a lower-case UUID.');
  if (typeof manifest.gameKey !== 'string' || manifest.gameKey.trim() !== manifest.gameKey || !manifest.gameKey || /[\u0000-\u001f\u007f]/u.test(manifest.gameKey)) {
    throw error('INVALID_IDENTITY', 'gameKey must be nonempty, trimmed text without control characters.');
  }
  if (RESERVED_GAME_KEY.test(manifest.gameKey)) throw error('INVALID_IDENTITY', 'gameKey uses a reserved MakeNovel storage namespace prefix.');
  if (manifest.runtimeCompatibilityId !== RUNTIME_COMPATIBILITY_ID) throw error('INCOMPATIBLE_RUNTIME', 'Manifest runtime compatibility ID is not supported by this tool.');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw error('INVALID_MANIFEST', 'Manifest files must be a nonempty array.');
  const folded = new Set();
  let previous;
  for (const file of manifest.files) {
    if (!exactKeys(file, ['path', 'size', 'sha256']) || !isSafeGamePath(file.path)
        || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.sha256 !== 'string' || !HASH.test(file.sha256)) {
      throw error('INVALID_MANIFEST', 'Invalid game file entry.');
    }
    if ((previous !== undefined && previous >= file.path) || folded.has(file.path.toLowerCase())) {
      throw error('INVALID_MANIFEST', 'File paths must be unique, case-insensitively distinct, and sorted by JavaScript UTF-16 order.');
    }
    previous = file.path;
    folded.add(file.path.toLowerCase());
  }
  if (!manifest.files.some((entry) => entry.path === 'game/config.txt')) throw error('INVALID_MANIFEST', 'Manifest must contain game/config.txt with exact casing.');
  if (typeof manifest.manifestHash !== 'string' || !HASH.test(manifest.manifestHash) || computeManifestHash(manifest) !== manifest.manifestHash) {
    throw error('INVALID_MANIFEST_HASH', 'Manifest hash does not match its exact canonical payload.');
  }
  return manifest;
}

function parseManifest(bytes) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw error('INVALID_MANIFEST', 'Manifest is not valid UTF-8 JSON; the original was not changed.'); }
  return validateManifest(value);
}

async function optionalRead(filename) {
  try { return await fs.readFile(filename); }
  catch (cause) { if (cause.code === 'ENOENT') return undefined; throw cause; }
}

/** Check every ancestor as well as descendants; a safe leaf under a junction is unsafe. */
export async function assertPlainDirectory(directory) {
  const full = path.resolve(directory);
  const root = path.parse(full).root;
  let current = full;
  while (true) {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw error('UNSAFE_PATH', `Directory is linked or not a normal directory: ${current}`);
    if (current === root) break;
    current = path.dirname(current);
  }
  return full;
}

async function collectFiles(gameRoot) {
  const files = [];
  const folded = new Set();
  async function walk(relative) {
    const names = await fs.readdir(path.join(gameRoot, relative));
    names.sort();
    for (const name of names) {
      if (!safeSegment(name)) throw error('UNSAFE_PATH', `Game path is not portable and safe: ${name}`);
      const child = `${relative}/${name}`;
      if (folded.has(child.toLowerCase())) throw error('UNSAFE_PATH', `Case-insensitive game path collision: ${child}`);
      folded.add(child.toLowerCase());
      const stat = await fs.lstat(path.join(gameRoot, child));
      if (stat.isSymbolicLink()) throw error('UNSAFE_PATH', `Linked game entries cannot be sealed: ${child}`);
      // Terre's HTTP file endpoint does not serve dotfiles. Empty .gitkeep is
      // only a repository directory placeholder, not a runtime resource.
      if (name === '.gitkeep') {
        if (!stat.isFile() || stat.size !== 0) throw error('UNSERVED_PLACEHOLDER', `Only an empty ordinary .gitkeep placeholder can be excluded; this path cannot be verified through Terre HTTP: ${child}`);
        continue;
      }
      if (child.toLowerCase() === MANIFEST_PATH) {
        if (child !== MANIFEST_PATH || !stat.isFile()) throw error('UNSAFE_PATH', 'The reserved manifest path must be an ordinary file with exact casing.');
        continue;
      }
      if (stat.isDirectory()) await walk(child);
      else if (stat.isFile()) files.push(child);
      else throw error('UNSAFE_PATH', `Unsupported game entry: ${child}`);
    }
  }
  await assertPlainDirectory(path.join(gameRoot, 'game'));
  await walk('game');
  return files.sort();
}

async function hashFile(filename) {
  const before = await fs.lstat(filename);
  if (before.isSymbolicLink() || !before.isFile()) throw error('UNSAFE_PATH', `Not a normal file: ${filename}`);
  const handle = await fs.open(filename, 'r');
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw error('SOURCE_CHANGED', `File changed while opening: ${filename}`);
    const hash = createHash('sha256');
    let size = 0;
    const buffer = Buffer.alloc(256 * 1024);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      size += bytesRead;
    }
    const after = await handle.stat();
    const final = await fs.lstat(filename);
    if (size !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
        || final.isSymbolicLink() || final.dev !== after.dev || final.ino !== after.ino || final.size !== after.size || final.mtimeMs !== after.mtimeMs) {
      throw error('SOURCE_CHANGED', `File changed while hashing: ${filename}`);
    }
    return { size, sha256: hash.digest('hex') };
  } finally { await handle.close(); }
}

/** Game bytes except the manifest itself and empty ordinary .gitkeep placeholders. */
export async function scanGame(gameRoot) {
  const root = await assertPlainDirectory(gameRoot);
  const names = await collectFiles(root);
  if (!names.includes('game/config.txt')) throw error('MISSING_CONFIG', 'Missing game/config.txt with exact casing.');
  const files = [];
  for (const name of names) files.push({ path: name, ...await hashFile(path.join(root, name)) });
  if (JSON.stringify(await collectFiles(root)) !== JSON.stringify(names)) throw error('SOURCE_CHANGED', 'The game file set changed while hashing.');
  return files;
}

function nativeConfigParser() {
  const require = createRequire(import.meta.url);
  const modulePath = path.join(REPO_ROOT, 'vendor/WebGAL/packages/parser/build/cjs/index.cjs');
  let parser;
  try { parser = require(modulePath); }
  catch (cause) { throw error('PARSER_UNAVAILABLE', `Build the locked WebGAL parser before sealing: ${cause.message}`); }
  const instance = new parser.default(undefined, (value) => value, parser.ADD_NEXT_ARG_LIST, parser.SCRIPT_CONFIG);
  return (text) => instance.parseConfig(text);
}

export async function readGameKey(gameRoot, files, parseConfig = nativeConfigParser()) {
  const bytes = await fs.readFile(path.join(gameRoot, 'game/config.txt'));
  const recorded = files.find((entry) => entry.path === 'game/config.txt');
  if (!recorded || bytes.length !== recorded.size || sha256(bytes) !== recorded.sha256) throw error('SOURCE_CHANGED', 'Configuration changed during sealing.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw error('INVALID_CONFIG', 'Configuration must contain valid UTF-8.'); }
  // Preserve BOM: the native parser treats a BOM attached to Game_key as part of
  // the command, so stripping it here would bind a key that the runtime never uses.
  const entries = parseConfig(text).filter((entry) => entry.command === 'Game_key');
  if (entries.length !== 1 || entries[0].args.length !== 1 || entries[0].options.length !== 0) {
    throw error('INVALID_CONFIG', 'Configuration must have exactly one unambiguous native Game_key command.');
  }
  const key = entries[0].args[0];
  if (typeof key !== 'string' || !key || key !== key.trim() || /[\u0000-\u001f\u007f]/u.test(key)) throw error('INVALID_CONFIG', 'Game_key is empty or contains unsupported control characters.');
  if (RESERVED_GAME_KEY.test(key)) throw error('INVALID_CONFIG', 'Game_key uses a reserved MakeNovel storage namespace prefix.');
  return key;
}

export async function verifyGame(gameRoot, options = {}) {
  const root = await assertPlainDirectory(gameRoot);
  const files = await scanGame(root);
  const bytes = await optionalRead(path.join(root, MANIFEST_PATH));
  if (!bytes) throw error('MISSING_MANIFEST', 'No manifest exists; explicitly seal a new identity with --init.');
  const manifest = parseManifest(bytes);
  const gameKey = await readGameKey(root, files, options.parseConfig);
  if (gameKey !== manifest.gameKey) throw error('IDENTITY_CHANGED', 'Game_key differs from the sealed project identity.');
  if (JSON.stringify(files) !== JSON.stringify(manifest.files)) throw error('UNSEALED_CHANGES', 'Game files have changed; explicitly seal the reviewed revision with --update.');
  if (JSON.stringify(await scanGame(root)) !== JSON.stringify(files)) throw error('SOURCE_CHANGED', 'Game files changed during verification.');
  const finalBytes = await optionalRead(path.join(root, MANIFEST_PATH));
  if (!finalBytes?.equals(bytes)) throw error('SOURCE_CHANGED', 'Manifest changed during verification.');
  return manifest;
}

async function writeExclusive(filename, bytes) {
  const handle = await fs.open(filename, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

async function prepareBackupDirectory(directory, gameRoot) {
  const full = path.resolve(directory);
  const relative = path.relative(gameRoot, full);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw error('UNSAFE_PATH', 'Manifest backups must be outside the author project.');
  }
  // Do not mkdir through a junction. Check existing ancestors before creation.
  let existing = full;
  while (true) {
    try { await fs.lstat(existing); break; }
    catch (cause) { if (cause.code !== 'ENOENT') throw cause; existing = path.dirname(existing); }
  }
  await assertPlainDirectory(existing);
  await fs.mkdir(full, { recursive: true });
  return assertPlainDirectory(full);
}

/** Explicit author action; never called automatically by startup, save or export. */
export async function sealGame(gameRoot, options = {}) {
  if (options.init === options.update || (!options.init && !options.update)) throw error('EXPLICIT_ACTION_REQUIRED', 'Specify exactly one of --init or --update.');
  const root = await assertPlainDirectory(gameRoot);
  const manifestPath = path.join(root, MANIFEST_PATH);
  const lockPath = path.join(root, '.makenovel-manifest.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (cause) { if (cause.code === 'EEXIST') throw error('SEAL_BUSY', 'A seal lock already exists. Check its owner before manual recovery; it was not removed.'); throw cause; }
  const temporary = path.join(root, `.makenovel-manifest-${randomUUID()}.tmp`);
  let createdTemporary = false;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, operation: 'seal-manifest' }) + '\n');
    await lock.sync();
    const files = await scanGame(root);
    const previousBytes = await optionalRead(manifestPath);
    if (options.init && previousBytes) throw error('IDENTITY_EXISTS', 'Manifest already exists; --init never replaces project identity.');
    if (options.update && !previousBytes) throw error('MISSING_MANIFEST', 'No existing identity to update; use --init for a new project.');
    const previous = previousBytes ? parseManifest(previousBytes) : undefined;
    const gameKey = await readGameKey(root, files, options.parseConfig);
    if (previous && previous.gameKey !== gameKey) throw error('IDENTITY_CHANGED', 'Game_key changed. Existing project identity was preserved; create a distinct project explicitly.');
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      projectId: previous?.projectId ?? randomUUID(),
      gameKey,
      runtimeCompatibilityId: RUNTIME_COMPATIBILITY_ID,
      files,
    };
    manifest.manifestHash = computeManifestHash(manifest);
    validateManifest(manifest);
    const nextBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    // A second full scan catches ordinary concurrent editor writes. The local
    // lock serializes this CLI, not external writers; stop author editing while sealing.
    if (JSON.stringify(await scanGame(root)) !== JSON.stringify(files)) throw error('SOURCE_CHANGED', 'Game files changed during sealing.');
    const latestBytes = await optionalRead(manifestPath);
    if (previousBytes ? !latestBytes?.equals(previousBytes) : latestBytes !== undefined) throw error('SOURCE_CHANGED', 'Manifest changed during sealing.');
    if (previous && previous.manifestHash === manifest.manifestHash) return { manifest: previous, changed: false, backupPath: null };
    let backupPath = null;
    if (previousBytes) {
      const backupRoot = await prepareBackupDirectory(options.backupRoot ?? path.join(REPO_ROOT, '.local/manifest-backups'), root);
      const projectBackup = path.join(backupRoot, previous.projectId);
      await fs.mkdir(projectBackup, { recursive: true });
      await assertPlainDirectory(projectBackup);
      // Hash the original JSON bytes too: formatting differences must never replace a backup.
      backupPath = path.join(projectBackup, `${previous.manifestHash}-${sha256(previousBytes)}.json`);
      try { await writeExclusive(backupPath, previousBytes); }
      catch (cause) {
        if (cause.code !== 'EEXIST') throw cause;
        const stat = await fs.lstat(backupPath);
        if (stat.isSymbolicLink() || !stat.isFile() || !(await fs.readFile(backupPath)).equals(previousBytes)) throw error('BACKUP_CONFLICT', 'An existing backup does not match the original manifest.');
      }
    }
    await writeExclusive(temporary, nextBytes);
    createdTemporary = true;
    // Recheck both paths immediately before rename; never follow a swapped link.
    await assertPlainDirectory(path.join(root, 'game'));
    if (JSON.stringify(await scanGame(root)) !== JSON.stringify(files)) throw error('SOURCE_CHANGED', 'Game files changed before manifest replacement.');
    const beforeRename = await optionalRead(manifestPath);
    if (previousBytes ? !beforeRename?.equals(previousBytes) : beforeRename !== undefined) throw error('SOURCE_CHANGED', 'Manifest changed before replacement.');
    if (beforeRename) {
      const stat = await fs.lstat(manifestPath);
      if (stat.isSymbolicLink() || !stat.isFile()) throw error('UNSAFE_PATH', 'Manifest destination became a linked path.');
    }
    if (options.init) {
      // link is an atomic create-if-absent, preventing an unexpected concurrent
      // first seal from being overwritten. Both paths are on the same volume.
      await fs.link(temporary, manifestPath);
      await fs.unlink(temporary);
    } else {
      await fs.rename(temporary, manifestPath);
    }
    createdTemporary = false;
    return { manifest, changed: true, backupPath };
  } finally {
    if (createdTemporary) await fs.unlink(temporary).catch(() => {});
    await lock.close();
    await fs.unlink(lockPath);
  }
}
