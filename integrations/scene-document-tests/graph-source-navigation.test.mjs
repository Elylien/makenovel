import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load=name=>import(pathToFileURL(path.join(process.env.GRAPH_INPUT_TEST_BUNDLE,`${name}.mjs`)));
const {default:Graph}=await load('graph');
const {SceneDocument}=await load('document');
const {createDirectorSourceNavigation}=await load('directorNavigation');
const A='a'.repeat(64),B='b'.repeat(64);
const source=['\ufeff; source navigation fixture','; @makenovel-node scene-bg','changeBg:day.svg -next;',...Array.from({length:140},(_,i)=>`say:过渡对白 ${i};`),'say:目标对白;'].join('\r\n');
const originLine=143;
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
// Real GraphicalEditor callbacks, native parsing, source resolver and shared
// SceneDocument. Rendering/virtualizer/DOM focus are instrumented boundaries;
// browser mounting and visible keyboard focus still require actual GUI evidence.
class Hooks {
  slots=[];index=0;pending=[];
  ref(value){const i=this.index++;return this.slots[i]??(this.slots[i]={current:value});}
  state(value){const i=this.index++;if(!(i in this.slots))this.slots[i]=typeof value==='function'?value():value;return [this.slots[i],next=>{this.slots[i]=typeof next==='function'?next(this.slots[i]):next;}];}
  memo(fn,deps){const i=this.index++;if(!same(this.slots[i]?.deps,deps))this.slots[i]={deps,value:fn()};return this.slots[i].value;}
  effect(fn,deps,layout){const i=this.index++;if(!same(this.slots[i]?.deps,deps)){const old=this.slots[i],next={deps,layout};this.slots[i]=next;this.pending.push(()=>{old?.cleanup?.();next.cleanup=fn();});}}
  render(fn,props){this.index=0;globalThis.__graphHooks=this;return fn(props);}
  commit(){for(const fn of this.pending.splice(0))fn();}
  unmount(){for(const slot of this.slots)slot?.cleanup?.();}
}
function collect(node,predicate,found=[]){
  if(!node||typeof node!=='object')return found;
  if(Array.isArray(node)){for(const child of node)collect(child,predicate,found);return found;}
  if(predicate(node))found.push(node);
  if(typeof node.type==='function')collect(node.type(node.props),predicate,found);
  else collect(node.props?.children,predicate,found);
  return found;
}
const button=(tree,label)=>collect(tree,node=>node.type==='button'&&node.props.children===label)[0];
const panel=tree=>collect(tree,node=>node.type==='director-panel')[0];
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
async function harness(){
  const calls={scroll:[],focus:[],preview:[],record:[],event:[],edit:0,save:0};
  const transport={read:async()=>({text:source,revision:A}),save:async text=>{calls.save++;return {text,revision:B};}};
  const document=new SceneDocument(transport,{read:()=>null,write:()=>{},clear:()=>{}});await document.load();
  const realEdit=document.edit.bind(document);document.edit=(...args)=>{calls.edit++;return realEdit(...args);};
  globalThis.__graphDocument=document;
  globalThis.document={activeElement:null};globalThis.HTMLInputElement=class {};globalThis.HTMLTextAreaElement=class {};
  globalThis.__graphPreview=(...args)=>calls.preview.push(args);globalThis.__graphRecordLine=(...args)=>calls.record.push(args);globalThis.__graphEvent=(...args)=>calls.event.push(args);
  let visible=[142],wanted=142,count=0;const mounted=new Map();
  const virtualizer={getVirtualItems:()=>visible.filter(index=>index<count).map(index=>({index,start:index*100,size:100})),getTotalSize:()=>count*100,measureElement:()=>{},scrollToIndex:(index,options)=>{calls.scroll.push({index,options});wanted=index;}};
  globalThis.__graphVirtualizer=options=>{count=options.count;return virtualizer;};
  const frames=new Map();let nextFrame=0;
  globalThis.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const scroller={querySelector:selector=>mounted.get(Number(selector.match(/"(\d+)"/)[1]))};
  const hooks=new Hooks();let currentPath='games/test/game/scene/start.txt';let tree;
  function render(nextPath=currentPath){
    currentPath=nextPath;tree=hooks.render(Graph,{targetPath:currentPath,targetName:'start.txt'});
    tree.props.ref.current={contains:()=>false};
    const scrollerNode=collect(tree,node=>node.type==='div'&&typeof node.props.ref==='function'&&Array.isArray(node.props.children)&&node.props.children[0]?.props?.style?.height===`${count*100}px`)[0];
    scrollerNode.props.ref(scroller);mounted.clear();
    for(const row of collect(tree,node=>node.props?.['data-source-start-line']!==undefined)){
      const line=row.props['data-source-start-line'];mounted.set(line,{focus:options=>calls.focus.push({line,options})});
    }
    hooks.commit();return tree;
  }
  function frame(){const entries=[...frames.values()];frames.clear();for(const fn of entries)fn();}
  function mountDestination(){visible=[wanted];return render();}
  render();
  async function open(){button(tree,'舞台与声音').props.onClick();await tick();render();const p=panel(tree);assert.ok(p);const s=p.props.initialSession;return {panel:p,navigation:createDirectorSourceNavigation(s,s.inheritance.background)};}
  async function locate(){const opened=await open();assert.equal(opened.panel.props.onLocate(opened.navigation),true);render();frame();assert.equal(calls.focus.length,0,'destination was not mounted yet');mountDestination();frame();return opened;}
  const cleanup=()=>{hooks.unmount();delete globalThis.__graphVirtualizer;delete globalThis.__graphPreview;delete globalThis.__graphRecordLine;delete globalThis.__graphEvent;};
  return {document,transport,calls,hooks,render,frame,mountDestination,open,locate,cleanup,get tree(){return tree;},get frameCount(){return frames.size;}};
}
function assertReadOnly(h){assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().status,'saved');assert.equal(h.document.getSnapshot().canUndo,false);assert.equal(h.calls.edit,0);assert.equal(h.calls.save,0);assert.deepEqual(h.calls.preview,[]);assert.deepEqual(h.calls.record,[]);assert.deepEqual(h.calls.event,[]);}

test('offscreen source maps native line to virtual index and focuses mounted row without executing or editing',async()=>{
  const h=await harness();await h.locate();
  assert.equal(panel(h.tree),undefined);assert.equal(h.calls.scroll[0].index,1,'legacy identity marker must not count as a visible row');
  assert.ok(h.calls.scroll.every(call=>call.options.align==='center'&&call.options.behavior==='auto'));
  assert.deepEqual(h.calls.focus,[{line:2,options:{preventScroll:true}}]);
  const row=collect(h.tree,node=>node.props?.['data-source-start-line']===2)[0];assert.equal(row.props.tabIndex,-1);assert.match(row.props['aria-label'],/已定位来源/);
  assert.ok(button(h.tree,'返回原对白'));assertReadOnly(h);h.cleanup();
});

test('return action locates the original unregistered dialogue without opening director or changing identity',async()=>{
  const h=await harness();await h.locate();button(h.tree,'返回原对白').props.onClick();h.render();h.mountDestination();h.frame();
  assert.equal(h.calls.focus.at(-1).line,originLine);assert.equal(panel(h.tree),undefined);assert.equal(button(h.tree,'返回原对白'),undefined);
  assertReadOnly(h);h.cleanup();
});

test('folded source row is expanded for locating without source changes',async()=>{
  const h=await harness();await h.locate();
  const toggle=collect(h.tree,node=>node.type==='div'&&typeof node.props.onClick==='function'&&node.props.children?.type==='icon')[0];
  toggle.props.onClick();h.render();assert.equal(collect(h.tree,node=>node.type==='sentence-editor').length,0);
  button(h.tree,'返回原对白').props.onClick();h.render();h.mountDestination();h.frame();
  const opened=await h.open();assert.equal(opened.panel.props.onLocate(opened.navigation),true);h.render();h.mountDestination();h.frame();
  assert.equal(collect(h.tree,node=>node.type==='sentence-editor').length,1);assertReadOnly(h);h.cleanup();
});

for(const [label,mutate] of [
  ['source edit',async h=>h.document.edit(source.replace('过渡对白 0','已修改'))],
  ['edit then undo ABA',async h=>{h.document.edit(source.replace('过渡对白 0','已修改'));h.document.undo();}],
  ['explicit reload of identical bytes',async h=>h.document.reloadDisk()],
  ['scene path switch',async h=>h.render('games/test/game/scene/other.txt')],
  ['scene path A-B-A switch',async h=>{h.render('games/test/game/scene/other.txt');h.render('games/test/game/scene/start.txt');}],
]){
  test(`${label} invalidates return highlight and rejects its stale callback`,async()=>{
    const h=await harness();await h.locate();const oldReturn=button(h.tree,'返回原对白').props.onClick;const scrollCount=h.calls.scroll.length;
    await mutate(h);h.render();assert.equal(button(h.tree,'返回原对白'),undefined);oldReturn();h.render();h.frame();
    assert.equal(h.calls.scroll.length,scrollCount);assert.match(h.document.getSnapshot().message,/过期|改变|失效/);h.cleanup();
  });
}

test('pending focus is cancelled if source changes before the virtual row mounts',async()=>{
  const h=await harness();const opened=await h.open();opened.panel.props.onLocate(opened.navigation);h.render();
  h.document.edit(source.replace('过渡对白 0','已修改'));h.mountDestination();h.frame();assert.deepEqual(h.calls.focus,[]);assert.equal(h.frameCount,0);h.cleanup();
});

test('unmount cancels queued focus and refuses old source and return callbacks',async()=>{
  const h=await harness();const opened=await h.open();opened.panel.props.onLocate(opened.navigation);h.render();const oldReturn=button(h.tree,'返回原对白').props.onClick;
  h.cleanup();h.frame();assert.deepEqual(h.calls.focus,[]);assert.equal(opened.panel.props.onLocate(opened.navigation),false);oldReturn();assert.match(h.document.getSnapshot().message,/过期/);
});

test('old panel callback is rejected after path A-B-A even with identical source and history',async()=>{
  const h=await harness();const opened=await h.open();h.render('games/test/game/scene/other.txt');h.render('games/test/game/scene/start.txt');
  assert.equal(opened.panel.props.onLocate(opened.navigation),false);assert.deepEqual(h.calls.scroll,[]);assertReadOnly(h);h.cleanup();
});

test('focus wait is bounded if a destination cannot mount',async()=>{
  const h=await harness();const opened=await h.open();opened.panel.props.onLocate(opened.navigation);h.render();
  for(let i=0;i<20;i++)h.frame();assert.equal(h.frameCount,0);assert.deepEqual(h.calls.focus,[]);assertReadOnly(h);h.cleanup();
});

test('save acknowledgement changes revision and expires a return anchor from a dirty shared draft',async()=>{
  const h=await harness();h.document.edit(source.replace('过渡对白 0','共享草稿'));h.render();await h.locate();
  const oldReturn=button(h.tree,'返回原对白').props.onClick;const scrollCount=h.calls.scroll.length;await h.document.save();h.render();oldReturn();h.render();
  assert.equal(button(h.tree,'返回原对白'),undefined);assert.equal(h.calls.scroll.length,scrollCount);assert.match(h.document.getSnapshot().message,/过期/);h.cleanup();
});

test('DocumentBar diagnostic locate keeps its existing virtual scroll behavior',async()=>{
  const h=await harness();collect(h.tree,node=>node.type==='document-bar')[0].props.onLocate(3,1);
  assert.deepEqual(h.calls.scroll,[{index:1,options:{align:'center'}}]);assert.equal(button(h.tree,'返回原对白'),undefined);assertReadOnly(h);h.cleanup();
});

test('a save revision acknowledgement rejects an old source callback even when bytes and history are equal',async()=>{
  const h=await harness();h.document.edit(source.replace('过渡对白 0','待保存草稿'));h.render();const opened=await h.open();
  const before=h.document.getSnapshot();await h.document.save();const after=h.document.getSnapshot();
  assert.equal(after.text,before.text);assert.equal(after.historyVersion,before.historyVersion);assert.notEqual(after.revision,before.revision);
  assert.equal(opened.panel.props.onLocate(opened.navigation),false);assert.deepEqual(h.calls.scroll,[]);h.cleanup();
});

test('a replaced document with the same path and exact bytes cannot accept old source callbacks',async()=>{
  const h=await harness();const opened=await h.open();
  const replacement=new SceneDocument(h.transport,{read:()=>null,write:()=>{},clear:()=>{}});await replacement.load();globalThis.__graphDocument=replacement;h.render();
  assert.equal(opened.panel.props.onLocate(opened.navigation),false);assert.deepEqual(h.calls.scroll,[]);assertReadOnly(h);h.cleanup();
});

test('main-document composition prevents both locating and returning without losing the existing anchor',async()=>{
  const h=await harness();const opened=await h.open();h.document.setComposing(true);
  assert.equal(opened.panel.props.onLocate(opened.navigation),false);assert.deepEqual(h.calls.scroll,[]);h.document.setComposing(false);
  assert.equal(opened.panel.props.onLocate(opened.navigation),true);h.render();h.mountDestination();h.frame();
  h.document.setComposing(true);h.render();assert.equal(button(h.tree,'返回原对白').props.disabled,true);
  h.document.setComposing(false);h.render();assert.equal(button(h.tree,'返回原对白').props.disabled,false);assertReadOnly(h);h.cleanup();
});

for (const guard of ['composition', 'saving', 'conflict']) {
  test(`queued focus cannot blur a new ${guard} state before React rerenders`,async()=>{
    const h=await harness();
    if(guard!=='composition'){h.document.edit(source.replace('过渡对白 0','待保存草稿'));h.render();}
    const opened=await h.open();opened.panel.props.onLocate(opened.navigation);h.render();h.mountDestination();
    const captured=h.document.getSnapshot();let finishSave,pending;
    if(guard==='composition')h.document.setComposing(true);
    if(guard==='saving'){
      h.transport.save=text=>new Promise(resolve=>{finishSave=()=>resolve({text,revision:B});});pending=h.document.save();
    }
    if(guard==='conflict'){
      h.transport.read=async()=>({text:source.replace('过渡对白 0','磁盘修改'),revision:B});await h.document.load();
    }
    const current=h.document.getSnapshot();
    assert.equal(current.text,captured.text);assert.equal(current.historyVersion,captured.historyVersion);assert.equal(current.revision,captured.revision);
    if(guard==='composition')assert.equal(current.isComposing,true);else assert.equal(current.status,guard);
    h.frame();assert.deepEqual(h.calls.focus,[]);assert.equal(h.frameCount,0);
    if(finishSave){finishSave();await pending;}h.cleanup();
  });
}
