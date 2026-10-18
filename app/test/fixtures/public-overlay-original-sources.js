'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createHash } = require('crypto');

// Canonical LF source pins. Fixtures are original code, not mirrored behavior.
const SOURCES = Object.freeze({
  adapter: { file: 'public-overlay-socket-adapter-fde29.source.txt', sha256: '5a6d38e2242cf66f1a83349eeeab0c97120df96a717e9b1b059a4a3aa7913055', origin: 'fde29a99d95222e8f441ffedc78df43e15ba0f06:app/modules/public-overlay-socket-adapter.js' },
  ownerPolicy7eb: { file: 'public-overlay-release-policy-7eb0.source.txt', sha256: 'a00f30fe5618eedc3aff6d8ea2f850b54ba230267ce454ba44ffe18c7fbce3ca', origin: '7eb0d1ae candidate original 22-line owner helper' }
});

function loadOriginalSource(name) {
  const entry = SOURCES[name];
  if (!entry) throw new Error('Unknown original fixture');
  const source = fs.readFileSync(path.join(__dirname, entry.file), 'utf8').replace(/\r\n/g, '\n');
  if (createHash('sha256').update(source).digest('hex') !== entry.sha256) {
    throw new Error('Original source fixture pin mismatch');
  }
  return source;
}

function loadOriginalAdapter() {
  const fixtureModule = { exports: {} };
  vm.runInNewContext(loadOriginalSource('adapter'), {
    module: fixtureModule, Set,
    require(name) {
      if (name === './public-overlay-registry') return require('../../modules/public-overlay-registry');
      if (name === './public-overlay-payload-projection') return require('../../modules/public-overlay-payload-projection');
      throw new Error('Unexpected original adapter dependency');
    }
  }, { filename: SOURCES.adapter.file });
  return fixtureModule.exports;
}

module.exports = { loadOriginalSource, loadOriginalAdapter };
