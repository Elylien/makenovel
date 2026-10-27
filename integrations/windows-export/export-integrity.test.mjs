import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import integrity from './export-integrity.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireBackend = createRequire(path.join(root, 'vendor/WebGAL_Terre/packages/terre2/package.json'));
const asar = requireBackend('@electron/asar');
// Exercise the built, locked exporter helper for the actual transformation.
const { WebgalFsService } = requireBackend(path.join(root, 'vendor/WebGAL_Terre/packages/terre2/dist/src/Modules/webgal-fs/webgal-fs.service.js'));
const scratch = path.join(root, '.scratch/windows-export-integrity-tests');
await fs.mkdir(scratch, { recursive: true });
const run = await fs.mkdtemp(path.join(scratch, 'run-'));
const { sha256, fileHashes, hashMapSignature, prepareExportExpectations, verifyFinalArchive, assertExportSourcesUnchanged } = integrity;
const config = { Game_name: '完整离线作品', Description: '原生描述' };
const write = async (rootPath, name, bytes) => {
  const target = path.join(rootPath, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
};

async function fixture({ selfContained = false, missingManifest = false } = {}) {
  const dir = await fs.mkdtemp(path.join(run, 'case-'));
  const sourceRoot = path.join(dir, 'source');
  const templateRoot = path.join(dir, 'template');
  const shellRoot = path.join(dir, 'shell');
  const shellSourceRoot = path.join(dir, 'locked-wrapper');
  const receiptPath = path.join(dir, 'runtime-build.json');
  const engineRoot = selfContained ? sourceRoot : templateRoot;
  await write(sourceRoot, 'game/config.txt', 'Game_name:完整离线作品;\r\nDescription:原生描述;\r\n');
  await write(sourceRoot, 'game/scene/start.txt', '\uFEFF;作者注释\r\n测试员:对白;\r\n');
  const engine = {
    'index.html': selfContained ? '<html>custom engine</html>' : '<html>reviewed shared engine</html>',
    'manifest.json': '{"name":"WebGAL","short_name":"WebGAL","description":"WebGAL DEMO","unrelated":true}\r\n',
    'assets/main.js': selfContained ? 'CUSTOM_ENGINE' : 'REVIEWED_ENGINE',
    'webgal-engine.json': '{"version":"test"}',
    'webgal-serviceworker.js': 'WORKER',
  };
  for (const [name, bytes] of Object.entries(engine)) {
    if (missingManifest && name === 'manifest.json') continue;
    await write(engineRoot, name, bytes);
  }
  for (const [name, bytes] of Object.entries({ 'main.js': 'native main', 'preload.js': 'native preload', 'public/icon.ico': Buffer.from([1, 9, 3]), 'public/icon.png': Buffer.from([8, 2, 4]) })) {
    await write(shellSourceRoot, name, bytes);
    await write(path.join(shellRoot, 'resources/app'), name, bytes);
  }
  await write(shellSourceRoot, 'public/.gitkeep', '');
  if (!selfContained) {
    const engineFiles = await fileHashes(templateRoot);
    await fs.writeFile(receiptPath, JSON.stringify({ schemaVersion: 1, engineFiles, engineSha256: hashMapSignature(engineFiles) }));
  }
  const options = { sourceRoot, templateRoot, receiptPath, shellRoot, shellSourceRoot };
  return { ...options, dir, engineRoot, prepare: () => prepareExportExpectations(options) };
}

async function archive(f, { overrides = {}, omit = [], nativeConfig = config, name = 'final' } = {}) {
  const app = path.join(f.dir, name);
  const engineFiles = await fileHashes(f.engineRoot);
  const sourceFiles = await fileHashes(f.sourceRoot);
  const shellFiles = await fileHashes(path.join(f.shellRoot, 'resources/app'));
  for (const relative of Object.keys(shellFiles)) await write(app, relative, await fs.readFile(path.join(f.shellRoot, 'resources/app', relative)));
  for (const relative of Object.keys(engineFiles).filter((key) => !key.startsWith('game/'))) {
    if (relative === 'webgal-serviceworker.js' || omit.includes('public/' + relative)) continue;
    await write(app, 'public/' + relative, await fs.readFile(path.join(f.engineRoot, relative)));
  }
  for (const relative of Object.keys(sourceFiles).filter((key) => key.startsWith('game/'))) {
    if (!omit.includes('public/' + relative)) await write(app, 'public/' + relative, await fs.readFile(path.join(f.sourceRoot, relative)));
  }
  await WebgalFsService.prototype.replaceTextFile.call({
    isActiveScenePath: async () => false,
    readTextFile: (file) => fs.readFile(file, 'utf8'),
    logger: { log() {} },
  }, path.join(app, 'public/manifest.json'), ['WebGAL DEMO', 'WebGAL'], [nativeConfig.Description, nativeConfig.Game_name]);
  for (const [relative, bytes] of Object.entries(overrides)) await write(app, relative, bytes);
  const asarPath = path.join(f.dir, name + '.asar');
  await asar.createPackage(app, asarPath);
  return asarPath;
}

test('current shared receipt, native manifest transformation and exact source bytes survive real ASAR packing', async () => {
  const f = await fixture(); const expectation = await f.prepare(); const asarPath = await archive(f);
  const result = verifyFinalArchive({ asar, asarPath, expectation, config });
  assert.equal(result.kind, 'reviewed-shared');
  assert.equal(result.inputEngineFiles, 5);
  assert.equal(result.verifiedPublicFiles, 8);
  assert.equal(Object.keys(result.gameFiles).length, 2);
  assert.equal(result.serviceWorkerAbsent, true);
  assert.equal(result.nativeManifestTransformVerified, true);
  await assertExportSourcesUnchanged(expectation);
});

test('stale shared template is rejected even when a current receipt exists', async () => {
  const f = await fixture(); await write(f.templateRoot, 'assets/main.js', 'OLD_ENGINE');
  await assert.rejects(f.prepare(), /Shared template versus runtime receipt bytes differ/);
});

test('unrecorded template files are rejected before export', async () => {
  const f = await fixture(); await write(f.templateRoot, 'assets/extra.js', 'extra');
  await assert.rejects(f.prepare(), /file set differs.*extra: assets\/extra.js/);
});

test('receipt whose engine map no longer matches its signature is rejected', async () => {
  const f = await fixture(); const receipt = JSON.parse(await fs.readFile(f.receiptPath, 'utf8'));
  receipt.engineFiles['index.html'] = sha256('substituted'); await fs.writeFile(f.receiptPath, JSON.stringify(receipt));
  await assert.rejects(f.prepare(), /Invalid runtime build receipt/);
});

test('expected game bytes alone are insufficient: extra game files are rejected', async () => {
  const f = await fixture(); const expectation = await f.prepare();
  const asarPath = await archive(f, { overrides: { 'public/game/scene/stale.txt': 'stale' } });
  assert.throws(() => verifyFinalArchive({ asar, asarPath, expectation, config }), /file set differs.*extra: game\/scene\/stale.txt/);
});

test('missing game files and changed engine bytes are both rejected', async () => {
  const f = await fixture(); const expectation = await f.prepare();
  const missing = await archive(f, { omit: ['public/game/scene/start.txt'], name: 'missing' });
  assert.throws(() => verifyFinalArchive({ asar, asarPath: missing, expectation, config }), /missing: game\/scene\/start.txt/);
  const changed = await archive(f, { overrides: { 'public/assets/main.js': 'stale engine' }, name: 'changed' });
  assert.throws(() => verifyFinalArchive({ asar, asarPath: changed, expectation, config }), /bytes differ: assets\/main.js/);
});

test('additional engine files and retained service worker are rejected', async () => {
  const f = await fixture(); const expectation = await f.prepare();
  for (const [name, extra] of [['extra', 'assets/unreviewed.js'], ['worker', 'webgal-serviceworker.js']]) {
    const asarPath = await archive(f, { overrides: { ['public/' + extra]: 'extra' }, name });
    assert.throws(() => verifyFinalArchive({ asar, asarPath, expectation, config }), /file set differs/);
  }
});

test('manifest must contain exactly the native two replacements, with unrelated fields preserved', async () => {
  const f = await fixture(); const expectation = await f.prepare();
  const asarPath = await archive(f, { overrides: { 'public/manifest.json': '{"name":"完整离线作品","short_name":"完整离线作品","description":"原生描述","unrelated":false}\r\n' } });
  assert.throws(() => verifyFinalArchive({ asar, asarPath, expectation, config }), /bytes differ: manifest.json/);
});

test('manifest expectation preserves native replacement-string semantics, including empty description and dollar tokens', async () => {
  const f = await fixture(); const expectation = await f.prepare();
  const unusual = { Game_name: '$& / author', Description: '' };
  const asarPath = await archive(f, { nativeConfig: unusual });
  assert.equal(verifyFinalArchive({ asar, asarPath, expectation, config: unusual }).nativeManifestTransformVerified, true);
});

test('verification of a valid intermediate archive does not accept a changed final archive', async () => {
  const f = await fixture(); const expectation = await f.prepare();
  const intermediate = await archive(f, { name: 'intermediate' });
  verifyFinalArchive({ asar, asarPath: intermediate, expectation, config });
  const final = await archive(f, { name: 'final', overrides: { 'public/game/scene/start.txt': 'copy corruption' } });
  assert.throws(() => verifyFinalArchive({ asar, asarPath: final, expectation, config }), /bytes differ: game\/scene\/start.txt/);
});

test('self-contained engine uses its own exact files without a shared receipt or engine replacement', async () => {
  const f = await fixture({ selfContained: true });
  await write(f.sourceRoot, 'custom-note.txt', 'preserved self-contained root file');
  const expectation = await f.prepare(); const asarPath = await archive(f);
  const result = verifyFinalArchive({ asar, asarPath, expectation, config });
  assert.equal(result.kind, 'self-contained'); assert.equal(result.runtimeReceiptSha256, null);
  assert.equal(result.runtimeEngineSha256, null);
  assert.equal(asar.extractFile(asarPath, path.join('public', 'assets', 'main.js')).toString(), 'CUSTOM_ENGINE');
});

test('missing manifest is explicitly rejected for shared and self-contained engines without writing a placeholder', async () => {
  for (const selfContained of [false, true]) {
    const f = await fixture({ selfContained, missingManifest: true });
    const before = await fileHashes(f.sourceRoot);
    await assert.rejects(f.prepare(), /Engine missing manifest.json/);
    await assert.rejects(fs.access(path.join(f.engineRoot, 'manifest.json')), { code: 'ENOENT' });
    assert.deepEqual(await fileHashes(f.sourceRoot), before);
  }
});

test('native missing-file behavior creates a non-JSON sentinel, explaining the explicit manifest requirement', async () => {
  const dir = await fs.mkdtemp(path.join(run, 'native-missing-manifest-'));
  const manifestPath = path.join(dir, 'manifest.json');
  const nativeContext = {
    isActiveScenePath: async () => false,
    readTextFile: (file) => WebgalFsService.prototype.readTextFile.call({}, file),
    logger: { log() {} },
  };
  const result = await WebgalFsService.prototype.replaceTextFile.call(nativeContext,
    manifestPath, ['WebGAL DEMO', 'WebGAL'], [config.Description, config.Game_name]);
  assert.equal(result, 'Replaced.');
  const written = await fs.readFile(manifestPath, 'utf8');
  assert.equal(written, 'file not exist');
  assert.throws(() => JSON.parse(written), SyntaxError);
});

test('source, template or receipt changes after snapshot invalidate completion', async () => {
  for (const kind of ['source', 'template', 'receipt']) {
    const f = await fixture(); const expectation = await f.prepare();
    if (kind === 'source') await write(f.sourceRoot, 'game/new.txt', 'late write');
    if (kind === 'template') await write(f.templateRoot, 'assets/main.js', 'late template');
    if (kind === 'receipt') await fs.appendFile(f.receiptPath, '\n');
    await assert.rejects(assertExportSourcesUnchanged(expectation), /Original author project|Shared template changed|Runtime receipt changed/);
  }
});

test('cached or final wrappers must match locked source, not merely their own cached copy', async () => {
  const f = await fixture(); const expectation = await f.prepare();
  const asarPath = await archive(f, { overrides: { 'preload.js': 'unexpected wrapper' } });
  assert.throws(() => verifyFinalArchive({ asar, asarPath, expectation, config }), /Final wrapper differs from locked source/);
  await write(path.join(f.shellRoot, 'resources/app'), 'main.js', 'changed cache');
  await assert.rejects(f.prepare(), /Cached wrapper differs from locked source/);
});

test('unreviewed cached shell public files cannot silently enter the package', async () => {
  const f = await fixture(); await write(path.join(f.shellRoot, 'resources/app'), 'public/extra.js', 'extra');
  await assert.rejects(f.prepare(), /Cached wrapper public assets file set differs/);
});
