'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const { buildDocsSpec, LOCALES } = require('./docs-screenshot-spec');
const { EXPECTED_OVERLAY_GUIDE_COUNT, OBS_DOCS_CAPTURE_LOCALES } = require('./lib/obs-docs-capture-inventory');
const { validateDocsCaptureReceipts } = require('./verify-docs-capture-receipts');

const ROOT = path.resolve(__dirname, '..');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function galleryImagePath(capturePath) {
  return `../../${capturePath}`;
}

function captureKey(locale, id) {
  return `${locale}:${id}`;
}

function expectedCapturePath(repoRoot, asset, locale) {
  const canonical = asset.canonical.replace(/^\/screenshots\//, '');
  const screenshotFile = path.join(repoRoot, 'screenshots', locale === 'en' ? canonical : path.join(locale, canonical));
  return path.relative(repoRoot, screenshotFile).replace(/\\/g, '/');
}

function rejectCurrentOutput(reason) {
  const error = new Error('Current screenshot evidence does not match the documentation capture contract');
  error.galleryReason = reason;
  throw error;
}

function assertCurrentOutput(condition, reason) {
  if (!condition) rejectCurrentOutput(reason);
}

function assertCurrentOutputEqual(actual, expected, reason) {
  if (!isDeepStrictEqual(actual, expected)) rejectCurrentOutput(reason);
}

function validateCurrentOutput({ repoRoot, output, asset, locale }) {
  assertCurrentOutput(output.guideId === asset.guideId, 'guide-mismatch');
  assertCurrentOutput(output.stepId === asset.stepId, 'step-mismatch');
  assertCurrentOutput(output.route === asset.route, 'route-mismatch');
  assertCurrentOutput(output.selector === asset.selector, 'selector-mismatch');
  assertCurrentOutputEqual(output.action, asset.action, 'action-mismatch');
  assertCurrentOutputEqual(output.workflow, asset.workflow, 'workflow-mismatch');
  const screenshotPath = expectedCapturePath(repoRoot, asset, locale);
  assertCurrentOutput(output.path === screenshotPath, 'image-path-mismatch');
  const screenshotFile = path.join(repoRoot, screenshotPath);
  assertCurrentOutput(fs.existsSync(screenshotFile), 'image-missing');
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(screenshotFile)).digest('hex');
  assertCurrentOutput(output.sha256 === sha256, 'image-hash-mismatch');
  try {
    validateDocsCaptureReceipts({ manifest: { outputs: [output] }, assets: [asset], locales: [locale] });
  } catch (_error) {
    rejectCurrentOutput('receipt-evidence-invalid');
  }
  return {
    plugin: asset.guideId,
    locale,
    stepId: asset.stepId,
    route: asset.route,
    screenshotPath,
    sha256,
    receipt: output.receipt
  };
}

function classifyCurrentCaptures({ repoRoot, manifest, spec }) {
  assert.ok(manifest && Array.isArray(manifest.outputs), 'Documentation capture manifest is invalid');
  const expected = new Map();
  for (const locale of spec.locales) {
    for (const asset of spec.assets) expected.set(captureKey(locale, asset.id), { locale, asset });
  }

  const candidates = new Map();
  const stale = [];
  for (const output of manifest.outputs) {
    const key = captureKey(output?.locale, output?.id);
    if (!expected.has(key)) {
      stale.push(output);
      continue;
    }
    const rows = candidates.get(key) || [];
    rows.push(output);
    candidates.set(key, rows);
  }

  const records = [];
  const missingKeys = [];
  const invalidKeys = [];
  const invalidDetails = [];
  const localeHashes = new Map();
  for (const [key, { locale, asset }] of expected) {
    const outputs = candidates.get(key) || [];
    if (outputs.length === 0) {
      missingKeys.push(key);
      continue;
    }
    if (outputs.length !== 1) {
      invalidKeys.push(key);
      invalidDetails.push({ key, reason: 'duplicate-current-key' });
      continue;
    }
    try {
      const record = validateCurrentOutput({ repoRoot, output: outputs[0], asset, locale });
      const localeHashesForLocale = localeHashes.get(locale) || new Set();
      assertCurrentOutput(!localeHashesForLocale.has(record.sha256), 'duplicate-screenshot-hash');
      localeHashesForLocale.add(record.sha256);
      localeHashes.set(locale, localeHashesForLocale);
      records.push(record);
    } catch (error) {
      invalidKeys.push(key);
      invalidDetails.push({ key, reason: error?.galleryReason || 'output-validation-failed' });
    }
  }

  const expectedCount = expected.size;
  const validCurrent = records.length;
  const failures = Array.isArray(manifest.failures) ? manifest.failures.length : (manifest.failures ? 1 : 0);
  const specHash = crypto.createHash('sha256')
    .update(JSON.stringify({ version: spec.version, assets: spec.assets }))
    .digest('hex');
  const manifestVersionMatches = manifest.version === spec.version;
  const manifestSpecHashMatches = manifest.specHash === specHash;
  const complete = validCurrent === expectedCount && stale.length === 0 && missingKeys.length === 0 &&
    invalidKeys.length === 0 && failures === 0 && manifestVersionMatches && manifestSpecHashMatches;

  return {
    records,
    expected: expectedCount,
    validCurrent,
    stale: stale.length,
    missing: missingKeys.length,
    invalid: invalidKeys.length,
    incomplete: expectedCount - validCurrent,
    rawOutputs: manifest.outputs.length,
    staleKeys: stale.map(output => captureKey(output?.locale, output?.id)),
    missingKeys,
    invalidKeys,
    invalidDetails,
    failures,
    manifestVersionMatches,
    manifestSpecHashMatches,
    complete
  };
}

function buildGalleryHtml({ records, report }) {
  const cards = records.map((record) => `
    <article class="capture-card" data-plugin="${escapeHtml(record.plugin)}" data-locale="${escapeHtml(record.locale)}">
      <header><strong>${escapeHtml(record.plugin)}</strong><span>${escapeHtml(record.locale.toUpperCase())}</span></header>
      <img src="${escapeHtml(galleryImagePath(record.screenshotPath))}" alt="${escapeHtml(`${record.plugin} ${record.locale} ${record.stepId}`)}" loading="lazy">
      <dl>
        <dt>Route</dt><dd>${escapeHtml(record.route)}</dd>
        <dt>Step</dt><dd>${escapeHtml(record.stepId)}</dd>
        <dt>Receipt</dt><dd>${escapeHtml(record.sha256)}</dd>
      </dl>
    </article>`).join('\n');
  const localeOptions = LOCALES.map((locale) => `<option value="${locale}">${locale.toUpperCase()}</option>`).join('');
  const invalidDetails = (report.invalidDetails || []).map((item) => `<li>${escapeHtml(item.key)}: ${escapeHtml(item.reason)}</li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LTTH Plugin Documentation QA</title>
  <link rel="icon" href="data:,">
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #111827; color: #e5e7eb; }
    body { margin: 0; padding: 1.5rem; } header { display: flex; gap: .7rem; align-items: baseline; flex-wrap: wrap; }
    .status { border: 1px solid #f59e0b; color: #fde68a; padding: .35rem .6rem; border-radius: .35rem; }
    .filters { display: flex; gap: .75rem; margin: 1rem 0; flex-wrap: wrap; }
    input, select { background: #1f2937; border: 1px solid #4b5563; color: inherit; padding: .45rem; border-radius: .3rem; }
    #gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 1rem; }
    .capture-card { background: #1f2937; border: 1px solid #374151; border-radius: .5rem; overflow: hidden; }
    .capture-card header { justify-content: space-between; padding: .65rem .8rem; }
    .capture-card img { width: 100%; display: block; background: #030712; }
    dl { margin: 0; padding: .75rem; font-size: .8rem; } dt { color: #9ca3af; } dd { margin: .15rem 0 .6rem; overflow-wrap: anywhere; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <header>
    <h1>LTTH Plugin Documentation QA</h1>
    <span class="status" id="reviewStatus">Review: ${escapeHtml(report.reviewStatus)}</span>
    <span>${report.currentValid}/${report.expected} current valid screenshots · ${report.stale} stale · ${report.missing} missing · ${report.invalid} invalid · ${report.guides} guides · ${report.obs.records}/${report.obs.expected} OBS previews</span>
  </header>
  <p>Review every localized product screenshot, its route, and CaptureReceipt hash before marking this gallery approved.</p>
${invalidDetails ? `  <section id="invalidReceipts"><h2>Invalid current receipts</h2><ul>${invalidDetails}</ul></section>` : ''}
  <div class="filters">
    <label>Plugin <input id="pluginFilter" placeholder="e.g. emoji-rain"></label>
    <label>Language <select id="localeFilter"><option value="">All</option>${localeOptions}</select></label>
  </div>
  <main id="gallery">${cards}</main>
  <script>
    const pluginFilter = document.querySelector('#pluginFilter');
    const localeFilter = document.querySelector('#localeFilter');
    const applyFilters = () => {
      const plugin = pluginFilter.value.trim().toLowerCase();
      const locale = localeFilter.value;
      document.querySelectorAll('[data-plugin]').forEach((card) => {
        card.hidden = Boolean((plugin && !card.dataset.plugin.includes(plugin)) || (locale && card.dataset.locale !== locale));
      });
    };
    pluginFilter.addEventListener('input', applyFilters);
    localeFilter.addEventListener('change', applyFilters);
  </script>
</body>
</html>\n`;
}

function buildPluginDocsGallery({ repoRoot = ROOT, outputDir = path.join(ROOT, 'docs', 'plugin-docs-qa') } = {}) {
  const manifestPath = path.join(repoRoot, 'screenshots', 'docs-capture-manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'Missing docs capture manifest. Run npm run docs:screenshots first.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const spec = buildDocsSpec(repoRoot);
  const coverage = classifyCurrentCaptures({ repoRoot, manifest, spec: { ...spec, locales: LOCALES } });
  const records = coverage.records.sort((left, right) => (
    left.plugin.localeCompare(right.plugin) || left.locale.localeCompare(right.locale) || left.stepId.localeCompare(right.stepId)
  ));

  const obsReportPath = path.join(repoRoot, 'screenshots', 'docs-obs-capture-report.json');
  const obsReport = fs.existsSync(obsReportPath) ? JSON.parse(fs.readFileSync(obsReportPath, 'utf8')) : null;
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    reviewStatus: 'pending',
    guides: new Set(spec.assets.map((asset) => asset.guideId)).size,
    locales: [...LOCALES],
    screenshots: records.length,
    receipts: records.length,
    rawOutputs: coverage.rawOutputs,
    expected: coverage.expected,
    currentValid: coverage.validCurrent,
    stale: coverage.stale,
    missing: coverage.missing,
    invalid: coverage.invalid,
    incomplete: coverage.incomplete,
    staleKeys: coverage.staleKeys,
    missingKeys: coverage.missingKeys,
    invalidKeys: coverage.invalidKeys,
    invalidDetails: coverage.invalidDetails,
    captureFailures: coverage.failures,
    manifestVersionMatches: coverage.manifestVersionMatches,
    manifestSpecHashMatches: coverage.manifestSpecHashMatches,
    coverageComplete: coverage.complete,
    obs: {
      expected: EXPECTED_OVERLAY_GUIDE_COUNT * OBS_DOCS_CAPTURE_LOCALES.length,
      records: Array.isArray(obsReport?.records) ? obsReport.records.length : 0,
      reportPath: obsReport ? 'screenshots/docs-obs-capture-report.json' : null
    }
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'index.html'), buildGalleryHtml({ records, report }), 'utf8');
  return { screenshotCount: records.length, guideCount: report.guides, outputDir, report };
}

if (require.main === module) {
  const result = buildPluginDocsGallery();
  console.log(`Built QA gallery for ${result.screenshotCount} localized captures at ${result.outputDir}`);
}

module.exports = { buildPluginDocsGallery, classifyCurrentCaptures };
