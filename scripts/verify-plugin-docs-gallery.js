'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { LOCALES } = require('./docs-screenshot-spec');
const { EXPECTED_OVERLAY_GUIDE_COUNT, OBS_DOCS_CAPTURE_LOCALES, buildObsCaptureInventory } = require('./lib/obs-docs-capture-inventory');
const { validateObsCaptureReport } = require('./verify-obs-docs-capture');

const ROOT = path.resolve(__dirname, '..');

function readJson(filePath, message) {
  assert.ok(fs.existsSync(filePath), message);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function verifyPluginDocsGallery({
  repoRoot = ROOT,
  outputDir = path.join(ROOT, 'docs', 'plugin-docs-qa'),
  baseUrl = process.env.OBS_DOCS_BASE_URL || 'http://127.0.0.1:3000'
} = {}) {
  const report = readJson(path.join(outputDir, 'report.json'), 'Missing plugin documentation QA report. Run npm run docs:gallery:build first.');
  assert.strictEqual(report.schemaVersion, 1, 'Plugin documentation QA report schema is stale');
  assert.strictEqual(report.reviewStatus, 'approved', 'Plugin documentation QA gallery is not approved by human visual review');
  assert.strictEqual(report.guides, 38, 'Plugin documentation QA gallery guide count is stale');
  assert.deepStrictEqual(report.locales, LOCALES, 'Plugin documentation QA gallery locales are stale');
  assert.strictEqual(report.screenshots, 860, 'Plugin documentation QA gallery screenshot count is incomplete');
  assert.strictEqual(report.receipts, 860, 'Plugin documentation QA gallery receipt count is incomplete');
  assert.strictEqual(report.obs?.expected, EXPECTED_OVERLAY_GUIDE_COUNT * OBS_DOCS_CAPTURE_LOCALES.length, 'Plugin documentation QA gallery OBS target count is stale');
  assert.strictEqual(report.obs?.records, report.obs.expected, 'Plugin documentation QA gallery OBS capture count is incomplete');
  assert.strictEqual(report.obs?.reportPath, 'screenshots/docs-obs-capture-report.json', 'Plugin documentation QA gallery does not reference an OBS capture report');

  const obsReport = readJson(
    path.join(repoRoot, report.obs.reportPath),
    'Plugin documentation QA gallery OBS capture report is missing'
  );
  const inventory = buildObsCaptureInventory(repoRoot, { baseUrl });
  const obs = validateObsCaptureReport({ repoRoot, report: obsReport, inventory });
  return { screenshots: report.screenshots, receipts: report.receipts, obs: obs.recordCount };
}

if (require.main === module) {
  const result = verifyPluginDocsGallery();
  console.log(`OK: approved plugin documentation QA gallery with ${result.screenshots} screenshots, ${result.receipts} receipts, and ${result.obs} OBS captures.`);
}

module.exports = { verifyPluginDocsGallery };
