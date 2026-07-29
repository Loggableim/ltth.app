const assert = require('node:assert/strict');
const test = require('node:test');

test('declares three twelve-cell atlases with the required chroma key', () => {
  const manifest = require('../assets/atlas-manifest.json');

  assert.equal(manifest.columns, 3);
  assert.equal(manifest.rows, 4);
  assert.equal(manifest.keyColor, '#00ff00');
  assert.deepEqual(Object.keys(manifest.atlases).sort(), ['eyes', 'heads', 'mouths']);
});
