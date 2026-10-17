'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRendererFixtureManifest } = require('../renderer-fixture-contract');
const root = path.resolve(__dirname, '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/coordination/obs-104-spotlight-fixture.json'), 'utf8'));
test('Spotlight Chatter closure manifest pins only four locales and reviewed source dependencies', () => {
  const result = validateRendererFixtureManifest(root, manifest);
  assert.equal(result.files.length, 12);
  assert.equal(result.totalBytes, 275823);
  assert.equal(result.listenerStarted, false);
});
