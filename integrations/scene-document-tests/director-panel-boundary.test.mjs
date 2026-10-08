import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = name => import(pathToFileURL(path.join(process.env.GRAPH_INPUT_TEST_BUNDLE, `${name}.mjs`)));
const unloadListeners = new Map();
globalThis.window = { addEventListener: (name, fn) => unloadListeners.set(name, fn) };
const { DirectorPanel } = await load('director');
const { default: Say } = await load('say');
const { default: Bgm } = await load('bgm');
const { default: Figure } = await load('figure');
const { default: FigureDiff } = await load('figureDiff');
const { default: Bg } = await load('bg');
const { createDirectorSession } = await load('directorSession');
const { SceneDocument } = await load('document');
const registry = await load('previewRegistry');
const A = 'a'.repeat(64), B = 'b'.repeat(64);
const source = 'changeBg:day.svg -duration=900 -next; @makenovel-node bg\r\n'
  + 'changeFigure:lin.svg -left -next; @makenovel-node left\r\n'
  + 'changeFigure:yu.svg -right -next; @makenovel-node right\r\n'
  + 'bgm:music.wav -volume=28; @makenovel-node music\r\n'
  + 'wait:900 -nobreak; @makenovel-node wait\r\n'
  + 'say:第一句 -speaker=林 -vocal=voice.wav; @makenovel-node line';
const same = (a,b) => a && b && a.length === b.length && a.every((value,index) => value === b[index]);

// Real panel event callbacks + real native source transactions. React rendering,
// Fluent widgets and sentence form rendering are substituted, not browser QA.
class Hooks {
  slots=[]; index=0; pending=[];
  ref(value) { const index=this.index++; return this.slots[index]??(this.slots[index]={current:value}); }
  state(value) { const index=this.index++; if(!(index in this.slots)) this.slots[index]=typeof value==='function'?value():value; return [this.slots[index],next=>{this.slots[index]=typeof next==='function'?next(this.slots[index]):next;}]; }
  memo(fn,deps) { const index=this.index++; if(!same(this.slots[index]?.deps,deps)) this.slots[index]={deps,value:fn()}; return this.slots[index].value; }
  effect(fn,deps,layout) { const index=this.index++; if(!same(this.slots[index]?.deps,deps)) { const old=this.slots[index], next={deps,layout}; this.slots[index]=next; this.pending.push(()=>{old?.cleanup?.();next.cleanup=fn();}); } }
  render(fn,props) { this.index=0;globalThis.__graphHooks=this;return fn(props); }
  commit() { for(const fn of this.pending.splice(0)) fn(); }
  unmount() { for(const slot of this.slots) slot?.cleanup?.(); }
}
function collect(node, predicate, found=[]) {
  if(!node || typeof node !== 'object') return found;
  if(Array.isArray(node)) { for(const child of node) collect(child,predicate,found); return found; }
  if(predicate(node)) found.push(node);
  collect(node.props?.children,predicate,found);
  return found;
}
const button = (tree,label) => collect(tree,node=>node.type==='button'&&node.props.children===label)[0];
const surface = tree => collect(tree,node=>node.type==='dialog-surface')[0];
const form = (tree,command) => collect(tree,node=>node.type==='director-editor'&&node.props.sentence.commandRaw===command)[0];
const alerts = tree => collect(tree,node=>node.props?.role==='alert').map(node=>node.props.children).join('\n');
const flush = async () => { await Promise.resolve();await Promise.resolve();await Promise.resolve(); };

async function harness() {
  let writes=0, closed=0, holds=0;
  const closeHolds=[];
  const transport={read:async()=>({text:source,revision:A}),save:async text=>{writes++;return {text,revision:B};}};
  const document=new SceneDocument(transport,{read:()=>null,write:()=>{},clear:()=>{}});
  await document.load();
  globalThis.document={activeElement:null};
  globalThis.HTMLInputElement=class {};
  globalThis.HTMLTextAreaElement=class {};
  globalThis.__directorHold=()=>{holds++;let released=false;return ()=>{if(!released){released=true;holds--;}};};
  const props={initialSession:createDirectorSession(source,5,document.getSnapshot().historyVersion),document,targetPath:'games/test/game/scene/start.txt',onClose:()=>{closeHolds.push(holds);closed++;}};
  const hooks=new Hooks();
  const render=()=>hooks.render(DirectorPanel,props);
  let tree=render(); hooks.commit();
  return {document,transport,hooks,props,render,tree,closeHolds,get writes(){return writes;},get closed(){return closed;},get holds(){return holds;}};
}

test('open and cancel leave the scene byte-identical and release this panel preview hold',async()=>{
  const h=await harness();assert.equal(h.holds,1);assert.equal(h.document.canPreview(),true);
  form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=40;');
  assert.equal(h.document.getSnapshot().text,source);
  button(h.render(),'取消').props.onClick();h.hooks.unmount();
  assert.equal(h.holds,0);assert.equal(h.document.getSnapshot().canUndo,false);assert.equal(h.closed,1);
});

test('cancel and successful apply release preview before the parent close render, with idempotent cleanup',async()=>{
  for(const action of ['取消','应用到草稿']) {
    const h=await harness();assert.equal(h.holds,1);
    if(action==='应用到草稿') form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=35;');
    button(h.render(),action).props.onClick();await flush();
    assert.deepEqual(h.closeHolds,[0]);assert.equal(h.holds,0);
    h.hooks.unmount();h.hooks.unmount();assert.equal(h.holds,0);
  }
});

test('two native row edits apply as one shared undo transaction with comments and CRLF preserved',async()=>{
  const h=await harness();
  const oldHistory=h.document.getSnapshot().historyVersion;
  form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=41;');
  form(h.render(),'say').props.onSubmit('say:新对白 -speaker=林 -vocal=other.wav;');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);assert.equal(h.writes,0);
  assert.equal(h.document.getSnapshot().historyVersion,oldHistory+1);
  assert.equal(h.document.getSnapshot().text,source.replace('volume=28','volume=41').replace('第一句','新对白').replace('voice.wav','other.wav'));
  assert.equal(h.document.canPreview(),false);h.document.undo();
  assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().canUndo,false);h.hooks.unmount();
});

test('apply flushes a focused control before reading the final transaction',async()=>{
  const h=await harness();const active=new HTMLInputElement();let blurred=0;
  active.blur=()=>{blurred++;form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=62;');};
  globalThis.document.activeElement=active;
  button(h.tree,'应用到草稿').props.onClick();await flush();
  assert.equal(blurred,1);assert.match(h.document.getSnapshot().text,/volume=62/);h.hooks.unmount();
});

test('the real Say debounce and blur commit the final local text before applying',async()=>{
  const h=await harness();const sayHooks=new Hooks();const props=form(h.tree,'say').props;
  let tree=sayHooks.render(Say,props);sayHooks.commit();
  collect(tree,node=>node.type==='textarea')[0].props.onChange({target:{value:'导演中文缓冲'}});
  tree=sayHooks.render(Say,props);sayHooks.commit();
  assert.equal(h.document.getSnapshot().text,source);
  const active=new HTMLTextAreaElement();active.blur=()=>collect(tree,node=>node.type==='textarea')[0].props.onBlur();
  globalThis.document.activeElement=active;button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.match(h.document.getSnapshot().text,/导演中文缓冲/);assert.equal(h.closed,1);
  sayHooks.unmount();h.hooks.unmount();await flush();
  h.document.undo();assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().canUndo,false);
});

test('ordinary external draft edit rejects apply and retains panel values',async()=>{
  const h=await harness();form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=66;');
  h.document.edit(source.replace('第一句','外部修改'));
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,0);assert.match(h.document.getSnapshot().text,/外部修改/);
  assert.equal(form(h.render(),'bgm').props.sentence.args.find(arg=>arg.key==='volume').value,66);
  assert.match(alerts(h.render()),/主文档已改变/);h.hooks.unmount();
});

test('undo back to equal text still rejects an older panel history',async()=>{
  const h=await harness();form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=66;');
  h.document.edit(source.replace('第一句','外部修改'));h.document.undo();
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,0);assert.equal(h.document.getSnapshot().text,source);assert.match(alerts(h.render()),/主文档已改变/);h.hooks.unmount();
});

test('invalid form input blocks the entire apply until that row is corrected',async()=>{
  const h=await harness();form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=wrong;');
  form(h.render(),'say').props.onSubmit('say:有效对白 -speaker=林 -vocal=voice.wav;');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.document.getSnapshot().text,source);assert.equal(h.closed,0);assert.match(alerts(h.render()),/无法应用的输入/);
  form(h.render(),'bgm').props.onSubmit('bgm:music.wav -volume=45;');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);assert.match(h.document.getSnapshot().text,/有效对白/);assert.match(h.document.getSnapshot().text,/volume=45/);h.hooks.unmount();
});

test('composition prevents apply, escape dismissal and shortcut until the final input is committed',async()=>{
  const h=await harness();surface(h.tree).props.onCompositionStartCapture();
  button(h.tree,'应用到草稿').props.onClick();h.tree.props.onOpenChange({}, {open:false});
  assert.equal(h.closed,0);assert.match(alerts(h.render()),/中文候选/);
  let stopped=0,prevented=0;
  surface(h.render()).props.onKeyDownCapture({ctrlKey:true,key:'s',nativeEvent:{isComposing:true},preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(stopped,1);assert.equal(prevented,1);assert.equal(h.writes,0);
  surface(h.render()).props.onCompositionEndCapture();
  queueMicrotask(()=>form(h.tree,'say').props.onSubmit('say:中文落定 -speaker=林 -vocal=voice.wav;'));
  await flush();button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.match(h.document.getSnapshot().text,/中文落定/);h.hooks.unmount();
});

test('Ctrl+S applies this draft and never saves the older shared document',async()=>{
  const h=await harness();form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=18;');
  let prevented=0,stopped=0;
  surface(h.render()).props.onKeyDownCapture({ctrlKey:true,key:'s',nativeEvent:{},preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  await flush();assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(h.writes,0);assert.match(h.document.getSnapshot().text,/volume=18/);h.hooks.unmount();
});

test('cancel beats a queued apply and ignores late child cleanup callbacks',async()=>{
  const h=await harness();const callback=form(h.tree,'bgm').props.onSubmit;
  callback('bgm:music.wav -volume=70;');button(h.render(),'应用到草稿').props.onClick();
  button(h.render(),'取消').props.onClick();h.hooks.unmount();callback('bgm:music.wav -volume=90;');await flush();
  assert.equal(h.closed,1);assert.equal(h.document.getSnapshot().text,source);assert.equal(h.holds,0);
});

test('every mounted native control disables the global effect editor and wait is read-only',async()=>{
  const h=await harness();const forms=collect(h.tree,node=>node.type==='director-editor');
  assert.equal(forms.length,5);assert.ok(forms.every(node=>node.props.disableEffectEditor===true));
  assert.equal(form(h.tree,'wait'),undefined);h.hooks.unmount();
});

test('fresh native Bgm and Figure projections initialize from an applied registered-node batch',async()=>{
  const h=await harness();form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=71;');
  const figureForm=collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.content==='lin.svg')[0];
  figureForm.props.onSubmit('changeFigure:lin-smile.svg -left -next;');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  const current=h.document.getSnapshot(), reopened=createDirectorSession(current.text,5,current.historyVersion);
  const bgmHooks=new Hooks(),figureHooks=new Hooks();
  const props=node=>({sentence:node.sentence,index:node.startLine,targetPath:h.props.targetPath,onSubmit:()=>{}});
  const bgmTree=bgmHooks.render(Bgm,props(reopened.nodes.find(node=>node.command==='bgm')));bgmHooks.commit();
  const figureTree=figureHooks.render(Figure,props(reopened.nodes.find(node=>node.command==='changeFigure')));figureHooks.commit();
  assert.equal(collect(bgmTree,node=>node.type==='input'&&node.props.placeholder==='百分比。 0-100 有效')[0].props.value,'71');
  assert.equal(collect(figureTree,node=>node.type==='choose-file')[0].props.selectedFilePath,'lin-smile.svg');
  bgmHooks.unmount();figureHooks.unmount();h.hooks.unmount();
});

test('real figure and background controls cannot open shared effect or advanced drawers in a local draft',async()=>{
  const h=await harness();let expanded=0,effects=0;globalThis.__figureExpand=()=>expanded++;globalThis.__figureEffect=()=>effects++;
  for(const [Component,command] of [[Figure,'changeFigure'],[Bg,'changeBg']]) {
    const hooks=new Hooks(),props=form(h.tree,command).props;let tree=hooks.render(Component,props);hooks.commit();
    const effect=button(tree,'打开效果编辑器');assert.equal(effect.props.disabled,true);effect.props.onClick();
    if(command==='changeFigure') {
      const more=button(tree,'编辑更多选项');assert.equal(more.props.disabled,true);more.props.onClick();
      tree=hooks.render(Component,props);assert.equal(collect(tree,node=>node.type==='shared-panel').length,0);
    }
    hooks.unmount();
  }
  assert.equal(expanded,0);assert.equal(effects,0);
  const hooks=new Hooks(),props={...form(h.tree,'changeFigure').props,disableEffectEditor:false};
  let tree=hooks.render(Figure,props);hooks.commit();button(tree,'编辑更多选项').props.onClick();
  tree=hooks.render(Figure,props);assert.equal(collect(tree,node=>node.type==='shared-panel').length,1);assert.equal(expanded,1);
  button(tree,'打开效果编辑器').props.onClick();assert.equal(effects,1);hooks.unmount();h.hooks.unmount();
});

test('native stage image pickers include SVG while preserving audio, video and model distinctions',async()=>{
  const h=await harness();
  for(const [Component,command] of [[Figure,'changeFigure'],[FigureDiff,'changeFigure'],[Bg,'changeBg']]) {
    const hooks=new Hooks();const tree=hooks.render(Component,form(h.tree,command).props);hooks.commit();
    const allowed=collect(tree,node=>node.type==='choose-file')[0].props.extNames;
    assert.ok(allowed.includes('.svg'));assert.ok(allowed.includes('.png'));assert.equal(allowed.includes('.wav'),false);
    assert.equal(allowed.includes('.mp4'),Component===Bg);
    assert.equal(allowed.includes('.json'),Component===Figure);hooks.unmount();
  }
  const hooks=new Hooks();const tree=hooks.render(Bgm,form(h.tree,'bgm').props);hooks.commit();
  const allowed=collect(tree,node=>node.type==='choose-file')[0].props.extNames;
  assert.ok(allowed.includes('.wav'));assert.equal(allowed.includes('.svg'),false);hooks.unmount();h.hooks.unmount();
});

test('a pending main-document composition blocks applying an otherwise valid panel',async()=>{
  const h=await harness();form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=34;');h.document.setComposing(true);
  button(h.render(),'应用到草稿').props.onClick();await flush();assert.equal(h.closed,0);assert.equal(h.document.getSnapshot().text,source);
  assert.match(alerts(h.render()),/中文候选/);h.document.setComposing(false);h.hooks.unmount();
});

test('preview holds are scoped by game and exact owner, and paths are deduplicated',()=>{
  const releaseA=registry.holdScenePreview('games/A/game/scene/start.txt');
  const releaseB=registry.holdScenePreview('games/A/game/scene/start.txt');
  const releaseC=registry.holdScenePreview('games/B/game/scene/other.txt');
  assert.equal(registry.canPreviewDocuments('A'),false);assert.equal(registry.canPreviewDocuments('unrelated'),true);
  assert.deepEqual(registry.pendingScenePaths('A'),['games/A/game/scene/start.txt']);
  releaseA();releaseA();assert.equal(registry.canPreviewDocuments('A'),false);
  releaseB();assert.equal(registry.canPreviewDocuments('A'),true);assert.equal(registry.canPreviewDocuments(),false);
  releaseC();assert.equal(registry.canPreviewDocuments(),true);assert.deepEqual(registry.pendingScenePaths(),[]);
});

test('an unapplied director draft participates in beforeunload protection until release',()=>{
  const release=registry.holdScenePreview('games/test/game/scene/start.txt');
  let prevented=0;const event={preventDefault(){prevented++;},returnValue:null};
  unloadListeners.get('beforeunload')(event);assert.equal(prevented,1);assert.equal(event.returnValue,'');
  release();unloadListeners.get('beforeunload')(event);assert.equal(prevented,1);
});
