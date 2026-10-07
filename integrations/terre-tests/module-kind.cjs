const fs = require('node:fs');
const path = require('node:path');

const packageTypes = new Map();

function packageType(directory) {
  if (packageTypes.has(directory)) return packageTypes.get(directory);
  const manifest = path.join(directory, 'package.json');
  let type;
  if (fs.existsSync(manifest)) {
    type = JSON.parse(fs.readFileSync(manifest, 'utf8')).type || 'commonjs';
  } else {
    const parent = path.dirname(directory);
    type = parent === directory ? 'commonjs' : packageType(parent);
  }
  packageTypes.set(directory, type);
  return type;
}

function isEsm(filename) {
  return filename.endsWith('.mjs') ||
    (!filename.endsWith('.cjs') && packageType(path.dirname(filename)) === 'module');
}

module.exports = { packageType, isEsm };
