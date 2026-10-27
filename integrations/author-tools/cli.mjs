import { readFile, stat, writeFile } from 'node:fs/promises';
import { AuthorToolError, createClient, getCapabilities, getCommands, listProjects, listAssets, readScene, diagnoseScene, createProposal, reviewProposal, validateProposal, commitProposal } from './author-tools.mjs';

const ALLOWED = {
  capabilities: [], commands: [], projects: ['origin'], assets: ['origin', 'game', 'category'], source: ['origin', 'game', 'path'],
  diagnose: ['file'], propose: ['origin', 'game', 'path', 'operations', 'out'], review: ['proposal'],
  validate: ['origin', 'proposal'], commit: ['origin', 'proposal', 'review-hash'],
};
const fail = (code, message) => { throw new AuthorToolError(code, message); };
const usage = { commands: ALLOWED, example: 'node integrations/author-tools/cli.mjs source --game my-game --path game/scene/start.txt', note: 'Local tools only. No models, secrets, execution, automatic sealing, or direct scene filesystem writes.' };
async function localFile(filename, json = true) {
  if (!filename) fail('INVALID_ARGUMENT', 'A local input file is required.');
  const entry = await stat(filename);
  if (!entry.isFile() || entry.size > 16 * 1024 * 1024) fail('FILE_TOO_LARGE', 'Input must be a regular file within 16 MiB.');
  const bytes = await readFile(filename);
  if (bytes.length > 16 * 1024 * 1024) fail('FILE_TOO_LARGE', 'Input files are limited to 16 MiB.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('INVALID_UTF8', 'Input must be valid UTF-8.'); }
  if (!json) return text;
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); } catch { fail('INVALID_JSON', 'Input must contain valid JSON.'); }
}
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') { console.log(JSON.stringify(usage, null, 2)); }
  else {
    if (!Object.hasOwn(ALLOWED, command)) fail('INVALID_ARGUMENT', 'Unknown command. Use --help.');
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i]?.replace(/^--/, '');
      if (!args[i]?.startsWith('--') || !ALLOWED[command].includes(key) || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith('--')) fail('INVALID_ARGUMENT', 'Unknown, duplicate or incomplete command option.');
      options[key] = args[i + 1];
    }
    const client = ['projects', 'assets', 'source', 'propose', 'validate', 'commit'].includes(command) ? createClient({ origin: options.origin }) : null;
    const selected = { gameName: options.game, ...(options.path ? { path: options.path } : {}) };
    let result;
    if (command === 'capabilities') result = getCapabilities();
    else if (command === 'commands') result = await getCommands();
    else if (command === 'projects') result = await listProjects(client);
    else if (command === 'assets') result = await listAssets(client, { gameName: options.game, category: options.category });
    else if (command === 'source') result = await readScene(client, selected);
    else if (command === 'diagnose') result = await diagnoseScene(await localFile(options.file, false));
    else if (command === 'review') result = await reviewProposal(await localFile(options.proposal));
    else if (command === 'validate') result = await validateProposal(client, await localFile(options.proposal));
    else if (command === 'commit') result = await commitProposal(client, await localFile(options.proposal), { expectedProposalHash: options['review-hash'] });
    else if (command === 'propose') {
      if (!options.out) fail('INVALID_ARGUMENT', '--out is required; existing files are never overwritten.');
      const proposal = await createProposal(client, { ...selected, operations: await localFile(options.operations) });
      await writeFile(options.out, JSON.stringify(proposal, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      result = { proposalFile: options.out, proposalHash: proposal.proposalHash, ...(await reviewProposal(proposal)), committed: false };
    }
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ error: { code: error.code ?? 'TOOL_ERROR', message: error.message, ...(error.details ? { details: error.details } : {}) } }, null, 2));
  process.exitCode = 1;
}
