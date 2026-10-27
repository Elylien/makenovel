import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
class Hooks {
  slots=[];index=0;pending=[];
  state(initial){const i=this.index++;if(!(i in this.slots))this.slots[i]=typeof initial==='function'?initial():initial;
    return[this.slots[i],v=>{this.slots[i]=typeof v==='function'?v(this.slots[i]):v;}];}
  ref(value){const i=this.index++;return this.slots[i]??(this.slots[i]={current:value});}
  memo(callback,deps){const i=this.index++;if(!same(this.slots[i]?.deps,deps))this.slots[i]={deps,value:callback()};return this.slots[i].value;}
  effect(callback,deps){const i=this.index++;if(same(this.slots[i]?.deps,deps))return;const previous=this.slots[i];
    const slot=this.slots[i]={deps,effect:true};this.pending.push(()=>{previous?.cleanup?.();slot.cleanup=callback();});}
  render(fn){this.index=0;globalThis.__favoriteHooks=this;const value=fn();for(const f of this.pending.splice(0))f();return value;}
  unmount(){for(const slot of this.slots)if(slot?.effect)slot.cleanup?.();}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function find(node,predicate){if(Array.isArray(node)){for(const child of node){const n=find(child,predicate);if(n)return n;}return;}
  if(!node||typeof node!=='object')return;if(predicate(node))return node;return find(node.props?.children,predicate);}
function all(node,predicate,result=[]){if(Array.isArray(node)){node.forEach(n=>all(n,predicate,result));return result;}
  if(!node||typeof node!=='object')return result;if(predicate(node))result.push(node);all(node.props?.children,predicate,result);return result;}
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):node==null||typeof node==='boolean'?'':String(node);
const button=(tree,label)=>find(tree,n=>n.type==='button'&&text(n)===label);
const entry=(id,extra={})=>({id,speaker:'林',text:'雨后的街角',voice:'',sceneName:'start.txt',createdAt:'2026-10-27T00:00:00.000Z',...extra});
const state={GUI:{showBacklog:true,showTitle:false,showMenuPanel:false,showFlowchart:false,showGlobalDialog:false},userData:{optionData:{volumeMain:80,vocalVolume:50,language:0}}};
function setup(initial=[]){const listeners=new Set(),statusListeners=new Set(),visualListeners=new Set();let stored=initial;
  const s={state:structuredClone(state),epoch:1,preview:false,writes:0,jumps:0,errors:[],actions:[],dialog:null,
    WebGAL:{gameKey:'namespace',backlogManager:{getBacklog:()=>[]},sceneManager:{sceneData:{currentScene:{}},session:1,getSessionEpoch(){return this.session;},lockSceneWrite:false},gameplay:{performController:{unmountPerform(){}}},flowchartManager:{clearProgress:async()=>{s.writes++;}}},
    dispatch(action){s.actions.push(action);},load:async()=>stored,add:async item=>{stored=[...stored,entry(item.id)];listeners.forEach(f=>f());return stored;},
    remove:async id=>{stored=stored.filter(e=>e.id!==id);listeners.forEach(f=>f());return stored;},clear:async()=>{stored=[];listeners.forEach(f=>f());return stored;},
    verifyVoice:async entry=>`blob:${entry.id}`,
    subscribeFavorites(f){listeners.add(f);return()=>listeners.delete(f);},subscribeStatus(f){statusListeners.add(f);return()=>statusListeners.delete(f);},
    subscribeVisual(f){visualListeners.add(f);return()=>visualListeners.delete(f);},
    publish(){statusListeners.forEach(f=>f());},publishVisual(){visualListeners.forEach(f=>f());},listeners,statusListeners,visualListeners};
  globalThis.__favoriteUI=s;return s;
}
setup();
const load=name=>import(pathToFileURL(path.join(process.env.FAVORITES_UI_BUNDLE,`${name}.mjs`)));
const {FavoriteVoicePlayer}=await load('voice');
const {useFavorites}=await load('hook');
const {Favorites,selectFavorites}=await load('panel');
const {Backlog}=await load('backlog');
const {System}=await load('system');

// Bundles retain WebGAL's singleton reference, exactly like a live page. New
// fixtures refresh its fields rather than replacing that identity.
const bundledWebGAL=globalThis.__favoriteUI.WebGAL;
function fixture(initial=[]){const s=setup(initial);Object.assign(bundledWebGAL,s.WebGAL);s.WebGAL=bundledWebGAL;return s;}

class Audio {
  constructor(src=''){this.src=src;this.paused=true;this.muted=false;this.playCalls=0;this.pauseCalls=0;this.onended=null;this.onerror=null;this.currentTime=2;this.volume=1;}
  play(){this.playCalls++;this.paused=false;return this.promise??Promise.resolve();}
  pause(){this.pauseCalls++;this.paused=true;}
  removeAttribute(){this.src='';}
  load(){}
}
function voiceFixture(){const voice=new Audio('game/vocal/current.wav');voice.paused=false;const audios=[],events=[],released=[];let context='one',current=voice,history=0;
  const player=new FavoriteVoicePlayer({createAudio:url=>{const a=new Audio(url);audios.push(a);return a;},currentVoice:()=>current,
    releaseAudioUrl:url=>released.push(url),stopHistory:()=>history++,volume:()=>.4,context:()=>context,onState:(...args)=>events.push(args)});
  return{player,voice,audios,events,released,get history(){return history;},setContext:value=>{context=value;},setCurrent:value=>{current=value;}};}

test('audition only mutes original voice, preserving its play state and clock',async()=>{const h=voiceFixture();await h.player.play('one','game/vocal/one.wav');
  assert.equal(h.voice.muted,true);assert.equal(h.voice.paused,false);assert.equal(h.voice.currentTime,2);assert.equal(h.audios[0].volume,.4);assert.equal(h.history,1);
  h.player.stop();await tick();assert.equal(h.audios[0].paused,true);assert.equal(h.voice.muted,false);assert.equal(h.voice.playCalls,0);assert.equal(h.voice.pauseCalls,0);assert.deepEqual(h.released,['game/vocal/one.wav']);});
test('switching favorites keeps original voice muted until explicit stop',async()=>{const h=voiceFixture();await h.player.play('one','one');await h.player.play('two','two');
  assert.equal(h.audios[0].paused,true);assert.equal(h.voice.muted,true);h.player.stop();assert.equal(h.voice.muted,false);assert.equal(h.voice.playCalls,0);});
test('late rejection from cancelled audio cannot stop a newer favorite',async()=>{const h=voiceFixture();const d=deferred();
  h.player.env.createAudio=url=>{const a=new Audio(url);if(!h.audios.length)a.promise=d.promise;h.audios.push(a);return a;};
  const first=h.player.play('one','one');await h.player.play('two','two');d.reject(Error('late'));await first;
  assert.equal(h.audios[1].paused,false);assert.deepEqual(h.events.at(-1),['two','']);h.player.dispose();});
test('decode failure stops audition, restores mute, and reports text remains',async()=>{const h=voiceFixture();await h.player.play('one','bad');h.audios[0].onerror();
  assert.equal(h.audios[0].paused,true);assert.equal(h.voice.muted,false);assert.equal(h.voice.playCalls,0);assert.match(h.events.at(-1)[1],/文本收藏仍保留/);});
test('normal audio end releases element and restores original mute value',async()=>{const h=voiceFixture();h.voice.muted=true;await h.player.play('one','one');h.audios[0].onended();
  assert.equal(h.audios[0].src,'');assert.equal(h.voice.muted,true);assert.equal(h.voice.playCalls,0);assert.deepEqual(h.events.at(-1),['','']);});
test('session change and disposal releases only owned media and mute',async()=>{const h=voiceFixture();await h.player.play('one','one');h.setContext('two');h.player.dispose();
  assert.equal(h.audios[0].paused,true);assert.equal(h.voice.muted,false);assert.equal(h.voice.playCalls,0);h.player.stop();assert.equal(h.released.length,1);});
test('same DOM element with changed src never gets a play or pause call',async()=>{const h=voiceFixture();await h.player.play('one','one');h.voice.src='new.wav';h.player.stop();assert.equal(h.voice.playCalls,0);assert.equal(h.voice.pauseCalls,0);assert.equal(h.voice.muted,false);});
test('replaced current vocal element is untouched during cleanup',async()=>{const h=voiceFixture();await h.player.play('one','one');const current=new Audio('new.wav');h.setCurrent(current);h.player.stop();assert.equal(h.voice.muted,false);assert.equal(current.muted,false);assert.equal(current.playCalls,0);});

test('collection filter and ordering preserve source array',()=>{const items=[entry('b',{createdAt:'2026-10-27T02:00:00.000Z'}),entry('a',{voice:'a.wav',createdAt:'2026-10-27T01:00:00.000Z'})];
  assert.deepEqual(selectFavorites(items,' 林 ',true,false).map(e=>e.id),['a']);assert.deepEqual(selectFavorites(items,'',false,true).map(e=>e.id),['a','b']);assert.equal(items[0].id,'b');});
test('collection hook updates only after durable acknowledgement and locks double click',async()=>{const s=fixture();const d=deferred();let calls=0;s.add=()=>{calls++;return d.promise;};
  const h=new Hooks();const render=()=>h.render(()=>useFavorites(true));render();await tick();const c=render();
  const pending=c.toggle({id:'x'});void c.toggle({id:'x'});assert.equal(calls,1);assert.equal(render().entries.length,0);
  d.resolve([entry('x')]);await pending;assert.equal(render().entries.length,1);assert.match(render().notice,/已收藏/);h.unmount();});
test('failed writes retain existing favorites with visible error',async()=>{const s=fixture([entry('old')]);s.remove=async()=>{throw Error('quota');};const h=new Hooks();
  const render=()=>h.render(()=>useFavorites(true));render();await tick();await render().remove('old');const next=render();assert.equal(next.entries[0].id,'old');assert.equal(next.error,'quota');h.unmount();});
test('corrupt load is unavailable rather than a successful empty list',async()=>{const s=fixture();s.load=async()=>{throw Error('损坏数据');};const h=new Hooks();const render=()=>h.render(()=>useFavorites(true));
  render();await tick();assert.equal(render().available,false);assert.equal(render().error,'损坏数据');h.unmount();});
test('late load after closing and reopening cannot replace the new collection',async()=>{const s=fixture();const d=deferred();s.load=()=>d.promise;const h=new Hooks();
  h.render(()=>useFavorites(true));h.render(()=>useFavorites(false));s.load=async()=>[entry('new')];h.render(()=>useFavorites(true));await tick();d.resolve([entry('old')]);await tick();
  assert.equal(h.render(()=>useFavorites(true)).entries[0].id,'new');h.unmount();});
test('preview/session invalidation clears displayed entries and suppresses pending add result',async()=>{const s=fixture([entry('old')]);const d=deferred();s.add=()=>d.promise;
  const h=new Hooks(),render=()=>h.render(()=>useFavorites(true));render();await tick();const adding=render().toggle({id:'x'});
  s.preview=true;s.epoch++;s.load=async()=>{throw Error('作者预览隔离');};s.publish();await tick();d.resolve([entry('x')]);await adding;
  const result=render();assert.equal(result.available,false);assert.equal(result.entries.length,0);assert.match(result.error,/预览/);h.unmount();assert.equal(s.listeners.size,0);});

function panelFixture(controller){const s=fixture();const handlers=new Map(),windowHandlers=new Map(),audios=[],released=[];const vocal=new Audio('current.wav');vocal.paused=false;
  globalThis.Audio=class extends Audio {constructor(url){super(url);audios.push(this);}};
  globalThis.URL.revokeObjectURL=url=>released.push(url);
  globalThis.window={addEventListener:(name,fn)=>windowHandlers.set(name,fn),removeEventListener:name=>windowHandlers.delete(name)};
  globalThis.document={hidden:false,getElementById:()=>vocal,querySelectorAll:()=>[],addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
  const h=new Hooks();const render=(active=true)=>h.render(()=>Favorites({controller,active}));return{s,h,render,handlers,windowHandlers,audios,released,vocal};}
const controller=(entries=[])=>({entries,loading:false,busy:false,error:'',notice:'',available:true,refresh:async()=>{},remove:async()=>{}});
test('favorites list has accessible search, filter, sort, voice controls and no story jump',()=>{const c=controller([entry('a',{voice:'a.wav'})]);const h=panelFixture(c);const tree=h.render();
  assert.ok(find(tree,n=>n.type==='input'&&n.props.type==='search'));assert.ok(find(tree,n=>n.type==='select'));assert.ok(button(tree,'试听语音'));assert.ok(button(tree,'取消收藏'));
  assert.equal(h.s.jumps,0);assert.equal(find(tree,n=>n.props.onDoubleClick&&n.type==='article'),undefined);h.h.unmount();});
test('search keydown and keyup never propagate to player shortcuts',()=>{const h=panelFixture(controller());const tree=h.render();for(const name of ['onKeyDown','onKeyUp']){
    let stopped=false;tree.props[name]({key:'Enter',isComposing:true,stopPropagation(){stopped=true;}});assert.equal(stopped,true);}h.h.unmount();});
test('corrupt collection has error and retry without misleading empty message',()=>{const c={...controller(),available:false,error:'损坏数据'};const h=panelFixture(c);const tree=h.render();
  assert.ok(find(tree,n=>n.props.role==='alert'));assert.ok(button(tree,'重新读取'));assert.doesNotMatch(text(tree),/还没有收藏/);h.h.unmount();});
test('missing voice reason is retained alongside text snapshot',()=>{const h=panelFixture(controller([entry('a',{voiceUnavailable:'语音路径不可用'})]));const tree=h.render();
  assert.match(text(tree),/语音路径不可用/);assert.equal(button(tree,'试听语音'),undefined);h.h.unmount();});
test('collection delete passes only favorite identity, never scene execution',async()=>{let removed='';const c=controller([entry('a')]);c.remove=async id=>{removed=id;};const h=panelFixture(c);
  button(h.render(),'取消收藏').props.onClick();assert.equal(removed,'a');assert.equal(h.s.jumps,0);h.h.unmount();});
test('position-only entry explains current-version boundary',()=>{const h=panelFixture(controller([entry('a',{identity:'revision-position'})]));assert.match(text(h.render()),/仅按当前版本位置保存/);h.h.unmount();});
test('audition waits for verified bytes and revokes a cancelled verification result',async()=>{const h=panelFixture(controller([entry('a',{voice:'a.wav'})]));const d=deferred();h.s.verifyVoice=()=>d.promise;
  button(h.render(),'试听语音').props.onClick();assert.equal(h.audios.length,0);h.h.unmount();d.resolve('blob:late');await tick();assert.equal(h.audios.length,0);assert.deepEqual(h.released,['blob:late']);});
test('resource validation failure leaves current voice unchanged and reports error',async()=>{const h=panelFixture(controller([entry('a',{voice:'a.wav'})]));h.s.verifyVoice=async()=>{throw Error('资源已变化');};
  button(h.render(),'试听语音').props.onClick();await tick();assert.equal(h.audios.length,0);assert.equal(h.vocal.muted,false);assert.match(text(h.render()),/资源已变化/);h.h.unmount();});
for(const boundary of ['session','scene','scene-lock','blur','hidden','inactive','new-native-voice'])test(`${boundary} boundary stops audition and restores only mute`,async()=>{
  const h=panelFixture(controller([entry('a',{voice:'a.wav'})]));button(h.render(),'试听语音').props.onClick();await tick();h.render();assert.equal(h.vocal.muted,true);
  if(boundary==='session'){h.s.WebGAL.sceneManager.session++;h.s.publishVisual();}
  if(boundary==='scene'){h.s.WebGAL.sceneManager.sceneData.currentScene={};h.s.publishVisual();}
  if(boundary==='scene-lock'){h.s.WebGAL.sceneManager.lockSceneWrite=true;h.s.publishVisual();}
  if(boundary==='blur')h.windowHandlers.get('blur')();
  if(boundary==='hidden'){document.hidden=true;h.handlers.get('visibilitychange')();}
  if(boundary==='inactive')h.render(false);
  if(boundary==='new-native-voice')h.handlers.get('play')({target:{id:'currentVocal'}});
  assert.equal(h.audios[0].paused,true);assert.equal(h.vocal.muted,false);assert.equal(h.vocal.playCalls,0);assert.equal(h.vocal.pauseCalls,0);assert.deepEqual(h.released,['blob:a']);h.h.unmount();assert.equal(h.s.visualListeners.size,0);
});
test('native history exposes collection toggles while preserving original return action',async()=>{const s=fixture();s.WebGAL.backlogManager.getBacklog=()=>[{id:'a',currentStageState:{showText:'台词',showName:'林',vocal:''},saveScene:{currentSentenceId:2}}];
  globalThis.IntersectionObserver=class{observe(){}disconnect(){}};globalThis.document={querySelector:()=>null};const h=new Hooks();const render=()=>h.render(Backlog);render();await tick();
  const tree=render();assert.ok(button(tree,'收藏'));assert.ok(button(tree,'收藏列表'));assert.ok(find(tree,n=>n.type==='Return'));button(tree,'收藏').props.onClick({stopPropagation(){}});await tick();
  assert.ok(button(render(),'已收藏'));assert.equal(s.jumps,0);h.unmount();});
test('history collection and tab keyboard path blocks game shortcuts but permits non-input Escape close',()=>{const s=fixture();
  globalThis.IntersectionObserver=class{observe(){}disconnect(){}};globalThis.document={querySelector:()=>null};const h=new Hooks();const tree=h.render(Backlog);
  const root=find(tree,n=>n.type==='div'&&n.props.onKeyUp&&n.props.onKeyDown);
  for(const key of ['Enter',' ','Control'])for(const name of ['onKeyDown','onKeyUp']){let stopped=false;
    root.props[name]({key,nativeEvent:{},target:{closest:()=>null},stopPropagation(){stopped=true;},preventDefault(){}});assert.equal(stopped,true);}
  assert.equal(s.actions.length,0);
  for(const input of [true,false]){root.props.onKeyDown({key:'Escape',nativeEvent:{isComposing:input},target:{closest:()=>input?{}:null},stopPropagation(){},preventDefault(){}});}
  assert.deepEqual(s.actions,[{component:'showBacklog',visibility:false},{component:'showTextBox',visibility:true}]);h.unmount();});
test('clear-all waits for collection persistence before clearing native data',async()=>{const s=fixture();const d=deferred();s.clear=()=>d.promise;const h=new Hooks();const tree=h.render(System);
  const reset=find(tree,n=>n.type==='NormalButton'&&Array.isArray(n.props.textList)&&n.props.textList.includes('resetData.options.clearAll'));
  reset.props.functionList[2]();s.dialog.leftFunc();assert.equal(s.actions.length,0);d.resolve([]);await tick();assert.equal(s.actions[0].type,'resetAll');assert.equal(s.writes,4);h.unmount();});
test('failed collection clear stops native clear and reports failure',async()=>{const s=fixture();s.clear=async()=>{throw Error('损坏数据');};const h=new Hooks();const tree=h.render(System);
  const reset=find(tree,n=>n.type==='NormalButton'&&Array.isArray(n.props.textList)&&n.props.textList.includes('resetData.options.clearAll'));
  reset.props.functionList[2]();s.dialog.leftFunc();await tick();assert.equal(s.actions.length,0);assert.equal(s.writes,0);assert.deepEqual(s.errors,['损坏数据']);h.unmount();});
