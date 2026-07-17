'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { assertPngIsVisible } = require('./capture-obs-docs-screenshot');

const ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'screenshots', 'docs-obs-capture-report.json');

function captureKey(record) {
  return `${record.plugin}:${record.locale}`;
}

function assertLocalOverlayUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw new Error('OBS capture overlay URL is not a localhost HTTP URL');
  }
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname), 'OBS capture overlay URL is not a localhost HTTP URL');
}

function assertPngEvidence(record, { pathKey, hashKey, colorsKey, contrastKey, label }, repoRoot) {
  assert.ok(typeof record[pathKey] === 'string' && record[pathKey].startsWith('screenshots/docs/obs/'), `OBS ${label} screenshot evidence is invalid`);
  const screenshot = path.join(repoRoot, record[pathKey]);
  assert.ok(fs.existsSync(screenshot), `OBS ${label} screenshot evidence is missing: ${record[pathKey]}`);
  const image = fs.readFileSync(screenshot);
  const hash = crypto.createHash('sha256').update(image).digest('hex');
  assert.strictEqual(record[hashKey], hash, `OBS ${label} screenshot hash changed: ${record[pathKey]}`);
  const visible = assertPngIsVisible(image);
  assert.strictEqual(record[colorsKey], visible.colors, `OBS ${label} screenshot color evidence drifted`);
  assert.strictEqual(record[contrastKey], visible.contrast, `OBS ${label} screenshot contrast evidence drifted`);
}

function assertRecord(record, target, repoRoot) {
  assert.strictEqual(record.sceneName, target.sceneName, 'OBS docs capture used a non-tutorial scene');
  assert.strictEqual(record.sourceName, target.sourceName, 'OBS docs capture used a non-temporary source');
  assert.strictEqual(record.overlayUrl, target.overlayUrl, 'OBS capture overlay URL does not match the declared target');
  assertLocalOverlayUrl(record.overlayUrl);
  assert.strictEqual(record.width, target.width, 'OBS capture width does not match the declared target');
  assert.strictEqual(record.height, target.height, 'OBS capture height does not match the declared target');
  assert.strictEqual(record.visible, true, 'OBS temporary source was not visible');
  assert.strictEqual(record.nonEmpty, true, 'OBS screenshot was blank');
  assert.strictEqual(record.sourceVisible, true, 'OBS temporary source screenshot was not visible');
  assert.strictEqual(record.sourceNonEmpty, true, 'OBS temporary source screenshot was blank');
  assert.strictEqual(record.restored, true, 'OBS tutorial scene was not restored');
  assert.strictEqual(record.temporarySceneItemRemoved, true, 'OBS temporary source scene item was not removed');
  assert.strictEqual(record.temporaryInputRemoved, true, 'OBS temporary source input was not removed');
  assert.ok(Array.isArray(record.outputChecks), 'OBS capture has no output-state evidence');
  assert.deepStrictEqual(record.outputChecks.map((check) => check.stage), ['before-mutation', 'before-screenshots', 'before-cleanup'], 'OBS capture output-state evidence is incomplete');
  assert.ok(record.outputChecks.every((check) => check.streamActive === false && check.recordActive === false), 'OBS capture ran while stream or recording output was active');
  assert.deepStrictEqual(record.initialSourceNames, [], 'OBS tutorial scene was not empty before capture');
  assert.deepStrictEqual(record.restoredSourceNames, [], 'OBS tutorial scene was not empty after capture');
  assert.deepStrictEqual(record.initialSceneItems, [], 'OBS tutorial scene-item baseline was not empty');
  assert.deepStrictEqual(record.restoredSceneItems, [], 'OBS tutorial scene-item state changed after capture');
  assertPngEvidence(record, {
    pathKey: 'screenshotPath',
    hashKey: 'sha256',
    colorsKey: 'colors',
    contrastKey: 'contrast',
    label: 'scene'
  }, repoRoot);
  assertPngEvidence(record, {
    pathKey: 'sourceScreenshotPath',
    hashKey: 'sourceSha256',
    colorsKey: 'sourceColors',
    contrastKey: 'sourceContrast',
    label: 'temporary-source'
  }, repoRoot);
}

function validateObsCaptureReport({ repoRoot = ROOT, report, inventory }) {
  assert.ok(report && typeof report === 'object', 'OBS capture report is invalid');
  assert.strictEqual(report.schemaVersion, 2, 'OBS capture report schema is stale');
  assert.ok(Array.isArray(inventory) && inventory.length > 0, 'OBS capture inventory is empty');
  assert.strictEqual(report.targetCount, inventory.length, 'OBS capture report target count is stale');
  assert.ok(Array.isArray(report.records), 'OBS capture report records are invalid');
  assert.strictEqual(report.records.length, inventory.length, 'OBS capture report does not cover every declared overlay target');

  const expected = new Map(inventory.map((target) => [captureKey(target), target]));
  const seen = new Set();
  for (const record of report.records) {
    const key = captureKey(record);
    assert.ok(expected.has(key), `Unexpected OBS capture record: ${key}`);
    assert.ok(!seen.has(key), `Duplicate OBS capture record: ${key}`);
    seen.add(key);
    assertRecord(record, expected.get(key), repoRoot);
  }
  assert.strictEqual(seen.size, expected.size, 'OBS capture report is missing a declared overlay-language target');
  return { recordCount: seen.size };
}

function main() {
  assert.ok(fs.existsSync(REPORT_PATH), 'Missing OBS capture report. Run npm run docs:obs:capture with explicit OBS_DOCS_CAPTURE_ALLOW=yes.');
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const { buildObsCaptureInventory } = require('./lib/obs-docs-capture-inventory');
  const baseUrl = process.env.OBS_DOCS_BASE_URL || 'http://127.0.0.1:3000';
  const inventory = buildObsCaptureInventory(ROOT, { baseUrl });
  const result = validateObsCaptureReport({ repoRoot: ROOT, report, inventory });
  console.log(`OK: ${result.recordCount} verified non-streaming OBS documentation captures.`);
}

if (require.main === module) main();

module.exports = { validateObsCaptureReport };
