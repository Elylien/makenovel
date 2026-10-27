import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

let sequence=0;
const clone=value=>structuredClone(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function harness(options={}) {
  const meta={schemaVersion:1,projectId:'5fa664df-083b-4337-a5dd-0fbc7d650cc4',gameKey:'test-game',runtimeCompatibilityId:'locked-runtime',manifestHash:'a'.repeat(64)};
  const namespace=`makenovel-v1:${meta.projectId}:${meta.manifestHash}`;
  const values=new Map();
  const h={meta,namespace,key:`${namespace}-favorites`,enabled:true,preview:false,epoch:1,values,reads:[],writes:[],errors:[],validations:[],
    raw:'say:台词 -speaker=雨 -vocal=sample.wav; @makenovel-node line.one\nsay:第二句;',
    WebGAL:{gameKey:namespace},
    getItem:async key=>{h.reads.push(key);return clone(values.get(key)??null);},
    setItem:async(key,value)=>{h.writes.push([key,clone(value)]);values.set(key,clone(value));return value;},
    sha256:async bytes=>hash(bytes),
    validateSnapshot:async snapshot=>{h.validations.push(clone(snapshot));return{rawScene:h.raw};},
    readVerifiedVocalAsset:async path=>{h.voicePath=path;return new Uint8Array([1,2,3]);},
    ...options,
  };
  globalThis.document={baseURI:'https://example.test/games/test/'};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name,operation)=>operation()}}});
  globalThis.__favoritesTest=h;
  h.api=await import(`${pathToFileURL(process.env.FAVORITES_TEST_BUNDLE).href}?case=${++sequence}`);
  h.item=(overrides={})=>({makenovel:clone(meta),saveScene:{currentSentenceId:1,sceneUrl:'./game/scene/start.txt',sceneName:'起点',sceneStack:[],currentLocals:{}},
    currentStageState:{showText:'台词',showName:'雨',vocal:'./game/vocal/sample.wav'},...overrides});
  return h;
}
const add=async h=>(await h.api.favoriteBacklog(h.item()))[0];

test('empty load is read-only; does not normalize old keys or write save/user state',async()=>{
  const h=await harness();h.values.set('test-game',{preserve:true});
  assert.deepEqual(await h.api.loadFavorites(),[]);assert.equal(h.writes.length,0);
  assert.deepEqual(h.reads,[h.key]);assert.deepEqual(h.values.get('test-game'),{preserve:true});
});
test('native source identity and rendered snapshot are persisted separately from story state',async()=>{
  const h=await harness();const entry=await add(h);
  assert.equal(entry.identity,'node');assert.equal(entry.nodeId,'line.one');assert.equal(entry.text,'台词');
  assert.equal(entry.voice,'game/vocal/sample.wav');assert.equal(entry.sceneUrl,'game/scene/start.txt');
  assert.equal(entry.sentenceIndex,0);assert.match(entry.id,/^[a-f0-9]{64}$/);assert.equal(h.writes.length,1);
  assert.deepEqual(Object.keys(h.values.get(h.key)).sort(),['entries','format','namespace','schemaVersion']);
  assert.equal('currentStageState' in entry,false);assert.equal('GameVar' in entry,false);
  assert.equal(h.validations.length,1);assert.equal(h.validations[0].backlog.length,0);
});
test('same favorite is idempotent and not reordered or retimestamped',async()=>{
  const h=await harness();const first=await add(h);const next=await h.api.favoriteBacklog(h.item());
  assert.deepEqual(next,[first]);assert.equal(h.writes.length,1);
});
test('missing source ID is explicitly a revision-position identity',async()=>{
  const h=await harness({raw:'say:台词;'});const entry=await add(h);
  assert.equal(entry.identity,'revision-position');assert.equal(entry.nodeId,undefined);
});
test('duplicate source IDs do not masquerade as stable identities',async()=>{
  const h=await harness({raw:'say:台词; @makenovel-node duplicate\nsay:其他; @makenovel-node duplicate'});
  assert.equal((await add(h)).identity,'revision-position');
});
test('a duplicate marker inside an ambiguous node does not grant stable identity',async()=>{
  const h=await harness({raw:'say:台词; @makenovel-node duplicate\nsay:其他; @makenovel-node duplicate @makenovel-node second'});
  assert.equal((await add(h)).identity,'revision-position');
});
test('a valid legacy standalone marker is read without rewriting source',async()=>{
  const h=await harness({raw:'; @makenovel-node legacy.one\nsay:台词;'});
  const item=h.item();item.saveScene.currentSentenceId=2;
  assert.equal((await h.api.favoriteBacklog(item))[0].nodeId,'legacy.one');assert.equal(h.raw,'; @makenovel-node legacy.one\nsay:台词;');
});
test('ambiguous standalone plus inline markers degrade safely',async()=>{
  const h=await harness({raw:'; @makenovel-node first\nsay:台词; @makenovel-node second'});
  const item=h.item();item.saveScene.currentSentenceId=2;
  assert.equal((await h.api.favoriteBacklog(item))[0].identity,'revision-position');
});
test('native multiline dialogue owns its head and tail marker',async()=>{
  const h=await harness({raw:'say:第一行\\\n第二行; @makenovel-node multiline'});
  const entry=await add(h);assert.equal(entry.nodeId,'multiline');assert.equal(entry.sentenceIndex,0);
});
test('different evaluated text at the same stable node is a different snapshot',async()=>{
  const h=await harness();const first=await add(h);const item=h.item();item.currentStageState.showText='变量值不同';
  const all=await h.api.favoriteBacklog(item);assert.equal(all.length,2);assert.notEqual(all[1].id,first.id);
});
test('same text at another source position is not mistaken for the first favorite',async()=>{
  const h=await harness({raw:'say:相同;\nsay:相同;'});await add(h);const item=h.item();item.saveScene.currentSentenceId=2;
  assert.equal(h.api.isBacklogFavorite(item,await h.api.loadFavorites()),false);
  assert.equal((await h.api.favoriteBacklog(item)).length,2);
});
test('text without voice stays collectable',async()=>{
  const h=await harness();const item=h.item();item.currentStageState.vocal='';
  const entry=(await h.api.favoriteBacklog(item))[0];assert.equal(entry.voice,'');assert.equal(entry.voiceUnavailable,undefined);
});
test('external or unsafe audio is disabled while preserving the text snapshot',async()=>{
  const h=await harness();const item=h.item();item.currentStageState.vocal='https://foreign.test/track.mp3';
  const entry=(await h.api.favoriteBacklog(item))[0];assert.equal(entry.voice,'');assert.match(entry.voiceUnavailable,/仅保存文字/);
});
test('encoded local paths canonicalize consistently in browser and file exports',async()=>{
  const h=await harness();globalThis.document.baseURI='file:///C:/Games/Novel%20Test/index.html';
  const item=h.item();item.saveScene.sceneUrl='file:///C:/Games/Novel%20Test/game/scene/%E9%9B%A8.txt';
  item.currentStageState.vocal='./game/vocal/voice%20one.wav';
  const entry=(await h.api.favoriteBacklog(item))[0];assert.equal(entry.sceneUrl,'game/scene/%E9%9B%A8.txt');assert.equal(entry.voice,'game/vocal/voice%20one.wav');
  assert.equal(h.api.favoriteIdForBacklog(item,[entry]),entry.id);
});
test('encoded hash and percent in a vocal filename round-trip without blocking text collection',async()=>{
  const h=await harness();const item=h.item();item.currentStageState.vocal='./game/vocal/a%23b%25.wav';
  const entry=(await h.api.favoriteBacklog(item))[0];assert.equal(entry.voice,'game/vocal/a%23b%25.wav');
  assert.deepEqual(await h.api.loadFavorites(),[entry]);assert.equal(h.api.favoriteIdForBacklog(item,[entry]),entry.id);
});
test('preview cannot load, add, remove or clear player favorites',async()=>{
  const h=await harness();h.enabled=false;h.preview=true;
  for(const operation of [()=>h.api.loadFavorites(),()=>h.api.favoriteBacklog(h.item()),()=>h.api.removeFavorite('a'.repeat(64)),()=>h.api.clearFavorites()])await assert.rejects(operation,/作者预览/);
  assert.equal(h.reads.length,0);assert.equal(h.writes.length,0);
});
test('unverified namespace and foreign metadata refuse before storage mutation',async()=>{
  const h=await harness();h.WebGAL.gameKey='makenovel-unverified-v1:'+'a'.repeat(64);
  await assert.rejects(()=>h.api.loadFavorites(),/会话已改变/);assert.equal(h.reads.length,0);
  h.WebGAL.gameKey=h.namespace;const item=h.item();item.makenovel.manifestHash='b'.repeat(64);
  await assert.rejects(()=>h.api.favoriteBacklog(item),/其他版本/);assert.equal(h.writes.length,0);
});
test('stale metadata and invalid source pointer never use text equality as fallback',async()=>{
  const h=await harness();const item=h.item();item.saveScene.currentSentenceId=100;
  await assert.rejects(()=>h.api.favoriteBacklog(item),/位置已失效/);
  h.raw='setVar:sideEffect=1;';await assert.rejects(()=>h.api.favoriteBacklog(h.item()),/位置已失效/);assert.equal(h.writes.length,0);
});
test('source version preflight failures preserve all storage',async()=>{
  const h=await harness();h.validateSnapshot=async()=>{throw new Error('作品内容已变化');};
  await assert.rejects(()=>add(h),/作品内容已变化/);assert.equal(h.writes.length,0);assert.ok(h.errors.length>0);
});
test('matching function is nonthrowing for malformed backlog and preview',async()=>{
  const h=await harness();const entry=await add(h);
  for(const item of [null,{},h.item({saveScene:{currentSentenceId:-1}})])assert.equal(h.api.favoriteIdForBacklog(item,[entry]),undefined);
  h.enabled=false;assert.equal(h.api.favoriteIdForBacklog(h.item(),[entry]),undefined);
});
test('stored lists and returned entries do not alias caller objects',async()=>{
  const h=await harness();const entry=await add(h);entry.text='tampered';
  const values=await h.api.loadFavorites();assert.equal(values[0].text,'台词');values[0].text='again';
  assert.equal((await h.api.loadFavorites())[0].text,'台词');
});
test('the input backlog is snapshotted at invocation before asynchronous validation',async()=>{
  const h=await harness();const wait=deferred();h.validateSnapshot=async()=>{await wait.promise;return{rawScene:h.raw};};
  const item=h.item();const pending=h.api.favoriteBacklog(item);item.currentStageState.showText='later mutation';
  wait.resolve();assert.equal((await pending)[0].text,'台词');
});
test('durable failure does not announce success or publish an optimistic entry',async()=>{
  const h=await harness();let events=0;h.api.subscribeFavorites(()=>events++);
  h.setItem=async()=>{throw new Error('QuotaExceededError');};
  await assert.rejects(()=>add(h),/QuotaExceeded/);assert.equal(events,0);assert.deepEqual(await h.api.loadFavorites(),[]);
});
test('failed writes do not poison following queued operations',async()=>{
  const h=await harness();const real=h.setItem;let first=true;h.setItem=async(...args)=>{if(first){first=false;throw new Error('disk');}return real(...args);};
  const bad=h.api.favoriteBacklog(h.item());const good=h.api.favoriteBacklog(h.item());
  await assert.rejects(()=>bad,/disk/);assert.equal((await good).length,1);
});
test('simultaneous additions are serialized and preserve both entries',async()=>{
  const h=await harness();const one=h.item();const two=h.item();two.currentStageState.showText='another';
  await Promise.all([h.api.favoriteBacklog(one),h.api.favoriteBacklog(two)]);assert.equal((await h.api.loadFavorites()).length,2);
});
test('reads ordered after writes observe durable completion',async()=>{
  const h=await harness();const wait=deferred();const real=h.setItem;h.setItem=async(...args)=>{await wait.promise;return real(...args);};
  const adding=h.api.favoriteBacklog(h.item());const reading=h.api.loadFavorites();wait.resolve();await adding;assert.equal((await reading).length,1);
});
test('clear queued after add leaves an empty collection',async()=>{
  const h=await harness();const added=h.api.favoriteBacklog(h.item());const cleared=h.api.clearFavorites();await added;assert.deepEqual(await cleared,[]);assert.deepEqual(await h.api.loadFavorites(),[]);
});
test('clear and remove publish only acknowledged writes and unsubscribe works',async()=>{
  const h=await harness();let events=0;const off=h.api.subscribeFavorites(()=>events++);const entry=await add(h);
  assert.deepEqual(await h.api.removeFavorite(entry.id),[]);assert.equal(events,2);
  await h.api.removeFavorite(entry.id);await h.api.clearFavorites();assert.equal(events,2);
  off();await add(h);assert.equal(events,2);
});
test('a broken subscriber cannot reject a successfully persisted operation',async()=>{
  const h=await harness();let notified=false;h.api.subscribeFavorites(()=>{throw new Error('UI failed');});h.api.subscribeFavorites(()=>{notified=true;});
  const entry=await add(h);assert.equal(notified,true);assert.deepEqual(await h.api.loadFavorites(),[entry]);
});
test('loading an older story snapshot cannot delete newer favorites',async()=>{
  const h=await harness();const entry=await add(h);const olderBacklog=h.item();olderBacklog.currentStageState.showText='old story state';
  assert.equal(h.api.isBacklogFavorite(olderBacklog,[entry]),false);
  assert.deepEqual(await h.api.loadFavorites(),[entry]);assert.equal(h.writes.length,1);
});
test('new runtime module session reads persisted data after restart',async()=>{
  const h=await harness();const entry=await add(h);globalThis.__favoritesTest=h;
  const reopened=await import(`${pathToFileURL(process.env.FAVORITES_TEST_BUNDLE).href}?restart=${++sequence}`);
  assert.deepEqual(await reopened.loadFavorites(),[entry]);
});
test('another exact version uses a different key and keeps old data',async()=>{
  const h=await harness();await add(h);const previous=clone(h.values.get(h.key));
  h.meta={...h.meta,manifestHash:'b'.repeat(64)};h.WebGAL.gameKey=`makenovel-v1:${h.meta.projectId}:${h.meta.manifestHash}`;h.epoch++;
  assert.deepEqual(await h.api.loadFavorites(),[]);assert.deepEqual(h.values.get(h.key),previous);
});
test('epoch changed during read discards stale completion',async()=>{
  const h=await harness();const wait=deferred();h.getItem=async()=>{await wait.promise;return null;};
  const operation=h.api.loadFavorites();await new Promise(resolve=>setImmediate(resolve));h.epoch++;wait.resolve();
  await assert.rejects(()=>operation,/会话已改变/);assert.equal(h.writes.length,0);
});
test('epoch changed before queued work starts prevents all IO',async()=>{
  const h=await harness();const operation=h.api.favoriteBacklog(h.item());h.epoch++;
  await assert.rejects(()=>operation,/会话已改变/);assert.equal(h.reads.length,0);assert.equal(h.writes.length,0);
});
test('preview during preflight prevents the write',async()=>{
  const h=await harness();h.validateSnapshot=async()=>{h.enabled=false;h.preview=true;h.epoch++;return{rawScene:h.raw};};
  await assert.rejects(()=>add(h),/作者预览/);assert.equal(h.writes.length,0);
});
test('already-started durable write cannot be rolled back but stale success is suppressed',async()=>{
  const h=await harness();let events=0;h.api.subscribeFavorites(()=>events++);const real=h.setItem;
  h.setItem=async(...args)=>{const result=await real(...args);h.epoch++;return result;};
  await assert.rejects(()=>add(h),/会话已改变/);assert.equal(h.values.get(h.key).entries.length,1);assert.equal(events,0);
});
test('cross-tab Web Lock is used when supported and read happens within it',async()=>{
  const h=await harness();let locked=false;const calls=[];navigator.locks={request:async(name,work)=>{calls.push(name);locked=true;try{return await work();}finally{locked=false;}}};
  const original=h.getItem;h.getItem=(...args)=>{assert.equal(locked,true);return original(...args);};await add(h);
  assert.deepEqual(calls,[`makenovel-favorites:${h.key}`]);
});
test('hosts without Web Locks can read and clear empty state but cannot mutate nonempty data',async()=>{
  const h=await harness();const entry=await add(h);delete navigator.locks;
  assert.deepEqual(await h.api.loadFavorites(),[entry]);
  await assert.rejects(()=>h.api.removeFavorite(entry.id),/保持只读/);await assert.rejects(()=>h.api.clearFavorites(),/保持只读/);
  h.values.delete(h.key);await assert.rejects(()=>add(h),/保持只读/);assert.deepEqual(await h.api.clearFavorites(),[]);
});
test('voice verification returns a blob of verified bytes, not the live source URL',async()=>{
  const h=await harness();const entry=await add(h);const url=await h.api.verifyFavoriteVoice(entry);
  try {assert.match(url,/^blob:/);assert.equal(h.voicePath,'game/vocal/sample.wav');assert.deepEqual([...new Uint8Array(await(await fetch(url)).arrayBuffer())],[1,2,3]);}
  finally {URL.revokeObjectURL(url);}
});
test('voice verification supplies decoded canonical filename to the manifest reader',async()=>{
  const h=await harness();const item=h.item();item.currentStageState.vocal='./game/vocal/a%23b%25.wav';
  const entry=(await h.api.favoriteBacklog(item))[0];const url=await h.api.verifyFavoriteVoice(entry);
  URL.revokeObjectURL(url);assert.equal(h.voicePath,'game/vocal/a#b%.wav');
});
test('changed/missing voice is reported without deleting a text favorite',async()=>{
  const h=await harness();const entry=await add(h);h.readVerifiedVocalAsset=async()=>{throw new Error('语音内容已经改变');};
  await assert.rejects(()=>h.api.verifyFavoriteVoice(entry),/已经改变/);assert.deepEqual(await h.api.loadFavorites(),[entry]);
});
test('voice verification refuses old revision, no voice, and preview',async()=>{
  const h=await harness();const entry=await add(h);
  await assert.rejects(()=>h.api.verifyFavoriteVoice({...entry,manifestHash:'b'.repeat(64)}),/版本不匹配/);
  await assert.rejects(()=>h.api.verifyFavoriteVoice({...entry,voice:''}),/没有语音/);
  h.enabled=false;h.preview=true;await assert.rejects(()=>h.api.verifyFavoriteVoice(entry),/作者预览/);
});
test('session change during voice verification suppresses object URL creation',async()=>{
  const h=await harness();const entry=await add(h);h.readVerifiedVocalAsset=async()=>{h.epoch++;return new Uint8Array([1]);};
  await assert.rejects(()=>h.api.verifyFavoriteVoice(entry),/会话已改变/);
});

for(const [name,mutate] of [
  ['future schema',value=>value.schemaVersion=2],
  ['foreign namespace',value=>value.namespace='another'],
  ['unknown top-level field',value=>value.future={keep:true}],
  ['unknown entry field',value=>value.entries[0].future=true],
  ['foreign revision',value=>value.entries[0].manifestHash='b'.repeat(64)],
  ['duplicate IDs',value=>value.entries.push(clone(value.entries[0]))],
  ['invalid timestamp',value=>value.entries[0].createdAt='yesterday'],
  ['unsafe path',value=>value.entries[0].voice='javascript:alert(1)'],
  ['identity mismatch',value=>value.entries[0].identity='revision-position'],
  ['oversize text',value=>value.entries[0].text='x'.repeat(32769)],
  ['array hole',value=>delete value.entries[0]],
])test(`corrupt data (${name}) is preserved and cannot be cleared or normalized`,async()=>{
  const h=await harness();await add(h);const value=clone(h.values.get(h.key));mutate(value);h.values.set(h.key,value);h.writes.length=0;
  for(const operation of [()=>h.api.loadFavorites(),()=>h.api.favoriteBacklog(h.item()),()=>h.api.removeFavorite('a'.repeat(64)),()=>h.api.clearFavorites()])await assert.rejects(operation,/没有覆盖原数据/);
  assert.deepEqual(h.values.get(h.key),value);assert.equal(h.writes.length,0);
});
test('snapshot getters in stored records are rejected without executing them',async()=>{
  const h=await harness();let accessed=false;const record={};Object.defineProperty(record,'entries',{enumerable:true,get(){accessed=true;return[];}});
  h.getItem=async()=>record;await assert.rejects(()=>h.api.loadFavorites(),/没有覆盖原数据/);assert.equal(accessed,false);
});
