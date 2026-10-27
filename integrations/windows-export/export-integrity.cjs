// Verify source identity and final package bytes; never edit the engine or game.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isGame = (name) => name.startsWith('game/');
const sortedMap = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const hashMapSignature = (value) => sha256(JSON.stringify(sortedMap(value)));

async function listFiles(root, relative = '') {
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error(`Linked source is not exported: ${root}`);
  const files = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Linked source is not exported: ${name}`);
    if (entry.isDirectory()) files.push(...await listFiles(root, name));
    else if (entry.isFile()) files.push(name.replaceAll('\\', '/'));
    else throw new Error(`Unsupported source file: ${name}`);
  }
  return files.sort();
}

async function fileHashes(root) {
  const hashes = {};
  for (const name of await listFiles(root)) hashes[name] = sha256(await fs.readFile(path.join(root, name)));
  return hashes;
}

function assertHashes(actual, expected, label) {
  const actualNames = Object.keys(actual).sort();
  const expectedNames = Object.keys(expected).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    const missing = expectedNames.filter((name) => !Object.hasOwn(actual, name));
    const extra = actualNames.filter((name) => !Object.hasOwn(expected, name));
    throw new Error(`${label} file set differs (missing: ${missing.join(', ')}; extra: ${extra.join(', ')})`);
  }
  for (const name of expectedNames) {
    if (actual[name] !== expected[name]) throw new Error(`${label} bytes differ: ${name}`);
  }
}

async function prepareExportExpectations({ sourceRoot, templateRoot, receiptPath, shellRoot, shellSourceRoot }) {
  const sourceHashes = await fileHashes(sourceRoot);
  if (!Object.hasOwn(sourceHashes, 'game/config.txt')) throw new Error('Missing game/config.txt');
  const selfContained = Object.hasOwn(sourceHashes, 'index.html');
  const engineRoot = selfContained ? sourceRoot : templateRoot;
  const engineHashes = Object.fromEntries(Object.entries(await fileHashes(engineRoot)).filter(([name]) => !isGame(name)));
  for (const name of ['index.html', 'manifest.json']) {
    if (!Object.hasOwn(engineHashes, name)) throw new Error(`Engine missing ${name}`);
  }
  let receiptBytes;
  let receipt;
  if (!selfContained) {
    // The PowerShell entry first validates this receipt against reviewed sources/dist.
    // Here we additionally bind the actual shared template that Terre will copy.
    receiptBytes = await fs.readFile(receiptPath);
    receipt = JSON.parse(receiptBytes.toString('utf8').replace(/^\uFEFF/, ''));
    if (receipt.schemaVersion !== 1 || !receipt.engineFiles ||
        hashMapSignature(receipt.engineFiles) !== receipt.engineSha256) {
      throw new Error('Invalid runtime build receipt');
    }
    assertHashes(engineHashes, receipt.engineFiles, 'Shared template versus runtime receipt');
  }
  const shellPublicHashes = await fileHashes(path.join(shellSourceRoot, 'public'));
  // electron-builder omits the locked empty directory placeholder. Do not
  // broaden this exception to other hidden files or a nonempty .gitkeep.
  if (shellPublicHashes['.gitkeep'] === sha256(Buffer.alloc(0))) delete shellPublicHashes['.gitkeep'];
  assertHashes(await fileHashes(path.join(shellRoot, 'resources/app/public')), shellPublicHashes, 'Cached wrapper public assets');
  const wrapperHashes = {};
  for (const name of ['main.js', 'preload.js']) {
    wrapperHashes[name] = sha256(await fs.readFile(path.join(shellSourceRoot, name)));
    if (sha256(await fs.readFile(path.join(shellRoot, 'resources/app', name))) !== wrapperHashes[name]) {
      throw new Error(`Cached wrapper differs from locked source: ${name}`);
    }
  }
  return {
    kind: selfContained ? 'self-contained' : 'reviewed-shared',
    sourceRoot, templateRoot, receiptPath, sourceHashes, engineHashes,
    manifestText: await fs.readFile(path.join(engineRoot, 'manifest.json'), 'utf8'),
    shellPublicHashes, wrapperHashes,
    runtimeReceiptSha256: receiptBytes ? sha256(receiptBytes) : null,
    runtimeEngineSha256: receipt?.engineSha256 ?? null,
  };
}

function expectedPublicHashes(expectation, config) {
  if (typeof config.Game_name !== 'string' || typeof config.Description !== 'string') throw new Error('Missing native export config');
  // Match only the two documented native substitutions, including JS replacement
  // string semantics. Any other mutation or missing replacement is rejected.
  const manifest = expectation.manifestText.replace(/WebGAL DEMO/g, config.Description).replace(/WebGAL/g, config.Game_name);
  const hashes = { ...expectation.shellPublicHashes, ...expectation.engineHashes };
  // Native export replaces the entire game directory, including shell leftovers.
  for (const name of Object.keys(hashes)) if (isGame(name)) delete hashes[name];
  delete hashes['webgal-serviceworker.js'];
  hashes['manifest.json'] = sha256(manifest);
  for (const [name, hash] of Object.entries(expectation.sourceHashes)) if (isGame(name)) hashes[name] = hash;
  return hashes;
}

function verifyFinalArchive({ asar, asarPath, expectation, config }) {
  const actualPublic = {};
  for (const listed of asar.listPackage(asarPath)) {
    const name = listed.replaceAll('\\', '/').replace(/^\/+/, '');
    if (name !== 'public' && !name.startsWith('public/')) continue;
    const nativeName = path.normalize(name);
    const stat = asar.statFile(asarPath, nativeName, false);
    if (stat.link) throw new Error(`Linked archive entry: ${name}`);
    if (stat.files) continue;
    const relative = name.slice('public/'.length);
    if (Object.hasOwn(actualPublic, relative)) throw new Error(`Duplicate archive entry: ${relative}`);
    actualPublic[relative] = sha256(asar.extractFile(asarPath, nativeName));
  }
  const expected = expectedPublicHashes(expectation, config);
  assertHashes(actualPublic, expected, 'Final ASAR public content');
  for (const [name, hash] of Object.entries(expectation.wrapperHashes)) {
    if (sha256(asar.extractFile(asarPath, name)) !== hash) throw new Error(`Final wrapper differs from locked source: ${name}`);
  }
  const gameFiles = Object.fromEntries(Object.entries(actualPublic).filter(([name]) => isGame(name)));
  return {
    kind: expectation.kind,
    runtimeReceiptSha256: expectation.runtimeReceiptSha256,
    runtimeEngineSha256: expectation.runtimeEngineSha256,
    inputEngineFiles: Object.keys(expectation.engineHashes).length,
    verifiedPublicFiles: Object.keys(actualPublic).length,
    nativeManifestTransformVerified: true,
    serviceWorkerAbsent: !Object.hasOwn(actualPublic, 'webgal-serviceworker.js'),
    exactGameFileSet: true,
    gameFiles,
  };
}

async function assertExportSourcesUnchanged(expectation) {
  assertHashes(await fileHashes(expectation.sourceRoot), expectation.sourceHashes, 'Original author project');
  if (expectation.kind === 'reviewed-shared') {
    if (sha256(await fs.readFile(expectation.receiptPath)) !== expectation.runtimeReceiptSha256) throw new Error('Runtime receipt changed during export');
    const now = Object.fromEntries(Object.entries(await fileHashes(expectation.templateRoot)).filter(([name]) => !isGame(name)));
    assertHashes(now, expectation.engineHashes, 'Shared template changed during export');
  }
}

module.exports = { sha256, fileHashes, hashMapSignature, assertHashes, prepareExportExpectations, verifyFinalArchive, assertExportSourcesUnchanged };
