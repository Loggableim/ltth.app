'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildDocsSpec, LOCALES } = require('./docs-screenshot-spec');
const { assertCaptureEvidence } = require('./lib/capture-receipt');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'screenshots', 'docs-capture-manifest.json');

function receiptKey(locale, id) {
  return `${locale}:${id}`;
}

function validateDocsCaptureReceipts({ manifest, assets, locales }) {
  assert.ok(manifest && Array.isArray(manifest.outputs), 'Documentation capture manifest is invalid');
  const expected = new Map();
  for (const locale of locales) {
    for (const asset of assets) expected.set(receiptKey(locale, asset.id), { locale, asset });
  }
  const seen = new Set();

  for (const output of manifest.outputs) {
    const key = receiptKey(output.locale, output.id);
    if (!expected.has(key)) continue;
    assert.ok(!seen.has(key), `Duplicate CaptureReceipt: ${key}`);
    seen.add(key);
    const { locale, asset } = expected.get(key);
    const receipt = output.receipt;
    assert.ok(receipt, `${key} is missing a CaptureReceipt`);
    assert.strictEqual(receipt.schemaVersion, 2, `${key} uses a stale CaptureReceipt schema`);
    assert.strictEqual(receipt.plugin, asset.guideId, `${key} receipt plugin drifted`);
    assert.strictEqual(receipt.language, locale, `${key} receipt language drifted`);
    assert.strictEqual(receipt.route, asset.route, `${key} receipt route drifted`);
    assert.deepStrictEqual(receipt.operations, asset.workflow.operations, `${key} receipt operations drifted`);
    assert.strictEqual(receipt.screenshotPath, output.path, `${key} receipt screenshot path drifted`);
    assert.strictEqual(receipt.sha256, output.sha256, `${key} receipt screenshot hash drifted`);
    assertCaptureEvidence({ network: receipt.network, consoleErrors: receipt.console });
    assert.ok(Array.isArray(receipt.blockedNetwork), `${key} receipt is missing blocked-network evidence`);
    assert.strictEqual(receipt.blockedNetwork.length, 0, `${key} recorded a blocked external network attempt`);
    assert.ok(Array.isArray(receipt.postconditions) && receipt.postconditions.length > 0, `${key} receipt has no postconditions`);
    assert.ok(receipt.postconditions.every((condition) => condition.passed === true), `${key} receipt has a failed postcondition`);
    assert.ok(Array.isArray(receipt.interactions), `${key} receipt has no interaction evidence`);
  }
  assert.strictEqual(seen.size, expected.size, 'Documentation capture receipts do not cover every guide action and locale');
  return { receiptCount: seen.size };
}

function main() {
  assert.ok(fs.existsSync(MANIFEST_PATH), 'Missing documentation capture manifest. Run npm run docs:screenshots first.');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const spec = buildDocsSpec(ROOT);
  const result = validateDocsCaptureReceipts({ manifest, assets: spec.assets, locales: LOCALES });
  console.log(`OK: ${result.receiptCount} verified documentation CaptureReceipts.`);
}

if (require.main === module) main();

module.exports = { validateDocsCaptureReceipts };
