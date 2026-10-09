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
const { default: Wait } = await load('wait');
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

async function harness(initialSource=source,selectedLine=5) {
  let writes=0, closed=0, holds=0;
  const closeHolds=[];
  const transport={read:async()=>({text:initialSource,revision:A}),save:async text=>{writes++;return {text,revision:B};}};
  const document=new SceneDocument(transport,{read:()=>null,write:()=>{},clear:()=>{}});
  await document.load();
  globalThis.document={activeElement:null};
  globalThis.HTMLInputElement=class {};
  globalThis.HTMLTextAreaElement=class {};
  globalThis.__directorHold=()=>{holds++;let released=false;return ()=>{if(!released){released=true;holds--;}};};
  const navigations=[];
  const props={initialSession:createDirectorSession(initialSource,selectedLine,document.getSnapshot().historyVersion),document,targetPath:'games/test/game/scene/start.txt',onClose:()=>{closeHolds.push(holds);closed++;},onLocate:navigation=>{navigations.push(navigation);closed++;return true;}};
  const hooks=new Hooks();
  const render=()=>hooks.render(DirectorPanel,props);
  let tree=render(); hooks.commit();
  return {document,transport,hooks,props,render,tree,closeHolds,navigations,get writes(){return writes;},get closed(){return closed;},get holds(){return holds;}};
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
  button(h.tree,'应用到草稿').props.onClick();h.tree.props.onOpenChange({preventDefault(){}}, {open:false,type:'escapeKeyDown',event:{nativeEvent:{}}});
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

test('every mounted native control disables the global effect editor and ordinary wait uses its native control',async()=>{
  const h=await harness();const forms=collect(h.tree,node=>node.type==='director-editor');
  assert.equal(forms.length,6);assert.ok(forms.every(node=>node.props.disableEffectEditor===true));
  assert.ok(form(h.tree,'wait'));h.hooks.unmount();
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

const pendingPicker=tree=>collect(tree,node=>node.props?.['data-director-pending-addition']==='true')
  .flatMap(card=>collect(card,node=>node.type==='choose-file'))[0];
const addFromPicker=(h,label,name)=>{
  button(h.render(),`新增${label}`).props.onClick();
  pendingPicker(h.render()).props.onChange({name});
};
const removals=tree=>collect(tree,node=>node.type==='button'&&node.props.children==='撤掉本次新增');
const locateButton=(tree,title='背景')=>{
  const row=collect(tree,node=>typeof node.type==='function'&&node.props.fact&&node.props.title===title)[0];
  return row&&button(row.type(row.props),'定位来源');
};

test('a clean source request carries exact target and return without edits, saves or identity registration',async()=>{
  const initial='\uFEFF; author note\r\nchangeBg:day.svg; keep\r\nsay:前一句;\r\nsay:本句;';
  const h=await harness(initial,3),before=h.document.getSnapshot();
  locateButton(h.tree).props.onClick();await flush();
  assert.equal(h.navigations.length,1);assert.equal(h.closed,1);assert.equal(h.holds,0);
  assert.equal(h.navigations[0].target.startLine,1);assert.equal(h.navigations[0].origin.startLine,3);
  assert.equal(h.navigations[0].target.nodeId,undefined);assert.equal(h.navigations[0].origin.nodeId,undefined);
  assert.equal(h.document.getSnapshot(),before);assert.equal(h.writes,0);h.hooks.unmount();
});

test('locating flushes a native input and refuses its unapplied value without losing the draft',async()=>{
  const h=await harness(),active=new HTMLInputElement();
  active.blur=()=>form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=61;');
  globalThis.document.activeElement=active;locateButton(h.tree).props.onClick();await flush();
  assert.equal(h.navigations.length,0);assert.equal(h.closed,0);assert.equal(h.holds,1);
  assert.match(alerts(h.render()),/未应用修改/);
  assert.equal(form(h.render(),'bgm').props.sentence.args.find(arg=>arg.key==='volume').value,61);
  assert.equal(h.document.getSnapshot().text,source);assert.equal(h.writes,0);h.hooks.unmount();
});

test('pending additions, invalid controls and complete additions all retain their draft when locating',async()=>{
  for(const state of ['pending','invalid','inserted']) {
    const h=await harness();
    if(state==='pending') button(h.tree,'新增背景').props.onClick();
    if(state==='invalid') form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=wrong;');
    if(state==='inserted') addFromPicker(h,'效果音','bell.wav');
    locateButton(h.render()).props.onClick();await flush();
    assert.equal(h.closed,0);assert.equal(h.navigations.length,0);assert.equal(h.holds,1);
    assert.match(alerts(h.render()),/未完成|未应用/);assert.equal(h.document.getSnapshot().text,source);
    if(state==='pending') assert.ok(pendingPicker(h.render()));
    if(state==='inserted') assert.equal(removals(h.render()).length,1);
    h.hooks.unmount();
  }
});

test('navigation waits for IME in either panel or shared document and ignores queued work after cancel',async()=>{
  const h=await harness();surface(h.tree).props.onCompositionStartCapture();
  locateButton(h.tree).props.onClick();await flush();assert.equal(h.navigations.length,0);
  surface(h.render()).props.onCompositionEndCapture();await flush();h.document.setComposing(true);
  locateButton(h.render()).props.onClick();await flush();assert.equal(h.navigations.length,0);
  assert.match(alerts(h.render()),/中文候选/);h.document.setComposing(false);
  locateButton(h.render()).props.onClick();button(h.render(),'取消').props.onClick();await flush();
  assert.equal(h.navigations.length,0);assert.equal(h.closed,1);assert.equal(h.document.getSnapshot().text,source);h.hooks.unmount();
});

test('parent refusal preserves modal and preview hold and saving documents cannot navigate',async()=>{
  const h=await harness();h.props.onLocate=()=>false;
  locateButton(h.render()).props.onClick();await flush();assert.equal(h.closed,0);assert.equal(h.holds,1);
  assert.match(alerts(h.render()),/已失效|尚未就绪/);
  let resolveSave;h.transport.save=()=>new Promise(resolve=>{resolveSave=resolve;});
  const edited=source.replace('第一句','共享修改');h.document.edit(edited);
  const saving=h.document.save();locateButton(h.render()).props.onClick();await flush();
  assert.match(alerts(h.render()),/正在读取、保存/);resolveSave({text:edited,revision:B});await saving;
  assert.equal(h.navigations.length,0);assert.equal(h.document.getSnapshot().text,edited);h.hooks.unmount();
});

test('source buttons omit unknown boundaries and unseen facts but retain explicit none and visible diff',async()=>{
  const cases=[
    ['changeBg:none;\r\nsay:本句;',1,'背景',true],
    ['say:本句;',0,'背景',false],
    ['changeBg:day.svg;\r\nlabel:branch;\r\nsay:本句;',2,'背景',false],
    ['changeFigureDiff:smile.svg -left;\r\nsay:本句;',1,'立绘 · 左侧',true],
  ];
  for(const [initial,line,title,expected] of cases) {
    const h=await harness(initial,line);assert.equal(!!locateButton(h.tree,title),expected);
    if(expected) {locateButton(h.tree,title).props.onClick();await flush();assert.equal(h.navigations.length,1);}
    h.hooks.unmount();
  }
});

test('picker follow-through and ordinary backdrop clicks cannot discard a pending or selected local draft',async()=>{
  for(const selected of [false,true]) {
    const h=await harness();button(h.tree,'新增背景').props.onClick();
    if(selected) pendingPicker(h.render()).props.onChange({name:'night.svg'});
    let prevented=0;h.render().props.onOpenChange({preventDefault(){prevented++;}}, {open:false,type:'backdropClick',event:{}});
    assert.equal(prevented,1);assert.equal(h.closed,0);assert.equal(h.holds,1);
    assert.equal(h.document.getSnapshot().text,source);
    if(selected) assert.equal(removals(h.render()).length,1);else assert.ok(pendingPicker(h.render()));
    button(h.render(),'取消').props.onClick();assert.equal(h.closed,1);h.hooks.unmount();
  }
});

test('Escape honors native IME flags and explicit non-composing Escape still cancels without saving',async()=>{
  for(const flags of [{nativeEvent:{isComposing:true}},{nativeEvent:{},keyCode:229}]) {
    const h=await harness();let prevented=0;
    h.tree.props.onOpenChange({preventDefault(){prevented++;}}, {open:false,type:'escapeKeyDown',event:flags});
    assert.equal(prevented,1);assert.equal(h.closed,0);assert.equal(h.holds,1);h.hooks.unmount();
  }
  const h=await harness();form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=54;');
  h.render().props.onOpenChange({preventDefault(){}}, {open:false,type:'escapeKeyDown',event:{nativeEvent:{},keyCode:27}});
  assert.equal(h.closed,1);assert.equal(h.holds,0);assert.equal(h.document.getSnapshot().text,source);assert.equal(h.writes,0);h.hooks.unmount();
});

test('a pending addition uses the native picker and blocks both apply and Ctrl+S without writing a placeholder',async()=>{
  const h=await harness();button(h.tree,'新增背景').props.onClick();
  const picker=pendingPicker(h.render());
  assert.deepEqual(picker.props.basePath,['background']);assert.ok(picker.props.extNames.includes('.svg'));
  assert.equal(picker.props.extNames.includes('.mp4'),false);
  assert.equal(button(h.render(),'应用到草稿').props.disabled,true);
  picker.props.onChange(null);assert.ok(pendingPicker(h.render()));
  button(h.render(),'应用到草稿').props.onClick();await flush();
  surface(h.render()).props.onKeyDownCapture({ctrlKey:true,key:'s',nativeEvent:{},preventDefault(){},stopPropagation(){}});
  await flush();assert.match(alerts(h.render()),/尚未选择素材/);
  assert.equal(h.document.getSnapshot().text,source);assert.equal(h.closed,0);assert.equal(h.writes,0);
  button(h.render(),'撤掉待添加').props.onClick();
  assert.equal(button(h.render(),'应用到草稿').props.disabled,false);
  button(h.render(),'应用到草稿').props.onClick();await flush();assert.equal(h.document.getSnapshot().canUndo,false);
  h.hooks.unmount();
});

test('removed or cancelled pending pickers cannot add a row through late callbacks',async()=>{
  const h=await harness();button(h.tree,'新增背景').props.onClick();
  const oldPicker=pendingPicker(h.render());button(h.render(),'撤掉待添加').props.onClick();
  button(h.render(),'新增立绘').props.onClick();oldPicker.props.onChange({name:'late.svg'});
  assert.equal(pendingPicker(h.render()).props.title,'选择立绘');assert.equal(removals(h.render()).length,0);
  const currentPicker=pendingPicker(h.render());button(h.render(),'取消').props.onClick();
  currentPicker.props.onChange({name:'also-late.svg'});h.hooks.unmount();await flush();
  assert.equal(h.closed,1);assert.equal(h.document.getSnapshot().text,source);assert.equal(h.holds,0);
});

test('four native additions keep source order and apply in one shared undo step',async()=>{
  const h=await harness();
  for(const [label,name] of [['背景','night.svg'],['立绘','smile.svg'],['背景音乐','new.wav'],['效果音','bell.wav']]) {
    addFromPicker(h,label,name);
    assert.equal(pendingPicker(h.render()),undefined);
  }
  assert.equal(removals(h.render()).length,4);
  assert.equal(h.document.getSnapshot().text,source);
  const cards=collect(h.render(),node=>node.type==='details'&&collect(node,n=>n.type==='director-editor').length);
  assert.ok(cards.every(card=>typeof card.key==='string'&&card.key.length));
  button(h.render(),'应用到草稿').props.onClick();await flush();
  const result=h.document.getSnapshot().text;
  assert.ok(result.startsWith(source.slice(0,source.indexOf('say:'))));
  const lines=result.split('\r\n');
  assert.match(lines[5],/^changeBg:night.svg -next;/);
  assert.match(lines[6],/^changeFigure:smile.svg -next;/);
  assert.match(lines[7],/^bgm:new.wav;/);
  assert.match(lines[8],/^playEffect:bell.wav;/);
  assert.equal(lines[9],source.split('\r\n')[5]);assert.equal(h.writes,0);
  h.document.undo();assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().canUndo,false);
  h.document.redo();assert.equal(h.document.getSnapshot().text,result);h.hooks.unmount();
});

test('only added rows can be removed and removed native callbacks cannot retarget or leave ghost errors',async()=>{
  const h=await harness();assert.equal(removals(h.tree).length,0);
  addFromPicker(h,'背景音乐','new.wav');
  const newForm=collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.content==='new.wav')[0];
  newForm.props.onSubmit('bgm:new.wav -volume=wrong;');assert.ok(alerts(h.render()).length>0);
  removals(h.render())[0].props.onClick();
  newForm.props.onSubmit('bgm:late.wav;');newForm.props.onSubmit('bgm:new.wav -volume=wrong;');
  assert.equal(removals(h.render()).length,0);assert.equal(alerts(h.render()),'');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().canUndo,false);h.hooks.unmount();
});

test('an older native dialogue callback follows stable identity across inserted and removed lines',async()=>{
  const h=await harness();const oldSay=form(h.tree,'say');
  const oldCard=collect(h.tree,node=>node.type==='details'&&collect(node,n=>n===oldSay).length)[0];
  addFromPicker(h,'效果音','bell.wav');
  assert.equal(form(h.render(),'say').props.index,6);
  const currentCard=collect(h.render(),node=>node.type==='details'&&collect(node,n=>n.type==='director-editor'&&n.props.sentence.commandRaw==='say').length)[0];
  assert.equal(currentCard.key,oldCard.key);
  oldSay.props.onSubmit('say:位移后仍是本句 -speaker=林 -vocal=voice.wav;');
  removals(h.render())[0].props.onClick();assert.equal(form(h.render(),'say').props.index,5);
  oldSay.props.onSubmit('say:撤掉后仍是本句 -speaker=林 -vocal=voice.wav;');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.document.getSnapshot().text,source.replace('第一句','撤掉后仍是本句'));h.hooks.unmount();
});

test('real Say buffered input survives an insertion and flushes into the same moved dialogue',async()=>{
  const h=await harness(),sayHooks=new Hooks();
  let props=form(h.tree,'say').props,tree=sayHooks.render(Say,props);sayHooks.commit();
  collect(tree,node=>node.type==='textarea')[0].props.onChange({target:{value:'新增设置时保留中文缓冲'}});
  tree=sayHooks.render(Say,props);sayHooks.commit();
  addFromPicker(h,'效果音','bell.wav');
  props=form(h.render(),'say').props;tree=sayHooks.render(Say,props);sayHooks.commit();
  assert.equal(collect(tree,node=>node.type==='textarea')[0].props.value,'新增设置时保留中文缓冲');
  const active=new HTMLTextAreaElement();active.blur=()=>collect(tree,node=>node.type==='textarea')[0].props.onBlur();
  globalThis.document.activeElement=active;button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.match(h.document.getSnapshot().text,/playEffect:bell.wav;[^\r\n]*\r\nsay:新增设置时保留中文缓冲/);
  sayHooks.unmount();h.hooks.unmount();await flush();h.document.undo();assert.equal(h.document.getSnapshot().text,source);
});

test('new rows use real Bgm controls and reject an incomplete native toggle until repaired or removed',async()=>{
  const h=await harness();addFromPicker(h,'背景音乐','new.wav');
  const newForm=collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.content==='new.wav')[0];
  const hooks=new Hooks();let tree=hooks.render(Bgm,newForm.props);hooks.commit();
  const volume=collect(tree,node=>node.type==='input'&&node.props.placeholder==='百分比。 0-100 有效')[0];
  volume.props.onChange({target:{value:'53'}});tree=hooks.render(Bgm,newForm.props);hooks.commit();
  collect(tree,node=>node.type==='input'&&node.props.placeholder==='百分比。 0-100 有效')[0].props.onBlur();
  let current=collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.content==='new.wav')[0];
  assert.equal(current.props.sentence.args.find(arg=>arg.key==='volume').value,53);
  current.props.onSubmit('bgm:选择背景音乐;');button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,0);assert.equal(h.document.getSnapshot().text,source);
  current.props.onSubmit('bgm:none;');button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);assert.match(h.document.getSnapshot().text,/bgm:none;/);hooks.unmount();h.hooks.unmount();
});

test('new image pickers reject unsupported content and retain the pending choice for correction',async()=>{
  const h=await harness();button(h.tree,'新增立绘').props.onClick();
  let picker=pendingPicker(h.render());assert.equal(picker.props.extNames.includes('.json'),false);
  picker.props.onChange({name:'model.json'});assert.ok(pendingPicker(h.render()));assert.match(alerts(h.render()),/静态图片/);
  pendingPicker(h.render()).props.onChange({name:'smile.svg'});assert.equal(pendingPicker(h.render()),undefined);
  assert.equal(removals(h.render()).length,1);button(h.render(),'取消').props.onClick();h.hooks.unmount();
});

test('composition prevents adding or removing a stage row until input settles',async()=>{
  const h=await harness();surface(h.tree).props.onCompositionStartCapture();
  button(h.render(),'新增背景').props.onClick();assert.equal(pendingPicker(h.render()),undefined);
  surface(h.render()).props.onCompositionEndCapture();await flush();addFromPicker(h,'背景','night.svg');
  surface(h.render()).props.onCompositionStartCapture();removals(h.render())[0].props.onClick();
  assert.equal(removals(h.render()).length,1);assert.match(alerts(h.render()),/中文候选/);
  surface(h.render()).props.onCompositionEndCapture();await flush();removals(h.render())[0].props.onClick();
  assert.equal(removals(h.render()).length,0);button(h.render(),'取消').props.onClick();h.hooks.unmount();
});

test('source references distinguish explicit none, unseen state and a branch boundary without asserting a live stage',async()=>{
  const previous='changeBg:none;\r\nsay:前一句;\r\nsay:当前句;';
  const h=await harness(previous,2);
  const refs=collect(h.tree,node=>typeof node.type==='function'&&node.props.fact);
  const background=refs.find(node=>node.props.title==='背景');assert.equal(background.props.fact.status,'none');
  const rendered=background.type(background.props);
  assert.equal(rendered.props['data-director-source-status'],'none');assert.equal(background.props.fact.startLine,0);
  assert.equal(refs.find(node=>node.props.title==='背景音乐').props.fact.status,'not-seen');
  h.hooks.unmount();
  const unknown=await harness('changeBg:old.svg;\r\nchoose:路线:a;\r\nsay:当前句;',2);
  const unknownRefs=collect(unknown.tree,node=>typeof node.type==='function'&&node.props.fact);
  assert.equal(unknownRefs.find(node=>node.props.title==='背景').props.fact.status,'unknown');
  const boundary=collect(unknown.tree,node=>node.type==='p'&&Array.isArray(node.props.children)&&node.props.children.includes('来源检查止于第 '))[0];
  assert.ok(boundary);unknown.hooks.unmount();
});

test('long native asset names fold back to one safe new row without truncating the name',async()=>{
  const h=await harness();
  const background=`nested/${'a'.repeat(70)}.svg`,figure=`人物/${'角色'.repeat(35)}.png`;
  addFromPicker(h,'背景',background);assert.equal(pendingPicker(h.render()),undefined);
  addFromPicker(h,'立绘',figure);assert.equal(pendingPicker(h.render()),undefined);
  assert.ok(collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.content===background).length);
  const figureForm=collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.content===figure)[0];
  const hooks=new Hooks();const tree=hooks.render(Figure,figureForm.props);hooks.commit();
  collect(tree,node=>node.type==='wheel'&&node.props.options?.has('left'))[0].props.onValueChange('left');
  assert.equal(alerts(h.render()),'');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  const lines=h.document.getSnapshot().text.split('\r\n');
  assert.equal(lines.length,8);assert.ok(lines[5].startsWith(`changeBg:${background} -next;`));
  assert.ok(lines[6].startsWith(`changeFigure:${figure}`));assert.match(lines[6],/ -left(?:=true)?(?: |;)/);
  hooks.unmount();h.hooks.unmount();
});

test('a new native clear state can select a fresh asset, retire old buffers and either apply or cancel',async()=>{
  for(const action of ['应用到草稿','取消']) {
    const h=await harness();addFromPicker(h,'背景音乐','new.wav');
    let newForm=collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.content==='new.wav')[0];
    const staleCallback=newForm.props.onSubmit,oldKey=newForm.key;
    const hooks=new Hooks();let tree=hooks.render(Bgm,newForm.props);hooks.commit();
    collect(tree,node=>node.type==='toggle')[0].props.onChange(true);
    let refs=collect(h.render(),node=>typeof node.type==='function'&&node.props.fact);
    assert.equal(refs.find(node=>node.props.title==='背景音乐').props.fact.status,'none');
    newForm=collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.commandRaw==='bgm').at(-1);
    tree=hooks.render(Bgm,newForm.props);hooks.commit();
    assert.equal(collect(tree,node=>node.type==='choose-file').length,0);
    collect(tree,node=>node.type==='toggle')[0].props.onChange(false);
    assert.ok(alerts(h.render()).length>0);
    const recovery=collect(h.render(),node=>node.type==='choose-file'&&node.props.title==='重新选择背景音乐')[0];
    assert.ok(recovery);recovery.props.onChange({name:'restored.wav'});
    newForm=collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.content==='restored.wav')[0];
    assert.notEqual(newForm.key,oldKey);assert.equal(alerts(h.render()),'');
    staleCallback('bgm:late-buffer.wav;');
    recovery.props.onChange({name:'late-picker.wav'});
    refs=collect(h.render(),node=>typeof node.type==='function'&&node.props.fact);
    const fact=refs.find(node=>node.props.title==='背景音乐').props.fact;
    assert.equal(fact.status,'source');assert.equal(fact.content,'restored.wav');
    assert.equal(h.document.getSnapshot().text,source);assert.equal(h.writes,0);
    button(h.render(),action).props.onClick();await flush();
    if(action==='取消') assert.equal(h.document.getSnapshot().text,source);
    else assert.match(h.document.getSnapshot().text,/bgm:restored.wav;/);
    hooks.unmount();h.hooks.unmount();
  }
});

test('asset control characters and extra script lines cannot become a truncated successful selection',async()=>{
  const h=await harness();button(h.tree,'新增背景').props.onClick();
  for(const name of ['a\rb.svg','a\nb.svg','a\uFEFFb.svg','a\u0000b.svg','a.svg;\nchangeBg:injected.svg;']) {
    pendingPicker(h.render()).props.onChange({name});
    assert.ok(pendingPicker(h.render()));assert.equal(removals(h.render()).length,0);
    assert.match(alerts(h.render()),/控制字符/);assert.equal(h.document.getSnapshot().text,source);
  }
  pendingPicker(h.render()).props.onChange({name:'normal.svg'});
  let newForm=collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.content==='normal.svg')[0];
  newForm.props.onSubmit('changeBg:normal.svg;\nchangeFigure:injected.svg;');
  assert.match(alerts(h.render()),/一条完整命令/);
  newForm.props.onSubmit('changeBg:none;');
  const recovery=collect(h.render(),node=>node.type==='choose-file'&&node.props.title==='重新选择背景')[0];
  recovery.props.onChange({name:'a\rb.svg'});assert.match(alerts(h.render()),/控制字符/);
  assert.equal(collect(h.render(),node=>node.type==='director-editor'&&node.props.sentence.content==='ab.svg').length,0);
  recovery.props.onChange({name:'fixed.svg'});button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);assert.match(h.document.getSnapshot().text,/changeBg:fixed.svg/);
  assert.doesNotMatch(h.document.getSnapshot().text,/injected|ab.svg/);h.hooks.unmount();
});

const structuralButton=(tree,prefix,line)=>collect(tree,node=>node.type==='button'&&node.props['aria-label']?.startsWith(prefix)&&node.props['aria-label']?.endsWith(`第 ${line} 行`))[0];
const stageRows=tree=>collect(tree,node=>node.type==='director-editor'&&!['say','wait'].includes(node.props.sentence.commandRaw));

test('existing deletion presents bound impact and only confirmation changes the local transaction',async()=>{
  const h=await harness();
  structuralButton(h.tree,'移除背景，',1).props.onClick();await flush();
  let tree=h.render();assert.ok(button(tree,'确认移除'));assert.equal(button(tree,'应用到草稿').props.disabled,true);
  button(tree,'应用到草稿').props.onClick();await flush();assert.equal(h.closed,0);assert.equal(h.document.getSnapshot().text,source);
  button(h.render(),'保留该设置').props.onClick();assert.ok(form(h.render(),'changeBg'));assert.equal(button(h.render(),'确认移除'),undefined);
  structuralButton(h.render(),'移除背景，',1).props.onClick();await flush();button(h.render(),'确认移除').props.onClick();await flush();
  assert.equal(form(h.render(),'changeBg'),undefined);assert.equal(h.document.getSnapshot().text,source);
  button(h.render(),'取消').props.onClick();assert.equal(h.document.getSnapshot().canUndo,false);h.hooks.unmount();
});

test('move and delete apply atomically and undo restores exact source and identities',async()=>{
  const h=await harness();
  structuralButton(h.tree,'下移背景，',1).props.onClick();await flush();
  assert.equal(stageRows(h.render())[0].props.sentence.content,'lin.svg');
  structuralButton(h.render(),'移除背景音乐，',4).props.onClick();await flush();button(h.render(),'确认移除').props.onClick();await flush();
  const version=h.document.getSnapshot().historyVersion;
  button(h.render(),'应用到草稿').props.onClick();await flush();
  const actual=h.document.getSnapshot().text,lines=source.split('\r\n');
  assert.equal(actual,[lines[1],lines[0],lines[2],lines[4],lines[5]].join('\r\n'));
  assert.equal(h.document.getSnapshot().historyVersion,version+1);assert.equal(h.writes,0);
  h.document.undo();assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().canUndo,false);
  h.document.redo();assert.equal(h.document.getSnapshot().text,actual);h.hooks.unmount();
});

test('structural controls flush real native buffers before moving and preserve callback identity',async()=>{
  const h=await harness();const oldSubmit=form(h.tree,'bgm').props.onSubmit;
  const active=new HTMLInputElement();let blurred=0;active.blur=()=>{blurred++;oldSubmit('bgm:music.wav -volume=57;');};globalThis.document.activeElement=active;
  structuralButton(h.tree,'上移背景音乐，',4).props.onClick();await flush();globalThis.document.activeElement=null;
  assert.equal(blurred,1);assert.equal(form(h.render(),'bgm').props.index,2);
  oldSubmit('bgm:music.wav -volume=63;');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.match(h.document.getSnapshot().text.split('\r\n')[2],/bgm:music.wav -volume=63; @makenovel-node music/);
  assert.match(h.document.getSnapshot().text.split('\r\n')[3],/yu.svg/);h.hooks.unmount();
});

test('removed existing row late callback cannot resurrect command or leave ghost errors',async()=>{
  const h=await harness();const late=form(h.tree,'bgm').props.onSubmit;
  structuralButton(h.tree,'移除背景音乐，',4).props.onClick();await flush();button(h.render(),'确认移除').props.onClick();await flush();
  late('bgm:evil.wav -volume=broken;');late('bgm:other.wav -volume=70;');
  assert.equal(form(h.render(),'bgm'),undefined);assert.equal(alerts(h.render()),'');
  button(h.render(),'应用到草稿').props.onClick();await flush();assert.equal(h.closed,1);assert.doesNotMatch(h.document.getSnapshot().text,/bgm:/);h.hooks.unmount();
});

test('editing after review invalidates the old confirmation without deleting another row',async()=>{
  const h=await harness();structuralButton(h.tree,'移除背景音乐，',4).props.onClick();await flush();
  const oldConfirm=button(h.render(),'确认移除').props.onClick;
  form(h.render(),'bgm').props.onSubmit('bgm:music.wav -volume=49;');assert.equal(button(h.render(),'确认移除'),undefined);
  oldConfirm();await flush();assert.ok(form(h.render(),'bgm'));assert.match(alerts(h.render()),/设置已变化/);
  button(h.render(),'应用到草稿').props.onClick();await flush();assert.match(h.document.getSnapshot().text,/volume=49/);h.hooks.unmount();
});

test('pending material, invalid values and composition prevent structural actions',async()=>{
  for(const state of ['pending','invalid','ime','document-ime']) {
    const h=await harness();
    if(state==='pending') button(h.tree,'新增背景').props.onClick();
    if(state==='invalid') form(h.tree,'bgm').props.onSubmit('bgm:music.wav -volume=broken;');
    if(state==='ime') surface(h.tree).props.onCompositionStartCapture();
    if(state==='document-ime') h.document.setComposing(true);
    structuralButton(h.render(),'下移背景，',1).props.onClick();await flush();
    structuralButton(h.render(),'移除背景，',1).props.onClick();await flush();
    assert.equal(stageRows(h.render())[0].props.sentence.content,'day.svg');assert.equal(button(h.render(),'确认移除'),undefined);
    assert.match(alerts(h.render()),state.includes('ime')?/中文候选/:/未完成的输入/);
    assert.equal(h.document.getSnapshot().text,source);h.hooks.unmount();
  }
});

test('wait boundary is visible and enforced even if disabled move callback is invoked',async()=>{
  const h=await harness();const move=structuralButton(h.tree,'下移背景音乐，',4);assert.equal(move.props.disabled,true);assert.ok(move.props.title);
  move.props.onClick();await flush();assert.match(alerts(h.render()),/等待|边界|相邻|跨越/);
  assert.equal(form(h.render(),'bgm').props.index,3);assert.equal(structuralButton(h.render(),'移除等待',5),undefined);h.hooks.unmount();
});

test('confirmation detects main-document ABA and cancel beats queued structural work',async()=>{
  const h=await harness();structuralButton(h.tree,'移除背景，',1).props.onClick();await flush();
  h.document.edit(source.replace('第一句','外部'));h.document.undo();
  button(h.render(),'确认移除').props.onClick();await flush();assert.ok(form(h.render(),'changeBg'));assert.match(alerts(h.render()),/主文档已改变/);
  button(h.render(),'取消').props.onClick();h.hooks.unmount();
  const fresh=await harness();structuralButton(fresh.tree,'下移背景，',1).props.onClick();button(fresh.tree,'取消').props.onClick();await flush();
  assert.equal(fresh.closed,1);assert.equal(fresh.document.getSnapshot().text,source);fresh.hooks.unmount();
});

test('deleting a latest source retains author comment and reveals earlier inheritance in the panel',async()=>{
  const initial='\uFEFF; 来源测试\r\nchangeBg:day.svg -next; @makenovel-node earlier\r\nsay:前句;\r\nchangeBg:night.svg -next; 夜景备注 ; @makenovel-node night\r\nsay:目标; @makenovel-node target\r\n';
  const h=await harness(initial,4);structuralButton(h.tree,'移除背景，',4).props.onClick();await flush();
  button(h.render(),'确认移除').props.onClick();await flush();
  const sourceRow=collect(h.render(),node=>typeof node.type==='function'&&node.props.title==='背景'&&node.props.fact)[0];
  assert.equal(sourceRow.props.fact.content,'day.svg');assert.equal(sourceRow.props.fact.scope,'earlier');
  locateButton(h.render()).props.onClick();await flush();assert.equal(h.navigations.length,0);
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.match(h.document.getSnapshot().text,/; 夜景备注 /);assert.doesNotMatch(h.document.getSnapshot().text,/@makenovel-node night/);
  h.document.undo();assert.equal(h.document.getSnapshot().text,initial);h.hooks.unmount();
});

test('two rapid structural clicks execute once and review confirmation cannot be replayed',async()=>{
  const h=await harness();const move=structuralButton(h.tree,'下移背景，',1).props.onClick;move();move();await flush();
  assert.equal(form(h.render(),'changeBg').props.index,1);
  structuralButton(h.render(),'移除背景，',2).props.onClick();await flush();const confirm=button(h.render(),'确认移除').props.onClick;
  confirm();confirm();await flush();confirm();await flush();
  assert.equal(form(h.render(),'changeBg'),undefined);assert.equal(stageRows(h.render()).length,3);h.hooks.unmount();
});

test('native Wait flushes duration and toggle as one transaction with another row and shared undo',async()=>{
  const h=await harness(),hooks=new Hooks(),props=form(h.tree,'wait').props;
  let tree=hooks.render(Wait,props);hooks.commit();
  const input=()=>collect(tree,node=>node.type==='input'&&node.props['aria-label']==='等待时间（毫秒）')[0];
  input().props.onChange({target:{value:'2400'}});
  tree=hooks.render(Wait,props);hooks.commit();
  collect(tree,node=>node.type==='toggle')[0].props.onChange(false);
  assert.equal(h.document.getSnapshot().text,source);
  form(h.render(),'bgm').props.onSubmit('bgm:music.wav -volume=42;');
  const active=new HTMLInputElement();active.blur=()=>input().props.onBlur();
  globalThis.document.activeElement=active;
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);assert.equal(h.writes,0);
  assert.match(h.document.getSnapshot().text,/wait:2400 -nobreak=false; @makenovel-node wait/);
  assert.match(h.document.getSnapshot().text,/volume=42/);
  hooks.unmount();h.hooks.unmount();h.document.undo();
  assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().canUndo,false);
});

test('native Wait invalid buffer blocks the whole batch until corrected without losing other rows',async()=>{
  const h=await harness(),hooks=new Hooks(),props=form(h.tree,'wait').props;
  let tree=hooks.render(Wait,props);hooks.commit();
  const set=value=>{collect(tree,node=>node.type==='input')[0].props.onChange({target:{value}});tree=hooks.render(Wait,props);hooks.commit();};
  form(h.render(),'say').props.onSubmit('say:保留有效对白 -speaker=林 -vocal=voice.wav;');
  const active=new HTMLInputElement();active.blur=()=>collect(tree,node=>node.type==='input')[0].props.onBlur();
  globalThis.document.activeElement=active;
  for(const invalid of ['', '-1', '1.5', '1e3', '2147483648', '2; jump:other.txt']) {
    set(invalid);button(h.render(),'应用到草稿').props.onClick();await flush();
    assert.equal(h.closed,0,invalid);assert.equal(h.document.getSnapshot().text,source);
    assert.match(alerts(h.render()),/无法应用的输入/);
  }
  set('1750');button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);assert.match(h.document.getSnapshot().text,/wait:1750 -nobreak/);
  assert.match(h.document.getSnapshot().text,/保留有效对白/);hooks.unmount();h.hooks.unmount();
});

test('native Wait no-op normalization preserves leading zeroes and explicit false without registering identity',async()=>{
  const initial='wait:000900 -nobreak=false; author note\r\nsay:当前句;';
  const h=await harness(initial,1),hooks=new Hooks(),props=form(h.tree,'wait').props;
  let tree=hooks.render(Wait,props);hooks.commit();
  collect(tree,node=>node.type==='input')[0].props.onChange({target:{value:'900'}});
  tree=hooks.render(Wait,props);hooks.commit();
  const active=new HTMLInputElement();active.blur=()=>collect(tree,node=>node.type==='input')[0].props.onBlur();globalThis.document.activeElement=active;
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);assert.equal(h.document.getSnapshot().text,initial);assert.equal(h.document.getSnapshot().canUndo,false);
  hooks.unmount();h.hooks.unmount();
});

test('wait editing keeps advanced syntax read-only and explains the restricted control',async()=>{
  for(const line of ['wait:{delay};','wait:900 -next;','wait:900 -next=false;','wait:900 -nobreak=1;','wait:900 -unknown=x;']) {
    const h=await harness(`${line}\r\nsay:当前句;`,1);
    assert.equal(form(h.tree,'wait'),undefined,line);
    const text=JSON.stringify(h.tree);
    assert.match(text,/保留原文，请在源码中设置|来源检查止于第/);
    button(h.render(),'应用到草稿').props.onClick();await flush();
    assert.equal(h.document.getSnapshot().text,`${line}\r\nsay:当前句;`);h.hooks.unmount();
  }
});

test('wait edits remain local while IME is active and cancel ignores late native submission',async()=>{
  const h=await harness(),callback=form(h.tree,'wait').props.onSubmit;
  surface(h.tree).props.onCompositionStartCapture();callback('wait:2300 -nobreak;');
  button(h.render(),'应用到草稿').props.onClick();await flush();assert.equal(h.closed,0);
  assert.equal(h.document.getSnapshot().text,source);
  surface(h.render()).props.onCompositionEndCapture();await flush();
  button(h.render(),'取消').props.onClick();callback('wait:500;');await flush();
  assert.equal(h.closed,1);assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().canUndo,false);h.hooks.unmount();
});

test('wait controls survive a neighbouring deletion by stable identity and cannot acquire structural actions',async()=>{
  const h=await harness(),callback=form(h.tree,'wait').props.onSubmit;
  structuralButton(h.tree,'移除背景音乐，',4).props.onClick();await flush();
  button(h.render(),'确认移除').props.onClick();await flush();
  callback('wait:1900;');
  assert.equal(form(h.render(),'wait').props.index,3);
  assert.equal(structuralButton(h.render(),'上移等待',4),undefined);
  assert.equal(structuralButton(h.render(),'移除等待',4),undefined);
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.match(h.document.getSnapshot().text,/wait:1900 -nobreak=false; @makenovel-node wait/);
  h.hooks.unmount();h.document.undo();assert.equal(h.document.getSnapshot().text,source);
});

test('execution order reads current local draft and never adds overlapping durations',async()=>{
  const h=await harness();
  const order=tree=>collect(tree,node=>node.type==='ol'&&node.props['aria-label']==='本句执行顺序')[0];
  assert.ok(order(h.tree));
  form(h.tree,'wait').props.onSubmit('wait:2100 -nobreak;');
  const text=JSON.stringify(order(h.render()));
  assert.match(text,/2100/);assert.doesNotMatch(text,/3000/);
  assert.equal(h.document.getSnapshot().text,source);h.hooks.unmount();
});

const backgroundLabels={
  duration:'背景入场回退时间（毫秒）',
  enterDuration:'背景入场时间（毫秒）',
  exitDuration:'背景下次退场时间（毫秒）',
};
function mountBackground(h) {
  const hooks=new Hooks();let tree;
  const render=()=>{tree=hooks.render(Bg,form(h.render(),'changeBg').props);hooks.commit();return tree;};
  const input=key=>collect(tree,node=>node.type==='input'&&node.props['aria-label']===backgroundLabels[key])[0];
  const set=(key,value)=>{assert.ok(input(key),key);input(key).props.onChange({target:{value}});render();};
  const choose=name=>{collect(tree,node=>node.type==='choose-file')[0].props.onChange({name});render();};
  render();return {hooks,render,input,set,choose,get tree(){return tree;}};
}
const sentenceArg=(sentence,key)=>sentence.args.find(arg=>arg.key===key)?.value;

test('only native background rows receive the local transition state and raw input adapter',async()=>{
  const h=await harness(),bg=form(h.tree,'changeBg');
  assert.equal(bg.props.backgroundTransition.editable,true);
  assert.deepEqual({duration:bg.props.backgroundTransition.duration,enterDuration:bg.props.backgroundTransition.enterDuration,
    exitDuration:bg.props.backgroundTransition.exitDuration,next:bg.props.backgroundTransition.next},
  {duration:'900',enterDuration:'',exitDuration:'',next:true});
  assert.equal(typeof bg.props.onBackgroundTransitionSubmit,'function');
  for(const item of collect(h.tree,node=>node.type==='director-editor'&&node!==bg)) {
    assert.equal(item.props.backgroundTransition,undefined,item.props.sentence.commandRaw);
    assert.equal(item.props.onBackgroundTransitionSubmit,undefined,item.props.sentence.commandRaw);
  }
  const mounted=mountBackground(h);
  assert.equal(mounted.input('duration').props.value,'900');
  assert.equal(mounted.input('enterDuration').props.value,'');
  assert.equal(mounted.input('exitDuration').props.value,'');
  mounted.hooks.unmount();h.hooks.unmount();
});

test('native background buffers survive asset selection and join dialogue in one undoable transaction',async()=>{
  const h=await harness(),mounted=mountBackground(h),version=h.document.getSnapshot().historyVersion;
  mounted.set('duration','1100');mounted.set('enterDuration','2200');mounted.set('exitDuration','3300');
  assert.equal(h.document.getSnapshot().text,source);
  mounted.choose('night.svg');
  let current=form(h.render(),'changeBg').props.sentence;
  assert.equal(current.content,'night.svg');
  assert.equal(sentenceArg(current,'duration'),1100);assert.equal(sentenceArg(current,'enterDuration'),2200);
  assert.equal(sentenceArg(current,'exitDuration'),3300);
  form(h.render(),'say').props.onSubmit('say:转场与对白一起修改 -speaker=林 -vocal=voice.wav;');
  mounted.render();mounted.set('enterDuration','2400');
  let blurred=0;const active=new HTMLInputElement();active.blur=()=>{blurred++;mounted.input('enterDuration').props.onBlur();};
  globalThis.document.activeElement=active;
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(blurred,1);assert.equal(h.closed,1);assert.equal(h.writes,0);
  assert.equal(h.document.getSnapshot().historyVersion,version+1);
  const edited=h.document.getSnapshot().text;
  assert.match(edited,/changeBg:night.svg/);assert.match(edited,/-duration=1100/);
  assert.match(edited,/-enterDuration=2400/);assert.match(edited,/-exitDuration=3300/);
  assert.match(edited,/; @makenovel-node bg\r\n/);assert.match(edited,/转场与对白一起修改/);
  assert.deepEqual(edited.split('\r\n').slice(1,5),source.split('\r\n').slice(1,5));
  mounted.hooks.unmount();h.hooks.unmount();h.document.undo();
  assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().canUndo,false);
  h.document.redo();assert.equal(h.document.getSnapshot().text,edited);
});

test('invalid background raw values block asset, next and apply without discarding another valid row',async()=>{
  const h=await harness(),mounted=mountBackground(h);
  form(h.render(),'say').props.onSubmit('say:保留转场旁的对白 -speaker=林 -vocal=voice.wav;');
  mounted.set('enterDuration','2300');
  const active=new HTMLInputElement();active.blur=()=>mounted.input('duration').props.onBlur();globalThis.document.activeElement=active;
  for(const invalid of ['-1','1.5','1e3','2147483648','2; jump:other.txt','2\nchangeBg:injected.svg']) {
    mounted.set('duration',invalid);mounted.choose('night.svg');
    const next=collect(mounted.tree,node=>node.type==='toggle'&&node.props.offText==='本句执行后等待')[0];
    next.props.onChange(false);mounted.render();
    button(h.render(),'应用到草稿').props.onClick();await flush();
    assert.equal(h.closed,0,invalid);assert.equal(h.document.getSnapshot().text,source);
    assert.equal(form(h.render(),'changeBg').props.sentence.content,'day.svg',invalid);
    assert.equal(sentenceArg(form(h.render(),'changeBg').props.sentence,'next'),true,invalid);
    assert.match(alerts(h.render()),/无法应用的输入/);
    assert.equal(mounted.input('duration').props.value,invalid);
    assert.equal(mounted.input('enterDuration').props.value,'2300');
    assert.equal(form(h.render(),'say').props.sentence.content,'保留转场旁的对白');
  }
  mounted.set('duration','1500');mounted.choose('night.svg');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);assert.match(h.document.getSnapshot().text,/changeBg:night.svg/);
  assert.match(h.document.getSnapshot().text,/-duration=1500/);assert.match(h.document.getSnapshot().text,/-enterDuration=2300/);
  assert.match(h.document.getSnapshot().text,/保留转场旁的对白/);assert.doesNotMatch(h.document.getSnapshot().text,/injected|jump:/);
  mounted.hooks.unmount();h.hooks.unmount();
});

test('clearing native background timing fields removes only overrides and preserves source identity',async()=>{
  const initial='\uFEFF; 转场边界\r\nchangeBg:day.svg -duration=900 -enterDuration=0 -exitDuration=1500 -next; 保留备注 ; @makenovel-node bg\r\nsay:当前句;\r\n';
  const h=await harness(initial,2),mounted=mountBackground(h);
  for(const key of Object.keys(backgroundLabels)) mounted.set(key,'');
  collect(mounted.tree,node=>node.type==='toggle'&&node.props.offText==='本句执行后等待')[0].props.onChange(false);
  mounted.render();
  const active=new HTMLInputElement();active.blur=()=>mounted.input('exitDuration').props.onBlur();globalThis.document.activeElement=active;
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);
  const edited=h.document.getSnapshot().text,reopened=createDirectorSession(edited,2,h.document.getSnapshot().historyVersion);
  const bg=reopened.nodes.find(node=>node.command==='changeBg').sentence;
  for(const key of Object.keys(backgroundLabels)) assert.equal(sentenceArg(bg,key),undefined,key);
  assert.ok([undefined,false].includes(sentenceArg(bg,'next')));
  assert.ok(edited.startsWith('\uFEFF; 转场边界\r\nchangeBg:day.svg'));
  assert.match(edited,/; 保留备注 ; @makenovel-node bg\r\nsay:当前句;\r\n$/);
  mounted.hooks.unmount();h.hooks.unmount();h.document.undo();assert.equal(h.document.getSnapshot().text,initial);
});

test('equivalent background timing and complete round trips preserve original bytes without new identity',async()=>{
  const initial='changeBg:day.svg -duration=000900 -next=false; author note\r\nsay:当前句;';
  for(const values of [['900'],['1200','900']]) {
    const h=await harness(initial,1),mounted=mountBackground(h);
    for(const value of values) {mounted.set('duration',value);mounted.input('duration').props.onBlur();mounted.render();}
    button(h.render(),'应用到草稿').props.onClick();await flush();
    assert.equal(h.closed,1);assert.equal(h.document.getSnapshot().text,initial);
    assert.equal(h.document.getSnapshot().canUndo,false);assert.equal(h.writes,0);
    mounted.hooks.unmount();h.hooks.unmount();
  }
});

test('background transition IME and cancellation gates ignore late native adapters and buffered submissions',async()=>{
  const h=await harness(),mounted=mountBackground(h),late=form(h.tree,'changeBg').props;
  mounted.set('enterDuration','1800');mounted.input('enterDuration').props.onBlur();mounted.render();
  surface(h.render()).props.onCompositionStartCapture();
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,0);assert.equal(h.document.getSnapshot().text,source);assert.match(alerts(h.render()),/中文候选/);
  surface(h.render()).props.onCompositionEndCapture();await flush();
  button(h.render(),'应用到草稿').props.onClick();button(h.render(),'取消').props.onClick();
  late.onBackgroundTransitionSubmit({duration:'5000',enterDuration:'',exitDuration:'',next:false});
  late.onSubmit('changeBg:late.svg -duration=5000;');await flush();
  assert.equal(h.closed,1);assert.equal(h.document.getSnapshot().text,source);
  assert.equal(h.document.getSnapshot().canUndo,false);assert.equal(h.writes,0);assert.equal(h.holds,0);
  mounted.hooks.unmount();h.hooks.unmount();
});

test('advanced or non-image background transition state stays read-only in the native local form',async()=>{
  for(const line of ['changeBg:day.svg -enter=fade.json;','changeBg:movie.mp4;','changeBg:none;']) {
    const initial=`${line}\r\nsay:当前句;`,h=await harness(initial,1),props=form(h.tree,'changeBg').props;
    assert.equal(props.backgroundTransition.editable,false,line);assert.ok(props.backgroundTransition.reason,line);
    const mounted=mountBackground(h);
    for(const key of Object.keys(backgroundLabels)) {
      const input=mounted.input(key);
      assert.ok(!input||input.props.disabled||collect(mounted.tree,node=>node.type==='fieldset'&&node.props.disabled).length,line);
    }
    assert.ok(JSON.stringify(mounted.tree).includes(props.backgroundTransition.reason));
    button(h.render(),'应用到草稿').props.onClick();await flush();
    assert.equal(h.document.getSnapshot().text,initial);assert.equal(h.document.getSnapshot().canUndo,false);
    mounted.hooks.unmount();h.hooks.unmount();
  }
});

test('removed background rows cannot return through a late transition adapter',async()=>{
  const h=await harness(),late=form(h.tree,'changeBg').props.onBackgroundTransitionSubmit;
  structuralButton(h.tree,'移除背景，',1).props.onClick();await flush();
  button(h.render(),'确认移除').props.onClick();await flush();
  late({duration:'bad; injected',enterDuration:'',exitDuration:'',next:false});
  late({duration:'800',enterDuration:'',exitDuration:'',next:false});
  assert.equal(form(h.render(),'changeBg'),undefined);assert.equal(alerts(h.render()),'');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);assert.doesNotMatch(h.document.getSnapshot().text,/changeBg:/);
  h.hooks.unmount();h.document.undo();assert.equal(h.document.getSnapshot().text,source);
});


test('read-only background state does not replace the existing native control values',async()=>{
  const h=await harness('changeBg:day.svg -next=TRUE;\r\nsay:当前句;',1),mounted=mountBackground(h);
  assert.equal(form(h.render(),'changeBg').props.backgroundTransition.editable,false);
  const next=collect(mounted.tree,node=>node.type==='toggle'&&node.props.offText==='本句执行后等待')[0];
  assert.equal(next.props.isChecked,true);
  mounted.choose('night.svg');
  assert.equal(sentenceArg(form(h.render(),'changeBg').props.sentence,'next'),true);
  mounted.hooks.unmount();h.hooks.unmount();
});

const figureLabels={
  duration:'立绘入场回退时间（毫秒）',
  enterDuration:'立绘入场时间（毫秒）',
  exitDuration:'立绘下次退场时间（毫秒）',
};
function mountFigure(h) {
  const hooks=new Hooks();let tree;
  const render=()=>{tree=hooks.render(Figure,form(h.render(),'changeFigure').props);hooks.commit();return tree;};
  const input=key=>collect(tree,node=>node.type==='input'&&node.props['aria-label']===figureLabels[key])[0];
  const set=(key,value)=>{assert.ok(input(key),key);input(key).props.onChange({target:{value}});render();};
  const choose=name=>{collect(tree,node=>node.type==='choose-file')[0].props.onChange({name});render();};
  const next=()=>collect(tree,node=>node.type==='toggle'&&node.props.offText==='本句执行后等待')[0];
  render();return {hooks,render,input,set,choose,next,get tree(){return tree;}};
}

test('native figure transition state initializes the left slot before the first control blur',async()=>{
  const h=await harness(),props=form(h.tree,'changeFigure').props,mounted=mountFigure(h);
  assert.equal(props.figureTransition.editable,true);
  assert.equal(props.figureTransition.position,'left');
  assert.equal(typeof props.onFigureTransitionSubmit,'function');
  assert.equal(collect(mounted.tree,node=>node.type==='wheel')[0].props.value,'left');
  for(const key of Object.keys(figureLabels)) assert.equal(mounted.input(key).props.value,'',key);
  // Use the first render's callback, without another render after layout/effects.
  mounted.input('enterDuration').props.onBlur();
  const current=form(h.render(),'changeFigure').props.sentence;
  assert.equal(sentenceArg(current,'left'),true);assert.equal(sentenceArg(current,'next'),true);
  for(const item of collect(h.tree,node=>node.type==='director-editor'&&node.props.sentence.commandRaw!=='changeFigure')) {
    assert.equal(item.props.figureTransition,undefined,item.props.sentence.commandRaw);
    assert.equal(item.props.onFigureTransitionSubmit,undefined,item.props.sentence.commandRaw);
  }
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().canUndo,false);
  mounted.hooks.unmount();h.hooks.unmount();
});

test('figure timing edits retain custom ID with right position and an explicit center token',async()=>{
  for(const target of ['-id=hero -right','-center','-id=hero -center']) {
    const initial=`\uFEFF; 目标不可漂移\r\nchangeFigure:lin.svg ${target} -duration=000800 -next=false; 作者备注 ; @makenovel-node figure\r\nsay:当前句;\r\n`;
    const h=await harness(initial,2),mounted=mountFigure(h);
    assert.equal(form(h.render(),'changeFigure').props.figureTransition.position,target.includes('-right')?'right':'');
    assert.equal(collect(mounted.tree,node=>node.type==='wheel')[0].props.value,target.includes('-right')?'right':'');
    mounted.set('enterDuration','2400');mounted.input('enterDuration').props.onBlur();mounted.render();
    button(h.render(),'应用到草稿').props.onClick();await flush();
    const edited=h.document.getSnapshot().text;
    assert.ok(edited.includes(`changeFigure:lin.svg ${target} -duration=000800`),edited);
    assert.match(edited,/-enterDuration=2400/);assert.match(edited,/-next=false/);
    assert.ok(edited.startsWith('\uFEFF; 目标不可漂移\r\n'));
    assert.match(edited,/; 作者备注 ; @makenovel-node figure\r\nsay:当前句;\r\n$/);
    const reopened=createDirectorSession(edited,2,h.document.getSnapshot().historyVersion).nodes.find(node=>node.command==='changeFigure');
    assert.equal(sentenceArg(reopened.sentence,'id'),target.includes('-id=hero')?'hero':undefined);
    assert.equal(sentenceArg(reopened.sentence,target.includes('-right')?'right':'center'),true);
    assert.equal(sentenceArg(reopened.sentence,'enterDuration'),2400);
    mounted.hooks.unmount();h.hooks.unmount();h.document.undo();assert.equal(h.document.getSnapshot().text,initial);
  }
});

test('native figure position changes replace explicit center with left while retaining a custom ID',async()=>{
  for(const target of ['-center=true','-id=hero -center=true']) {
    const initial=`changeFigure:lin.svg ${target} -enterDuration=1200 -next=false; target note ; @makenovel-node figure\r\nsay:当前句;`;
    const h=await harness(initial,1),mounted=mountFigure(h);
    assert.equal(collect(mounted.tree,node=>node.type==='wheel')[0].props.value,'');
    collect(mounted.tree,node=>node.type==='wheel')[0].props.onValueChange('left');mounted.render();
    const props=form(h.render(),'changeFigure').props,current=props.sentence;
    assert.equal(props.figureTransition.editable,true);assert.equal(props.figureTransition.position,'left');
    assert.equal(sentenceArg(current,'left'),true);assert.equal(sentenceArg(current,'center'),undefined);
    assert.equal(sentenceArg(current,'id'),target.includes('-id=hero')?'hero':undefined);
    assert.equal(sentenceArg(current,'enterDuration'),1200);assert.equal(sentenceArg(current,'next'),false);
    assert.equal(alerts(h.render()),'');assert.equal(h.document.getSnapshot().text,initial);
    button(h.render(),'应用到草稿').props.onClick();await flush();
    const edited=h.document.getSnapshot().text;
    assert.notEqual(edited,initial);assert.match(edited,/-left(?:[= ;]|$)/);assert.doesNotMatch(edited,/-center/);
    assert.match(edited,/; target note ; @makenovel-node figure\r\nsay:当前句;$/);
    if(target.includes('-id=hero')) assert.match(edited,/-id=hero/);
    const reopened=createDirectorSession(edited,1,h.document.getSnapshot().historyVersion).nodes.find(node=>node.command==='changeFigure');
    assert.equal(sentenceArg(reopened.sentence,'left'),true);assert.equal(sentenceArg(reopened.sentence,'center'),undefined);
    mounted.hooks.unmount();h.hooks.unmount();h.document.undo();assert.equal(h.document.getSnapshot().text,initial);
  }
});

test('invalid raw figure timing cannot inject source through asset selection or survive cancellation',async()=>{
  const initial='changeFigure:lin.svg -id=hero -left -duration=800 -next; @makenovel-node figure\r\nsay:当前句;';
  const h=await harness(initial,1),mounted=mountFigure(h);
  form(h.render(),'say').props.onSubmit('say:有效但尚未应用的对白;');
  mounted.set('enterDuration','2300');
  const active=new HTMLInputElement();active.blur=()=>mounted.input('duration').props.onBlur();globalThis.document.activeElement=active;
  for(const invalid of ['-1','1.5','1e3','2147483648','2; jump:other.txt','2\nchangeFigure:injected.svg']) {
    mounted.set('duration',invalid);mounted.choose('other.svg');mounted.next().props.onChange(false);mounted.render();
    button(h.render(),'应用到草稿').props.onClick();await flush();
    assert.equal(h.closed,0,invalid);assert.equal(h.document.getSnapshot().text,initial);
    const current=form(h.render(),'changeFigure').props.sentence;
    assert.equal(current.content,'lin.svg',invalid);assert.equal(sentenceArg(current,'id'),'hero');
    assert.equal(sentenceArg(current,'left'),true);assert.equal(sentenceArg(current,'next'),true);
    assert.equal(mounted.input('duration').props.value,invalid);assert.equal(mounted.input('enterDuration').props.value,'2300');
    assert.equal(form(h.render(),'say').props.sentence.content,'有效但尚未应用的对白');
    assert.match(alerts(h.render()),/无法应用的输入/);
  }
  button(h.render(),'取消').props.onClick();await flush();
  assert.equal(h.closed,1);assert.equal(h.document.getSnapshot().text,initial);
  assert.equal(h.document.getSnapshot().canUndo,false);assert.equal(h.writes,0);assert.equal(h.holds,0);
  mounted.hooks.unmount();h.hooks.unmount();
});

test('figure asset replacement carries timing buffers and dialogue into one shared undo transaction',async()=>{
  const h=await harness(),mounted=mountFigure(h),version=h.document.getSnapshot().historyVersion;
  mounted.set('duration','1100');mounted.set('enterDuration','2200');mounted.set('exitDuration','3300');
  assert.equal(h.document.getSnapshot().text,source);mounted.choose('lin-smile.svg');
  const current=form(h.render(),'changeFigure').props.sentence;
  assert.equal(current.content,'lin-smile.svg');assert.equal(sentenceArg(current,'left'),true);
  assert.equal(sentenceArg(current,'duration'),1100);assert.equal(sentenceArg(current,'enterDuration'),2200);
  assert.equal(sentenceArg(current,'exitDuration'),3300);
  form(h.render(),'say').props.onSubmit('say:立绘与对白一起修改 -speaker=林 -vocal=voice.wav;');
  mounted.render();mounted.set('enterDuration','2400');
  let blurred=0;const active=new HTMLInputElement();active.blur=()=>{blurred++;mounted.input('enterDuration').props.onBlur();};
  globalThis.document.activeElement=active;button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(blurred,1);assert.equal(h.closed,1);assert.equal(h.writes,0);
  assert.equal(h.document.getSnapshot().historyVersion,version+1);
  const edited=h.document.getSnapshot().text;
  assert.match(edited,/changeFigure:lin-smile.svg -left/);assert.match(edited,/-duration=1100/);
  assert.match(edited,/-enterDuration=2400/);assert.match(edited,/-exitDuration=3300/);
  assert.match(edited,/; @makenovel-node left\r\n/);assert.match(edited,/立绘与对白一起修改/);
  for(const line of [0,2,3,4]) assert.equal(edited.split('\r\n')[line],source.split('\r\n')[line]);
  mounted.hooks.unmount();h.hooks.unmount();h.document.undo();
  assert.equal(h.document.getSnapshot().text,source);assert.equal(h.document.getSnapshot().canUndo,false);
  h.document.redo();assert.equal(h.document.getSnapshot().text,edited);
});

test('equivalent figure timing and native next false round trips restore exact source without identity churn',async()=>{
  for(const target of ['-left','-id=hero -right','-center']) {
    const initial=`changeFigure:lin.svg ${target} -duration=000900 -next=false; author note\r\nsay:当前句;`;
    const h=await harness(initial,1),mounted=mountFigure(h);
    assert.equal(mounted.next().props.isChecked,false);
    mounted.set('duration','900');mounted.input('duration').props.onBlur();mounted.render();
    assert.equal(sentenceArg(form(h.render(),'changeFigure').props.sentence,'next'),false);
    mounted.next().props.onChange(true);mounted.render();mounted.next().props.onChange(false);mounted.render();
    mounted.set('duration','1200');mounted.input('duration').props.onBlur();mounted.render();
    mounted.set('duration','900');mounted.input('duration').props.onBlur();mounted.render();
    button(h.render(),'应用到草稿').props.onClick();await flush();
    assert.equal(h.closed,1);assert.equal(h.document.getSnapshot().text,initial);
    assert.equal(h.document.getSnapshot().canUndo,false);assert.equal(h.writes,0);
    mounted.hooks.unmount();h.hooks.unmount();
  }
});

test('clearing figure timing overrides preserves the ID, base position, comment and source identity',async()=>{
  const initial='changeFigure:lin.svg -id=hero -right -duration=800 -enterDuration=0 -exitDuration=160 -next=false; 保留 ; @makenovel-node figure\r\nsay:当前句;';
  const h=await harness(initial,1),mounted=mountFigure(h);
  for(const key of Object.keys(figureLabels)) mounted.set(key,'');
  const active=new HTMLInputElement();active.blur=()=>mounted.input('exitDuration').props.onBlur();globalThis.document.activeElement=active;
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);
  const edited=h.document.getSnapshot().text,reopened=createDirectorSession(edited,1,h.document.getSnapshot().historyVersion);
  const figure=reopened.nodes.find(node=>node.command==='changeFigure').sentence;
  for(const key of Object.keys(figureLabels)) assert.equal(sentenceArg(figure,key),undefined,key);
  assert.equal(sentenceArg(figure,'id'),'hero');assert.equal(sentenceArg(figure,'right'),true);assert.equal(sentenceArg(figure,'next'),false);
  assert.match(edited,/; 保留 ; @makenovel-node figure\r\nsay:当前句;$/);
  mounted.hooks.unmount();h.hooks.unmount();h.document.undo();assert.equal(h.document.getSnapshot().text,initial);
});

test('figure timing IME and cancellation gates ignore late raw adapters and native submissions',async()=>{
  const h=await harness(),mounted=mountFigure(h),late=form(h.tree,'changeFigure').props;
  mounted.set('enterDuration','1800');mounted.input('enterDuration').props.onBlur();mounted.render();
  surface(h.render()).props.onCompositionStartCapture();button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,0);assert.equal(h.document.getSnapshot().text,source);assert.match(alerts(h.render()),/中文候选/);
  surface(h.render()).props.onCompositionEndCapture();await flush();
  button(h.render(),'应用到草稿').props.onClick();button(h.render(),'取消').props.onClick();
  assert.equal(late.onFigureTransitionSubmit({duration:'5000',enterDuration:'',exitDuration:'',next:false}),false);
  late.onSubmit('changeFigure:late.svg -id=other -right -duration=5000;');await flush();
  assert.equal(h.closed,1);assert.equal(h.document.getSnapshot().text,source);
  assert.equal(h.document.getSnapshot().canUndo,false);assert.equal(h.writes,0);assert.equal(h.holds,0);
  mounted.hooks.unmount();h.hooks.unmount();
});

test('unsupported figure timing stays read-only without exposing active duration controls',async()=>{
  for(const line of ['changeFigure:lin.svg -enter=custom;','changeFigure:none -left;',
    'changeFigure:lin.svg -left -right;','changeFigure:lin.svg -id=fig-left;',
    'changeFigure:lin.svg -duration=1.5;']) {
    const initial=`${line}\r\nsay:当前句;`,h=await harness(initial,1),props=form(h.tree,'changeFigure').props;
    assert.equal(props.figureTransition.editable,false,line);assert.ok(props.figureTransition.reason,line);
    const mounted=mountFigure(h);
    for(const key of Object.keys(figureLabels)) {
      const input=mounted.input(key);
      assert.ok(!input||input.props.disabled||collect(mounted.tree,node=>node.type==='fieldset'&&node.props.disabled).length,line);
    }
    assert.ok(JSON.stringify(mounted.tree).includes(props.figureTransition.reason));
    button(h.render(),'应用到草稿').props.onClick();await flush();
    assert.equal(h.document.getSnapshot().text,initial);assert.equal(h.document.getSnapshot().canUndo,false);
    mounted.hooks.unmount();h.hooks.unmount();
  }
});

test('read-only figure state preserves the existing native next and position initial values',async()=>{
  const initial='changeFigure:lin.svg -right -next=TRUE;\r\nsay:当前句;',h=await harness(initial,1),mounted=mountFigure(h);
  assert.equal(form(h.render(),'changeFigure').props.figureTransition.editable,false);
  mounted.render();assert.equal(mounted.next().props.isChecked,true);
  assert.equal(collect(mounted.tree,node=>node.type==='wheel')[0].props.value,'right');
  mounted.choose('other.svg');
  const current=form(h.render(),'changeFigure').props.sentence;
  assert.equal(sentenceArg(current,'next'),true);assert.equal(sentenceArg(current,'right'),true);
  mounted.hooks.unmount();h.hooks.unmount();
});

test('removed figure rows cannot return through late timing or native asset callbacks',async()=>{
  const initial='changeFigure:lin.svg -left -next; @makenovel-node figure\r\nsay:当前句;',h=await harness(initial,1);
  const late=form(h.tree,'changeFigure').props;
  structuralButton(h.tree,'移除立绘 · 左侧，',1).props.onClick();await flush();
  button(h.render(),'确认移除').props.onClick();await flush();
  assert.equal(late.onFigureTransitionSubmit({duration:'bad; injected',enterDuration:'',exitDuration:'',next:false}),false);
  assert.equal(late.onFigureTransitionSubmit({duration:'800',enterDuration:'',exitDuration:'',next:false}),false);
  late.onSubmit('changeFigure:late.svg -right;');
  assert.equal(form(h.render(),'changeFigure'),undefined);assert.equal(alerts(h.render()),'');
  button(h.render(),'应用到草稿').props.onClick();await flush();
  assert.equal(h.closed,1);assert.doesNotMatch(h.document.getSnapshot().text,/changeFigure:/);
  h.hooks.unmount();h.document.undo();assert.equal(h.document.getSnapshot().text,initial);
});
