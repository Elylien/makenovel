import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sealGame, verifyGame, RUNTIME_COMPATIBILITY_ID } from './manifest.mjs';

function usage() {
  return 'Usage: node integrations/game-manifest/cli.mjs <seal|verify> --game <project-root> [--init|--update] [--backup-root <outside-project-directory>]';
}

export function parseArguments(args) {
  const [action, ...rest] = args;
  if (!['seal', 'verify'].includes(action)) throw new Error(usage());
  const options = {};
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    const names = { '--game': 'game', '--backup-root': 'backupRoot', '--runtime-id': 'runtimeId', '--init': 'init', '--update': 'update' };
    const name = names[flag];
    if (!name || Object.hasOwn(options, name)) throw new Error(`Unknown or repeated argument: ${flag}\n${usage()}`);
    if (name === 'init' || name === 'update') options[name] = true;
    else {
      const value = rest[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      options[name] = value;
    }
  }
  if (!options.game) throw new Error(usage());
  if (options.runtimeId && options.runtimeId !== RUNTIME_COMPATIBILITY_ID) throw new Error('Unsupported --runtime-id; this tool seals only its reviewed runtime compatibility protocol.');
  if (action === 'verify' && (options.init || options.update || options.backupRoot)) throw new Error('verify is read-only and does not accept seal options.');
  return { action, ...options };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = path.resolve(options.game);
  const result = options.action === 'verify'
    ? { manifest: await verifyGame(root), verified: true }
    : await sealGame(root, options);
  console.log(JSON.stringify({
    action: options.action, gameRoot: root, projectId: result.manifest.projectId,
    gameKey: result.manifest.gameKey, manifestHash: result.manifest.manifestHash,
    files: result.manifest.files.length, changed: result.changed, verified: result.verified,
    backupPath: result.backupPath,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((cause) => { console.error(`${cause.code ?? 'MANIFEST_ERROR'}: ${cause.message}`); process.exitCode = 1; });
}
