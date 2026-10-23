import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function runPreviewStorageTests({ root, source, out, build, mocks }) {
  // Derive the fixture from the production initializer, as compatibility tests
  // do, without importing the browser renderer singleton into Node.
  const require = createRequire(path.join(root, 'vendor/WebGAL_Terre/package.json'));
  const ts = require('typescript');
  const stagePath = path.join(source, 'Core/Modules/stage/stageStateManager.ts');
  const stageSource = ts.createSourceFile(stagePath, await readFile(stagePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let initializer;
  stageSource.forEachChild((statement) => {
    if (!ts.isVariableStatement(statement)) return;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'initState') initializer = declaration.initializer;
    }
  });
  if (!initializer) throw new Error('Native stage initializer changed; review the fixture boundary.');
  const nativeStagePath = path.join(out, 'preview-native-stage.ts');
  await writeFile(nativeStagePath, `import { baseTransform } from ${JSON.stringify(path.join(source, 'Core/Modules/stage/stageInterface.ts'))};\nexport const initState = ${initializer.getText(stageSource)};\n`, 'utf8');
  const ctx = 'const h=globalThis.__previewStorageHarness;';
  const boundaries = Object.fromEntries(Object.entries(mocks).map(([key, value]) => [key, value.replaceAll('__restoreHarness', '__previewStorageHarness')]));
  // These are deliberately real, not the controlled validators used by the
  // general restore suite. A query-string reimport models a fresh browser page.
  delete boundaries['Core/controller/storage/makenovelCompatibility.ts'];
  delete boundaries['Core/util/syncWithEditor/runtime/previewSyncSceneCommand.ts'];
  boundaries['Core/Modules/stage/stageStateManager.ts'] = ctx +
    `export { initState } from ${JSON.stringify(nativeStagePath)}; export const stageStateManager=h.stage;`;
  boundaries['Core/parser/sceneParser.ts'] =
    'import NativeParser, { SCRIPT_CONFIG, ADD_NEXT_ARG_LIST } from "webgal-parser";' +
    'export { SCRIPT_CONFIG, ADD_NEXT_ARG_LIST }; export const scriptRegistry=Object.fromEntries(SCRIPT_CONFIG.map(config=>[config.scriptType,{...config,scriptFunction(){}}]));' +
    'export const WebgalParser=new NativeParser(()=>{},name=>name,ADD_NEXT_ARG_LIST,SCRIPT_CONFIG); export const sceneParser=(...args)=>WebgalParser.parse(...args);';
  boundaries['Core/controller/gamePlay/nextSentence.ts'] = ctx +
    'export const forward=options=>h.forward(options); export const commitForward=()=>h.commit(); export const continueSentence=()=>h.forward(); export const hasDeferredStoryContinue=()=>false;';
  boundaries['Core/util/syncWithEditor/runtime/targetTransformBaseline.ts'] =
    'export const cloneBaseTransform=()=>({}); export const isTargetTransformBaselineSyncSettled=()=>true; export const createTargetTransformBaselineManager=()=>({invalidateBaselines(){},applySyncSceneTarget(){},getReadyTransformBaselineOverride:()=>null});';
  boundaries['Core/util/syncWithEditor/runtime/previewSyncTransport.ts'] = ctx +
    'export const createPreviewSyncTransport=hooks=>{h.previewHooks=hooks;return {connect(){},send:message=>{h.previewMessages.push(message);h.onSend(message);return true;},isActiveSocket:()=>true,isSocketOpen:()=>true,ensureConnected(){},dispose(){}}};';
  const outfile = path.join(out, 'preview-storage-runtime.mjs');
  await build({
    entryPoints: [path.join(root, 'integrations/runtime-restore-tests/preview-storage-entry.ts')],
    outfile, bundle: true, format: 'esm', platform: 'node', target: 'node22',
    tsconfig: path.join(source, '../tsconfig.json'),
    plugins: [{
      name: 'preview-storage-boundaries',
      setup(api) {
        api.onResolve({ filter: /.*/ }, (args) => {
          const absolute = args.path.startsWith('@/') ? path.join(source, args.path.slice(2))
            : args.path.startsWith('.') ? path.resolve(args.resolveDir, args.path) : null;
          if (!absolute) return;
          const relative = path.relative(source, absolute).split(path.sep).join('/');
          const key = Object.hasOwn(boundaries, relative) ? relative : relative + '.ts';
          if (Object.hasOwn(boundaries, key)) return { path: key, namespace: 'preview-storage-stub' };
        });
        api.onLoad({ filter: /.*/, namespace: 'preview-storage-stub' }, (args) => ({
          loader: 'js', contents: boundaries[args.path], resolveDir: source,
        }));
      },
    }],
  });
  const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./preview-storage.test.mjs', import.meta.url))], {
    stdio: 'inherit', env: { ...process.env, PREVIEW_STORAGE_TEST_BUNDLE: outfile },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
