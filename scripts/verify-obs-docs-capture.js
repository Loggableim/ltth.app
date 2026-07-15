'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const reportPath = path.join(ROOT, 'screenshots', 'docs-obs-capture-report.json');

assert.ok(fs.existsSync(reportPath), 'Missing OBS capture report. Run scripts/capture-obs-docs-screenshot.js with explicit OBS_DOCS_CAPTURE_ALLOW=yes.');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
assert.strictEqual(report.schemaVersion, 1, 'OBS capture report schema is stale');
assert.ok(Array.isArray(report.records) && report.records.length > 0, 'OBS capture report has no records');

for (const record of report.records) {
  assert.strictEqual(record.sceneName, 'tutorial', 'OBS docs capture used a non-tutorial scene');
  assert.strictEqual(record.sourceName, 'LTTH Docs Capture', 'OBS docs capture used a non-temporary source');
  assert.strictEqual(record.visible, true, 'OBS temporary source was not visible');
  assert.strictEqual(record.nonEmpty, true, 'OBS screenshot was blank');
  assert.strictEqual(record.sourceVisible, true, 'OBS temporary source screenshot was not visible');
  assert.strictEqual(record.sourceNonEmpty, true, 'OBS temporary source screenshot was blank');
  assert.strictEqual(record.restored, true, 'OBS tutorial scene was not restored');
  assert.strictEqual(record.temporarySceneItemRemoved, true, 'OBS temporary source scene item was not removed');
  assert.strictEqual(record.temporaryInputRemoved, true, 'OBS temporary source input was not removed');
  assert.strictEqual(record.streamActive, false, 'OBS capture ran while stream output was active');
  assert.strictEqual(record.recordActive, false, 'OBS capture ran while recording output was active');
  assert.deepStrictEqual([...record.restoredSourceNames].sort(), [...record.initialSourceNames].sort(), 'OBS source list changed after capture');
  assert.deepStrictEqual(record.restoredSceneItems, record.initialSceneItems, 'OBS tutorial scene-item state changed after capture');
  assert.ok(record.colors > 1 && record.contrast > 0, 'OBS screenshot has no visible contrast');
  assert.ok(record.sourceColors > 1 && record.sourceContrast > 0, 'OBS temporary source screenshot has no visible contrast');
  const screenshot = path.join(ROOT, record.screenshotPath);
  assert.ok(fs.existsSync(screenshot), `OBS screenshot is missing: ${record.screenshotPath}`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(screenshot)).digest('hex');
  assert.strictEqual(record.sha256, hash, `OBS screenshot hash changed: ${record.screenshotPath}`);
}

console.log(`OK: ${report.records.length} verified non-streaming OBS documentation capture(s).`);
