'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildDocsSpec, LOCALES } = require('./docs-screenshot-spec');
const { classifyCurrentCaptures } = require('./build-plugin-docs-gallery');
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
  assert.strictEqual(report.schemaVersion, 2, 'Plugin documentation QA report schema is stale');
  assert.strictEqual(report.reviewStatus, 'approved', 'Plugin documentation QA gallery is not approved by human visual review');
  const spec = buildDocsSpec(repoRoot);
  const expectedCaptures = spec.assets.length * LOCALES.length;
  assert.strictEqual(report.guides, new Set(spec.assets.map((asset) => asset.guideId)).size, 'Plugin documentation QA gallery guide count is stale');
  assert.deepStrictEqual(report.locales, LOCALES, 'Plugin documentation QA gallery locales are stale');
  assert.strictEqual(report.expected, expectedCaptures, 'Plugin documentation QA gallery expected capture count is stale');
  assert.strictEqual(report.screenshots, expectedCaptures, 'Plugin documentation QA gallery current screenshot count is incomplete');
  assert.strictEqual(report.receipts, expectedCaptures, 'Plugin documentation QA gallery current receipt count is incomplete');
  assert.strictEqual(report.currentValid, expectedCaptures, 'Plugin documentation QA gallery has invalid or missing current receipts');
  assert.strictEqual(report.stale, 0, 'Plugin documentation QA gallery contains stale receipts');
  assert.strictEqual(report.missing, 0, 'Plugin documentation QA gallery is missing expected captures');
  assert.strictEqual(report.invalid, 0, 'Plugin documentation QA gallery contains invalid current receipts');
  assert.strictEqual(report.incomplete, 0, 'Plugin documentation QA gallery coverage is incomplete');
  assert.strictEqual(report.captureFailures, 0, 'Plugin documentation QA gallery carries capture failures');
  assert.strictEqual(report.manifestVersionMatches, true, 'Plugin documentation QA gallery manifest version is stale');
  assert.strictEqual(report.manifestSpecHashMatches, true, 'Plugin documentation QA gallery manifest was not recorded from the current spec');
  assert.strictEqual(report.coverageComplete, true, 'Plugin documentation QA gallery has not passed strict receipt completeness');

  const captureManifest = readJson(
    path.join(repoRoot, 'screenshots', 'docs-capture-manifest.json'),
    'Plugin documentation capture manifest is missing'
  );
  const currentCoverage = classifyCurrentCaptures({
    repoRoot,
    manifest: captureManifest,
    spec: { ...spec, locales: LOCALES }
  });
  assert.strictEqual(currentCoverage.complete, true, 'Current documentation capture manifest is incomplete');
  assert.strictEqual(report.rawOutputs, currentCoverage.rawOutputs, 'Plugin documentation QA gallery raw manifest count is stale');
  assert.strictEqual(report.currentValid, currentCoverage.validCurrent, 'Plugin documentation QA gallery current receipt count is stale');
  assert.strictEqual(report.stale, currentCoverage.stale, 'Plugin documentation QA gallery stale receipt count is stale');
  assert.strictEqual(report.missing, currentCoverage.missing, 'Plugin documentation QA gallery missing receipt count is stale');
  assert.strictEqual(report.invalid, currentCoverage.invalid, 'Plugin documentation QA gallery invalid receipt count is stale');
  assert.strictEqual(report.incomplete, currentCoverage.incomplete, 'Plugin documentation QA gallery incomplete count is stale');
  assert.deepStrictEqual(report.invalidDetails, currentCoverage.invalidDetails, 'Plugin documentation QA gallery invalid receipt details are stale');
  assert.strictEqual(report.obs?.expected, EXPECTED_OVERLAY_GUIDE_COUNT * OBS_DOCS_CAPTURE_LOCALES.length, 'Plugin documentation QA gallery OBS target count is stale');
  assert.strictEqual(report.obs?.records, report.obs.expected, 'Plugin documentation QA gallery OBS capture count is incomplete');
  assert.strictEqual(report.obs?.reportPath, 'screenshots/docs-obs-capture-report.json', 'Plugin documentation QA gallery does not reference an OBS capture report');

  const obsReport = readJson(
    path.join(repoRoot, report.obs.reportPath),
    'Plugin documentation QA gallery OBS capture report is missing'
  );
  const inventory = buildObsCaptureInventory(repoRoot, { baseUrl });
  const obs = validateObsCaptureReport({ repoRoot, report: obsReport, inventory });
  return { screenshots: report.screenshots, receipts: report.receipts, stale: report.stale, missing: report.missing, obs: obs.recordCount };
}

if (require.main === module) {
  const result = verifyPluginDocsGallery();
  console.log(`OK: approved plugin documentation QA gallery with ${result.screenshots} screenshots, ${result.receipts} receipts, and ${result.obs} OBS captures.`);
}

module.exports = { verifyPluginDocsGallery };
