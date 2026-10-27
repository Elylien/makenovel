import { createHash, randomUUID } from 'node:crypto';
import { loadNative } from './load-native.mjs';

const HASH = /^[a-f0-9]{64}$/;
const NODE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,95}$/;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_OPERATIONS = 64;
const CATEGORIES = ['background', 'figure', 'bgm', 'se', 'vocal', 'scene', 'animation', 'video'];
const INSERT_COMMANDS = ['say', 'changeBg', 'changeFigure', 'bgm', 'playEffect', 'wait', 'end', 'label', 'jumpLabel', 'setVar'];
const RESOURCE_COMMANDS = { changeBg: 'background', changeFigure: 'figure', bgm: 'bgm', playEffect: 'se' };
const clients = new WeakMap();
export const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
export class AuthorToolError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'AuthorToolError'; this.code = code; this.details = details; }
}
const fail = (code, message, details) => { throw new AuthorToolError(code, message, details); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const same = (a, b) => canonical(a) === canonical(b);
const nativeJson = value => JSON.parse(JSON.stringify(value));
function canonical(value) {
  if (Array.isArray(value)) return '[' + Array.from({ length: value.length }, (_, index) => {
    if (!Object.hasOwn(value, index)) fail('INVALID_PROPOSAL', 'Sparse arrays are not proposal JSON.');
    return canonical(value[index]);
  }).join(',') + ']';
  if (record(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.getOwnPropertySymbols(value).length === 0) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  if (value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  fail('INVALID_PROPOSAL', 'Proposal values must be plain JSON.');
}
export function computeProposalHash(proposal) {
  if (!record(proposal)) fail('INVALID_PROPOSAL', 'A proposal object is required.');
  return sha256(canonical(Object.fromEntries(Object.entries(proposal).filter(([key]) => key !== 'proposalHash'))));
}
function safeSegment(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && value !== '.' && value !== '..'
    && !/[<>:"/\\|?*\u0000-\u001f\u007f]/u.test(value) && !/[. ]$/u.test(value)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value);
}
function safeRequestSegment(value) {
  if (!safeSegment(value)) return false;
  // JSON snapshots do not decode paths. Still refuse disguised traversal in
  // caller-selected targets instead of making that fact an attack surface.
  let decoded = value;
  for (let count = 0; count < 5; count++) {
    let next; try { next = decodeURIComponent(decoded); } catch { break; }
    if (!safeSegment(next)) return false;
    if (next === decoded) break;
    decoded = next;
  }
  return true;
}
function target({ gameName, path = 'game/scene/start.txt' } = {}) {
  if (!safeRequestSegment(gameName) || typeof path !== 'string' || !path.startsWith('game/scene/')
      || !path.endsWith('.txt') || path.length > 1024 || !path.split('/').every(safeRequestSegment)) {
    fail('INVALID_PATH', 'Choose a game directory and a plain game/scene/*.txt relative path.');
  }
  return { gameName, path };
}
function checkedText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES || text.includes('\0')
      || Buffer.from(text, 'utf8').toString('utf8') !== text) fail('INVALID_SOURCE', 'Source must be lossless UTF-8 text within 2 MiB.');
  return text;
}
function checkedOrigin(origin) {
  let url;
  try { url = new URL(origin); } catch { fail('INVALID_ORIGIN', 'Use an explicit loopback editor origin.'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash || ![url.origin, url.origin + '/'].includes(origin)) {
    fail('INVALID_ORIGIN', 'Only http://127.0.0.1:<port> is supported; redirects and remote hosts are refused.');
  }
  return url.origin;
}
export function createClient({ origin = 'http://127.0.0.1:3001', fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  const client = Object.freeze({ origin: checkedOrigin(origin) });
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) fail('INVALID_CLIENT', 'Invalid transport or timeout.');
  clients.set(client, { fetchImpl, timeoutMs });
  return client;
}
async function request(client, route, body) {
  const transport = clients.get(client);
  if (!transport) fail('INVALID_CLIENT', 'Use createClient to select a local editor.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), transport.timeoutMs);
  try {
    const response = await transport.fetchImpl(client.origin + '/api/manageGame/' + route, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: controller.signal,
      headers: { Origin: client.origin, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.redirected || (response.url && new URL(response.url).origin !== client.origin)) fail('INVALID_SERVER_RESPONSE', 'The editor response changed origin.');
    const parts = []; let size = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); fail('RESPONSE_TOO_LARGE', 'The editor response exceeds the local tool limit.'); }
          parts.push(value);
        }
      } finally { reader.releaseLock(); }
    } else {
      const bytes = Buffer.from(await response.text());
      if (bytes.byteLength > MAX_RESPONSE_BYTES) fail('RESPONSE_TOO_LARGE', 'The editor response exceeds the local tool limit.');
      parts.push(bytes);
    }
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))); }
    catch { fail('INVALID_SERVER_RESPONSE', 'The editor did not return valid UTF-8 JSON.'); }
    if (!response.ok) {
      const code = typeof value?.code === 'string' && /^[A-Z][A-Z0-9_]{0,80}$/.test(value.code) ? value.code : 'HTTP_ERROR';
      fail(code, typeof value?.message === 'string' ? value.message : 'The editor refused the request.', { status: response.status, server: value });
    }
    return value;
  } catch (error) {
    if (error instanceof AuthorToolError) throw error;
    fail('HTTP_REQUEST_FAILED', 'The local editor request failed; a submitted write may require rereading before retry.', { cause: String(error.message ?? error) });
  } finally { clearTimeout(timer); }
}
function checkedSnapshot(value) {
  if (!record(value) || typeof value.revision !== 'string' || typeof value.workspaceId !== 'string' || !HASH.test(value.revision) || !HASH.test(value.workspaceId)) fail('INVALID_SERVER_RESPONSE', 'The editor omitted revision or workspace identity.');
  checkedText(value.text);
  if (sha256(value.text) !== value.revision) fail('INVALID_SERVER_RESPONSE', 'The returned revision does not match the source bytes.');
  return { text: value.text, revision: value.revision, workspaceId: value.workspaceId };
}
export function getCapabilities() {
  return { schemaVersion: 1, name: 'makenovel-author-tools', transport: 'existing-loopback-terre-api',
    operations: ['registerIds', 'patchDialogue', 'insertBefore'], insertCommands: [...INSERT_COMMANDS],
    categories: [...CATEGORIES], limits: { maxOperations: MAX_OPERATIONS, maxSourceBytes: MAX_TEXT_BYTES, assetListing: 'one directory level per native category' },
    guarantees: ['same native parser and identity edits as GUI', 'expected revision and workspace on commit', 'review digest required', 'no scene execution or automatic sealing'],
    unsupported: ['model hosting', 'MCP transport', 'new scene creation', 'route simulation', 'multi-file atomic transactions', 'nested asset insertion', 'automatic merge', 'preview or Windows acceptance'],
  };
}
export async function getCommands() {
  const native = await loadNative();
  return { coverage: 'locked-webgal-core', commands: native.nativeCommands.map(item => ({ ...item, insertable: INSERT_COMMANDS.includes(item.name) })), executed: false };
}
export async function listProjects(client) {
  const values = await request(client, 'gameList');
  if (!Array.isArray(values) || values.length > 10000 || values.some(value => !record(value) || !safeSegment(value.dir) || typeof value.name !== 'string')) fail('INVALID_SERVER_RESPONSE', 'Invalid project catalog.');
  return values.map(({ name, dir }) => ({ name, gameName: dir }));
}
export async function listAssets(client, { gameName, category = 'all' } = {}) {
  if (!safeSegment(gameName) || gameName.includes('%') || ![...CATEGORIES, 'all'].includes(category)) fail('INVALID_PATH', 'Choose a plain game name and a supported asset category.');
  const readCatalog = async parts => {
    const route = 'readGameAssets/' + [gameName, 'game', ...parts].map(encodeURIComponent).join('/');
    const value = await request(client, route);
    if (!record(value) || !Array.isArray(value.dirInfo) || value.dirInfo.length > 10000) fail('INVALID_SERVER_RESPONSE', 'Invalid asset catalog.');
    if (value.dirInfo.some(file => !record(file) || !safeSegment(file.name) || typeof file.isDir !== 'boolean')) fail('INVALID_SERVER_RESPONSE', 'Invalid asset entry.');
    return value.dirInfo;
  };
  // Older native templates omit optional categories. Inspect the game root
  // rather than treating every legacy directory-read 500 as an empty folder.
  const directories = new Set((await readCatalog([])).filter(file => file.isDir).map(file => file.name));
  const selectedCategories = category === 'all' ? CATEGORIES : [category];
  const results = [];
  for (const selected of selectedCategories.filter(item => directories.has(item))) {
    for (const file of await readCatalog([selected])) {
      results.push({ category: selected, name: file.name, path: `game/${selected}/${file.name}`, isDirectory: file.isDir,
        ...(Number.isSafeInteger(file.size) && file.size >= 0 ? { size: file.size } : {}) });
    }
  }
  return { gameName, coverage: 'category-top-level-metadata-only', assets: results,
    unavailableCategories: selectedCategories.filter(item => !directories.has(item)) };
}
export async function diagnoseScene(text) {
  const native = await loadNative(); checkedText(text);
  return { analysis: nativeJson(native.analyzeScene(text)), nodes: nativeJson(native.inspectSceneIdentity(text, native.parseNative(text)).nodes), executed: false };
}
export async function readScene(client, options) {
  const selected = target(options);
  const snapshot = checkedSnapshot(await request(client, 'textSnapshot', selected));
  return { ...selected, ...snapshot, ...await diagnoseScene(snapshot.text) };
}
function checkedNodeId(value) { if (typeof value !== 'string' || !NODE_ID.test(value) || value.includes('-concat')) fail('INVALID_OPERATION', 'A native stable node ID is required.'); return value; }
function safeResource(category, value) {
  if (!safeSegment(value) || value.includes('%') || /[{}]/.test(value)) fail('UNSUPPORTED_STATEMENT', 'Inserted resources must be plain, static files at the category root.', { category, path: value });
  return { category, path: value };
}
function resourcesFor(sentence) {
  const resources = [];
  const category = RESOURCE_COMMANDS[sentence.commandRaw];
  if (category && sentence.content !== 'none') resources.push(safeResource(category, sentence.content));
  if (sentence.commandRaw === 'say') {
    const voice = sentence.args.find(arg => arg.key === 'vocal');
    if (voice && voice.value !== 'none') resources.push(safeResource('vocal', voice.value));
  }
  return resources;
}
async function applyOperations(baseText, operations, normalize) {
  const native = await loadNative(); checkedText(baseText);
  if (!Array.isArray(operations) || !operations.length || operations.length > MAX_OPERATIONS) fail('INVALID_OPERATION', 'Provide 1 to 64 explicit source operations.');
  const initialAnalysis = native.analyzeScene(baseText);
  if (!initialAnalysis.valid) fail('SCENE_VALIDATION_FAILED', 'Repair invalid source before preparing an AI proposal.', { diagnostics: initialAnalysis.diagnostics });
  let text = baseText; const normalized = [], changes = [], resources = [];
  for (let index = 0; index < operations.length; index++) {
    const op = operations[index]; let result, normalizedOperation;
    const ranges = native.parseNative(text);
    const identity = native.inspectSceneIdentity(text, ranges);
    const analysis = native.analyzeScene(text);
    if (op?.type === 'registerIds') {
      if (!exact(op, normalize ? ['type'] : ['type', 'assigned'])) fail('INVALID_OPERATION', 'registerIds has unexpected fields.');
      const eligibleStartLines = analysis.blocks.filter(block => block.graphicalEditable && ['command', 'dialogue'].includes(block.kind)).map(block => block.startLine - 1);
      let used = 0;
      if (!normalize && (!Array.isArray(op.assigned) || op.assigned.some(item => !exact(item, ['nodeId', 'startLine']) || !Number.isInteger(item.startLine)))) fail('INVALID_OPERATION', 'Invalid assigned identity list.');
      result = native.assignMissingNodeIds(text, ranges, () => normalize ? 'mn-' + randomUUID() : checkedNodeId(op.assigned[used++]?.nodeId), { eligibleStartLines });
      if (!normalize && !same(result.assigned, op.assigned)) fail('PROPOSAL_CONTENT_MISMATCH', 'The registered identities do not match current native source.');
      normalizedOperation = { type: 'registerIds', assigned: result.assigned };
    } else if (op?.type === 'patchDialogue') {
      if (!exact(op, ['type', 'nodeId', 'text'])) fail('INVALID_OPERATION', 'patchDialogue requires only nodeId and text.');
      checkedNodeId(op.nodeId);
      const node = identity.nodes.find(item => item.nodeId === op.nodeId);
      if (!node) fail('ID_NOT_FOUND', 'The requested stable node ID does not exist; text and line number are not identity.');
      const block = node && analysis.blocks.find(item => item.startLine === node.startLine + 1 && item.endLine === node.endLine + 1);
      if (!block || block.kind === 'advanced' || !['dialogue', 'command'].includes(block.kind) || block.command !== 'say') fail('UNSUPPORTED_STATEMENT', 'Only a native analyzed dialogue can be changed by this operation.');
      result = native.patchNodeDialogue(text, ranges, { nodeId: op.nodeId, text: op.text, allowImplicitDialogue: block.kind === 'dialogue' });
      normalizedOperation = { ...op };
    } else if (op?.type === 'insertBefore') {
      if (!exact(op, normalize ? ['type', 'beforeNodeId', 'statement'] : ['type', 'beforeNodeId', 'statement', 'newNodeId'])) fail('INVALID_OPERATION', 'insertBefore requires a stable anchor (or null) and one statement.');
      let beforeStartLine = null;
      if (op.beforeNodeId !== null) {
        checkedNodeId(op.beforeNodeId);
        const anchor = identity.nodes.find(item => item.nodeId === op.beforeNodeId);
        if (!anchor) fail('ID_NOT_FOUND', 'The insertion anchor no longer exists.');
        beforeStartLine = anchor.startLine;
      }
      if (typeof op.statement !== 'string' || /[\r\n]/.test(op.statement) || op.statement.includes('@makenovel-node')) fail('UNSUPPORTED_STATEMENT', 'Insert exactly one native line without an existing identity.');
      const candidateAnalysis = native.analyzeScene(op.statement);
      const candidate = native.parseNative(op.statement).filter(sentence => !sentence.isLineBreakHolder && sentence.commandRaw !== 'comment');
      if (!candidateAnalysis.valid || candidateAnalysis.hasAdvanced || candidate.length !== 1 || !INSERT_COMMANDS.includes(candidate[0].commandRaw)
          || candidateAnalysis.blocks.some(block => block.kind !== 'blank' && block.kind !== 'comment' && !block.graphicalEditable)) fail('UNSUPPORTED_STATEMENT', 'This statement is outside the reviewed insertion subset.', { diagnostics: candidateAnalysis.diagnostics });
      resources.push(...resourcesFor(candidate[0]));
      const newNodeId = normalize ? 'mn-' + randomUUID() : checkedNodeId(op.newNodeId);
      result = native.insertSceneStatement(text, ranges, beforeStartLine, op.statement, () => newNodeId, native.parseNative);
      normalizedOperation = { type: 'insertBefore', beforeNodeId: op.beforeNodeId, statement: op.statement, newNodeId };
    } else fail('INVALID_OPERATION', 'Unknown author operation.');
    text = checkedText(result.source);
    normalized.push(normalizedOperation); changes.push({ index, type: op.type, changes: result.changes });
  }
  const analysis = native.analyzeScene(text);
  if (!analysis.valid || native.hasUnreviewedAdvancedChanges(initialAnalysis, analysis)) fail('SCENE_VALIDATION_FAILED', 'The proposal would introduce invalid or unreviewed source.', { diagnostics: analysis.diagnostics });
  return { operations: normalized, proposedText: text, proposedRevision: sha256(text), changes, analysis: nativeJson(analysis),
    resources: resources.filter((item, index) => resources.findIndex(other => same(item, other)) === index) };
}
export async function createProposal(client, { gameName, path = 'game/scene/start.txt', operations } = {}) {
  const scene = await readScene(client, { gameName, path });
  const computed = await applyOperations(scene.text, operations, true);
  if (computed.proposedText === scene.text) fail('NO_CHANGES', 'The proposal does not change any source bytes.');
  const proposal = { schemaVersion: 1, kind: 'makenovel-author-proposal', origin: client.origin, gameName, path,
    workspaceId: scene.workspaceId, baseRevision: scene.revision, baseText: scene.text, ...computed };
  return { ...proposal, proposalHash: computeProposalHash(proposal) };
}
const PROPOSAL_KEYS = ['schemaVersion', 'kind', 'origin', 'gameName', 'path', 'workspaceId', 'baseRevision', 'baseText', 'operations', 'proposedText', 'proposedRevision', 'changes', 'analysis', 'resources', 'proposalHash'];
async function checkedProposal(value) {
  // Keep a private JSON snapshot across native compilation and HTTP awaits.
  // A library caller must not be able to mutate reviewed bytes in flight.
  const proposal = JSON.parse(canonical(value));
  if (!exact(proposal, PROPOSAL_KEYS) || proposal.schemaVersion !== 1 || proposal.kind !== 'makenovel-author-proposal'
      || ['workspaceId', 'baseRevision', 'proposedRevision', 'proposalHash'].some(key => typeof proposal[key] !== 'string' || !HASH.test(proposal[key]))) fail('INVALID_PROPOSAL', 'Unknown or malformed proposal; preserve it and generate a new one.');
  target(proposal); checkedOrigin(proposal.origin); checkedText(proposal.baseText); checkedText(proposal.proposedText);
  if (computeProposalHash(proposal) !== proposal.proposalHash) fail('PROPOSAL_HASH_MISMATCH', 'Proposal contents changed after creation.');
  if (sha256(proposal.baseText) !== proposal.baseRevision) fail('PROPOSAL_CONTENT_MISMATCH', 'Base source bytes do not match the expected revision.');
  const computed = await applyOperations(proposal.baseText, proposal.operations, false);
  for (const key of ['operations', 'proposedText', 'proposedRevision', 'changes', 'analysis', 'resources']) {
    if (!same(proposal[key], computed[key])) fail('PROPOSAL_CONTENT_MISMATCH', 'Proposal output differs from the native operations.', { field: key });
  }
  if (proposal.baseText === proposal.proposedText) fail('NO_CHANGES', 'The proposal does not change source.');
  return proposal;
}
function diffSummary(before, after) {
  const oldLines = before.split('\n'), newLines = after.split('\n');
  let prefix = 0; while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0; while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
  return { firstLine: prefix + 1, removed: oldLines.slice(prefix, oldLines.length - suffix), added: newLines.slice(prefix, newLines.length - suffix),
    note: 'One contiguous review hunk; exact per-operation UTF-16 ranges are in changes. CR and BOM are preserved in JSON.' };
}
export async function reviewProposal(value) {
  const proposal = await checkedProposal(value);
  return { proposalHash: proposal.proposalHash, gameName: proposal.gameName, path: proposal.path, baseRevision: proposal.baseRevision,
    proposedRevision: proposal.proposedRevision, changes: proposal.changes, analysis: proposal.analysis, resources: proposal.resources,
    diff: diffSummary(proposal.baseText, proposal.proposedText), executed: false };
}
export async function validateProposal(client, value) {
  const proposal = await checkedProposal(value);
  if (client.origin !== proposal.origin) fail('ORIGIN_MISMATCH', 'The proposal belongs to a different local editor origin.');
  const current = await readScene(client, proposal);
  if (current.workspaceId !== proposal.workspaceId) fail('WORKSPACE_CHANGED', 'The author workspace changed; keep both sources and regenerate the proposal.');
  if (current.revision !== proposal.baseRevision || current.text !== proposal.baseText) fail('REVISION_CONFLICT', 'The source changed after proposal creation; keep both versions and regenerate.', { expectedRevision: proposal.baseRevision, actualRevision: current.revision });
  const resourceChecks = [], diagnostics = [];
  const catalogs = new Map();
  for (const resource of proposal.resources) {
    if (!catalogs.has(resource.category)) catalogs.set(resource.category, await listAssets(client, { gameName: proposal.gameName, category: resource.category }));
    const found = catalogs.get(resource.category).assets.some(asset => !asset.isDirectory && asset.name === resource.path);
    resourceChecks.push({ ...resource, exists: found });
    if (!found) diagnostics.push({ code: 'RESOURCE_NOT_FOUND', severity: 'error', message: 'An inserted resource is absent from the current native catalog.', ...resource });
  }
  return { valid: diagnostics.length === 0, proposalHash: proposal.proposalHash, diagnostics, resourceChecks,
    currentRevision: current.revision, workspaceId: current.workspaceId, executed: false };
}
export async function commitProposal(client, value, { expectedProposalHash } = {}) {
  if (typeof expectedProposalHash !== 'string' || !HASH.test(expectedProposalHash)) fail('REVIEW_HASH_REQUIRED', 'Supply the exact digest from a reviewed proposal.');
  const proposal = await checkedProposal(value);
  if (proposal.proposalHash !== expectedProposalHash) fail('REVIEW_HASH_MISMATCH', 'The selected proposal differs from the reviewed digest.');
  const validation = await validateProposal(client, proposal);
  if (!validation.valid) fail('PROPOSAL_VALIDATION_FAILED', 'Resolve proposal diagnostics before committing.', { diagnostics: validation.diagnostics });
  const saved = checkedSnapshot(await request(client, 'saveTextSnapshot', {
    gameName: proposal.gameName, path: proposal.path, text: proposal.proposedText,
    expectedRevision: proposal.baseRevision, expectedWorkspaceId: proposal.workspaceId,
  }));
  if (saved.workspaceId !== proposal.workspaceId || saved.revision !== proposal.proposedRevision || saved.text !== proposal.proposedText) fail('COMMIT_UNCONFIRMED', 'The save response differs from the proposal. Reread before retry; the server may have written.');
  return { committed: true, gameName: proposal.gameName, path: proposal.path, revision: saved.revision, workspaceId: saved.workspaceId,
    proposalHash: proposal.proposalHash, requiresReseal: true, executed: false };
}
