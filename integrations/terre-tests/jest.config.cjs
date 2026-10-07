const path = require('node:path');

const terreRoot = path.resolve(__dirname, '../../vendor/WebGAL_Terre');
const backendRoot = path.join(terreRoot, 'packages/terre2');
const upstream = require(path.join(backendRoot, 'package.json')).jest;

// Preserve the upstream suite selection, environment and coverage settings.
module.exports = {
  ...upstream,
  rootDir: path.resolve(backendRoot, upstream.rootDir),
  coverageDirectory: path.resolve(backendRoot, upstream.rootDir, upstream.coverageDirectory),
  cacheDirectory: path.resolve(__dirname, '../../.local/terre-jest-cache'),
  resolver: path.join(__dirname, 'resolver.cjs'),
  transform: {
    '^.+\\.ts$': [
      require.resolve('ts-jest', { paths: [backendRoot] }),
      { tsconfig: path.join(backendRoot, 'tsconfig.json') },
    ],
    '^.+\\.[cm]?js$': path.join(__dirname, 'esm-transformer.cjs'),
  },
  // The JS transformer passes CommonJS through unchanged and converts only
  // actual ESM packages. This includes nested ESM dependencies of trash.
  transformIgnorePatterns: [],
};
