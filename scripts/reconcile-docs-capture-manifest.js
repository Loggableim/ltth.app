'use strict';

// A manifest is normally written only by the isolated capture runner. This
// narrow reconciliation path is for an inventory shrink: it keeps captures
// only when every surviving step definition is byte-for-byte unchanged and
// removes outputs that belong to guides no longer present in the manifests.

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { LOCALES, buildDocsSpec } = require('./docs-screenshot-spec');

const ROOT = path.resolve(__dirname, '..');
const manifestPath = path.join(ROOT, 'screenshots', 'docs-capture-manifest.json');
const spec = buildDocsSpec(ROOT);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function specHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify({ version: value.version, assets: value.assets })).digest('hex');
}

const expectedById = new Map(spec.assets.map((asset) => [asset.id, asset]));
const previousAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
for (const asset of previousAssets) {
  const expected = expectedById.get(asset.id);
  if (expected) assert.deepStrictEqual(asset, expected, `Capture definition changed for ${asset.id}; recapture it instead.`);
}
for (const asset of spec.assets) {
  assert.ok(previousAssets.some((previous) => previous.id === asset.id), `No prior capture definition exists for ${asset.id}; capture it instead.`);
}

const expectedOutputKeys = new Set();
for (const locale of LOCALES) {
  for (const asset of spec.assets) expectedOutputKeys.add(`${locale}:${asset.id}`);
}
const outputs = (manifest.outputs || []).filter((output) => expectedOutputKeys.has(`${output.locale}:${output.id}`));
assert.strictEqual(outputs.length, expectedOutputKeys.size, 'Some surviving captures are missing; capture the incomplete matrix instead.');
assert.strictEqual(new Set(outputs.map((output) => `${output.locale}:${output.id}`)).size, outputs.length, 'Duplicate capture output found.');
for (const output of outputs) {
  const asset = expectedById.get(output.id);
  const relative = asset.canonical.replace(/^\/screenshots\//, '');
  const image = path.join(ROOT, 'screenshots', output.locale === 'en' ? relative : path.join(output.locale, relative));
  assert.ok(fs.existsSync(image), `Missing surviving screenshot: ${image}`);
  const bytes = fs.readFileSync(image);
  output.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  output.bytes = bytes.length;
}

const nextManifest = {
  ...manifest,
  ...spec,
  specHash: specHash(spec),
  requestedLocales: LOCALES,
  requestedIds: spec.assets.map((asset) => asset.id),
  outputs,
  failures: [],
  reconciledAt: new Date().toISOString(),
  reconciliation: 'Removed captures only for tutorial definitions absent from the current manifest inventory.'
};
fs.writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');
console.log(`Reconciled ${outputs.length} captures for ${spec.assets.length} current tutorial actions.`);
