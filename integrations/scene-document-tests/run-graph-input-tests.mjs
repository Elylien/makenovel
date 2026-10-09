import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const { build } = require('esbuild');
const out = path.join(root, '.scratch/graph-input-tests');
await mkdir(out, { recursive: true });
const source = path.join(root, 'vendor/WebGAL_Terre/packages/origine2/src/pages/editor');
const mocks = {
  axios: `export default {post:()=>{throw new Error("Unexpected test network request");},isAxiosError:()=>false};`,
  react: `const h=()=>globalThis.__graphHooks;
    export const useRef=x=>h().ref(x), useState=x=>h().state(x), useMemo=(fn,d)=>h().memo(fn,d), useCallback=(fn,d)=>h().memo(()=>fn,d);
    export const useEffect=(fn,d)=>h().effect(fn,d,false), useLayoutEffect=(fn,d)=>h().effect(fn,d,true);
    export const memo=(fn,compare)=>{fn.compare=compare; return fn;};`,
  'react/jsx-runtime': `export const jsx=(type,props,key)=>({type,props:props??{},key}); export const jsxs=jsx; export const Fragment='fragment';`,
  '@lingui/macro': `export const t=(text,...args)=>text.reduce((s,v,i)=>s+v+(args[i]??''),'');`,
  '@fluentui/react-components': `export const Button='button', Input='input', Dropdown='dropdown',Option='option',Dialog='dialog',DialogActions='dialog-actions',DialogBody='dialog-body',DialogContent='dialog-content',DialogSurface='dialog-surface',DialogTitle='dialog-title';`,
  '@icon-park/react': `export const DeleteFive='icon',Sort='icon',DownOne='icon',RightOne='icon',Play='icon',LinkOne='icon';`,
  '@tanstack/react-virtual': `export const useVirtualizer=options=>globalThis.__graphVirtualizer?.(options)??(({count})=>({getVirtualItems:()=>Array.from({length:count},(_,index)=>({index,start:0,size:100})),getTotalSize:()=>100,measureElement:()=>{},scrollToIndex:()=>{}}))(options);`,
  '@hello-pangea/dnd': `export const DragDropContext='drag-context'; const provided={innerRef:()=>{},draggableProps:{},dragHandleProps:{},droppableProps:{}}; export const Droppable=p=>p.children(provided),Draggable=p=>p.children(provided);`,
  './SentenceEditor': `export const sentenceEditorConfig=[]; export const sentenceEditorDefault={component:'sentence-editor', title:()=>''};`,
  './components/DirectorPanel': `export const DirectorPanel='director-panel';`,
  '@/store/useEditorStore': `export default {use:{subPage:()=>"test",updateExpand:()=>index=>globalThis.__figureExpand?.(index)}};`,
  '@/pages/editor/GraphicalEditor/components/TerrePanel': `export const TerrePanel='shared-panel';`,
  '@/pages/editor/GraphicalEditor/components/SearchableCascader': `export default 'cascader';`,
  '@/hooks/useEaseTypeOptions': `export const useEaseTypeOptions=()=>new Map();`,
  '@/utils/editorPreviewClient': `export const EditorPreviewClient={setEffect:()=>{throw new Error('Unexpected preview');}};`,
  '../components/OptionCategory': `export const OptionCategory='category';`,
  '../components/AssetPreview': `export const AssetPreview='asset-preview';`,
  '@/hooks/useGlobalEffectEditor': `export const useGlobalEffectEditor=()=>payload=>globalThis.__figureEffect?.(payload);`,
  '../components/IgnoreDefaultOption': `export const IgnoreDefaultOption='ignore-default';`,
  '../components/FigureAssociatedAnimationOptions': `export const useFigureAssociatedAnimation=()=>({animationFlag:{value:""},submitArgs:()=>[]}),FigureAssociatedAnimationOptions='associated-animation';`,
  '../SentenceEditor': `export const sentenceEditorConfig=Array.from({length:200},(_,type)=>({type,component:'director-editor'}));`,
  '../../SceneDocument/sceneDocumentRegistry': `export const holdScenePreview=path=>globalThis.__directorHold(path);`,
  '../SceneDocument/useSceneDocument': `export const useSceneDocument=()=>({document:globalThis.__graphDocument,state:globalThis.__graphDocument.getSnapshot()});`,
  '../SceneDocument/DocumentBar': `export const DocumentBar='document-bar';`,
  '@/runtime/WG_ORIGINE_RUNTIME': `export const editorLineHolder={getSceneLine:()=>1,recordSceneEditingLine:(...args)=>globalThis.__graphRecordLine?.(...args)};`,
  '../../../utils/editorPreviewClient': `export const EditorPreviewClient={sendSyncScene:(...args)=>globalThis.__graphPreview?.(...args)};`,
  '../../../utils/logger': `export const logger={info:()=>{}};`,
  '@/utils/eventBus': `export const eventBus={on:()=>{},off:()=>{},emit:(...args)=>globalThis.__graphEvent?.(...args)};`,
  './components/AddSentence': `export const AddSentenceButton='button',AddSentenceDialog='dialog',addSentenceType={forward:1};`,
  './components/SentenceArgOption': `export default 'arg-option';`,
  './components/TerrePanel': `export const GlobalTerrePanel=()=>null;`,
  '../../ChooseFile/ChooseFile': `export default 'choose-file';`,
  '@/components/terreToggle/TerreToggle': `export default 'toggle';`,
  '../../../../components/terreToggle/TerreToggle': `export default 'toggle';`,
  '../components/CommonOption': `export default 'option';`,
  '../components/CommonTips': `export default 'tips';`,
  '@/pages/editor/GraphicalEditor/components/WheelDropdown': `export default 'wheel';`,
};
await build({ entryPoints: {
  graph: path.join(source,'GraphicalEditor/GraphicalEditor.tsx'),
  say: path.join(source,'GraphicalEditor/SentenceEditor/Say.tsx'),
  wheel: path.join(source,'GraphicalEditor/components/WheelDropdown.tsx'),
  document: path.join(source,'SceneDocument/sceneDocument.ts'),
  director: path.join(source,'GraphicalEditor/components/DirectorPanel.tsx'),
  directorSession: path.join(source,'SceneDocument/directorSession.ts'),
  directorNavigation: path.join(source,'SceneDocument/directorNavigation.ts'),
  wait: path.join(source,'GraphicalEditor/SentenceEditor/Wait.tsx'),
  directorTiming: path.join(source,'SceneDocument/directorTiming.ts'),
  bgm: path.join(source,'GraphicalEditor/SentenceEditor/Bgm.tsx'),
  figure: path.join(source,'GraphicalEditor/SentenceEditor/ChangeFigure.tsx'),
  figureDiff: path.join(source,'GraphicalEditor/SentenceEditor/ChangeFigureDiff.tsx'),
  bg: path.join(source,'GraphicalEditor/SentenceEditor/ChangeBg.tsx'),
  previewRegistry: path.join(source,'SceneDocument/sceneDocumentRegistry.ts'),
}, outdir: out, outExtension:{'.js':'.mjs'}, bundle:true, platform:'node',format:'esm',target:'node22',define:{'import.meta.env.DEV':'false'},
plugins:[{name:'graph-event-boundary',setup(api){
  api.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:args.path.endsWith('.scss')?{path:'styles',namespace:'mock'}:undefined);
  api.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='styles'?'export default {};':mocks[args.path],loader:'js'}));
}}] });
const run=spawnSync(process.execPath,['--test',fileURLToPath(new URL('./graph-input-boundary.test.mjs',import.meta.url)),fileURLToPath(new URL('./director-panel-boundary.test.mjs',import.meta.url)),fileURLToPath(new URL('./graph-source-navigation.test.mjs',import.meta.url)),fileURLToPath(new URL('./director-timing.test.mjs',import.meta.url))],{stdio:'inherit',env:{...process.env,GRAPH_INPUT_TEST_BUNDLE:out}});
if(run.error)throw run.error;
process.exitCode=run.status??1;
