import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const WebSocket = require('ws');
const state = JSON.parse(await readFile(path.join(projectRoot, '.local/editor-runtime/process.json'), 'utf8'));
const origin = state.url;
const results = [];

async function httpCheck(name, urlPath, expected, options = {}) {
  // Node fetch normalizes Host; use the raw HTTP client so that spoofed Host
  // checks actually put the intended header on the wire.
  const response = await new Promise((resolve, reject) => {
    const outgoing = request(`${origin}${urlPath}`, options, (incoming) => {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => resolve({ status: incoming.statusCode, body: Buffer.concat(chunks).toString() }));
      incoming.on('error', reject);
    });
    outgoing.setTimeout(5000, () => outgoing.destroy(new Error(`${name}: timeout`)));
    outgoing.on('error', reject);
    outgoing.end(options.body);
  });
  assert.equal(response.status, expected, `${name}: ${response.body}`);
  results.push({ name, status: 'passed', httpStatus: response.status });
  return response;
}

await httpCheck('Built editor is served', '/', 200);
const statusResponse = await httpCheck('Exact Origin can read profile', '/api/userData/status', 200, { headers: { Origin: origin } });
const status = JSON.parse(statusResponse.body);
assert.equal(path.resolve(status.configRoot), path.resolve(state.profileRoot));
assert.equal(path.resolve(status.activeUserDataRoot), path.resolve(state.profileRoot));
assert.equal(status.isPortable, false);
await httpCheck('Same-origin Referer can read API', '/api/userData/status', 200, { headers: { Referer: `${origin}/` } });

const blockedHeaders = [
  ['Missing source', {}],
  ['Foreign Origin', { Origin: 'https://example.com' }],
  ['Null Origin', { Origin: 'null' }],
  ['Different local port', { Origin: 'http://127.0.0.1:3000' }],
  ['Deceptive Origin suffix', { Origin: `${origin}.example.com` }],
  ['Foreign Referer', { Referer: 'https://example.com/' }],
  ['Foreign Host', { Origin: origin, Host: 'example.com' }],
  ['Cross-site Fetch Metadata', { Origin: origin, 'Sec-Fetch-Site': 'cross-site' }],
];
const blockedFolderName = 'blocked-origin-verification';
const blockedFolderPath = path.join(state.profileRoot, 'games', blockedFolderName);
await assert.rejects(access(blockedFolderPath), { code: 'ENOENT' });
for (const [name, headers] of blockedHeaders) {
  await httpCheck(`${name} blocks real write route`, '/api/assets/createNewFolder', 403, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'games', name: blockedFolderName }),
  });
}
await assert.rejects(access(blockedFolderPath), { code: 'ENOENT' });
await httpCheck('API GET also requires source', '/api/manageGame/gameList', 403);
await httpCheck('Case-insensitive API route also requires source', '/API/userData/status', 403);
await httpCheck('Foreign request cannot fetch editor resources', '/', 403, { headers: { Origin: 'https://example.com' } });

async function websocketCheck(name, route, headers, expected) {
  const actual = await new Promise((resolve, reject) => {
    const socket = new WebSocket(`${origin.replace('http:', 'ws:')}${route}`, { headers });
    const timeout = setTimeout(() => { socket.terminate(); reject(new Error(`${name}: timeout`)); }, 3000);
    const finish = (result) => { clearTimeout(timeout); resolve(result); };
    socket.once('open', () => { socket.close(); finish(101); });
    socket.once('unexpected-response', (_, response) => { response.resume(); finish(response.statusCode); });
    socket.once('error', (error) => { clearTimeout(timeout); reject(error); });
  });
  assert.equal(actual, expected, name);
  results.push({ name, status: 'passed', httpStatus: actual });
}
for (const route of ['/api/webgalsync', '/api/lsp2']) {
  await websocketCheck(`${route}: same-origin upgrade`, route, { Origin: origin }, 101);
  await websocketCheck(`${route}: foreign origin refused`, route, { Origin: 'https://example.com' }, 403);
  await websocketCheck(`${route}: no origin refused`, route, {}, 403);
  await websocketCheck(`${route}: foreign Host refused`, route, { Origin: origin, Host: 'example.com' }, 403);
}

console.log(JSON.stringify({ origin, checks: results.length, profileRoot: status.activeUserDataRoot, results }, null, 2));
