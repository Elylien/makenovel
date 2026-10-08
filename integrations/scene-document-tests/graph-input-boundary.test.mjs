import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load=name=>import(pathToFileURL(path.join(process.env.GRAPH_INPUT_TEST_BUNDLE,`${name}.mjs`)));
const {default:Graph}=await load('graph');
const {default:Say}=await load('say');
const {default:Wheel}=await load('wheel');
const {SceneDocument}=await load('document');
const A='a'.repeat(64),B='b'.repeat(64);
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
// A hook/event boundary harness: app services and rendered UI widgets are stubbed;
// production TSX callbacks, hook lifetimes, parsing and shared document are exercised.
class Hooks {
  slots=[]; index=0; pending=[];
  ref(value){const i=this.index++; return this.slots[i]??(this.slots[i]={current:value});}
  state(value){const i=this.index++; if(!(i in this.slots))this.slots[i]=typeof value==='function'?value():value; return [this.slots[i],next=>{this.slots[i]=typeof next==='function'?next(this.slots[i]):next;}];}
  memo(fn,deps){const i=this.index++; if(!same(this.slots[i]?.deps,deps))this.slots[i]={deps,value:fn()}; return this.slots[i].value;}
  effect(fn,deps,layout){const i=this.index++; if(!same(this.slots[i]?.deps,deps)){const old=this.slots[i]; const next={deps,layout}; this.slots[i]=next; this.pending.push(()=>{old?.cleanup?.(); next.cleanup=fn();});}}
  render(fn,props){this.index=0;globalThis.__graphHooks=this;return fn(props);}
  commit(){for(const fn of this.pending.splice(0))fn();}
  unmount(){for(const layout of [true,false])for(const slot of this.slots)if(slot?.layout===layout)slot.cleanup?.();}
}
function find(node,predicate){if(node==null||typeof node!=='object')return; if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}return;}
  if(predicate(node))return node;
  if(typeof node.type==='function')return find(node.type(node.props),predicate);
  return find(node.props?.children,predicate);
}
const input=tree=>find(tree,x=>x.type==='textarea');
const sentence=tree=>find(tree,x=>x.type==='sentence-editor');
async function harness(){
  const transport={read:async()=>({text:'say:原文 -clear; @makenovel-node test-say',revision:A}),save:async text=>({text,revision:B})};
  const document=new SceneDocument(transport,{read:()=>null,write:()=>{},clear:()=>{}});await document.load();
  globalThis.__graphDocument=document;
  globalThis.document={activeElement:null};
  globalThis.HTMLInputElement=class {};
  globalThis.HTMLTextAreaElement=class {};
  const graph=new Hooks(); const path='games/甲/game/scene/start.txt';
  const render=()=>graph.render(Graph,{targetPath:path,targetName:'start.txt'});
  const tree=render(); const graphProps=sentence(tree).props;
  graph.commit();
  const say=new Hooks(); let sayTree=say.render(Say,graphProps); say.commit();
  return {document,transport,graph,say,tree,render,props:graphProps,getSay:()=>sayTree,rerenderSay:props=>{sayTree=say.render(Say,props??graphProps);say.commit();return sayTree;}};
}

test('save acknowledgement preserves the graphical editor key and active IME local state',async()=>{
  const h=await harness();h.document.edit('say:提交 -clear; @makenovel-node test-say');
  let resolve; h.transport.save=()=>new Promise(done=>{resolve=done;}); const pending=h.document.save();
  const before=h.render();const beforeSentence=sentence(before);h.rerenderSay(beforeSentence.props);
  before.props.onCompositionStartCapture();input(h.getSay()).props.onCompositionStart();
  input(h.getSay()).props.onChange({target:{value:'中文候选'}});h.rerenderSay(beforeSentence.props);
  resolve({text:'say:提交 -clear; @makenovel-node test-say',revision:B});await pending;
  const after=h.render();assert.equal(sentence(after).key,beforeSentence.key);
  assert.equal(input(h.rerenderSay(sentence(after).props)).props.value,'中文候选');
  after.props.onCompositionEndCapture();input(h.getSay()).props.onCompositionEnd();
  await Promise.resolve();await Promise.resolve();
  assert.equal(h.document.getSnapshot().text,'say:中文候选 -clear; @makenovel-node test-say');
  assert.equal(h.document.getSnapshot().isComposing,false);
  assert.equal(h.document.getSnapshot().status,'dirty');
  h.say.unmount();h.graph.unmount();
});

test('mode/file unmount flushes an interrupted composition once and unlocks its old document',async()=>{
  const h=await harness(); h.tree.props.onCompositionStartCapture();input(h.getSay()).props.onCompositionStart();
  input(h.getSay()).props.onChange({target:{value:'未结束输入'}});h.rerenderSay();
  h.graph.unmount();h.say.unmount();await Promise.resolve();
  assert.equal(h.document.getSnapshot().text,'say:未结束输入 -clear; @makenovel-node test-say');
  assert.equal(h.document.getSnapshot().isComposing,false);
  h.document.undo();assert.equal(h.document.getSnapshot().text,'say:原文 -clear; @makenovel-node test-say');
  assert.equal(h.document.getSnapshot().canUndo,false);
});

test('queued composition end cannot replay an old buffer after unmount and undo',async()=>{
  const h=await harness(); input(h.getSay()).props.onCompositionStart();
  input(h.getSay()).props.onChange({target:{value:'一次提交'}});h.rerenderSay();
  input(h.getSay()).props.onCompositionEnd();h.say.unmount();
  h.document.undo();await Promise.resolve();
  assert.equal(h.document.getSnapshot().text,'say:原文 -clear; @makenovel-node test-say');
  h.graph.unmount();
});

test('a pending graphical input from an old history cannot overwrite the undo result',async()=>{
  const h=await harness();h.document.edit('say:已提交 -clear; @makenovel-node test-say');
  const current=sentence(h.render());h.rerenderSay(current.props);
  input(h.getSay()).props.onChange({target:{value:'旧控件尚未提交'}});h.rerenderSay(current.props);
  h.document.undo();h.say.unmount();
  assert.equal(h.document.getSnapshot().text,'say:原文 -clear; @makenovel-node test-say');
  assert.equal(h.document.getSnapshot().canUndo,false);
  h.graph.unmount();
});

test('graph cleanup blurs a live controlled input before clearing its composition guard',async()=>{
  const h=await harness();const active=new globalThis.HTMLInputElement();let blurred=0;
  active.blur=()=>{blurred++;assert.equal(h.document.getSnapshot().isComposing,true);};
  globalThis.document.activeElement=active;
  // Mount a separate graph root with its DOM ref installed before layout effects.
  const graph=new Hooks();const tree=graph.render(Graph,{targetPath:'games/甲/game/scene/start.txt',targetName:'start.txt'});
  tree.props.ref.current={contains:element=>element===active};graph.commit();
  tree.props.onCompositionStartCapture();graph.unmount();assert.equal(blurred,1);
  assert.equal(h.document.getSnapshot().isComposing,true);await Promise.resolve();
  assert.equal(h.document.getSnapshot().isComposing,false);h.say.unmount();h.graph.unmount();
});

test('wheel selection commits within the user event and cannot fire again after unmount',async()=>{
  const hooks=new Hooks();const calls=[];const listeners=new Map();
  const button={contains:()=>true,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  globalThis.document={activeElement:button};
  const tree=hooks.render(Wheel,{options:new Map([['','默认'],['left','左']]),value:'',onValueChange:value=>calls.push(value)});
  tree.props.ref.current=button;hooks.commit();
  listeners.get('wheel')({deltaY:1,preventDefault(){},stopPropagation(){}});
  assert.deepEqual(calls,['left']);hooks.unmount();assert.equal(listeners.size,0);
  await new Promise(resolve=>setTimeout(resolve,550));assert.deepEqual(calls,['left']);
});

test('different project and history navigation each change the graphical projection key',async()=>{
  const h=await harness();const original=sentence(h.tree).key;
  const other=h.graph.render(Graph,{targetPath:'games/乙/game/scene/start.txt',targetName:'start.txt'});
  assert.notEqual(sentence(other).key,original);
  h.document.edit('say:another -clear; @makenovel-node test-say');h.document.undo();
  assert.notEqual(sentence(h.render()).key,original);
  h.say.unmount();h.graph.unmount();
});

test('director entry captures the focused native field only after its blur commit',async()=>{
  const h=await harness();const active=new globalThis.HTMLTextAreaElement();
  active.blur=()=>{h.props.onSubmit('say:打开前落定 -clear;');};globalThis.document.activeElement=active;
  find(h.tree,node=>node.type==='button'&&node.props.children==='舞台与声音').props.onClick();
  await Promise.resolve();await Promise.resolve();
  const panel=find(h.render(),node=>node.type==='director-panel');
  assert.match(panel.props.initialSession.expectedSource,/打开前落定/);
  assert.equal(h.document.getSnapshot().canUndo,true);
  h.say.unmount();h.graph.unmount();
});

test('active main-field composition prevents opening a director transaction',async()=>{
  const h=await harness();h.document.setComposing(true);
  find(h.tree,node=>node.type==='button'&&node.props.children==='舞台与声音').props.onClick();
  await Promise.resolve();await Promise.resolve();
  assert.equal(find(h.render(),node=>node.type==='director-panel'),undefined);
  assert.match(h.document.getSnapshot().message,/完成中文输入/);
  h.document.setComposing(false);h.say.unmount();h.graph.unmount();
});

test('director modal composition and save shortcuts do not reach the main graph',async()=>{
  const h=await harness();find(h.tree,node=>node.type==='button'&&node.props.children==='舞台与声音').props.onClick();
  await Promise.resolve();await Promise.resolve();const tree=h.render();
  tree.props.onCompositionStartCapture();assert.equal(h.document.getSnapshot().isComposing,false);
  let prevented=0;tree.props.onKeyDownCapture({ctrlKey:true,key:'s',preventDefault(){prevented++;}});
  assert.equal(prevented,0); // The modal owns this event and its own local draft.
  h.say.unmount();h.graph.unmount();
});

test('an open director session is not reused by another file path',async()=>{
  const h=await harness();find(h.tree,node=>node.type==='button'&&node.props.children==='舞台与声音').props.onClick();
  await Promise.resolve();await Promise.resolve();assert.ok(find(h.render(),node=>node.type==='director-panel'));
  const other=h.graph.render(Graph,{targetPath:'games/乙/game/scene/start.txt',targetName:'start.txt'});
  assert.equal(find(other,node=>node.type==='director-panel'),undefined);
  h.say.unmount();h.graph.unmount();
});

test('registered-node batch resync remounts controls and rejects a real Say stale cleanup buffer',async()=>{
  const h=await harness();const oldKey=sentence(h.tree).key;
  input(h.getSay()).props.onChange({target:{value:'旧控件未提交缓冲'}});h.rerenderSay();
  const applied='say:导演已应用 -clear; @makenovel-node test-say';
  h.document.edit(applied,{resyncControls:true});
  const nextProps=sentence(h.render());assert.notEqual(nextProps.key,oldKey);
  h.say.unmount();await Promise.resolve();assert.equal(h.document.getSnapshot().text,applied);
  const fresh=new Hooks();const tree=fresh.render(Say,nextProps.props);fresh.commit();
  assert.equal(input(tree).props.value,'导演已应用');fresh.unmount();
  h.document.undo();assert.equal(h.document.getSnapshot().text,'say:原文 -clear; @makenovel-node test-say');
  assert.equal(h.document.getSnapshot().canUndo,false);h.graph.unmount();
});
