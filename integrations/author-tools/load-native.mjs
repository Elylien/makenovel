import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
let pending;
/** Compile the actual shared Terre contracts, never a second script parser. */
export function loadNative() {
  pending ??= (async () => {
    const require = createRequire(new URL('../../vendor/WebGAL_Terre/package.json', import.meta.url));
    const { build } = require('esbuild');
    const result = await build({
      entryPoints: [fileURLToPath(new URL('./native.ts', import.meta.url))],
      alias: { 'webgal-parser': require.resolve('webgal-parser') },
      bundle: true, platform: 'node', format: 'esm', target: 'node22', write: false,
    });
    const bytes = result.outputFiles[0].contents;
    const hash = createHash('sha256').update(bytes).digest('hex');
    const directory = path.join(root, '.scratch/author-tools');
    await mkdir(directory, { recursive: true });
    const filename = path.join(directory, `native-${hash}.mjs`);
    try { await writeFile(filename, bytes, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!Buffer.from(bytes).equals(await readFile(filename))) {
        throw Object.assign(new Error('The cached native bundle differs from its content hash; preserve it for inspection before retrying.'), { code: 'NATIVE_CACHE_MISMATCH' });
      }
    }
    return import(pathToFileURL(filename).href);
  })();
  return pending;
}
