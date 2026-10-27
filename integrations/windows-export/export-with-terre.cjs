// Invoke the pinned Terre exporter in a disposable author profile. No HTTP server.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { sha256, fileHashes, prepareExportExpectations, verifyFinalArchive, assertExportSourcesUnchanged } = require('./export-integrity.cjs');

async function main() {
  const [repoArg, sourceArg, shellArg, workArg, outputArg] = process.argv.slice(2);
  if (!outputArg || process.platform !== 'win32') throw new Error('Expected: repo sourceGame builtShell workRoot outputRoot (Windows only)');
  const [repoRoot, sourceRoot, shellRoot, workRoot, outputRoot] = [repoArg, sourceArg, shellArg, workArg, outputArg].map((name) => path.resolve(name));
  const inside = (root, name) => { const relative = path.relative(root, name); return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative); };
  if (!inside(path.join(repoRoot, '.scratch', 'windows-export'), workRoot)) throw new Error('Work directory must be beneath .scratch/windows-export');
  if (!inside(path.join(repoRoot, '.local', 'exports'), outputRoot)) throw new Error('Output directory must be beneath .local/exports');
  if ((await fs.lstat(sourceRoot)).isSymbolicLink()) throw new Error('The source directory cannot be a link');
  await fs.access(path.join(sourceRoot, 'game', 'config.txt'));
  await fs.access(path.join(shellRoot, 'WebGAL.exe'));
  const backendRoot = path.join(repoRoot, 'vendor', 'WebGAL_Terre', 'packages', 'terre2');
  const expectation = await prepareExportExpectations({
    sourceRoot,
    templateRoot: path.join(backendRoot, 'assets/templates/WebGAL_Template'),
    receiptPath: path.join(repoRoot, '.local/runtime-sync/runtime-build.json'),
    shellRoot,
    shellSourceRoot: path.join(repoRoot, 'vendor/WebGAL_Terre/packages/WebGAL-electron'),
  });
  const sourceHashes = expectation.sourceHashes;
  // mkdir without recursive is deliberate: never reuse or remove an existing run.
  await fs.mkdir(workRoot);
  await fs.mkdir(outputRoot);
  const appRoot = path.join(workRoot, 'app-root');
  const profileRoot = path.join(workRoot, 'profile');
  const templateRoot = path.join(appRoot, 'assets', 'templates');
  const gameName = 'export-snapshot';
  await fs.mkdir(templateRoot, { recursive: true });
  const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
  await fs.cp(shellRoot, path.join(templateRoot, 'WebGAL_Electron_Template'), { recursive: true });
  await fs.cp(path.join(backendRoot, 'assets', 'templates', 'WebGAL_Template'), path.join(templateRoot, 'WebGAL_Template'), { recursive: true });
  await fs.mkdir(path.join(profileRoot, 'games'), { recursive: true });
  await fs.cp(sourceRoot, path.join(profileRoot, 'games', gameName), { recursive: true });
  const snapshotHashes = await fileHashes(path.join(profileRoot, 'games', gameName));
  if (JSON.stringify(snapshotHashes) !== JSON.stringify(sourceHashes)) throw new Error('The source changed while its export snapshot was being copied');

  process.chdir(appRoot);
  process.env.WEBGAL_USER_DATA_ROOT = profileRoot;
  // The exporter normally opens Explorer after packaging. Suppress only that UI
  // side effect; the actual service, fs operations and ASAR implementation run.
  backendRequire(path.join(backendRoot, 'dist', 'src', 'util', 'open.js'))._open = async () => {};
  const { ConsoleLogger } = backendRequire('@nestjs/common');
  const { UserDataService } = backendRequire(path.join(backendRoot, 'dist/src/Modules/user-data/user-data.service.js'));
  const { WebgalFsService } = backendRequire(path.join(backendRoot, 'dist/src/Modules/webgal-fs/webgal-fs.service.js'));
  const { ManageGameService } = backendRequire(path.join(backendRoot, 'dist/src/Modules/manage-game/manage-game.service.js'));
  await UserDataService.initialize();
  if (path.resolve(UserDataService.getGameRoot()) !== path.join(profileRoot, 'games')) throw new Error('The built backend does not support isolated author profiles; rebuild the patched backend first');
  const logger = new ConsoleLogger('MakeNovelExport', { logLevels: ['error', 'warn'] });
  const service = new ManageGameService(logger, new WebgalFsService(logger));
  const config = await service.getGameConfig(gameName);
  const succeeded = await service.exportGame(gameName, 'electron-windows');
  if (!succeeded) throw new Error('The upstream Terre exporter returned false');
  const exportedRoot = path.join(profileRoot, 'Exported_Games', gameName, 'electron-windows');
  await assertExportSourcesUnchanged(expectation);
  await fs.cp(exportedRoot, outputRoot, { recursive: true });
  // Verify the final copied package, not only its intermediate export directory.
  const asarPath = path.join(outputRoot, 'resources', 'app.asar');
  const asar = backendRequire('@electron/asar');
  const integrity = verifyFinalArchive({ asar, asarPath, expectation, config });
  const exportedGame = integrity.gameFiles;
  await fs.access(path.join(outputRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'steamworks.js', 'dist', 'win64', 'steamworksjs.win32-x64-msvc.node'));
  await assertExportSourcesUnchanged(expectation);
  const report = {
    schemaVersion: 2, createdAt: new Date().toISOString(),
    method: 'pinned ManageGameService.exportGame(electron-windows)',
    sourceRoot, outputRoot, sourceFiles: Object.keys(sourceHashes).length,
    verifiedGameFiles: Object.keys(exportedGame).length,
    sourceUnchanged: true, gameBytesMatch: true, serviceWorkerRemoved: true,
    originalWrapperPreserved: true,
    integrity,
    exeSha256: sha256(await fs.readFile(path.join(outputRoot, 'WebGAL.exe'))),
    asarSha256: sha256(await fs.readFile(path.join(outputRoot, 'resources', 'app.asar'))),
    compiledExporterSha256: sha256(await fs.readFile(path.join(backendRoot, 'dist/src/Modules/manage-game/manage-game.service.js'))),
    wrapperLockSha256: sha256(await fs.readFile(path.join(repoRoot, 'vendor/WebGAL_Terre/packages/WebGAL-electron/yarn.lock'))),
    runtimeIndexSha256: sha256(asar.extractFile(asarPath, path.join('public', 'index.html'))),
    gameFiles: exportedGame,
    acceptance: { packaged: true, processLaunch: 'not-run', gui: 'not-run', offlineRestart: 'not-run', ordinaryUser: 'not-run' },
  };
  await fs.writeFile(path.join(outputRoot, 'makenovel-export.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ outputRoot, sourceFiles: report.sourceFiles, verifiedGameFiles: report.verifiedGameFiles, engineKind: integrity.kind, verifiedPublicFiles: integrity.verifiedPublicFiles, asarSha256: report.asarSha256 }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
