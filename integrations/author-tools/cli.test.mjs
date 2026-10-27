// These run the real CLI processes and native contracts. The temporary HTTP server
// below is an explicit protocol fixture, not a running Terre service or GUI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const scratch = path.join(root, '.scratch');
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const original = '\uFEFF; 只给CLI使用的临时作品\r\nsay:原对白 -speaker=林; 注释 ; @makenovel-node first\r\nend:; @makenovel-node ending\r\n';
const gameName = 'isolated-cli-fixture';
const scenePath = 'game/scene/start.txt';

async function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('CLI fixture exceeded 20 seconds.')); }, 20_000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  });
}

function success(result) {
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function refusal(result, code) {
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const output = JSON.parse(result.stderr);
  assert.equal(output.error.code, code);
  return output;
}

async function fixture(t) {
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(path.join(scratch, 'author-tools-cli-'));
  t.after(async () => {
    const relative = path.relative(scratch, directory);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await rm(directory, { recursive: true, force: true });
  });
  let text = original;
  const workspaceId = hash('isolated CLI protocol fixture');
  const requests = [];
  const saves = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = body ? JSON.parse(body) : null;
    requests.push({ url: request.url, headers: request.headers, body: payload });
    let status = 200;
    let output;
    if (request.url === '/api/manageGame/textSnapshot' && request.method === 'POST') {
      assert.equal(payload.gameName, gameName);
      assert.equal(payload.path, scenePath);
      output = { text, revision: hash(text), workspaceId };
    } else if (request.url === '/api/manageGame/saveTextSnapshot' && request.method === 'POST') {
      saves.push(payload);
      if (payload.expectedRevision !== hash(text) || payload.expectedWorkspaceId !== workspaceId) {
        status = 409;
        output = { code: 'REVISION_CONFLICT', message: 'Protocol fixture revision mismatch.' };
      } else {
        text = payload.text;
        output = { text, revision: hash(text), workspaceId };
      }
    } else {
      status = 404;
      output = { code: 'FIXTURE_UNEXPECTED_ENDPOINT', message: request.url };
    }
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(output));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const operationsFile = path.join(directory, 'operations.json');
  const proposalFile = path.join(directory, 'proposal.json');
  await writeFile(operationsFile, JSON.stringify([{ type: 'patchDialogue', nodeId: 'first', text: '工具审阅后的对白🌧️' }]), 'utf8');
  const propose = ['propose', '--origin', origin, '--game', gameName, '--path', scenePath, '--operations', operationsFile, '--out', proposalFile];
  return { directory, origin, operationsFile, proposalFile, propose, requests, saves, get text() { return text; } };
}

test('CLI capabilities are structured JSON and do not require a service', async () => {
  const capabilities = success(await run(['capabilities']));
  assert.ok(capabilities.operations.includes('patchDialogue'));
  assert.equal(capabilities.transport, 'existing-loopback-terre-api');
});

test('CLI refuses unknown, duplicate and incomplete options with structured errors', async () => {
  for (const args of [
    ['source', '--cookie', 'secret'],
    ['source', '--game', gameName, '--game', 'other'],
    ['source', '--game'],
    ['unknown-command'],
  ]) refusal(await run(args), 'INVALID_ARGUMENT');
});

test('CLI local diagnosis preserves UTF-8 BOM/raw positions and labels itself unexecuted', async t => {
  const f = await fixture(t);
  const filename = path.join(f.directory, 'source.txt');
  const source = '\uFEFFsay:中文🌧️; @makenovel-node first\r\n';
  await writeFile(filename, source, 'utf8');
  const result = success(await run(['diagnose', '--file', filename]));
  assert.equal(result.analysis.valid, true);
  assert.equal(result.analysis.blocks[0].raw, source.slice(0, -2));
  assert.equal(result.analysis.blocks[0].range.start.offset, 0);
  assert.equal(result.executed, false);
  assert.equal(f.requests.length, 0);
  assert.equal(await readFile(filename, 'utf8'), source);
});

test('CLI rejects invalid UTF-8 and malformed JSON before HTTP or output creation', async t => {
  const f = await fixture(t);
  const invalidUtf8 = path.join(f.directory, 'invalid-utf8.txt');
  await writeFile(invalidUtf8, Buffer.from([0xc3, 0x28]));
  refusal(await run(['diagnose', '--file', invalidUtf8]), 'INVALID_UTF8');
  await writeFile(f.operationsFile, '[{"type":', 'utf8');
  refusal(await run(f.propose), 'INVALID_JSON');
  assert.equal(f.requests.length, 0);
  assert.equal(f.saves.length, 0);
  await assert.rejects(access(f.proposalFile), { code: 'ENOENT' });
});

test('CLI proposal output is exclusive and preserves an existing artifact without a source write', async t => {
  const f = await fixture(t);
  const retained = '作者保留的旧提案；不得覆盖\r\n';
  await writeFile(f.proposalFile, retained, 'utf8');
  refusal(await run(f.propose), 'EEXIST');
  assert.equal(await readFile(f.proposalFile, 'utf8'), retained);
  assert.equal(f.text, original);
  assert.equal(f.saves.length, 0);
});

test('CLI serialized proposal is reviewed locally and committed once through HTTP with exact guards', async t => {
  const f = await fixture(t);
  const proposed = success(await run(f.propose));
  assert.equal(proposed.committed, false);
  const proposal = JSON.parse(await readFile(f.proposalFile, 'utf8'));
  assert.equal(proposed.proposalHash, proposal.proposalHash);
  assert.equal(f.text, original);
  assert.equal(f.saves.length, 0);
  const readsBeforeReview = f.requests.length;
  const review = success(await run(['review', '--proposal', f.proposalFile]));
  assert.equal(review.proposalHash, proposal.proposalHash);
  assert.equal(f.requests.length, readsBeforeReview);
  const validation = success(await run(['validate', '--origin', f.origin, '--proposal', f.proposalFile]));
  assert.equal(validation.valid, true);
  assert.equal(f.saves.length, 0);
  refusal(await run(['commit', '--origin', f.origin, '--proposal', f.proposalFile]), 'REVIEW_HASH_REQUIRED');
  assert.equal(f.saves.length, 0);
  const commitArgs = ['commit', '--origin', f.origin, '--proposal', f.proposalFile, '--review-hash', review.proposalHash];
  const receipt = success(await run(commitArgs));
  assert.equal(receipt.committed, true);
  assert.equal(receipt.requiresReseal, true);
  assert.equal(receipt.revision, hash(f.text));
  assert.equal(f.text, original.replace('原对白', '工具审阅后的对白🌧️'));
  assert.deepEqual(f.saves, [{ gameName, path: scenePath, text: proposal.proposedText, expectedRevision: hash(original), expectedWorkspaceId: proposal.workspaceId }]);
  refusal(await run(commitArgs), 'REVISION_CONFLICT');
  assert.equal(f.saves.length, 1);
  assert.equal(await readFile(f.proposalFile, 'utf8'), JSON.stringify(proposal, null, 2) + '\n');
  for (const request of f.requests) {
    assert.equal(request.headers.origin, f.origin);
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.headers.cookie, undefined);
  }
});
