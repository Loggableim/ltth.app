'use strict';

const fs = require('fs');
const path = require('path');

function createPluginDependencyResolverSource({ fixtureRoot, appNodeModules }) {
  if (typeof fixtureRoot !== 'string' || !path.isAbsolute(fixtureRoot)) {
    throw new TypeError('fixtureRoot must be an absolute path');
  }
  if (typeof appNodeModules !== 'string' || !path.isAbsolute(appNodeModules)) {
    throw new TypeError('appNodeModules must be an absolute path');
  }

  return `'use strict';\n` +
    `const Module = require('module');\n` +
    `const path = require('path');\n` +
    `const fixtureRoot = ${JSON.stringify(path.resolve(fixtureRoot))};\n` +
    `const appNodeModules = ${JSON.stringify(path.resolve(appNodeModules))};\n` +
    `const originalNodeModulePaths = Module._nodeModulePaths;\n` +
    `Module._nodeModulePaths = function (from) {\n` +
    `  const paths = originalNodeModulePaths.call(this, from);\n` +
    `  const relative = path.relative(fixtureRoot, path.resolve(from));\n` +
    `  const insideFixture = relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));\n` +
    `  if (insideFixture && !paths.includes(appNodeModules)) paths.unshift(appNodeModules);\n` +
    `  return paths;\n` +
    `};\n`;
}

function writePluginDependencyResolver({ profileDir, fixtureRoot, appNodeModules }) {
  if (typeof profileDir !== 'string' || !path.isAbsolute(profileDir)) {
    throw new TypeError('profileDir must be an absolute path');
  }
  const resolverPath = path.join(path.resolve(profileDir), 'docs-capture-plugin-dependency-resolver.cjs');
  const source = createPluginDependencyResolverSource({ fixtureRoot, appNodeModules });
  fs.writeFileSync(resolverPath, source, { encoding: 'utf8', flag: 'wx' });
  return resolverPath;
}

module.exports = { createPluginDependencyResolverSource, writePluginDependencyResolver };
