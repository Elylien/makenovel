import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
const { build } = require('esbuild');
const ts = require('typescript');
const sourceRoot = path.join(projectRoot, 'vendor/WebGAL/packages/webgal/src');
const bundleRoot = path.join(projectRoot, '.scratch/save-compatibility-tests/bundle');
await mkdir(bundleRoot, { recursive: true });

// Read the real native initializer, rather than inventing a similarly shaped
// stage fixture or importing the browser/Pixi singleton tree into Node.
const stageSource = path.join(sourceRoot, 'Core/Modules/stage/stageStateManager.ts');
const source = ts.createSourceFile(stageSource, await readFile(stageSource, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let initializer;
source.forEachChild((statement) => {
  if (!ts.isVariableStatement(statement)) return;
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name) && declaration.name.text === 'initState') initializer = declaration.initializer;
  }
});
if (!initializer) throw new Error('Native initState initializer was not found; update the fixture boundary deliberately.');
const stageEntry = path.join(bundleRoot, 'native-stage-entry.ts');
await writeFile(stageEntry, `import { baseTransform } from ${JSON.stringify(path.join(sourceRoot, 'Core/Modules/stage/stageInterface.ts'))};\nexport const initState = ${initializer.getText(source)};\n`, 'utf8');
await build({
  entryPoints: {
    compatibility: path.join(sourceRoot, 'Core/controller/storage/makenovelCompatibility.ts'),
    nativeStage: stageEntry,
  },
  outdir: bundleRoot,
  outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
});
const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./compatibility.test.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, SAVE_COMPATIBILITY_TEST_BUNDLE: bundleRoot },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
