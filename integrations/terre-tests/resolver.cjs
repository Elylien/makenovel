const { packageType } = require('./module-kind.cjs');

module.exports = (request, options) => {
  // Transformed ESM retains its original import condition. For example,
  // globby -> unicorn-magic exposes an import-only Node entrypoint.
  const conditions = packageType(options.basedir) === 'module'
    ? [...(options.conditions || []).filter((value) => value !== 'require'), 'import']
    : options.conditions;
  return options.defaultResolver(request, { ...options, conditions });
};
