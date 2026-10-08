import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const { captureSaveBackup, preserveBeforeInitialization, verifySaveBackup, ownsSaveBackupKey } =
  await import(pathToFileURL(path.join(process.env.SAVE_BACKUP_TEST_BUNDLE, 'saveBackup.mjs')));
const scope = { projectId: 'e6bc04c4-3203-4b01-a217-5a71e9b5e7cd', legacyGameKey: 'makenovel-test', legacyGameName: '测试游戏' };
const namespace = `makenovel-v1:${scope.projectId}:${'a'.repeat(64)}`;
const older = `makenovel-v1:${scope.projectId}:${'b'.repeat(64)}`;
const foreign = `makenovel-v1:81d40bd2-2d2e-43f1-bd3f-dc3bf0ebfe44:${'a'.repeat(64)}`;

class Storage {
  constructor(entries = []) { this.data = new Map(structuredClone(entries)); this.writes = []; }
  async keys() { return [...this.data.keys()]; }
  async getItem(key) { return structuredClone(this.data.has(key) ? this.data.get(key) : null); }
  async setItem(key, value) { this.writes.push(key); this.data.set(key, structuredClone(value)); return value; }
}
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
  value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
function resign(archive) {
  archive.checksum.value = createHash('sha256').update(canonical(archive.payload)).digest('hex');
  return archive;
}
async function simple() { return captureSaveBackup(new Storage([[scope.legacyGameKey, { schema: 'legacy' }]]), scope); }

test('captures user globals/read/options, every numbered slot, fast, progress and all flowchart snapshots', async () => {
  const keys = [scope.legacyGameKey, `${scope.legacyGameKey}-saves0`, `${scope.legacyGameKey}-saves200`,
    `${scope.legacyGameKey}-saves900`, `${scope.legacyGameKey}-saves-fast`, `${scope.legacyGameKey}-flowchart`,
    `${scope.legacyGameKey}-flowchart-main-node`, `FastSaveKey-${scope.legacyGameName}-${scope.legacyGameKey}`,
    `FastSaveActive-${scope.legacyGameName}-${scope.legacyGameKey}`];
  const user = { globalGameVar: { route: 'a' }, readHistory: { chapter: ['line'] }, optionData: { speed: 5 }, appreciationData: { cg: ['cg.png'] } };
  const storage = new Storage(keys.map((key, i) => [key, i === 0 ? user : { slot: i }]));
  const original = structuredClone(storage.data);
  const archive = await captureSaveBackup(storage, scope);
  assert.deepEqual(archive.payload.records.map(r => r.key), keys.sort());
  assert.deepEqual(storage.data, original);
  assert.deepEqual(storage.writes, []);
  assert.ok(JSON.stringify(archive).includes('readHistory'));
  await verifySaveBackup(JSON.parse(JSON.stringify(archive)), scope);
});

test('captures same project across manifests and excludes all foreign project keys', async () => {
  const storage = new Storage([[namespace, {}], [`${namespace}-saves2`, {}], [`${older}-flowchart-main-x`, {}], [foreign, {}], [`${foreign}-saves2`, {}]]);
  const archive = await captureSaveBackup(storage, scope);
  assert.deepEqual(archive.payload.records.map(r => r.key), [`${namespace}-saves2`, namespace, `${older}-flowchart-main-x`].sort());
});

test('anchored key matching excludes prefix neighbors, malformed hashes, unrelated settings and backup keys', () => {
  for (const key of ['makenovel-test-other', 'makenovel-test-saves2-extra', 'makenovel-test-saves-fast-other',
    'makenovel-test-savesNaN', 'makenovel-test-flowchart', `${namespace}0`, `${namespace}x-saves0`,
    `makenovel-v1:${scope.projectId}:${'A'.repeat(64)}`, `makenovel-v1:${scope.projectId}:a-saves0`,
    `makenovel-unverified-v1:${'c'.repeat(64)}`, `makenovel-backup-v1:${scope.projectId}:anything`]) {
    assert.equal(ownsSaveBackupKey(key, scope), key === 'makenovel-test-flowchart', key);
  }
});

test('unsealed scope captures legacy only and normalizes undefined optional fields for JSON export', async () => {
  const unsealed = { projectId: undefined, legacyGameKey: scope.legacyGameKey, legacyGameName: undefined };
  const archive = await captureSaveBackup(new Storage([[scope.legacyGameKey, null], [namespace, {}]]), unsealed);
  assert.deepEqual(archive.payload.scope, { legacyGameKey: scope.legacyGameKey });
  assert.equal(archive.payload.records.length, 1);
  await verifySaveBackup(JSON.parse(JSON.stringify(archive)), unsealed);
});

test('unsealed backup includes its derived isolated settings key without unverified save slots or foreign settings', async () => {
  const unsealed = { legacyGameKey: scope.legacyGameKey };
  const settingsKey = `makenovel-unverified-v1:${createHash('sha256').update(scope.legacyGameKey).digest('hex')}`;
  const otherKey = `makenovel-unverified-v1:${createHash('sha256').update('other-game').digest('hex')}`;
  const storage = new Storage([[settingsKey, { optionData: { volume: 17 }, unknownField: 'preserve me' }],
    [`${settingsKey}-saves0`, { shouldNotExist: true }], [otherKey, { privateSettings: true }]]);
  const before = structuredClone(storage.data);
  const archive = await captureSaveBackup(storage, unsealed);
  assert.deepEqual(archive.payload.records.map(record => record.key), [settingsKey]);
  assert.ok(JSON.stringify(archive).includes('preserve me'));
  await verifySaveBackup(JSON.parse(JSON.stringify(archive)), unsealed);
  assert.deepEqual(storage.data, before); assert.deepEqual(storage.writes, []);
});

test('isolated settings from another legacy key or a derived slot cannot pass recomputed-checksum validation', async () => {
  const settingsKey = `makenovel-unverified-v1:${createHash('sha256').update(scope.legacyGameKey).digest('hex')}`;
  const foreignKey = `makenovel-unverified-v1:${createHash('sha256').update('another-game').digest('hex')}`;
  for (const injectedKey of [foreignKey, `${settingsKey}-saves-fast`, `${settingsKey}-flowchart`]) {
    const archive = await captureSaveBackup(new Storage([[settingsKey, { volume: 10 }]]), scope);
    archive.payload.records[0].key = injectedKey;
    await assert.rejects(verifySaveBackup(resign(archive), scope), /其他作品/);
  }
});

test('sealed startup preserves original unverified settings before initialization without normalizing their value', async () => {
  const settingsKey = `makenovel-unverified-v1:${createHash('sha256').update(scope.legacyGameKey).digest('hex')}`;
  const storage = new Storage([[settingsKey, 'opaque damaged settings']]);
  const key = await preserveBeforeInitialization(storage, scope);
  const archive = await verifySaveBackup(storage.data.get(key), scope);
  assert.deepEqual(archive.payload.records, [{ key: settingsKey, value: { type: 'string', value: 'opaque damaged settings' } }]);
  assert.equal(storage.data.get(settingsKey), 'opaque damaged settings');
  assert.deepEqual(storage.writes, [key]);
});

test('unknown schema, damaged player primitives and null keys are copied without interpretation', async () => {
  const storage = new Storage([[scope.legacyGameKey, 'broken json {'], [`${scope.legacyGameKey}-saves0`, null],
    [`${scope.legacyGameKey}-saves1`, { protocol: 982, opaque: ['unknown', false, 123] }]]);
  const archive = await captureSaveBackup(storage, scope);
  assert.deepEqual(archive.payload.records.find(r => r.key === scope.legacyGameKey).value, { type: 'string', value: 'broken json {' });
  assert.equal(archive.payload.records.find(r => r.key.endsWith('saves0')).value.type, 'null');
  await verifySaveBackup(archive, scope);
});

test('lossless tags retain undefined, holes, exceptional numbers, bigint, Date, binary, Blob, Map and Set', async () => {
  const sparse = Array(3); sparse[2] = undefined;
  const archive = await captureSaveBackup(new Storage([[scope.legacyGameKey, {
    sparse, missing: undefined, values: [-0, NaN, Infinity, -Infinity, 1n], date: new Date('2020-01-01T00:00:00Z'),
    binary: new Uint16Array([1, 256]), blob: new Blob(['abc'], { type: 'text/plain' }), map: new Map([['x', 1]]), set: new Set([2]),
  }]]), scope);
  const fields = new Map(archive.payload.records[0].value.entries);
  assert.deepEqual(fields.get('sparse'), { type: 'array', length: 3, entries: [[2, { type: 'undefined' }]] });
  assert.equal(fields.get('missing').type, 'undefined');
  assert.deepEqual(fields.get('values').entries.map(pair => pair[1].value), ['-0', 'NaN', 'Infinity', '-Infinity', '1']);
  assert.equal(fields.get('binary').kind, 'Uint16Array');
  assert.equal(fields.get('blob').base64, 'YWJj');
  assert.equal(fields.get('date').value, '2020-01-01T00:00:00.000Z');
  await verifySaveBackup(JSON.parse(JSON.stringify(archive)), scope);
});

test('prototype-shaped fields remain inert pairs without polluting objects', async () => {
  const value = JSON.parse('{"__proto__":{"polluted":true},"constructor":"raw"}');
  const archive = await captureSaveBackup(new Storage([[scope.legacyGameKey, value]]), scope);
  assert.equal(archive.payload.records[0].value.entries[0][0], '__proto__');
  await verifySaveBackup(archive, scope);
  assert.equal({}.polluted, undefined);
});

test('preinitialization appends and readback verifies a copy, preserving every original byte-shaped value', async () => {
  const storage = new Storage([[scope.legacyGameKey, { missingField: true }], [`${older}-saves1`, 'opaque old slot']]);
  const original = structuredClone(storage.data);
  const key = await preserveBeforeInitialization(storage, scope);
  assert.ok(key.startsWith(`makenovel-backup-v1:${scope.projectId}:`));
  assert.deepEqual(storage.writes, [key]);
  for (const [key, value] of original) assert.deepEqual(storage.data.get(key), value);
  const saved = await verifySaveBackup(storage.data.get(key), scope);
  assert.equal(saved.payload.reason, 'before-initialization');
  assert.equal(saved.payload.preserved.length, 0);
});

test('preinitialization skips empty namespace without writing any marker', async () => {
  const storage = new Storage([[foreign, { unrelated: true }]]);
  assert.equal(await preserveBeforeInitialization(storage, scope), null);
  assert.deepEqual(storage.writes, []);
});

test('manual export includes immutable copies after live user data was normalized', async () => {
  const storage = new Storage([[scope.legacyGameKey, { original: 'legacy' }]]);
  const key = await preserveBeforeInitialization(storage, scope);
  const copy = structuredClone(storage.data.get(key));
  storage.data.set(scope.legacyGameKey, { normalized: true });
  const archive = await captureSaveBackup(storage, scope);
  assert.equal(archive.payload.preserved[0].key, key);
  assert.deepEqual(archive.payload.preserved[0].archive, copy);
  assert.equal(archive.payload.preserved[0].archive.payload.preserved.length, 0);
  assert.ok(JSON.stringify(archive).includes('original'));
  await verifySaveBackup(JSON.parse(JSON.stringify(archive)), scope);
});

test('multiple startups append separate snapshots and never overwrite or recursively embed prior copies', async () => {
  const storage = new Storage([[scope.legacyGameKey, 1]]);
  const first = await preserveBeforeInitialization(storage, scope);
  storage.data.set(scope.legacyGameKey, 2);
  const second = await preserveBeforeInitialization(storage, scope);
  assert.notEqual(first, second);
  assert.equal(storage.data.get(first).payload.records[0].value.value, '1');
  assert.equal(storage.data.get(second).payload.records[0].value.value, '2');
  const archive = await captureSaveBackup(storage, scope);
  assert.equal(archive.payload.preserved.length, 2);
  assert.ok(archive.payload.preserved.every(p => p.archive.payload.preserved.length === 0));
});

test('unchanged startup reuses a verified snapshot without repeatedly consuming quota', async () => {
  const storage = new Storage([[scope.legacyGameKey, { unchanged: true }]]);
  const first = await preserveBeforeInitialization(storage, scope);
  assert.equal(await preserveBeforeInitialization(storage, scope), first);
  assert.deepEqual(storage.writes, [first]);
});

test('sealed project export retains an earlier unsealed backup for the same legacy key', async () => {
  const storage = new Storage([[scope.legacyGameKey, { unsealedOriginal: true }]]);
  const unsealed = { legacyGameKey: scope.legacyGameKey };
  const key = await preserveBeforeInitialization(storage, unsealed);
  storage.data.set(scope.legacyGameKey, { changedLater: true });
  const archive = await captureSaveBackup(storage, scope);
  assert.equal(archive.payload.preserved[0].key, key);
  assert.equal(archive.payload.preserved[0].archive.payload.scope.projectId, undefined);
  await verifySaveBackup(JSON.parse(JSON.stringify(archive)), scope);
});

test('same project retained copies survive a changed game name or legacy key', async () => {
  const oldScope = { ...scope, legacyGameName: '原来的标题', legacyGameKey: 'original-key' };
  const storage = new Storage([[oldScope.legacyGameKey, 1]]);
  const key = await preserveBeforeInitialization(storage, oldScope);
  const archive = await captureSaveBackup(storage, scope);
  assert.equal(archive.payload.records.length, 0);
  assert.equal(archive.payload.preserved[0].key, key);
  await verifySaveBackup(archive, scope);
});

test('foreign retained backup cannot be smuggled under the current project backup prefix', async () => {
  const foreignScope = { ...scope, projectId: '81d40bd2-2d2e-43f1-bd3f-dc3bf0ebfe44' };
  const storage = new Storage([[scope.legacyGameKey, 1]]);
  const key = await preserveBeforeInitialization(storage, scope);
  const archive = await captureSaveBackup(new Storage([[foreign, 2]]), foreignScope, 'before-initialization');
  storage.data.set(key, archive);
  await assert.rejects(captureSaveBackup(storage, scope), /副本身份无效/);
});

test('invalid previous retained copy is not replaced and does not prevent a new startup copy', async () => {
  const storage = new Storage([[scope.legacyGameKey, 1]]);
  const first = await preserveBeforeInitialization(storage, scope);
  storage.data.get(first).checksum.value = '0'.repeat(64);
  const second = await preserveBeforeInitialization(storage, scope);
  assert.notEqual(first, second);
  assert.equal(storage.data.get(first).checksum.value, '0'.repeat(64));
  await verifySaveBackup(storage.data.get(second), scope);
});

test('quota failure prevents successful initialization result and leaves original data untouched', async () => {
  const storage = new Storage([[scope.legacyGameKey, { old: true }]]);
  const original = structuredClone(storage.data);
  storage.setItem = async () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(preserveBeforeInitialization(storage, scope), /QuotaExceeded/);
  assert.deepEqual(storage.data, original);
});

test('readback truncation rejects the initialization boundary without deleting the failed copy', async () => {
  const storage = new Storage([[scope.legacyGameKey, { old: true }]]);
  storage.setItem = async (key) => { storage.data.set(key, { truncated: true }); };
  await assert.rejects(preserveBeforeInitialization(storage, scope), /不是受支持/);
  assert.deepEqual(storage.data.get(scope.legacyGameKey), { old: true });
  assert.equal(storage.data.size, 2);
});

test('read errors fail closed before any backup writes', async () => {
  const storage = new Storage([[scope.legacyGameKey, 1]]);
  storage.getItem = async () => { throw new Error('database unavailable'); };
  await assert.rejects(preserveBeforeInitialization(storage, scope), /database unavailable/);
  assert.deepEqual(storage.writes, []);
});

test('concurrent key insertion rejects partial namespace export', async () => {
  const storage = new Storage([[scope.legacyGameKey, 1]]);
  let count = 0;
  storage.keys = async () => { if (++count > 1) storage.data.set(`${scope.legacyGameKey}-saves1`, 2); return [...storage.data.keys()]; };
  await assert.rejects(captureSaveBackup(storage, scope), /正在变化/);
});

test('concurrent value change rejects a torn observed snapshot', async () => {
  const storage = new Storage([[scope.legacyGameKey, 1]]);
  let count = 0;
  storage.getItem = async () => ++count;
  await assert.rejects(captureSaveBackup(storage, scope), /正在变化/);
});

test('unsupported cyclic data fails rather than silently dropping it', async () => {
  const cycle = {}; cycle.self = cycle;
  const storage = new Storage([[scope.legacyGameKey, cycle]]);
  await assert.rejects(preserveBeforeInitialization(storage, scope), /循环引用/);
  assert.deepEqual(storage.writes, []);
});

test('unsupported object prototypes and custom array properties fail without mutating data', async () => {
  const storage = new Storage();
  storage.getItem = async () => /regexp/;
  storage.keys = async () => [scope.legacyGameKey];
  await assert.rejects(captureSaveBackup(storage, scope), /不支持的对象/);
  const array = [1]; array.custom = 2;
  storage.getItem = async () => array;
  await assert.rejects(captureSaveBackup(storage, scope), /自定义字段/);
});

test('File metadata and symbol properties are rejected instead of silently omitted', async () => {
  const storage = new Storage(); storage.keys = async () => [scope.legacyGameKey];
  storage.getItem = async () => new File(['content'], 'player.dat');
  await assert.rejects(captureSaveBackup(storage, scope), /文件对象/);
  const symbols = { [Symbol('unknown')]: 1 };
  storage.getItem = async () => symbols;
  await assert.rejects(captureSaveBackup(storage, scope), /符号字段/);
});

test('checksum rejects changed data or changed timestamp', async () => {
  for (const modify of [a => { a.payload.records[0].value.entries[0][1].value = 'altered'; },
    a => { a.payload.createdAt = '2000-01-01T00:00:00.000Z'; }]) {
    const archive = await simple(); modify(archive);
    await assert.rejects(verifySaveBackup(archive, scope), /摘要不匹配/);
  }
});

test('scope rejects another project even when checksum is otherwise correct', async () => {
  await assert.rejects(verifySaveBackup(await simple(), { ...scope, projectId: '81d40bd2-2d2e-43f1-bd3f-dc3bf0ebfe44' }), /身份不匹配/);
});

test('foreign key injection is rejected even when attacker recomputes checksum', async () => {
  const archive = await simple(); archive.payload.records[0].key = foreign;
  await assert.rejects(verifySaveBackup(resign(archive), scope), /其他作品/);
});

test('duplicate records and unsupported format versions are rejected', async () => {
  const duplicate = await simple(); duplicate.payload.records.push(structuredClone(duplicate.payload.records[0]));
  await assert.rejects(verifySaveBackup(resign(duplicate), scope), /重复键/);
  const future = await simple(); future.payload.schemaVersion = 2;
  await assert.rejects(verifySaveBackup(resign(future), scope), /格式或作品身份/);
});

test('tampered tagged values and additional object fields cannot pass checksum-only validation', async () => {
  const cases = [{ type: 'number', value: 'nonsense' }, { type: 'binary', kind: 'Unknown', base64: '' },
    { type: 'binary', kind: 'Blob', mime: '', base64: '*' }, { type: 'array', length: 1, entries: [[1, { type: 'null' }]] },
    { type: 'object', entries: [['a', { type: 'null' }], ['a', { type: 'null' }]] }, { type: 'null', extra: true }];
  for (const value of cases) {
    const archive = await simple(); archive.payload.records[0].value = value;
    await assert.rejects(verifySaveBackup(resign(archive), scope), /无效或不支持/);
  }
});

test('nested backup recursion is rejected even with valid nested checksums', async () => {
  const storage = new Storage([[scope.legacyGameKey, 1]]);
  const key = await preserveBeforeInitialization(storage, scope);
  const exported = await captureSaveBackup(storage, scope);
  exported.payload.preserved[0].archive.payload.preserved.push({ key, archive: await simple() });
  resign(exported.payload.preserved[0].archive); resign(exported);
  await assert.rejects(verifySaveBackup(exported, scope), /格式或作品身份/);
});

test('damaged retained copy is not silently omitted from an export', async () => {
  const storage = new Storage([[scope.legacyGameKey, 1]]);
  const key = await preserveBeforeInitialization(storage, scope);
  storage.data.get(key).checksum.value = '0'.repeat(64);
  await assert.rejects(captureSaveBackup(storage, scope), /摘要不匹配/);
  assert.ok(storage.data.has(key));
});

test('invalid or reserved identities fail before enumeration', async () => {
  const storage = new Storage(); storage.keys = async () => { throw new Error('must not read'); };
  for (const invalid of [{ ...scope, projectId: 'not-uuid' }, { ...scope, legacyGameKey: '' },
    { ...scope, legacyGameKey: namespace }]) {
    await assert.rejects(captureSaveBackup(storage, invalid), /作品身份无效/);
  }
});
