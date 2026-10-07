const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { isEsm } = require('./module-kind.cjs');

const terreRoot = path.resolve(__dirname, '../../vendor/WebGAL_Terre');
const esbuild = require(require.resolve('esbuild', { paths: [terreRoot] }));
const transformerSource = fs.readFileSync(__filename);
const moduleKindSource = fs.readFileSync(path.join(__dirname, 'module-kind.cjs'));

module.exports = {
  getCacheKey(sourceText, sourcePath, options) {
    return createHash('sha256')
      .update(transformerSource)
      .update(moduleKindSource)
      .update(esbuild.version)
      .update(sourceText)
      .update(sourcePath)
      .update(String(isEsm(sourcePath)))
      .update(options.configString)
      .update(String(options.instrument))
      .digest('hex');
  },
  process(sourceText, sourcePath) {
    if (!isEsm(sourcePath)) return { code: sourceText };
    const result = esbuild.transformSync(sourceText, {
      sourcefile: sourcePath,
      loader: 'js',
      format: 'cjs',
      platform: 'node',
      target: 'node22',
      sourcemap: 'external',
      sourcesContent: true,
      // Jest's CJS VM cannot execute import(); keep the real dependency graph
      // while expressing deferred loading as Promise + require.
      supported: { 'dynamic-import': false },
      define: {
        'import.meta.url': JSON.stringify(pathToFileURL(sourcePath).href),
        'import.meta.filename': JSON.stringify(sourcePath),
        'import.meta.dirname': JSON.stringify(path.dirname(sourcePath)),
      },
    });
    return { code: result.code, map: result.map };
  },
};
