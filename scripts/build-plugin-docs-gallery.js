'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildDocsSpec, LOCALES } = require('./docs-screenshot-spec');
const { EXPECTED_OVERLAY_GUIDE_COUNT, OBS_DOCS_CAPTURE_LOCALES } = require('./lib/obs-docs-capture-inventory');

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
    <span>${report.screenshots} screenshots · ${report.guides} guides · ${report.obs.records}/${report.obs.expected} OBS previews</span>
  </header>
  <p>Review every localized product screenshot, its route, and CaptureReceipt hash before marking this gallery approved.</p>
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
  const expectedCount = spec.assets.length * LOCALES.length;
  assert.strictEqual((manifest.outputs || []).length, expectedCount, 'Gallery requires a complete localized capture manifest');
  assert.deepStrictEqual(manifest.failures || [], [], 'Gallery cannot be built from capture failures');

  const records = manifest.outputs.map((output) => {
    assert.ok(output.receipt, `${output.locale}/${output.id} is missing its CaptureReceipt`);
    return {
      plugin: output.guideId,
      locale: output.locale,
      stepId: output.stepId,
      route: output.route,
      screenshotPath: output.path,
      sha256: output.sha256,
      receipt: output.receipt
    };
  }).sort((left, right) => (
    left.plugin.localeCompare(right.plugin) || left.locale.localeCompare(right.locale) || left.stepId.localeCompare(right.stepId)
  ));

  const obsReportPath = path.join(repoRoot, 'screenshots', 'docs-obs-capture-report.json');
  const obsReport = fs.existsSync(obsReportPath) ? JSON.parse(fs.readFileSync(obsReportPath, 'utf8')) : null;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reviewStatus: 'pending',
    guides: new Set(records.map((record) => record.plugin)).size,
    locales: [...LOCALES],
    screenshots: records.length,
    receipts: records.filter((record) => record.receipt).length,
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

module.exports = { buildPluginDocsGallery };
