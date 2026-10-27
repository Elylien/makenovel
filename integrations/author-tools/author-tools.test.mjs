import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createClient, getCapabilities, listProjects, listAssets, readScene, diagnoseScene,
  createProposal, reviewProposal, validateProposal, commitProposal,
  computeProposalHash,
} from './author-tools.mjs';

// HTTP is a deterministic transport substitute. Source parsing, identity,
// local writeback and proposal validation are the production implementation.
// These tests do not claim a running Terre server, browser or native IME.
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const workspace = hash('isolated author test workspace');
const gameName = 'author-tools-fixture';
const scenePath = 'game/scene/start.txt';
const source = '\uFEFF; 作者原注释  \r\nsay:  旧对白🌧️  -speaker=林; 作者备注 ; @makenovel-node first\r\nfutureCommand:opaque -keep=1;  保留未知内容  \r\nend:; @makenovel-node ending\r\n';
const patch = text => [{ type: 'patchDialogue', nodeId: 'first', text }];
const target = operations => ({ gameName, path: scenePath, operations });
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const withCode = code => error => {
  assert.equal(error.code, code, `${error.code}: ${error.message}`);
  return true;
};
const clone = value => JSON.parse(JSON.stringify(value));
const rehash = value => { value.proposalHash = computeProposalHash(value); return value; };

function fixture(options = {}) {
  let text = options.text ?? source;
  let workspaceId = workspace;
  const requests = [];
  const saves = [];
  const assets = {
    background: ['room.svg'], figure: ['lin.svg'], vocal: ['voice.wav'],
    bgm: ['rain.ogg'], se: ['bell.wav'], scene: ['start.txt'],
    animation: ['enter.json'], video: [],
    ...options.assets,
  };
  const state = {
    requests, saves, assets,
    get text() { return text; },
    setText(value) { text = value; },
    setWorkspace(value) { workspaceId = value; },
    snapshot() { return { text, revision: hash(text), workspaceId }; },
    beforeSave: undefined,
    responseOverride: undefined,
  };
  const fetchImpl = async (urlValue, init = {}) => {
    const url = new URL(urlValue);
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url: url.href, method: init.method ?? 'GET', headers: new Headers(init.headers), redirect: init.redirect, body });
    const overridden = await state.responseOverride?.(url, init, body);
    if (overridden) return overridden;
    if (url.pathname === '/api/manageGame/gameList') {
      return jsonResponse([{ name: '独立作者测试', dir: gameName, cover: '', template: null }]);
    }
    if (url.pathname.startsWith('/api/manageGame/readGameAssets/')) {
      const relative = decodeURIComponent(url.pathname.slice('/api/manageGame/readGameAssets/'.length));
      const parts = relative.split('/');
      assert.equal(parts[0], gameName);
      assert.equal(parts[1], 'game');
      const category = parts[2];
      if (!category) return jsonResponse({ readDirPath: relative, dirPath: `E:/private-test-root/${relative}`, dirInfo: Object.keys(assets).map(name => ({
        name, isDir: true, extName: '', path: `E:/private-test-root/${relative}/${name}`,
      })) });
      return jsonResponse({ readDirPath: relative, dirPath: `E:/private-test-root/${relative}`, dirInfo: (assets[category] ?? []).map(name => ({
        name, isDir: false, extName: name.slice(name.lastIndexOf('.')), path: `E:/private-test-root/${relative}/${name}`, size: 80,
      })) });
    }
    if (url.pathname === '/api/manageGame/textSnapshot') {
      assert.equal(body.gameName, gameName);
      assert.equal(body.path, scenePath);
      return jsonResponse(state.snapshot());
    }
    if (url.pathname === '/api/manageGame/saveTextSnapshot') {
      saves.push(body);
      await state.beforeSave?.(body);
      if (body.expectedWorkspaceId !== workspaceId) return jsonResponse({ code: 'WORKSPACE_CHANGED', message: 'Workspace changed; file unchanged.' }, 409);
      if (body.expectedRevision !== hash(text)) return jsonResponse({ code: 'REVISION_CONFLICT', message: 'Revision changed; file unchanged.' }, 409);
      assert.equal(body.gameName, gameName);
      assert.equal(body.path, scenePath);
      text = body.text;
      return jsonResponse(state.snapshot());
    }
    throw new Error(`Unexpected request ${url.href}`);
  };
  state.client = createClient({ origin: 'http://127.0.0.1:3001', fetchImpl });
  return state;
}

test('capabilities declare available operations and keep route execution out of scope', async () => {
  const capabilities = await getCapabilities();
  const serialized = JSON.stringify(capabilities);
  assert.match(serialized, /patchDialogue/);
  assert.match(serialized, /insertBefore/);
  assert.match(serialized, /registerIds/);
  assert.ok(!serialized.includes('apiKey'));
});

test('project, asset and source queries never issue an active scene save', async () => {
  const f = fixture();
  assert.match(JSON.stringify(await listProjects(f.client)), /author-tools-fixture/);
  assert.match(JSON.stringify(await listAssets(f.client, { gameName, category: 'background' })), /room\.svg/);
  const scene = await readScene(f.client, { gameName, path: scenePath });
  assert.equal(scene.text, source);
  assert.equal(scene.revision, hash(source));
  assert.equal(scene.workspaceId, workspace);
  assert.ok(scene.nodes.some(node => node.nodeId === 'first'));
  assert.ok(scene.analysis.hasAdvanced);
  assert.equal(f.saves.length, 0);
  assert.equal(f.text, source);
});

test('HTTP client uses exact loopback Origin and refuses automatic redirects', async () => {
  const f = fixture();
  await readScene(f.client, { gameName, path: scenePath });
  for (const request of f.requests) {
    assert.equal(new URL(request.url).origin, 'http://127.0.0.1:3001');
    assert.equal(request.headers.get('origin'), 'http://127.0.0.1:3001');
    assert.equal(request.headers.has('authorization'), false);
    assert.equal(request.headers.has('cookie'), false);
    assert.equal(request.redirect, 'error');
  }
});

test('remote, credential-bearing and path-bearing origins reject before fetch', () => {
  for (const origin of ['https://127.0.0.1:3001', 'http://example.com', 'http://127.0.0.1.example.com:3001', 'http://user:secret@127.0.0.1:3001', 'http://127.0.0.1:3001/api', 'http://127.0.0.1:3001?secret=value', 'http://127.0.0.1:3001/#fragment']) {
    assert.throws(() => createClient({ origin, fetchImpl() { assert.fail('Must not fetch invalid origin'); } }), withCode('INVALID_ORIGIN'), origin);
  }
});

test('unsafe game and scene paths reject without querying the server', async () => {
  for (const request of [
    { gameName: '../other', path: scenePath },
    { gameName: 'a/b', path: scenePath },
    { gameName, path: '../start.txt' },
    { gameName, path: 'game/scene/../config.txt' },
    { gameName, path: 'game/scene/%2e%2e/config.txt' },
    { gameName, path: 'game/scene/start.txt:stream' },
    { gameName, path: 'C:/private/start.txt' },
    { gameName, path: 'game/config.txt' },
  ]) {
    const f = fixture();
    await assert.rejects(readScene(f.client, request));
    assert.equal(f.requests.length, 0, JSON.stringify(request));
  }
});

test('unknown asset categories reject before making a request', async () => {
  const f = fixture();
  await assert.rejects(listAssets(f.client, { gameName, category: '../scene' }));
  assert.equal(f.requests.length, 0);
});

test('all asset metadata tolerates a genuinely absent optional category without requesting it', async () => {
  const f = fixture();
  delete f.assets.video;
  const catalog = await listAssets(f.client, { gameName, category: 'all' });
  assert.ok(catalog.assets.some(item => item.category === 'background' && item.name === 'room.svg'));
  assert.equal(f.requests.some(request => new URL(request.url).pathname.endsWith('/game/video')), false);
  assert.equal(f.saves.length, 0);
});

test('a missing entire resource category becomes a validation diagnostic instead of a false success', async () => {
  const f = fixture();
  delete f.assets.background;
  const proposal = await createProposal(f.client, target([{ type: 'insertBefore', beforeNodeId: 'first', statement: 'changeBg:room.svg;' }]));
  const validation = await validateProposal(f.client, proposal);
  assert.equal(validation.valid, false);
  assert.ok(validation.diagnostics.some(item => item.code === 'RESOURCE_NOT_FOUND'));
  await assert.rejects(commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash }), withCode('PROPOSAL_VALIDATION_FAILED'));
  assert.equal(f.saves.length, 0);
  assert.equal(f.requests.some(request => new URL(request.url).pathname.endsWith('/game/background')), false);
});

test('snapshot revision is verified against exact UTF-8 bytes before exposing source', async () => {
  const f = fixture();
  f.responseOverride = url => url.pathname.endsWith('/textSnapshot') ? jsonResponse({ ...f.snapshot(), revision: hash('different source') }) : undefined;
  await assert.rejects(readScene(f.client, { gameName, path: scenePath }), withCode('INVALID_SERVER_RESPONSE'));
  assert.equal(f.saves.length, 0);
});

test('BOM-prefixed first dialogue is valid without shifting original source offsets', async () => {
  const text = '\uFEFFsay:第一句; @makenovel-node first\r\nend:; @makenovel-node ending\r\n';
  const diagnosis = await diagnoseScene(text);
  assert.equal(diagnosis.analysis.valid, true);
  assert.equal(diagnosis.analysis.previewable, true);
  assert.equal(diagnosis.analysis.blocks[0].raw, text.split('\r\n')[0]);
  assert.equal(diagnosis.analysis.blocks[0].range.start.offset, 0);
  assert.equal(diagnosis.analysis.blocks[0].startLine, 1);
  assert.equal(diagnosis.nodes[0].nodeId, 'first');
  assert.equal(diagnosis.nodes[0].start, 1);
  assert.equal(diagnosis.executed, false);
});

test('missing workspace identity is rejected rather than silently saving by revision alone', async () => {
  const f = fixture();
  f.responseOverride = url => url.pathname.endsWith('/textSnapshot') ? jsonResponse({ text: source, revision: hash(source) }) : undefined;
  await assert.rejects(readScene(f.client, { gameName, path: scenePath }), withCode('INVALID_SERVER_RESPONSE'));
  assert.equal(f.saves.length, 0);
});

test('dialogue proposal preserves BOM, CRLF, comments and unrelated advanced bytes exactly', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('第一次修改;仍保留雨🌧️')));
  assert.equal(proposal.baseText, source);
  assert.equal(proposal.baseRevision, hash(source));
  assert.equal(proposal.proposedText, source.replace('旧对白🌧️', '第一次修改\\;仍保留雨🌧️'));
  assert.equal(proposal.proposedRevision, hash(proposal.proposedText));
  assert.equal(f.text, source);
  assert.equal(f.saves.length, 0);
  const review = await reviewProposal(proposal);
  assert.equal(review.proposalHash, proposal.proposalHash);
  assert.match(JSON.stringify(review.diff), /第一次修改/);
});

test('proposal creation, review and validation remain read-only', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('提案只保存在副本里。')));
  await reviewProposal(proposal);
  const validation = await validateProposal(f.client, proposal);
  assert.equal(validation.valid, true);
  assert.equal(f.text, source);
  assert.equal(f.saves.length, 0);
});

test('capability arrays cannot mutate the operation or insertion allowlist', () => {
  const capabilities = getCapabilities();
  capabilities.operations.push('writeAnyFile');
  capabilities.insertCommands.push('futureCommand');
  const fresh = getCapabilities();
  assert.equal(fresh.operations.includes('writeAnyFile'), false);
  assert.equal(fresh.insertCommands.includes('futureCommand'), false);
});

test('mutating the caller proposal during commit cannot replace the already reviewed source bytes', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('最初审阅的对白。')));
  const reviewedText = proposal.proposedText;
  const reviewedHash = proposal.proposalHash;
  f.responseOverride = url => {
    if (url.pathname.endsWith('/textSnapshot')) {
      proposal.proposedText = source.replace('旧对白🌧️', '未审阅的并发篡改');
      proposal.proposedRevision = hash(proposal.proposedText);
    }
  };
  const result = await commitProposal(f.client, proposal, { expectedProposalHash: reviewedHash });
  assert.equal(result.committed, true);
  assert.equal(f.saves.length, 1);
  assert.equal(f.saves[0].text, reviewedText);
  assert.equal(f.text, reviewedText);
});

test('explicit reviewed commit reuses existing revision and workspace transaction fields', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('已经审阅并提交。')));
  const result = await commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash });
  assert.equal(result.committed, true);
  assert.equal(result.requiresReseal, true);
  assert.equal(result.revision, hash(proposal.proposedText));
  assert.equal(result.workspaceId, workspace);
  assert.equal(f.text, proposal.proposedText);
  assert.equal(f.saves.length, 1);
  assert.deepEqual(f.saves[0], {
    gameName, path: scenePath, text: proposal.proposedText,
    expectedRevision: hash(source), expectedWorkspaceId: workspace,
  });
});

test('commit without a reviewed digest never sends a save request', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('未审阅。')));
  await assert.rejects(commitProposal(f.client, proposal, {}), withCode('REVIEW_HASH_REQUIRED'));
  assert.equal(f.saves.length, 0);
  assert.equal(f.text, source);
});

test('an approved digest cannot authorize a different valid proposal', async () => {
  const f = fixture();
  const first = await createProposal(f.client, target(patch('第一份提案。')));
  const second = await createProposal(f.client, target(patch('第二份提案。')));
  await assert.rejects(commitProposal(f.client, second, { expectedProposalHash: first.proposalHash }), withCode('REVIEW_HASH_MISMATCH'));
  assert.equal(f.saves.length, 0);
});

test('a text revision changes while retained node identity stays stable', async () => {
  const f = fixture();
  const first = await createProposal(f.client, target(patch('AI第一次修改。')));
  await commitProposal(f.client, first, { expectedProposalHash: first.proposalHash });
  const scene = await readScene(f.client, { gameName, path: scenePath });
  assert.notEqual(scene.revision, hash(source));
  assert.ok(scene.nodes.some(node => node.nodeId === 'first'));
  f.setText(f.text.replace('AI第一次修改。', '人工微调后的对白。'));
  const next = await createProposal(f.client, target(patch('AI读取人工版本后继续修改。')));
  assert.match(next.baseText, /人工微调后的对白/);
  await commitProposal(f.client, next, { expectedProposalHash: next.proposalHash });
  assert.ok(f.text.includes('@makenovel-node first'));
  assert.ok(f.text.includes('futureCommand:opaque -keep=1;  保留未知内容  \r\n'));
});

test('stale proposal is rejected before save and preserves the newer human text', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('旧版本提案。')));
  const human = source.replace('旧对白🌧️', '人工已经修改。');
  f.setText(human);
  await assert.rejects(commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash }), withCode('REVISION_CONFLICT'));
  assert.equal(f.text, human);
  assert.equal(f.saves.length, 0);
});

test('replaying an already committed proposal rejects instead of duplicating the operation', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('提交一次。')));
  await commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash });
  await assert.rejects(commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash }), withCode('REVISION_CONFLICT'));
  assert.equal(f.saves.length, 1);
});

test('workspace switch with identical text and revision still refuses commit', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('不同工作区不能接收。')));
  f.setWorkspace(hash('another author profile'));
  await assert.rejects(commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash }), withCode('WORKSPACE_CHANGED'));
  assert.equal(f.saves.length, 0);
  assert.equal(f.text, source);
});

test('server revision race after validation preserves the newer source', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('与保存竞争的提案。')));
  const newer = source.replace('旧对白🌧️', '最后一刻的另一作者修改。');
  f.beforeSave = () => f.setText(newer);
  await assert.rejects(commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash }), withCode('REVISION_CONFLICT'));
  assert.equal(f.saves.length, 1);
  assert.equal(f.text, newer);
});

test('proposal hash detects altered text, operations, target and workspace metadata', async () => {
  const f = fixture();
  const original = await createProposal(f.client, target(patch('原提案。')));
  for (const alter of [
    value => { value.proposedText += 'say:偷偷追加;'; },
    value => { value.operations[0].text = '未审阅的替换。'; },
    value => { value.gameName = 'another-game'; },
    value => { value.path = 'game/scene/other.txt'; },
    value => { value.workspaceId = hash('foreign'); },
  ]) {
    const changed = clone(original); alter(changed);
    await assert.rejects(reviewProposal(changed), withCode('PROPOSAL_HASH_MISMATCH'));
  }
  assert.equal(f.saves.length, 0);
});

test('rehashing altered result text cannot bypass deterministic operation replay', async () => {
  const f = fixture();
  const proposal = clone(await createProposal(f.client, target(patch('可验证的正文。'))));
  proposal.proposedText += 'say:未经操作产生的内容;\r\n';
  proposal.proposedRevision = hash(proposal.proposedText);
  rehash(proposal);
  await assert.rejects(reviewProposal(proposal), withCode('PROPOSAL_CONTENT_MISMATCH'));
});

test('rehashing forged change summaries or analysis cannot misrepresent the reviewed result', async () => {
  const f = fixture();
  const original = await createProposal(f.client, target(patch('完整差异。')));
  for (const alter of [
    value => { value.changes = []; },
    value => { value.analysis = { valid: true, diagnostics: [], blocks: [] }; },
    value => { value.resources = [{ category: 'background', path: 'fake.svg' }]; },
  ]) {
    const changed = clone(original); alter(changed); rehash(changed);
    await assert.rejects(reviewProposal(changed), withCode('PROPOSAL_CONTENT_MISMATCH'));
  }
});

test('unknown proposal schema and unexpected operation fields fail closed', async () => {
  const f = fixture();
  const proposal = clone(await createProposal(f.client, target(patch('当前协议。'))));
  proposal.schemaVersion = 999; rehash(proposal);
  await assert.rejects(reviewProposal(proposal), withCode('INVALID_PROPOSAL'));
  await assert.rejects(createProposal(f.client, target([{ ...patch('拒绝越权字段。')[0], path: 'game/config.txt' }])), withCode('INVALID_OPERATION'));
  assert.equal(f.saves.length, 0);
});

test('proposal origin must match explicitly configured client origin', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('只能提交原入口。')));
  let calls = 0;
  const another = createClient({ origin: 'http://127.0.0.1:3999', fetchImpl() { calls++; throw new Error('Unexpected network request'); } });
  await assert.rejects(validateProposal(another, proposal));
  assert.equal(calls, 0);
});

test('identity lookup refuses missing IDs instead of guessing line number or matching text', async () => {
  const f = fixture();
  await assert.rejects(createProposal(f.client, target([{ type: 'patchDialogue', nodeId: 'missing', text: '不能猜测。' }])), withCode('ID_NOT_FOUND'));
  assert.equal(f.saves.length, 0);
  assert.equal(f.text, source);
});

test('duplicate registered identities block a source modification', async () => {
  const text = 'say:甲; @makenovel-node duplicate\r\nsay:乙; @makenovel-node duplicate\r\n';
  const f = fixture({ text });
  await assert.rejects(createProposal(f.client, target([{ type: 'patchDialogue', nodeId: 'duplicate', text: '不得选中任意一项。' }])));
  assert.equal(f.text, text);
  assert.equal(f.saves.length, 0);
});

test('registration adds identities only to known editable nodes and leaves advanced bytes untouched', async () => {
  const text = '\uFEFF; 开头\r\nsay:尚无身份; 原注释\r\nfutureCommand:opaque -keep=1;  不可改动  \r\nend:;\r\n';
  const f = fixture({ text });
  const proposal = await createProposal(f.client, target([{ type: 'registerIds' }]));
  assert.ok(proposal.proposedText.includes('futureCommand:opaque -keep=1;  不可改动  \r\n'));
  assert.equal(proposal.proposedText.charCodeAt(0), 0xfeff);
  assert.equal(proposal.operations[0].assigned.length, 2);
  assert.equal(new Set(proposal.operations[0].assigned.map(item => item.nodeId)).size, 2);
  await commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash });
  const alreadyRegistered = f.text;
  await assert.rejects(createProposal(f.client, target([{ type: 'registerIds' }])), withCode('NO_CHANGES'));
  assert.equal(f.text, alreadyRegistered);
  assert.equal(f.saves.length, 1);
});

test('insertion generates a fresh identity and preserves neighboring legacy identity ownership', async () => {
  const text = '\uFEFF; @makenovel-node first\r\nsay:原对白; 作者注释\r\nend:; @makenovel-node ending\r\n';
  const f = fixture({ text });
  const proposal = await createProposal(f.client, target([{ type: 'insertBefore', beforeNodeId: 'first', statement: 'say:新增对白 -speaker=羽;' }]));
  const newId = proposal.operations[0].newNodeId;
  assert.ok(newId && newId !== 'first' && newId !== 'ending');
  assert.ok(proposal.proposedText.includes(`@makenovel-node ${newId}`));
  assert.ok(proposal.proposedText.includes('; @makenovel-node first\r\nsay:原对白; 作者注释\r\n'));
  assert.equal(proposal.proposedText.replace(/\r\n/g, '').includes('\n'), false);
  assert.equal(proposal.proposedText.charCodeAt(0), 0xfeff);
});

test('empty BOM scene can receive a bounded native statement without losing BOM', async () => {
  const f = fixture({ text: '\uFEFF' });
  const proposal = await createProposal(f.client, target([{ type: 'insertBefore', beforeNodeId: null, statement: 'say:从空稿开始;' }]));
  assert.equal(proposal.proposedText.charCodeAt(0), 0xfeff);
  assert.match(proposal.proposedText, /从空稿开始/);
  assert.equal((proposal.proposedText.match(/@makenovel-node/g) ?? []).length, 1);
});

test('multi-operation proposal is all-or-nothing when a later node is absent', async () => {
  const f = fixture();
  await assert.rejects(createProposal(f.client, target([
    ...patch('第一步不应独立落盘。'),
    { type: 'patchDialogue', nodeId: 'missing', text: '第二步失败。' },
  ])), withCode('ID_NOT_FOUND'));
  assert.equal(f.text, source);
  assert.equal(f.saves.length, 0);
});

test('incomplete or unsafe dialogue text cannot escape the original statement', async () => {
  for (const text of ['', 'none', '正文 -next', '第一句\nend:;', '未配对\ud800']) {
    const f = fixture();
    await assert.rejects(createProposal(f.client, target(patch(text))));
    assert.equal(f.text, source);
    assert.equal(f.saves.length, 0);
  }
});

test('insertion rejects multi-statement, imported ID and unsupported route operations', async () => {
  for (const statement of ['say:甲;\nsay:乙;', 'say:带来旧身份; @makenovel-node imported', 'futureCommand:opaque -keep=2;', 'changeScene:other.txt;', 'choose:甲:a.txt|乙:b.txt;']) {
    const f = fixture();
    await assert.rejects(createProposal(f.client, target([{ type: 'insertBefore', beforeNodeId: 'ending', statement }])));
    assert.equal(f.text, source);
    assert.equal(f.saves.length, 0);
  }
});

test('missing referenced asset is structured validation failure and prevents commit', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target([{ type: 'insertBefore', beforeNodeId: 'first', statement: 'changeBg:missing.svg;' }]));
  const validation = await validateProposal(f.client, proposal);
  assert.equal(validation.valid, false);
  assert.ok(validation.diagnostics.some(item => item.code === 'RESOURCE_NOT_FOUND'));
  await assert.rejects(commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash }), withCode('PROPOSAL_VALIDATION_FAILED'));
  assert.equal(f.saves.length, 0);
  assert.equal(f.text, source);
});

test('asset disappearance after review is rechecked before the commit write', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target([{ type: 'insertBefore', beforeNodeId: 'first', statement: 'changeBg:room.svg;' }]));
  assert.equal((await validateProposal(f.client, proposal)).valid, true);
  f.assets.background = [];
  await assert.rejects(commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash }), withCode('PROPOSAL_VALIDATION_FAILED'));
  assert.equal(f.saves.length, 0);
});

test('valid native asset insertion uses metadata existence only and never reports execution', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target([{ type: 'insertBefore', beforeNodeId: 'first', statement: 'changeFigure:lin.svg -left;' }]));
  assert.ok(proposal.resources.some(item => item.category === 'figure' && item.path === 'lin.svg'));
  const validation = await validateProposal(f.client, proposal);
  assert.equal(validation.valid, true);
  assert.notEqual(validation.executed, true);
  await commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash });
  assert.ok(f.text.includes('changeFigure:lin.svg -left'));
});

test('HTTP rejection cannot be mistaken for a committed result', async () => {
  const f = fixture();
  const proposal = await createProposal(f.client, target(patch('模拟拒绝。')));
  f.responseOverride = url => url.pathname.endsWith('/saveTextSnapshot') ? jsonResponse({ code: 'WRITE_LOCKED', message: 'File locked; draft retained.' }, 409) : undefined;
  await assert.rejects(commitProposal(f.client, proposal, { expectedProposalHash: proposal.proposalHash }), withCode('WRITE_LOCKED'));
  assert.equal(f.text, source);
});
